-- Fase 10 · Avisos internos de Recursos e instalaciones.
-- Ver docs/CONTRATO-FASE-10.md §30.
--
-- Se emiten solo cuatro, los que alguien necesita saber sin tener que entrar a
-- mirar: tu reserva fue aprobada, tu reserva fue rechazada, tu reserva se
-- canceló porque se canceló la actividad, y te han puesto como responsable de
-- un mantenimiento.
--
-- Lo que NO se avisa, a propósito: cada reserva creada. Quien reserva ya sabe
-- que ha reservado, y llenar la bandeja de confirmaciones de lo que uno mismo
-- acaba de hacer es la forma más rápida de que se deje de leer.
--
-- El transporte externo sigue desactivado (D20 y D21): esto se queda en la
-- bandeja de la aplicación. Ni esta migración ni la interfaz dicen que se haya
-- enviado nada a nadie.

-- 1. Tipos de evento, sin pisar los de las demás fases -------------------------

select app.add_notification_event_types(array[
  'reservation.approved',
  'reservation.rejected',
  'reservation.cancelled_by_activity',
  'maintenance.assigned'
]);

-- 2. Textos --------------------------------------------------------------------

create or replace function app.notification_text_fase10(p_event notification_events)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_payload jsonb := coalesce(p_event.payload, '{}'::jsonb);
  v_recurso text := coalesce(nullif(v_payload ->> 'resource_name', ''), 'un recurso');
  v_cuando text := app.notification_when(v_payload);
  v_motivo text := nullif(v_payload ->> 'reason', '');
  v_titulo text;
  v_cuerpo text;
begin
  case p_event.event_type
    when 'reservation.approved' then
      v_titulo := 'Reserva confirmada';
      v_cuerpo := 'Tu reserva de «' || v_recurso || '»' || v_cuando || ' está confirmada.';

    when 'reservation.rejected' then
      v_titulo := 'Reserva rechazada';
      v_cuerpo := 'Tu reserva de «' || v_recurso || '»' || v_cuando || ' no se ha aprobado.'
        || case when v_motivo is not null then ' Motivo: ' || v_motivo else '' end;

    when 'reservation.cancelled_by_activity' then
      v_titulo := 'Reserva cancelada';
      v_cuerpo := 'Se ha cancelado la actividad para la que tenías reservado «' || v_recurso || '»'
        || v_cuando || ', así que la reserva se ha cancelado también.';

    when 'maintenance.assigned' then
      v_titulo := 'Mantenimiento a tu cargo';
      v_cuerpo := 'Te han asignado «' || coalesce(nullif(v_payload ->> 'title', ''), 'una intervención')
        || '» sobre «' || v_recurso || '»' || v_cuando || '.';

    else
      return null;
  end case;

  return jsonb_build_object('title', left(v_titulo, 200), 'body', left(v_cuerpo, 1000));
end;
$$;

revoke all on function app.notification_text_fase10(notification_events) from public, anon, authenticated;

-- El despachador prueba la Fase 10 primero y cae hacia atrás igual que antes.
-- Se reescribe entero, conservando la cadena existente: si se añadiera solo la
-- rama nueva sin repetir las demás, las de las fases anteriores dejarían de
-- consultarse y sus avisos se quedarían sin texto.
create or replace function app.notification_text(p_event notification_events)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_text jsonb;
begin
  v_text := app.notification_text_fase10(p_event);
  if v_text is not null then
    return v_text;
  end if;

  v_text := app.notification_text_fase7(p_event);
  if v_text is not null then
    return v_text;
  end if;

  v_text := app.notification_text_fase6(p_event);
  if v_text is not null then
    return v_text;
  end if;

  return app.notification_text_fase5(p_event);
end;
$$;

revoke all on function app.notification_text(notification_events) from public, anon, authenticated;

-- 3. Payload común de una reserva ------------------------------------------------
--
-- Lleva el nombre del recurso y la franja, que es lo que la persona necesita
-- para ubicarse. NO lleva el título de la actividad: quien recibe el aviso ya
-- sabe qué reservó, y si la actividad es privada su título no tiene por qué
-- viajar a la bandeja de nadie (§47 del contrato).

create or replace function app.reservation_notification_payload(p_reservation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'resource_name', r.name,
    'starts_at', res.starts_at,
    'ends_at', res.ends_at,
    'timezone', coalesce(c.timezone, ch.timezone)
  )
  from resource_reservations res
  join resources r on r.id = res.resource_id
  join churches ch on ch.id = res.church_id
  left join campuses c on c.id = r.campus_id
  where res.id = p_reservation_id;
$$;

revoke all on function app.reservation_notification_payload(uuid) from public, anon, authenticated;

-- 4. Emisión -----------------------------------------------------------------------
--
-- Se añade a las RPC que ya existen, sin reescribir su lógica: solo la llamada
-- al motor, en la misma transacción que la mutación, de modo que si la
-- operación se deshace el aviso no llega. La deduplicación va por transición
-- (id de la reserva y estado), no por fecha.

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

  -- Antes del aviso: si la franja está cogida, esto falla y no se avisa de una
  -- confirmación que no ha ocurrido.
  perform app.occupy_resource(v_r.church_id, v_r.resource_id, 'reservation', p_reservation_id, null,
    v_r.starts_at, v_r.ends_at);

  perform app.emit_notification_event(
    v_r.church_id, 'reservation.approved', 'resource_reservations', p_reservation_id, 1,
    array[v_r.requested_by], app.reservation_notification_payload(p_reservation_id), 'approved'
  );

  perform app.write_audit_log(v_r.church_id, 'reservation.approved', 'resource_reservations', p_reservation_id, '{}'::jsonb);
end;
$$;

revoke all on function app.approve_reservation(uuid) from public, anon;
grant execute on function app.approve_reservation(uuid) to authenticated;

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

  perform app.emit_notification_event(
    v_r.church_id, 'reservation.rejected', 'resource_reservations', p_reservation_id, 1,
    array[v_r.requested_by],
    app.reservation_notification_payload(p_reservation_id) || jsonb_build_object('reason', p_reason),
    'rejected'
  );

  perform app.write_audit_log(v_r.church_id, 'reservation.rejected', 'resource_reservations', p_reservation_id,
    jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function app.reject_reservation(uuid, text) from public, anon;
grant execute on function app.reject_reservation(uuid, text) to authenticated;

-- Y el aviso de la cancelación en cascada, que es el que de verdad hace falta:
-- alguien reservó el auditorio para el domingo y la actividad se ha cancelado.
create or replace function app.activities_sync_reservations()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reserva record;
begin
  if (new.status = 'cancelled' and old.status is distinct from 'cancelled')
     or (new.archived_at is not null and old.archived_at is null) then

    for v_reserva in
      select id, requested_by from resource_reservations
      where activity_id = new.id and status in ('confirmed', 'pending')
    loop
      update resource_reservations
      set status = 'cancelled',
          cancelled_at = now(),
          cancelled_by = null,
          cancelled_reason = case
            when new.status = 'cancelled' then 'La actividad se canceló'
            else 'La actividad se archivó' end,
          updated_at = now()
      where id = v_reserva.id;

      perform app.release_occupancy(v_reserva.id, null);

      perform app.emit_notification_event(
        new.church_id, 'reservation.cancelled_by_activity', 'resource_reservations', v_reserva.id, 1,
        array[v_reserva.requested_by], app.reservation_notification_payload(v_reserva.id), 'cancelled'
      );

      perform app.write_audit_log(new.church_id, 'reservation.cancelled',
        'resource_reservations', v_reserva.id,
        jsonb_build_object('cause', case when new.status = 'cancelled' then 'activity_cancelled' else 'activity_archived' end,
                           'activity_id', new.id));
    end loop;

    return new;
  end if;

  if (new.starts_at, new.ends_at) is distinct from (old.starts_at, old.ends_at) then

    if new.starts_at is null or new.ends_at is null then
      if exists (select 1 from resource_reservations
                 where activity_id = new.id and status in ('confirmed', 'pending')) then
        raise exception 'Esta actividad tiene recursos reservados: cancela las reservas antes de dejarla sin horario.'
          using errcode = '22023';
      end if;
      return new;
    end if;

    for v_reserva in
      select id, status from resource_reservations
      where activity_id = new.id and status in ('confirmed', 'pending')
    loop
      update resource_reservations
      set starts_at = new.starts_at, ends_at = new.ends_at, updated_at = now()
      where id = v_reserva.id;

      if v_reserva.status = 'confirmed' then
        perform app.move_occupancy(v_reserva.id, null, new.starts_at, new.ends_at);
      end if;

      perform app.write_audit_log(new.church_id, 'reservation.rescheduled',
        'resource_reservations', v_reserva.id,
        jsonb_build_object('cause', 'activity_rescheduled', 'activity_id', new.id,
                           'starts_at', new.starts_at, 'ends_at', new.ends_at));
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function app.activities_sync_reservations() from public, anon, authenticated;

-- El aviso de mantenimiento asignado va en un trigger y no dentro de
-- save_maintenance, por dos motivos: así la RPC de la migración anterior no
-- depende de una función que se crea después, y así el aviso sale por cualquier
-- ruta de escritura, no solo por la que hoy conocemos.
--
-- Solo avisa cuando el responsable CAMBIA: reasignar avisa, corregir el título
-- no. La clave de deduplicación lleva a quién se asigna, así que devolver la
-- tarea a alguien que ya la tuvo vuelve a avisarle.

create or replace function app.maintenance_notify_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.responsible_person_id is null
     or (tg_op = 'UPDATE' and new.responsible_person_id is not distinct from old.responsible_person_id) then
    return new;
  end if;

  perform app.emit_notification_event(
    new.church_id, 'maintenance.assigned', 'resource_maintenance', new.id, 1,
    array[new.responsible_person_id],
    (select jsonb_build_object(
       'resource_name', r.name, 'title', new.title,
       'starts_at', new.starts_at, 'ends_at', new.ends_at,
       'timezone', coalesce(c.timezone, ch.timezone))
     from resources r
     join churches ch on ch.id = new.church_id
     left join campuses c on c.id = r.campus_id
     where r.id = new.resource_id),
    new.responsible_person_id::text
  );

  return new;
end;
$$;

revoke all on function app.maintenance_notify_assignment() from public, anon, authenticated;

create trigger resource_maintenance_notify_assignment_trg
  after insert or update of responsible_person_id on resource_maintenance
  for each row execute function app.maintenance_notify_assignment();
