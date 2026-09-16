-- Fase 4 · Capabilities de actividades y planificación.
--
-- Actividades, calendario y planning son núcleo (module_key null): una
-- iglesia puede programar reuniones o tareas sin contratar Serving. La
-- estructura de servicio por actividad (áreas/puestos/requisitos) exige
-- además el módulo `serving` habilitado; se comprueba en las funciones.
--
-- Scopes admitidos (app.has_capability):
--   church       -> toda la iglesia
--   campus       -> actividades de esa sede (no las globales de iglesia)
--   service_area -> activity.read de actividades con esa área;
--                   activity_positions.manage de los puestos de esa área
--   activity     -> una actividad concreta (activity.read, activity.manage,
--                   activity_plan.manage...)

insert into capabilities (key, description, module_key) values
  ('activity.read', 'Ver actividades en cualquier estado dentro de su ámbito, con notas administrativas', null),
  ('activity.create', 'Crear actividades (desde cero, plantilla o recurrentes)', null),
  ('activity.manage', 'Editar actividades y su estructura dentro de su ámbito', null),
  ('activity_positions.manage', 'Gestionar puestos y requisitos de un área dentro de actividades', null),
  ('activity.publish', 'Publicar, despublicar, completar y reabrir actividades', null),
  ('activity.cancel', 'Cancelar y reactivar actividades canceladas', null),
  ('activity.archive', 'Archivar y desarchivar actividades', null),
  ('activity_template.manage', 'Gestionar plantillas de actividad', null),
  ('activity_plan.manage', 'Gestionar el orden del servicio (planning)', null);

-- Propietario y administración: todas.
insert into role_capabilities (role_key, capability_key)
select r.role_key, c.key
from (values ('church_owner'), ('church_admin')) as r (role_key)
cross join capabilities c
where c.key like 'activity%';

-- Administración de sede: todas, efectivas solo con una asignación de rol
-- con scope_type = 'campus' (o de iglesia, si así se asigna expresamente).
insert into role_capabilities (role_key, capability_key)
select 'campus_admin', key from capabilities where key like 'activity%';

-- Líder de área: consulta actividades donde participa su área y gestiona los
-- puestos de su área dentro de ellas, mediante scope_type = 'service_area'.
-- No recibe activity.manage (edición de la actividad raíz, áreas o plan) ni
-- create/publish/cancel/archive: aunque el rol se asignara por error con
-- scope 'church', no podría editar ni cambiar el estado de actividades.
insert into role_capabilities (role_key, capability_key) values
  ('ministry_leader', 'activity.read'),
  ('ministry_leader', 'activity_positions.manage');
