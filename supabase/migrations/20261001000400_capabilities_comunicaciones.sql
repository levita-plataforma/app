-- Fase 9 (Diogo) · Capabilities de comunicación segmentada.
-- Mismo patrón que 20260924000400_capabilities_eventos.sql: el seed de Fase 0
-- no cubre capabilities nuevas, hay que concederlas explícitamente.

insert into capabilities (key, description, module_key) values
  ('communications.read', 'Ver comunicaciones, segmentos y plantillas dentro de su ámbito', 'communications'),
  ('communications.create', 'Crear comunicaciones en borrador', 'communications'),
  ('communications.send', 'Enviar o materializar comunicaciones', 'communications'),
  ('communications.schedule', 'Programar el envío de comunicaciones y cancelarlas antes de procesar', 'communications'),
  ('communications.manage_templates', 'Crear, editar y archivar plantillas', 'communications'),
  ('communications.manage_segments', 'Crear, editar y archivar segmentos reutilizables', 'communications'),
  ('communications.read_metrics', 'Ver métricas agregadas de entrega', 'communications'),
  ('communications.manage_preferences', 'Gestionar preferencias de notificación de otras personas', 'communications');

insert into role_capabilities (role_key, capability_key)
select 'church_owner', key from capabilities where key like 'communications.%'
union all
select 'church_admin', key from capabilities where key like 'communications.%';

insert into role_capabilities (role_key, capability_key)
select 'campus_admin', key from capabilities where key like 'communications.%';

-- Líder de área: puede crear, enviar y programar comunicaciones acotadas a su
-- área (validado en la capa RPC, ver app.communication_cap y
-- app.create_communication en 20261001000600), pero no gestiona plantillas,
-- segmentos globales, métricas agregadas de toda la iglesia ni preferencias
-- de otras personas.
insert into role_capabilities (role_key, capability_key) values
  ('ministry_leader', 'communications.read'),
  ('ministry_leader', 'communications.create'),
  ('ministry_leader', 'communications.send'),
  ('ministry_leader', 'communications.schedule');

-- app.communication_cap(): capability efectiva sobre una comunicación,
-- reutilizando el scope 'service_area' ya existente (análogo a app.event_cap
-- de Fase 6). p_service_area_id es opcional: cuando la comunicación/segmento
-- no está acotada a un área concreta, solo la capability a nivel church basta.
create or replace function app.communication_cap(
  p_church_id uuid,
  p_service_area_id uuid,
  p_capability text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app.has_capability(p_church_id, p_capability)
    or (p_service_area_id is not null and app.has_capability(p_church_id, p_capability, 'service_area', p_service_area_id));
$$;

revoke all on function app.communication_cap(uuid, uuid, text) from public, anon;
grant execute on function app.communication_cap(uuid, uuid, text) to authenticated;
