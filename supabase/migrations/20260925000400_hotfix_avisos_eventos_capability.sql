-- Hotfix Fase 6 · F-03 (alto, suplantación institucional):
-- app.notify_event_registrants (20260924000700_avisos_eventos.sql) es
-- `security definer`, no comprobaba NINGUNA capability y su envoltorio
-- public.notify_event_registrants estaba concedido a `authenticated`. Es
-- decir: cualquier usuario con cuenta en la plataforma —miembro raso de otra
-- iglesia— podía, con solo el uuid de un evento, emitir avisos en el outbox a
-- todos los inscritos de ese evento, a nombre de la iglesia dueña
-- (app.emit_notification_event recibe v_event.church_id). Suplantación
-- institucional con el motor de avisos de la Fase 5 como vehículo.
--
-- Corrección:
--   * app.notify_event_registrants exige capability de gestión del evento en
--     su ámbito, con el mismo app.event_cap que usan el resto de operaciones
--     de la fase (app.admin_cancel_registration, app.checkin_attendee):
--     event.registration.manage (quien gestiona inscritos) o event.manage
--     (quien gestiona el evento). Error 42501, que la Server Action
--     enviarComunicacionAction ya traduce a "No tienes permiso...".
--   * app.event_notification_payload se revoca de `authenticated`: no lleva
--     comprobación de lectura y devuelve título, horario y ubicación de
--     cualquier evento por uuid. Sus únicos llamantes son funciones `security
--     definer` de este mismo esquema (la propia notify_event_registrants y el
--     trigger app.emit_registration_notification), que la ejecutan como
--     propietario y no necesitan el grant.

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
  v_activity activities%rowtype;
  v_recipients uuid[];
  v_count integer;
begin
  select * into v_event from events where id = p_event_id;
  if not found then
    return 0;
  end if;

  select a.* into v_activity
  from activities a
  join events e on e.activity_id = a.id and e.church_id = a.church_id
  where e.id = p_event_id;

  if not (
    app.event_cap(v_event.church_id, v_activity.campus_id, v_activity.id, 'event.registration.manage')
    or app.event_cap(v_event.church_id, v_activity.campus_id, v_activity.id, 'event.manage')
  ) then
    raise exception 'No autorizado.' using errcode = '42501';
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

comment on function app.notify_event_registrants(uuid, text, registration_status[], text) is
  'Emite un evento de dominio a los inscritos de un evento reutilizando el outbox de la Fase 5. Exige event.registration.manage o event.manage sobre el evento (hotfix F-03).';

revoke all on function app.notify_event_registrants(uuid, text, registration_status[], text) from public, anon;
grant execute on function app.notify_event_registrants(uuid, text, registration_status[], text) to authenticated;

-- app.event_notification_payload: solo para uso interno de funciones definer.
revoke all on function app.event_notification_payload(uuid) from public, anon, authenticated;

comment on function app.event_notification_payload(uuid) is
  'Payload mínimo de aviso de evento. Uso interno de funciones security definer: no comprueba derecho de lectura, por eso no está concedida a ningún rol de cliente (hotfix F-03).';
