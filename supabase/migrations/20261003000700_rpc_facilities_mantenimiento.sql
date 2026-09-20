-- Fase 10 · RPC de mantenimiento.
-- Ver docs/CONTRATO-FASE-10.md §17, §18 y decisión P-11.
--
-- Un mantenimiento puede bloquear el recurso o ser solo una anotación en la
-- agenda. Cuando bloquea, entra en la misma capa de ocupación que las reservas
-- y compite con ellas por la franja: no hay dos mecanismos separados que
-- puedan cruzarse sin verse.
--
-- Mantenimiento vencido y recurso fuera de servicio son cosas distintas
-- (§9 del encargo): una revisión que pasó de fecha no apaga el recurso por su
-- cuenta. Quien decide apagarlo cambia su status a mano.

-- app.save_maintenance ------------------------------------------------------------

create or replace function app.save_maintenance(p_church_id uuid, p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := nullif(p_input ->> 'id', '')::uuid;
  v_resource_id uuid := nullif(p_input ->> 'resource_id', '')::uuid;
  v_res resources%rowtype;
  v_actual resource_maintenance%rowtype;
  v_starts timestamptz := nullif(p_input ->> 'starts_at', '')::timestamptz;
  v_ends timestamptz := nullif(p_input ->> 'ends_at', '')::timestamptz;
  v_bloquea boolean;
  v_bloqueaba boolean;
begin
  perform app.assert_church_member(p_church_id);

  if v_id is not null then
    select * into v_actual from resource_maintenance where id = v_id and church_id = p_church_id;
    if not found then
      raise exception 'El mantenimiento no existe.' using errcode = 'P0002';
    end if;
    v_resource_id := v_actual.resource_id;
    v_starts := coalesce(v_starts, v_actual.starts_at);
    v_ends := coalesce(v_ends, v_actual.ends_at);
  end if;

  select * into v_res from resources where id = v_resource_id and church_id = p_church_id;
  if not found then
    raise exception 'El recurso no existe.' using errcode = 'P0002';
  end if;

  if not app.resource_cap(p_church_id, v_res.campus_id, v_res.id, 'facilities.manage_maintenance') then
    raise exception 'No tienes permiso para gestionar el mantenimiento de este recurso.' using errcode = '42501';
  end if;

  if v_starts is null or v_ends is null then
    raise exception 'El mantenimiento necesita ventana de inicio y fin.' using errcode = '22023';
  end if;

  if v_ends <= v_starts then
    raise exception 'La hora de fin tiene que ser posterior a la de inicio.' using errcode = '22023';
  end if;

  v_bloquea := coalesce((p_input ->> 'blocks_availability')::boolean, coalesce(v_actual.blocks_availability, true));

  if v_id is null then
    if app.j_text(p_input, 'title') is null or app.j_text(p_input, 'type') is null then
      raise exception 'El mantenimiento necesita título y tipo.' using errcode = '22023';
    end if;

    insert into resource_maintenance (
      church_id, resource_id, type, title, description, blocks_availability,
      starts_at, ends_at, responsible_person_id, created_by
    ) values (
      p_church_id, v_resource_id, app.j_text(p_input, 'type'), app.j_text(p_input, 'title'),
      app.j_text(p_input, 'description'), v_bloquea, v_starts, v_ends,
      nullif(p_input ->> 'responsible_person_id', '')::uuid,
      app.current_person_id(p_church_id)
    )
    returning id into v_id;

    if v_bloquea then
      perform app.occupy_resource(p_church_id, v_resource_id, 'maintenance', null, v_id, v_starts, v_ends);
    end if;
  else
    if v_actual.status not in ('scheduled', 'in_progress') then
      raise exception 'Este mantenimiento ya está % y no se puede editar.', v_actual.status using errcode = '22023';
    end if;

    v_bloqueaba := v_actual.blocks_availability;

    update resource_maintenance set
      type = coalesce(app.j_text(p_input, 'type'), type),
      title = coalesce(app.j_text(p_input, 'title'), title),
      description = case when p_input ? 'description' then app.j_text(p_input, 'description') else description end,
      blocks_availability = v_bloquea,
      starts_at = v_starts,
      ends_at = v_ends,
      responsible_person_id = case
        when p_input ? 'responsible_person_id' then nullif(p_input ->> 'responsible_person_id', '')::uuid
        else responsible_person_id end,
      status = coalesce(app.j_text(p_input, 'status')::maintenance_status, status),
      updated_at = now()
    where id = v_id;

    -- Los tres caminos posibles al editar, cada uno con su efecto sobre la
    -- franja. Sin esto, dejar de bloquear no liberaría el recurso y seguir
    -- bloqueando con otro horario lo dejaría ocupado en el viejo.
    if v_bloquea and not v_bloqueaba then
      perform app.occupy_resource(p_church_id, v_resource_id, 'maintenance', null, v_id, v_starts, v_ends);
    elsif not v_bloquea and v_bloqueaba then
      perform app.release_occupancy(null, v_id);
    elsif v_bloquea then
      perform app.move_occupancy(null, v_id, v_starts, v_ends);
    end if;
  end if;

  perform app.write_audit_log(p_church_id, 'maintenance.saved', 'resource_maintenance', v_id,
    jsonb_build_object('resource_id', v_resource_id, 'blocks', v_bloquea));

  return v_id;
end;
$$;

revoke all on function app.save_maintenance(uuid, jsonb) from public, anon;
grant execute on function app.save_maintenance(uuid, jsonb) to authenticated;

-- app.complete_maintenance ----------------------------------------------------------
--
-- Cerrar la intervención libera el recurso: la ventana ya no bloquea porque ya
-- se hizo. Lo que no desaparece es la fila, que es el historial.

create or replace function app.complete_maintenance(p_maintenance_id uuid, p_result_notes text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_m resource_maintenance%rowtype;
  v_res resources%rowtype;
begin
  select * into v_m from resource_maintenance where id = p_maintenance_id;
  if v_m.id is null or not (v_m.church_id = any (app.church_ids_for_user())) then
    raise exception 'El mantenimiento no existe.' using errcode = 'P0002';
  end if;

  select * into v_res from resources where id = v_m.resource_id;

  if not app.resource_cap(v_m.church_id, v_res.campus_id, v_res.id, 'facilities.manage_maintenance') then
    raise exception 'No tienes permiso para cerrar este mantenimiento.' using errcode = '42501';
  end if;

  if v_m.status not in ('scheduled', 'in_progress') then
    raise exception 'Este mantenimiento ya está %.', v_m.status using errcode = '22023';
  end if;

  update resource_maintenance
  set status = 'completed', performed_at = now(),
      performed_by = app.current_person_id(v_m.church_id),
      result_notes = coalesce(p_result_notes, result_notes),
      updated_at = now()
  where id = p_maintenance_id;

  perform app.release_occupancy(null, p_maintenance_id);

  perform app.write_audit_log(v_m.church_id, 'maintenance.completed', 'resource_maintenance', p_maintenance_id, '{}'::jsonb);
end;
$$;

revoke all on function app.complete_maintenance(uuid, text) from public, anon;
grant execute on function app.complete_maintenance(uuid, text) to authenticated;

-- app.cancel_maintenance --------------------------------------------------------------

create or replace function app.cancel_maintenance(p_maintenance_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_m resource_maintenance%rowtype;
  v_res resources%rowtype;
begin
  select * into v_m from resource_maintenance where id = p_maintenance_id;
  if v_m.id is null or not (v_m.church_id = any (app.church_ids_for_user())) then
    raise exception 'El mantenimiento no existe.' using errcode = 'P0002';
  end if;

  select * into v_res from resources where id = v_m.resource_id;

  if not app.resource_cap(v_m.church_id, v_res.campus_id, v_res.id, 'facilities.manage_maintenance') then
    raise exception 'No tienes permiso para cancelar este mantenimiento.' using errcode = '42501';
  end if;

  if v_m.status not in ('scheduled', 'in_progress') then
    raise exception 'Este mantenimiento ya está %.', v_m.status using errcode = '22023';
  end if;

  update resource_maintenance
  set status = 'cancelled', cancelled_at = now(),
      cancelled_by = app.current_person_id(v_m.church_id), updated_at = now()
  where id = p_maintenance_id;

  perform app.release_occupancy(null, p_maintenance_id);

  perform app.write_audit_log(v_m.church_id, 'maintenance.cancelled', 'resource_maintenance', p_maintenance_id,
    jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function app.cancel_maintenance(uuid, text) from public, anon;
grant execute on function app.cancel_maintenance(uuid, text) to authenticated;

-- Envoltorios públicos --------------------------------------------------------------------

create or replace function public.save_maintenance(p_church_id uuid, p_input jsonb)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.save_maintenance(p_church_id, p_input); $$;

create or replace function public.complete_maintenance(p_maintenance_id uuid, p_result_notes text default null)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.complete_maintenance(p_maintenance_id, p_result_notes); $$;

create or replace function public.cancel_maintenance(p_maintenance_id uuid, p_reason text default null)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.cancel_maintenance(p_maintenance_id, p_reason); $$;

do $grants$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.proname in ('save_maintenance', 'complete_maintenance', 'cancel_maintenance')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$grants$;
