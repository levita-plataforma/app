-- Fase 7 · Capacidades de Grupos y Discipulado, y activación del scope 'group'.
-- Ver docs/CONTRATO-FASE-7.md §5.
--
-- El scope 'group' está admitido en church_people_roles.scope_type desde la
-- Fase 0 (20260916000700_rbac_capabilities_scopes.sql:74) y el rol
-- 'group_leader' existe desde entonces sin ninguna capacidad asociada. Esta
-- migración es la primera que lo usa de verdad.
--
-- Como scope_id no tiene clave foránea genérica (decisión de la Fase 0,
-- comentada en el propio esquema), la validación de que ese uuid es un grupo
-- vivo del mismo tenant se hace en la RPC de concesión de liderazgo
-- (20260926000500_rpc_grupos.sql).

insert into capabilities (key, description, module_key) values
  ('group.read', 'Ver el directorio interno de grupos y la ficha de los grupos de su ámbito', 'groups'),
  ('group.create', 'Crear grupos y tipos de grupo', 'groups'),
  ('group.manage', 'Editar, pausar, cerrar y archivar grupos', 'groups'),
  ('group.member.manage', 'Añadir y dar de baja participantes de un grupo', 'groups'),
  ('group.request.manage', 'Aceptar y rechazar solicitudes de ingreso', 'groups'),
  ('group.meeting.manage', 'Programar, editar y cancelar reuniones de grupo', 'groups'),
  ('group.attendance.manage', 'Registrar y corregir la asistencia a reuniones', 'groups'),
  ('group.contact.read', 'Ver el contacto de participantes que no lo han hecho visible', 'groups'),
  ('course.read', 'Ver cursos, cohortes y sesiones de su ámbito', 'discipleship'),
  ('course.create', 'Crear cursos y cohortes', 'discipleship'),
  ('course.manage', 'Editar, cerrar y archivar cursos y cohortes, y sus sesiones', 'discipleship'),
  ('course.enrollment.manage', 'Matricular, resolver solicitudes y dar por terminado a un matriculado', 'discipleship'),
  ('course.attendance.manage', 'Registrar y corregir la asistencia a sesiones', 'discipleship'),
  ('path.read', 'Ver itinerarios y sus pasos', 'discipleship'),
  ('path.manage', 'Crear, editar y archivar itinerarios y pasos', 'discipleship'),
  ('path.progress.manage', 'Marcar el progreso de una persona en un itinerario', 'discipleship');

-- church_owner, church_admin y campus_admin reciben todas las capacidades
-- nuevas. Como en fases anteriores, se conceden explícitamente: el seed de la
-- Fase 0 solo cubrió las que existían entonces.
insert into role_capabilities (role_key, capability_key)
select r.role_key, c.key
from (values ('church_owner'), ('church_admin'), ('campus_admin')) as r (role_key)
cross join capabilities c
where c.module_key in ('groups', 'discipleship');

-- group_leader: hasta hoy no tenía ninguna capacidad. Recibe lo necesario para
-- llevar su grupo, y NO recibe group.contact.read: el contacto de una persona
-- solo se ve si esa persona lo ha hecho visible o si quien mira tiene permiso
-- expreso (decisión P-5). Tampoco crea ni archiva grupos.
insert into role_capabilities (role_key, capability_key) values
  ('group_leader', 'group.read'),
  ('group_leader', 'group.member.manage'),
  ('group_leader', 'group.request.manage'),
  ('group_leader', 'group.meeting.manage'),
  ('group_leader', 'group.attendance.manage'),
  ('group_leader', 'course.read'),
  ('group_leader', 'path.read');

-- member: lo justo para el directorio interno y para ver en qué puede formarse.
insert into role_capabilities (role_key, capability_key) values
  ('member', 'group.read'),
  ('member', 'course.read'),
  ('member', 'path.read');

-- Gating de módulo desde la base, plantilla de app.require_serving_module
-- (20260920000700_rpc_actividades.sql:74-86).

create or replace function app.require_groups_module(p_church_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not app.module_enabled(p_church_id, 'groups') then
    raise exception 'El módulo de Grupos no está activo en esta iglesia.'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function app.require_groups_module(uuid) from public, anon;
grant execute on function app.require_groups_module(uuid) to authenticated;

create or replace function app.require_discipleship_module(p_church_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not app.module_enabled(p_church_id, 'discipleship') then
    raise exception 'El módulo de Discipulado no está activo en esta iglesia.'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function app.require_discipleship_module(uuid) from public, anon;
grant execute on function app.require_discipleship_module(uuid) to authenticated;

-- app.group_cap(): capacidad efectiva sobre un grupo, combinando scope church,
-- el campus del grupo y el grupo concreto. Mismo diseño que app.activity_cap
-- (Fase 4) y app.event_cap (Fase 6), pero estrenando scope_type='group'.
create or replace function app.group_cap(
  p_church_id uuid,
  p_campus_id uuid,
  p_group_id uuid,
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
    or (p_group_id is not null and app.has_capability(p_church_id, p_capability, 'group', p_group_id));
$$;

revoke all on function app.group_cap(uuid, uuid, uuid, text) from public, anon;
grant execute on function app.group_cap(uuid, uuid, uuid, text) to authenticated;

-- app.group_cap_by_id(): la misma comprobación resolviendo el campus del grupo.
-- Es la forma cómoda para políticas y RPC que solo tienen el id del grupo.
create or replace function app.group_cap_by_id(p_group_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select app.group_cap(g.church_id, g.campus_id, g.id, p_capability)
    from groups g
    where g.id = p_group_id
  ), false);
$$;

revoke all on function app.group_cap_by_id(uuid, text) from public, anon;
grant execute on function app.group_cap_by_id(uuid, text) to authenticated;

-- app.is_group_leader(): liderazgo vigente registrado en group_leaders.
-- Pertenecer a group_leaders NO es la fuente de autorización (misma doctrina
-- que app.position_notification_recipients, 20260923000300:88-97): sirve para
-- saber quién responde del grupo y para elegir destinatarios de avisos, pero
-- lo que autoriza es la capacidad efectiva de app.group_cap.
create or replace function app.is_group_leader(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from group_leaders gl
    where gl.group_id = p_group_id
      and gl.ends_at is null
      and gl.person_id in (select app.current_person_ids())
  );
$$;

revoke all on function app.is_group_leader(uuid) from public, anon;
grant execute on function app.is_group_leader(uuid) to authenticated;

-- app.is_group_member(): participación activa en el grupo.
create or replace function app.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from group_members gm
    where gm.group_id = p_group_id
      and gm.status = 'active'
      and gm.person_id in (select app.current_person_ids())
  );
$$;

revoke all on function app.is_group_member(uuid) from public, anon;
grant execute on function app.is_group_member(uuid) to authenticated;

-- app.can_read_group(): quién ve un grupo.
--   - Grupo 'listed': cualquier persona con pertenencia viva a la iglesia y
--     capacidad group.read (directorio interno, decisión P-1).
--   - Grupo 'private': solo responsables, participantes y quien tenga
--     capacidad de gestión sobre ese grupo.
-- Un grupo archivado solo lo ven quienes pueden gestionarlo, para consultar
-- el historial (D12).
create or replace function app.can_read_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select
      g.church_id = any((select app.church_ids_for_user())::uuid[])
      and (
        app.group_cap(g.church_id, g.campus_id, g.id, 'group.manage')
        or app.group_cap(g.church_id, g.campus_id, g.id, 'group.member.manage')
        or app.is_group_leader(g.id)
        or app.is_group_member(g.id)
        or (
          g.archived_at is null
          and g.visibility = 'listed'
          and app.group_cap(g.church_id, g.campus_id, g.id, 'group.read')
        )
      )
    from groups g
    where g.id = p_group_id
  ), false);
$$;

revoke all on function app.can_read_group(uuid) from public, anon;
grant execute on function app.can_read_group(uuid) to authenticated;

-- app.can_read_group_roster(): quién ve la lista de participantes y
-- responsables de un grupo. Más estrecho que can_read_group: en el directorio
-- interno se ve que el grupo existe, no quién está dentro.
create or replace function app.can_read_group_roster(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select
      g.church_id = any((select app.church_ids_for_user())::uuid[])
      and (
        app.group_cap(g.church_id, g.campus_id, g.id, 'group.manage')
        or app.group_cap(g.church_id, g.campus_id, g.id, 'group.member.manage')
        or app.is_group_leader(g.id)
        or app.is_group_member(g.id)
      )
    from groups g
    where g.id = p_group_id
  ), false);
$$;

revoke all on function app.can_read_group_roster(uuid) from public, anon;
grant execute on function app.can_read_group_roster(uuid) to authenticated;

-- app.can_read_person_contact(): regla P-5. El nombre de un participante se ve
-- siempre; el teléfono y el correo, solo si la persona lo ha hecho visible o
-- si quien mira tiene permiso expreso.
--
-- Aviso: esta función gobierna la superficie que estrena la Fase 7. La
-- política people_select de la Fase 0 sigue dejando leer la fila completa de
-- people a cualquier miembro de la iglesia; estrecharla afecta a F2, F5 y F6 y
-- queda fuera de esta fase (riesgo R-01 del contrato).
create or replace function app.can_read_person_contact(p_church_id uuid, p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    p_person_id in (select app.current_person_ids())
    or app.has_capability(p_church_id, 'people.read')
    or app.has_capability(p_church_id, 'people.manage')
    or app.has_capability_any_scope(p_church_id, 'group.contact.read')
    or exists (
      select 1
      from church_people cp
      join people p on p.id = cp.person_id
      where cp.church_id = p_church_id
        and cp.person_id = p_person_id
        and cp.archived_at is null
        and (cp.directory_visible or p.directory_visible)
    );
$$;

revoke all on function app.can_read_person_contact(uuid, uuid) from public, anon;
grant execute on function app.can_read_person_contact(uuid, uuid) to authenticated;

-- app.course_cap() / app.cohort_cap(): capacidad efectiva sobre formación.
-- El discipulado no estrena scope propio: se resuelve por church y por el
-- campus de la cohorte, como hizo la Fase 6 al no crear un scope 'event'.
create or replace function app.course_cap(p_church_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app.has_capability(p_church_id, p_capability);
$$;

revoke all on function app.course_cap(uuid, text) from public, anon;
grant execute on function app.course_cap(uuid, text) to authenticated;

create or replace function app.cohort_cap(p_cohort_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select app.has_capability(cc.church_id, p_capability)
      or (cc.campus_id is not null
          and app.has_capability(cc.church_id, p_capability, 'campus', cc.campus_id))
    from course_cohorts cc
    where cc.id = p_cohort_id
  ), false);
$$;

revoke all on function app.cohort_cap(uuid, text) from public, anon;
grant execute on function app.cohort_cap(uuid, text) to authenticated;
