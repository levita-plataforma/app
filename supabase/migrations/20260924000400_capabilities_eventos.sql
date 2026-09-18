-- Fase 6 · Capabilities de eventos, inscripciones y formularios.
-- Ver prompt de Fase 6 §40.
--
-- Reutiliza el scope 'activity' ya existente (evento = activity + events):
-- una capability con scope_type='activity' y scope_id=activities.id autoriza
-- también las operaciones del events asociado, comprobado en app.event_cap.
-- No se crea un scope 'event' paralelo (evitar multiplicar scopes
-- equivalentes, prompt §40).

insert into capabilities (key, description, module_key) values
  ('event.read', 'Ver eventos en cualquier estado dentro de su ámbito', 'events'),
  ('event.create', 'Crear eventos (desde cero o desde activity existente)', 'events'),
  ('event.manage', 'Editar configuración de evento, inscripción y aforo', 'events'),
  ('event.publish', 'Publicar y despublicar eventos', 'events'),
  ('event.registration.manage', 'Gestionar inscripciones, cancelaciones y waitlist', 'events'),
  ('event.registration.export', 'Exportar inscritos, asistentes y respuestas', 'events'),
  ('event.checkin', 'Hacer y deshacer check-in de asistentes', 'events'),
  ('form.read', 'Ver formularios y respuestas no sensibles', 'events'),
  ('form.manage', 'Crear, editar, versionar y archivar formularios', 'events'),
  ('form.sensitive.manage', 'Crear/editar campos sensitive/restricted y leer sus respuestas', 'events');

-- church_owner y church_admin: igual que en fases anteriores, las
-- capabilities nuevas se conceden explícitamente (el seed de Fase 0 solo
-- cubrió las que existían en su momento).
insert into role_capabilities (role_key, capability_key)
select 'church_owner', key from capabilities where key like 'event%' or key like 'form%'
union all
select 'church_admin', key from capabilities where key like 'event%' or key like 'form%';

insert into role_capabilities (role_key, capability_key)
select 'campus_admin', key from capabilities where key like 'event%' or key like 'form%';

-- Líder de área: puede ver y gestionar inscripciones/check-in de eventos de
-- su área si la actividad tiene área asignada, pero no crea/publica/archiva
-- eventos ni gestiona formularios sensibles.
insert into role_capabilities (role_key, capability_key) values
  ('ministry_leader', 'event.read'),
  ('ministry_leader', 'event.registration.manage'),
  ('ministry_leader', 'event.checkin'),
  ('ministry_leader', 'form.read'),
  ('member', 'event.read');

-- app.event_cap(): capability efectiva sobre un evento, reutilizando el
-- scope 'activity' ya existente en app.has_capability (scope church, campus
-- de la actividad, o la actividad concreta). Ver app.activity_cap (Fase 4).
create or replace function app.event_cap(
  p_church_id uuid,
  p_campus_id uuid,
  p_activity_id uuid,
  p_capability text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app.has_capability(p_church_id, p_capability)
    or (p_campus_id is not null and app.has_capability(p_church_id, p_capability, 'campus', p_campus_id))
    or (p_activity_id is not null and app.has_capability(p_church_id, p_capability, 'activity', p_activity_id));
$$;

revoke all on function app.event_cap(uuid, uuid, uuid, text) from public, anon;
grant execute on function app.event_cap(uuid, uuid, uuid, text) to authenticated;
