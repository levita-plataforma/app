-- Fase 6 · Comunicación de eventos reutilizando el motor de avisos de
-- Fase 5 (app.emit_notification_event), sin crear un segundo motor.
-- Ver prompt de Fase 6 §35-36.

alter table notification_events drop constraint notification_events_event_type_check;
alter table notification_events add constraint notification_events_event_type_check
  check (event_type in (
    'assignment.proposed',
    'assignment.accepted',
    'assignment.declined',
    'assignment.cancelled',
    'assignment.substituted',
    'assignment.substitution_requested',
    'assignment.substitution_cancelled',
    'assignment.reminder',
    'assignment.coverage_at_risk',
    'activity.rescheduled',
    'event.published',
    'event.cancelled',
    'event.rescheduled',
    'event.reminder',
    'registration.confirmed',
    'registration.waitlisted',
    'registration.promoted',
    'registration.cancelled'
  ));

-- app.event_notification_payload(): payload mínimo, sin datos de otros
-- inscritos ni información administrativa. Ver prompt Fase 6 §35, contrato
-- de payload ya fijado en Fase 5 (CONTRATO-F4-F5.md §5.3).
create or replace function app.event_notification_payload(p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'event_id', e.id,
    'title', a.title,
    'starts_at', a.starts_at,
    'ends_at', a.ends_at,
    'timezone', a.timezone,
    'location_text', a.location_text,
    'public_slug', e.public_slug
  )
  from events e join activities a on a.id = e.activity_id and a.church_id = e.church_id
  where e.id = p_event_id;
$$;

revoke all on function app.event_notification_payload(uuid) from public, anon;
grant execute on function app.event_notification_payload(uuid) to authenticated;

-- app.notify_event_registrants(): envía un evento de dominio a los inscritos
-- (confirmed) de un evento, opcionalmente también a waitlisted/cancelled.
-- Reutiliza app.emit_notification_event (outbox, misma transacción,
-- deduplicación por idempotency_key). No es un segundo motor: es una
-- función de conveniencia sobre el mismo outbox de Fase 5.
create or replace function app.notify_event_registrants(
  p_event_id uuid,
  p_event_type text,
  p_include_statuses registration_status[] default array['confirmed']::registration_status[],
  p_key_suffix text default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event events%rowtype;
  v_recipients uuid[];
  v_count integer;
begin
  select * into v_event from events where id = p_event_id;
  if not found then
    return 0;
  end if;

  select coalesce(array_agg(distinct primary_person_id), '{}')
  into v_recipients
  from registrations
  where event_id = p_event_id
    and status = any(p_include_statuses)
    and primary_person_id is not null;

  v_count := coalesce(array_length(v_recipients, 1), 0);
  if v_count = 0 then
    return 0;
  end if;

  perform app.emit_notification_event(
    v_event.church_id, p_event_type, 'events', p_event_id, null,
    v_recipients, app.event_notification_payload(p_event_id), p_key_suffix
  );

  return v_count;
end;
$$;

revoke all on function app.notify_event_registrants(uuid, text, registration_status[], text) from public, anon;
grant execute on function app.notify_event_registrants(uuid, text, registration_status[], text) to authenticated;

create or replace function public.notify_event_registrants(
  p_event_id uuid,
  p_event_type text,
  p_include_statuses registration_status[] default array['confirmed']::registration_status[],
  p_key_suffix text default null
)
returns integer
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.notify_event_registrants(p_event_id, p_event_type, p_include_statuses, p_key_suffix);
$$;

revoke all on function public.notify_event_registrants(uuid, text, registration_status[], text) from public;
grant execute on function public.notify_event_registrants(uuid, text, registration_status[], text) to authenticated;

-- Emisión automática al confirmar/waitlistear/promocionar/cancelar una
-- registration individual (§36: idempotente, sin duplicados por edición sin
-- cambio real — la clave de deduplicación usa registration_id + status).
create or replace function app.emit_registration_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event_type text;
  v_church_id uuid;
begin
  if new.primary_person_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_event_type := case new.status
      when 'confirmed' then 'registration.confirmed'
      when 'waitlisted' then 'registration.waitlisted'
      else null
    end;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_event_type := case new.status
      when 'confirmed' then case when old.status = 'waitlisted' then 'registration.promoted' else 'registration.confirmed' end
      when 'cancelled' then 'registration.cancelled'
      when 'waitlisted' then 'registration.waitlisted'
      else null
    end;
  end if;

  if v_event_type is null then
    return new;
  end if;

  select church_id into v_church_id from events where id = new.event_id;

  perform app.emit_notification_event(
    v_church_id, v_event_type, 'registrations', new.id, null,
    array[new.primary_person_id], app.event_notification_payload(new.event_id),
    new.status::text
  );

  return new;
end;
$$;

create trigger registrations_emit_notification
  after insert or update of status on registrations
  for each row execute function app.emit_registration_notification();
