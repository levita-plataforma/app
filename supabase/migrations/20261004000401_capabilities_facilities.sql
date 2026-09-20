-- Fase 10 · Capacidades de Recursos e instalaciones, y scope 'resource'.
-- Ver docs/CONTRATO-FASE-10.md §22 y §23.
--
-- El scope 'resource' no existía todavía en church_people_roles.scope_type.
-- Se añade aquí igual que la Fase 7 hizo con 'group': el mecanismo de la Fase 0
-- es genérico, así que basta con admitir el valor.
--
-- Como scope_id no tiene clave foránea genérica —decisión de la Fase 0,
-- comentada en su propio esquema—, que ese uuid sea un recurso vivo del mismo
-- tenant se comprueba en la RPC que concede el permiso, no en la tabla.

insert into capabilities (key, description, module_key) values
  ('facilities.read', 'Ver el catálogo de recursos y su disponibilidad', 'facilities'),
  ('facilities.manage_resources', 'Crear, editar, archivar y restaurar recursos', 'facilities'),
  ('facilities.create_reservation', 'Reservar un recurso', 'facilities'),
  ('facilities.manage_reservations', 'Editar y cancelar reservas de otras personas', 'facilities'),
  ('facilities.approve_reservations', 'Aprobar o rechazar reservas pendientes', 'facilities'),
  ('facilities.manage_maintenance', 'Programar, ejecutar y cancelar mantenimientos', 'facilities');

-- church_owner, church_admin y campus_admin reciben todas. Como en las fases
-- anteriores se conceden explícitamente: el seed de la Fase 0 solo cubrió las
-- capacidades que existían entonces.
insert into role_capabilities (role_key, capability_key)
select r.role_key, c.key
from (values ('church_owner'), ('church_admin'), ('campus_admin')) as r (role_key)
cross join capabilities c
where c.module_key = 'facilities';

-- ministry_leader recibe dos y solo dos: consultar y reservar. Mismo criterio
-- que la Fase 4, donde tampoco recibe activity.manage por defecto (ADR 0017,
-- decisión 12): quien coordina un área necesita ver si el auditorio está libre
-- y reservarlo para su ensayo, no administrar el catálogo ni aprobar lo que
-- piden los demás.
insert into role_capabilities (role_key, capability_key) values
  ('ministry_leader', 'facilities.read'),
  ('ministry_leader', 'facilities.create_reservation');

-- member solo consulta. Reservar exige una concesión expresa: si una iglesia
-- quiere que cualquiera pueda coger el proyector de préstamo, concede
-- facilities.create_reservation por rol, no se amplía el permiso base de todos.
insert into role_capabilities (role_key, capability_key) values
  ('member', 'facilities.read');

-- scope 'resource' ------------------------------------------------------------
--
-- No hay nada que alterar: church_people_roles.scope_type admite 'resource'
-- desde la Fase 0 (20260916000700:74), junto a 'module' y 'pastoral_case' que
-- tampoco usa nadie todavía. Esta fase es la primera que lo emplea de verdad,
-- igual que la Fase 7 estrenó 'group'.
--
-- Reescribir ese check para «añadir» el valor habría sido un error caro: la
-- restricción se declaró en línea, y una versión nueva que olvidara 'module' o
-- 'pastoral_case' rompería concesiones de otras fases.

-- app.resource_cap -------------------------------------------------------------
--
-- Capacidad efectiva sobre un recurso: vale tenerla en toda la iglesia, en la
-- sede del recurso, o sobre ese recurso concreto. Mismo patrón exacto que
-- app.activity_cap (20260920000500), incluido el orden de las comprobaciones.

create or replace function app.resource_cap(
  p_church_id uuid,
  p_campus_id uuid,
  p_resource_id uuid,
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
    or (p_resource_id is not null and app.has_capability(p_church_id, p_capability, 'resource', p_resource_id));
$$;

comment on function app.resource_cap(uuid, uuid, uuid, text) is
  'Capacidad efectiva sobre un recurso, mirando los tres ámbitos: iglesia, sede del recurso y el recurso concreto. Ver docs/CONTRATO-FASE-10.md §23.';

revoke all on function app.resource_cap(uuid, uuid, uuid, text) from public, anon;
grant execute on function app.resource_cap(uuid, uuid, uuid, text) to authenticated;

-- Misma pregunta pero partiendo del id del recurso, que es como la hacen casi
-- todas las políticas: evita repetir el join con resources en cada una.
create or replace function app.resource_cap_by_id(p_resource_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from resources r
    where r.id = p_resource_id
      and app.resource_cap(r.church_id, r.campus_id, r.id, p_capability)
  );
$$;

comment on function app.resource_cap_by_id(uuid, text) is
  'Igual que app.resource_cap pero resolviendo iglesia y sede desde el propio recurso.';

revoke all on function app.resource_cap_by_id(uuid, text) from public, anon;
grant execute on function app.resource_cap_by_id(uuid, text) to authenticated;
