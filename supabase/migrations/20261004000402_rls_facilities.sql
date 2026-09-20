-- Fase 10 · RLS y privilegios de Recursos e instalaciones.
-- Ver docs/CONTRATO-FASE-10.md §25.
--
-- Mismo modelo que las fases 4 y 7: toda escritura pasa por RPC security
-- definer, así que insert, update y delete quedan revocados y aquí no se crea
-- ninguna política de escritura. Lo que hay son políticas de lectura.
--
-- La Fase 10 no tiene superficie pública: anon no lee nada de esto (decisión
-- P-18, el calendario de salas no es público). Los privilegios por defecto de
-- PostgreSQL conceden EXECUTE a PUBLIC, de ahí los revoke explícitos en las
-- migraciones de funciones, ahora también comprobados por
-- hotfix_revokes_publicos_test.sql.

alter table resources enable row level security;
alter table resources force row level security;
alter table resource_reservations enable row level security;
alter table resource_reservations force row level security;
alter table resource_maintenance enable row level security;
alter table resource_maintenance force row level security;
alter table resource_occupancy enable row level security;
alter table resource_occupancy force row level security;

-- Privilegios -----------------------------------------------------------------

do $privs$
declare
  v_table text;
begin
  foreach v_table in array array[
    'resources', 'resource_reservations', 'resource_maintenance', 'resource_occupancy'
  ]
  loop
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
    execute format('grant select on table public.%I to authenticated', v_table);
  end loop;
end;
$privs$;

-- El gate del módulo -----------------------------------------------------------
--
-- Ver el catálogo exige tener el módulo contratado y la capacidad de lectura.
-- Se comprueba en la base y no solo escondiendo el menú: ocultar una pantalla
-- no es una barrera.

create or replace function app.can_read_facilities(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app.module_enabled(p_church_id, 'facilities')
     and app.has_capability(p_church_id, 'facilities.read');
$$;

comment on function app.can_read_facilities(uuid) is
  'Puerta de lectura del módulo: entitlement activo y facilities.read. Ver docs/CONTRATO-FASE-10.md §24.';

revoke all on function app.can_read_facilities(uuid) from public, anon;
grant execute on function app.can_read_facilities(uuid) to authenticated;

-- Políticas de lectura ---------------------------------------------------------

-- El catálogo lo ve quien tiene facilities.read en la iglesia. No se afina por
-- sede: saber que existe una sala en otra sede no revela nada, y sin esto no se
-- puede consultar disponibilidad para planificar, que es el caso de uso normal
-- de quien coordina un área.
create policy resources_select on resources
  for select to authenticated
  using ( app.can_read_facilities(church_id) );

-- Una reserva se ve si se ve el módulo. Lo que NO se ve desde aquí es qué hay
-- detrás de la actividad asociada: eso lo decide la política de activities, que
-- no se toca. Saber que el auditorio está cogido de 10 a 12 no da derecho a
-- saber de qué va la reunión que lo ocupa (§47 del contrato).
create policy resource_reservations_select on resource_reservations
  for select to authenticated
  using ( app.can_read_facilities(church_id) );

create policy resource_maintenance_select on resource_maintenance
  for select to authenticated
  using ( app.can_read_facilities(church_id) );

-- La tabla de ocupación se lee para pintar el calendario de disponibilidad:
-- dice qué franjas están cogidas, sin decir por quién ni para qué.
create policy resource_occupancy_select on resource_occupancy
  for select to authenticated
  using ( app.can_read_facilities(church_id) );

-- resource_maintenance.result_notes y cost_note son anotaciones internas de
-- quien mantiene, y la política de lectura alcanza a cualquiera con
-- facilities.read. Como RLS filtra filas y no columnas, se retiran del grant y
-- las sirve app.maintenance_internal_notes, que sí comprueba capacidad. Mismo
-- criterio que course_cohorts.notes en la Fase 7 y que el contacto de una
-- persona tras R-01.
revoke select on table resource_maintenance from authenticated;
grant select (
  id, church_id, resource_id, type, title, description, status,
  blocks_availability, starts_at, ends_at, responsible_person_id,
  performed_at, performed_by, created_by, created_at, updated_at,
  cancelled_at, cancelled_by
) on table resource_maintenance to authenticated;

create or replace function app.maintenance_internal_notes(p_maintenance_id uuid)
returns table (result_notes text, cost_note text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church uuid;
  v_resource uuid;
begin
  select m.church_id, m.resource_id into v_church, v_resource
  from resource_maintenance m
  where m.id = p_maintenance_id;

  if v_church is null or not (v_church = any (app.church_ids_for_user())) then
    raise exception 'El mantenimiento no existe.' using errcode = 'P0002';
  end if;

  if not app.resource_cap_by_id(v_resource, 'facilities.manage_maintenance') then
    raise exception 'No tienes permiso para ver las notas del mantenimiento.' using errcode = '42501';
  end if;

  return query
  select m.result_notes, m.cost_note
  from resource_maintenance m
  where m.id = p_maintenance_id;
end;
$$;

comment on function app.maintenance_internal_notes(uuid) is
  'Notas de ejecución y coste de un mantenimiento. Fuera del grant de columnas porque las ve cualquiera con facilities.read; aquí se exige manage_maintenance sobre ese recurso.';

revoke all on function app.maintenance_internal_notes(uuid) from public, anon;
grant execute on function app.maintenance_internal_notes(uuid) to authenticated;

create or replace function public.maintenance_internal_notes(p_maintenance_id uuid)
returns table (result_notes text, cost_note text)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.maintenance_internal_notes(p_maintenance_id);
$$;

revoke all on function public.maintenance_internal_notes(uuid) from public, anon;
grant execute on function public.maintenance_internal_notes(uuid) to authenticated;

-- Las funciones de trigger no se pueden invocar con un select, pero los
-- privilegios por defecto les conceden EXECUTE a PUBLIC igual que a cualquier
-- otra. Se revocan al crearlas en las migraciones siguientes.
