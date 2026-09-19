-- Fase 8 (Diogo) · Notificaciones Kids reutilizando el motor de Fase 5
-- (app.emit_notification_event), sin crear un segundo motor. Ver prompt
-- Fase 8 §38.
--
-- Payload SIEMPRE mínimo y sin datos sensibles (§38: "no enviar contenido
-- sensible en push/email"): nunca el motivo de una incidencia, nunca notas
-- médicas, nunca el nombre completo del menor si no es imprescindible.

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
    'registration.cancelled',
    'kid.checked_in',
    'kid.checked_out',
    'kid.pickup_denied',
    'kids.ratio_warning',
    'kids.credential_expiring',
    'kids.incident_guardian_notification_required'
  ));

-- app.notify_kid_guardians(): notifica a los guardianes con can_view=true
-- de un menor. Payload mínimo, nunca detalle de incidencia (§38).
create or replace function app.notify_kid_guardians(
  p_church_id uuid,
  p_kid_person_id uuid,
  p_event_type text,
  p_key_suffix text default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_recipients uuid[];
begin
  select coalesce(array_agg(distinct guardian_person_id), '{}')
  into v_recipients
  from kid_guardians
  where church_id = p_church_id and kid_person_id = p_kid_person_id and active and can_view;

  if cardinality(v_recipients) = 0 then
    return 0;
  end if;

  perform app.emit_notification_event(
    p_church_id, p_event_type, 'kid_checkins', p_kid_person_id, null,
    v_recipients,
    jsonb_build_object('kid_person_id', p_kid_person_id),
    p_key_suffix
  );

  return cardinality(v_recipients);
end;
$$;

revoke all on function app.notify_kid_guardians(uuid, uuid, text, text) from public, anon;
grant execute on function app.notify_kid_guardians(uuid, uuid, text, text) to authenticated;

-- Emisión automática al hacer check-in/check-out (trigger sobre
-- kid_checkins, misma transacción que la mutación, igual patrón que Fase 6
-- con registrations_emit_notification).
create or replace function app.emit_kid_checkin_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    perform app.notify_kid_guardians(new.church_id, new.kid_person_id, 'kid.checked_in', new.id::text);
  elsif tg_op = 'UPDATE' and new.status = 'checked_out' and old.status is distinct from 'checked_out' then
    perform app.notify_kid_guardians(new.church_id, new.kid_person_id, 'kid.checked_out', new.id::text);
  end if;
  return new;
end;
$$;

create trigger kid_checkins_emit_notification
  after insert or update of status on kid_checkins
  for each row execute function app.emit_kid_checkin_notification();
