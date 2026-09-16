-- Fase 3 · Capabilities del módulo Serving.
-- Ver prompt de Fase 3 §23.

insert into capabilities (key, description, module_key) values
  ('service.read', 'Ver estructura de servicio (áreas, equipos, puestos)', 'serving'),
  ('service.manage', 'Gestionar configuración general de servicio', 'serving'),
  ('service_area.manage', 'Crear, editar y archivar áreas de servicio', 'serving'),
  ('service_area.leaders.manage', 'Asignar/quitar líderes de área', 'serving'),
  ('service_members.manage', 'Gestionar miembros de áreas de servicio', 'serving'),
  ('service_teams.manage', 'Gestionar equipos permanentes', 'serving'),
  ('service_positions.manage', 'Gestionar puestos y sus requisitos', 'serving'),
  ('qualification.manage', 'Gestionar catálogo de cualificaciones y asignaciones', 'serving'),
  ('credential.read', 'Ver estado de credenciales (sin datos sensibles)', 'serving'),
  ('credential.manage', 'Gestionar tipos de credencial y credenciales de personas', 'serving'),
  ('credential.sensitive.read', 'Ver credenciales marcadas como sensibles (LOPIVI y similares)', 'serving');

-- church_owner y church_admin: el patrón de la Fase 0 concedió "select *
-- from capabilities" en el momento de esa migración, así que no incluye
-- capabilities añadidas después. Se completan aquí explícitamente para las
-- nuevas de Serving.
insert into role_capabilities (role_key, capability_key)
select 'church_owner', key from capabilities
where key like 'service%' or key like 'qualification%' or key like 'credential%'
union all
select 'church_admin', key from capabilities
where key like 'service%' or key like 'qualification%' or key like 'credential%';

-- ministry_leader recibe el subconjunto operativo de su propia área vía
-- scope_type='service_area' en church_people_roles, no aquí: el rol global
-- solo concede lo mínimo de lectura para poder navegar la sección.
insert into role_capabilities (role_key, capability_key) values
  ('ministry_leader', 'service.read'),
  ('ministry_leader', 'service_area.manage'),
  ('ministry_leader', 'service_area.leaders.manage'),
  ('ministry_leader', 'service_members.manage'),
  ('ministry_leader', 'service_teams.manage'),
  ('ministry_leader', 'service_positions.manage'),
  ('ministry_leader', 'qualification.manage'),
  ('ministry_leader', 'credential.read'),
  ('member', 'service.read');
