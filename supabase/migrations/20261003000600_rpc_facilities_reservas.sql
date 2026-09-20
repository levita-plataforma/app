-- Fase 10 · RPC de reservas.
-- Ver docs/CONTRATO-FASE-10.md §8, §13, §14, §21 y §42.
--
-- Una reserva nace confirmada, salvo que el recurso exija aprobación: entonces
-- nace pendiente y no ocupa nada. Solo la confirmación adquiere la franja, y es
-- ahí donde la restricción de exclusión decide si había hueco de verdad
-- (decisión P-14). Dos personas pueden tener pendientes solapadas; la segunda
-- que intente confirmar se lleva el no.

-- app.reservation_window ----------------------------------------------------------
--
-- De dónde salen las horas de una reserva. Si va con actividad, manda la
-- actividad (decisión P-17: un solo horario, no dos que puedan divergir). Si no,
-- las horas vienen en la petición.

create or replace function app.reservation_window(
  p_church_id uuid,
  p_activity_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_act activities%rowtype;
begin
  if p_activity_id is null then
    if p_starts_at is null or p_ends_at is null then
      raise exception 'La reserva necesita hora de inicio y de fin.' using errcode = '22023';
    end if;
    return query select p_starts_at, p_ends_at;
    return;
  end if;

  select * into v_act from activities where id = p_activity_id and church_id = p_church_id;
  if not found then
    raise exception 'La actividad no existe.' using errcode = 'P0002';
  end if;

  -- Una actividad flexible no tiene horario todavía. No se le inventa uno: sin
  -- ventana concreta no hay nada que reservar (§13 del contrato y §8 del
  -- encargo).
  if v_act.starts_at is null or v_act.ends_at is null then
    raise exception 'Esta actividad todavía no tiene horario concreto: fíjalo antes de reservar recursos.'
      using errcode = '22023';
  end if;

  return query select v_act.starts_at, v_act.ends_at;
end;
$$;

revoke all on function app.reservation_window(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- app.create_reservation ------------------------------------------------------------

create or replace function app.create_reservation(p_church_id uuid, p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_resource_id uuid := nullif(p_input ->> 'resource_id', '')::uuid;
  v_activity_id uuid := nullif(p_input ->> 'activity_id', '')::uuid;
  v_responsible uuid := nullif(p_input ->> 'responsible_person_id', '')::uuid;
  v_purpose text := app.j_text(p_input, 'purpose');
  v_res resources%rowtype;
  v_ventana record;
  v_person uuid;
  v_status reservation_status;
  v_id uuid;
begin
  perform app.assert_church_member(p_church_id);

  v_person := app.current_person_id(p_church_id);
  if v_person is null then
    raise exception 'No perteneces a esta iglesia.' using errcode = '42501';
  end if;

  select * into v_res from resources where id = v_resource_id and church_id = p_church_id;
  if not found then
    raise exception 'El recurso no existe.' using errcode = 'P0002';
  end if;

  if not app.resource_cap(p_church_id, v_res.campus_id, v_res.id, 'facilities.create_reservation')
     and not app.resource_cap(p_church_id, v_res.campus_id, v_res.id, 'facilities.manage_reservations') then
    raise exception 'No tienes permiso para reservar este recurso.' using errcode = '42501';
  end if;

  if v_res.archived_at is not null then
    raise exception 'Este recurso está archivado.' using errcode = '22023';
  end if;

  if not v_res.reservable then
    raise exception 'Este recurso no admite reservas.' using errcode = '22023';
  end if;

  if v_res.status <> 'active' then
    raise exception 'Este recurso no está disponible ahora mismo (%).', v_res.status using errcode = '22023';
  end if;

  if v_purpose is null then
    raise exception 'Di para qué es la reserva.' using errcode = '22023';
  end if;

  select * into v_ventana from app.reservation_window(
    p_church_id, v_activity_id,
    nullif(p_input ->> 'starts_at', '')::timestamptz,
    nullif(p_input ->> 'ends_at', '')::timestamptz
  );

  if v_ventana.ends_at <= v_ventana.starts_at then
    raise exception 'La hora de fin tiene que ser posterior a la de inicio.' using errcode = '22023';
  end if;

  -- Quien necesita aprobación entra pendiente; quien no, confirmada. Si alguien
  -- tiene la capacidad de aprobar, su propia reserva no da un rodeo: nace
  -- pendiente igual y la confirma en el mismo gesto si quiere, para que el
  -- histórico refleje lo que pasó.
  v_status := case when v_res.requires_approval then 'pending' else 'confirmed' end;

  insert into resource_reservations (
    church_id, resource_id, activity_id, requested_by, responsible_person_id,
    starts_at, ends_at, status, purpose, notes
  ) values (
    p_church_id, v_resource_id, v_activity_id, v_person, coalesce(v_responsible, v_person),
    v_ventana.starts_at, v_ventana.ends_at, v_status, v_purpose, app.j_text(p_input, 'notes')
  )
  returning id into v_id;

  if v_status = 'confirmed' then
    perform app.occupy_resource(p_church_id, v_resource_id, 'reservation', v_id, null,
      v_ventana.starts_at, v_ventana.ends_at);
  end if;

  perform app.write_audit_log(p_church_id, 'reservation.created', 'resource_reservations', v_id,
    jsonb_build_object('resource_id', v_resource_id, 'status', v_status, 'activity_id', v_activity_id));

  return v_id;
end;
$$;

revoke all on function app.create_reservation(uuid, jsonb) from public, anon;
grant execute on function app.create_reservation(uuid, jsonb) to authenticated;

-- app.update_reservation -------------------------------------------------------------
--
-- Cambiar horario, propósito o responsable. El recurso NO se cambia aquí: mover
-- una reserva de sala es cancelarla y hacer otra, y permitirlo por update
-- abriría la puerta a saltarse la comprobación de permiso sobre el recurso
-- nuevo (§6 del encargo).

create or replace function app.update_reservation(p_reservation_id uuid, p_input jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_r resource_reservations%rowtype;
  v_res resources%rowtype;
  v_person uuid;
  v_starts timestamptz;
  v_ends timestamptz;
begin
  select * into v_r from resource_reservations where id = p_reservation_id;
  if v_r.id is null or not (v_r.church_id = any (app.church_ids_for_user())) then
    raise exception 'La reserva no existe.' using errcode = 'P0002';
  end if;

  select * into v_res from resources where id = v_r.resource_id;
  v_person := app.current_person_id(v_r.church_id);

  -- Quien la pidió puede editar la suya; para tocar la de otra persona hace
  -- falta manage_reservations.
  if v_r.requested_by is distinct from v_person
     and not app.resource_cap(v_r.church_id, v_res.campus_id, v_res.id, 'facilities.manage_reservations') then
    raise exception 'No puedes editar una reserva de otra persona.' using errcode = '42501';
  end if;

  if v_r.status not in ('pending', 'confirmed') then
    raise exception 'Esta reserva ya está % y no se puede editar.', v_r.status using errcode = '22023';
  end if;

  if p_input ? 'resource_id' and nullif(p_input ->> 'resource_id', '')::uuid is distinct from v_r.resource_id then
    raise exception 'Para cambiar de recurso, cancela esta reserva y crea otra.' using errcode = '22023';
  end if;

  -- Si la reserva cuelga de una actividad, el horario lo manda la actividad y
  -- no se puede tocar por aquí: si no, los dos horarios divergirían en
  -- silencio, que es justo lo que el contrato prohíbe (P-17).
  if v_r.activity_id is not null and (p_input ? 'starts_at' or p_input ? 'ends_at') then
    raise exception 'El horario de esta reserva lo marca su actividad: cámbialo en la actividad.'
      using errcode = '22023';
  end if;

  v_starts := coalesce(nullif(p_input ->> 'starts_at', '')::timestamptz, v_r.starts_at);
  v_ends := coalesce(nullif(p_input ->> 'ends_at', '')::timestamptz, v_r.ends_at);

  if v_ends <= v_starts then
    raise exception 'La hora de fin tiene que ser posterior a la de inicio.' using errcode = '22023';
  end if;

  update resource_reservations set
    starts_at = v_starts,
    ends_at = v_ends,
    purpose = coalesce(app.j_text(p_input, 'purpose'), purpose),
    notes = case when p_input ? 'notes' then app.j_text(p_input, 'notes') else notes end,
    responsible_person_id = case
      when p_input ? 'responsible_person_id' then nullif(p_input ->> 'responsible_person_id', '')::uuid
      else responsible_person_id end,
    updated_at = now()
  where id = p_reservation_id;

  -- Solo una confirmada ocupa; mover la franja es donde puede aparecer el
  -- conflicto, y si aparece se cae todo el cambio.
  if v_r.status = 'confirmed' and (v_starts, v_ends) is distinct from (v_r.starts_at, v_r.ends_at) then
    perform app.move_occupancy(p_reservation_id, null, v_starts, v_ends);
  end if;

  perform app.write_audit_log(v_r.church_id, 'reservation.updated', 'resource_reservations', p_reservation_id,
    jsonb_build_object('starts_at', v_starts, 'ends_at', v_ends));
end;
$$;

revoke all on function app.update_reservation(uuid, jsonb) from public, anon;
grant execute on function app.update_reservation(uuid, jsonb) to authenticated;

-- app.cancel_reservation --------------------------------------------------------------

create or replace function app.cancel_reservation(p_reservation_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_r resource_reservations%rowtype;
  v_res resources%rowtype;
  v_person uuid;
begin
  select * into v_r from resource_reservations where id = p_reservation_id;
  if v_r.id is null or not (v_r.church_id = any (app.church_ids_for_user())) then
    raise exception 'La reserva no existe.' using errcode = 'P0002';
  end if;

  select * into v_res from resources where id = v_r.resource_id;
  v_person := app.current_person_id(v_r.church_id);

  if v_r.requested_by is distinct from v_person
     and not app.resource_cap(v_r.church_id, v_res.campus_id, v_res.id, 'facilities.manage_reservations') then
    raise exception 'No puedes cancelar una reserva de otra persona.' using errcode = '42501';
  end if;

  if v_r.status not in ('pending', 'confirmed') then
    raise exception 'Esta reserva ya está %.', v_r.status using errcode = '22023';
  end if;

  update resource_reservations
  set status = 'cancelled', cancelled_at = now(), cancelled_by = v_person,
      cancelled_reason = p_reason, updated_at = now()
  where id = p_reservation_id;

  -- Suelta la franja en la misma transacción: si esto se quedara para luego, el
  -- recurso seguiría figurando como ocupado por algo ya cancelado.
  perform app.release_occupancy(p_reservation_id, null);

  perform app.write_audit_log(v_r.church_id, 'reservation.cancelled', 'resource_reservations', p_reservation_id,
    jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function app.cancel_reservation(uuid, text) from public, anon;
grant execute on function app.cancel_reservation(uuid, text) to authenticated;

-- app.approve_reservation --------------------------------------------------------------
--
-- El momento en el que se decide de verdad quién se queda la sala. Dos
-- aprobaciones simultáneas de reservas solapadas: una entra y la otra recibe el
-- conflicto. No hay sobreventa posible.

create or replace function app.approve_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_r resource_reservations%rowtype;
  v_res resources%rowtype;
begin
  select * into v_r from resource_reservations where id = p_reservation_id for update;
  if v_r.id is null or not (v_r.church_id = any (app.church_ids_for_user())) then
    raise exception 'La reserva no existe.' using errcode = 'P0002';
  end if;

  select * into v_res from resources where id = v_r.resource_id;

  if not app.resource_cap(v_r.church_id, v_res.campus_id, v_res.id, 'facilities.approve_reservations') then
    raise exception 'No tienes permiso para aprobar reservas.' using errcode = '42501';
  end if;

  if v_r.status <> 'pending' then
    raise exception 'Esta reserva no está pendiente de aprobación.' using errcode = '22023';
  end if;

  if v_res.status <> 'active' or v_res.archived_at is not null then
    raise exception 'El recurso ya no está disponible: no se puede confirmar la reserva.' using errcode = '22023';
  end if;

  update resource_reservations set status = 'confirmed', updated_at = now()
  where id = p_reservation_id;

  perform app.occupy_resource(v_r.church_id, v_r.resource_id, 'reservation', p_reservation_id, null,
    v_r.starts_at, v_r.ends_at);

  perform app.write_audit_log(v_r.church_id, 'reservation.approved', 'resource_reservations', p_reservation_id, '{}'::jsonb);
end;
$$;

revoke all on function app.approve_reservation(uuid) from public, anon;
grant execute on function app.approve_reservation(uuid) to authenticated;

-- app.reject_reservation ----------------------------------------------------------------

create or replace function app.reject_reservation(p_reservation_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_r resource_reservations%rowtype;
  v_res resources%rowtype;
begin
  select * into v_r from resource_reservations where id = p_reservation_id;
  if v_r.id is null or not (v_r.church_id = any (app.church_ids_for_user())) then
    raise exception 'La reserva no existe.' using errcode = 'P0002';
  end if;

  select * into v_res from resources where id = v_r.resource_id;

  if not app.resource_cap(v_r.church_id, v_res.campus_id, v_res.id, 'facilities.approve_reservations') then
    raise exception 'No tienes permiso para rechazar reservas.' using errcode = '42501';
  end if;

  if v_r.status <> 'pending' then
    raise exception 'Esta reserva no está pendiente de aprobación.' using errcode = '22023';
  end if;

  update resource_reservations
  set status = 'rejected', rejected_at = now(), rejected_by = app.current_person_id(v_r.church_id),
      updated_at = now()
  where id = p_reservation_id;

  perform app.write_audit_log(v_r.church_id, 'reservation.rejected', 'resource_reservations', p_reservation_id,
    jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function app.reject_reservation(uuid, text) from public, anon;
grant execute on function app.reject_reservation(uuid, text) to authenticated;

-- Envoltorios públicos ------------------------------------------------------------------

create or replace function public.create_reservation(p_church_id uuid, p_input jsonb)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.create_reservation(p_church_id, p_input); $$;

create or replace function public.update_reservation(p_reservation_id uuid, p_input jsonb)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.update_reservation(p_reservation_id, p_input); $$;

create or replace function public.cancel_reservation(p_reservation_id uuid, p_reason text default null)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.cancel_reservation(p_reservation_id, p_reason); $$;

create or replace function public.approve_reservation(p_reservation_id uuid)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.approve_reservation(p_reservation_id); $$;

create or replace function public.reject_reservation(p_reservation_id uuid, p_reason text default null)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.reject_reservation(p_reservation_id, p_reason); $$;

do $grants$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.proname in ('create_reservation', 'update_reservation', 'cancel_reservation',
                        'approve_reservation', 'reject_reservation')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$grants$;
