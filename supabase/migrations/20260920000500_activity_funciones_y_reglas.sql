-- Fase 4 · Funciones de dominio y reglas (triggers) de actividades.
-- Ver docs/adr/0017.
--
-- Las reglas viven en base de datos para que ninguna vía (RPC, service_role,
-- SQL) pueda saltarse: matriz de estados, bloqueo de actividades cerradas,
-- compatibilidad de sede, pertenencia de personas al tenant e inmutabilidad
-- de snapshots. Las comprobaciones de capability de las transiciones se
-- aplican siempre que hay un usuario autenticado (auth.uid() no nulo).

-- ===========================================================================
-- Zona horaria
-- ===========================================================================
create or replace function app.is_valid_timezone(p_timezone text)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select p_timezone is not null
    and exists (select 1 from pg_timezone_names where name = p_timezone);
$$;

-- Resuelve la zona aplicable: la indicada, o la de la sede, o la de la iglesia.
create or replace function app.resolve_activity_timezone(
  p_church_id uuid,
  p_campus_id uuid,
  p_requested text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_timezone text := nullif(btrim(coalesce(p_requested, '')), '');
begin
  if v_timezone is null and p_campus_id is not null then
    select nullif(btrim(coalesce(c.timezone, '')), '') into v_timezone
    from campuses c
    where c.id = p_campus_id and c.church_id = p_church_id;
  end if;

  if v_timezone is null then
    select ch.timezone into v_timezone from churches ch where ch.id = p_church_id;
  end if;

  if not app.is_valid_timezone(v_timezone) then
    raise exception 'La zona horaria "%" no es una zona IANA válida.', coalesce(v_timezone, '')
      using errcode = '22023';
  end if;

  return v_timezone;
end;
$$;

-- Convierte una fecha-hora local (sin zona) a instante. Semántica de
-- PostgreSQL, fijada por tests: una hora inexistente por cambio a horario de
-- verano se desplaza hacia delante (02:30 -> 03:30); una hora ambigua por
-- vuelta a horario estándar se resuelve en horario estándar (la segunda).
create or replace function app.local_to_instant(p_local timestamp, p_timezone text)
returns timestamptz
language sql
stable
set search_path = pg_catalog, public
as $$
  select p_local at time zone p_timezone;
$$;

revoke all on function app.is_valid_timezone(text) from public, anon;
revoke all on function app.resolve_activity_timezone(uuid, uuid, text) from public, anon;
revoke all on function app.local_to_instant(timestamp, text) from public, anon;
grant execute on function app.is_valid_timezone(text) to authenticated;
grant execute on function app.resolve_activity_timezone(uuid, uuid, text) to authenticated;
grant execute on function app.local_to_instant(timestamp, text) to authenticated;

-- ===========================================================================
-- Autorización por ámbito
-- ===========================================================================

-- Capability sobre una actividad: scope church, o campus de la actividad
-- (solo si tiene sede), o la actividad concreta.
create or replace function app.activity_cap(
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

-- Gestión de puestos de un área dentro de una actividad: quien gestiona la
-- actividad, o activity_positions.manage en su ámbito (incluido service_area).
create or replace function app.activity_area_positions_cap(
  p_church_id uuid,
  p_campus_id uuid,
  p_activity_id uuid,
  p_service_area_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select app.activity_cap(p_church_id, p_campus_id, p_activity_id, 'activity.manage')
    or app.activity_cap(p_church_id, p_campus_id, p_activity_id, 'activity_positions.manage')
    or (p_service_area_id is not null
        and app.has_capability(p_church_id, 'activity_positions.manage', 'service_area', p_service_area_id));
$$;

-- ¿Tiene la capability en algún scope? (p. ej. para ver plantillas globales
-- quien solo puede crear actividades en su sede).
create or replace function app.has_capability_any_scope(p_church_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from church_people_roles cpr
    join church_people cp on cp.id = cpr.church_people_id and cp.church_id = cpr.church_id
    join role_capabilities rc on rc.role_key = cpr.role_key
    where cpr.church_id = p_church_id
      and cp.person_id in (select app.current_person_ids())
      and cp.archived_at is null
      and rc.capability_key = p_capability
  );
$$;

-- Audiencia "leaders": cualquier rol distinto de member o liderazgo activo de área.
create or replace function app.is_church_leader(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from church_people_roles cpr
    join church_people cp on cp.id = cpr.church_people_id and cp.church_id = cpr.church_id
    where cpr.church_id = p_church_id
      and cp.person_id in (select app.current_person_ids())
      and cp.archived_at is null
      and cpr.role_key <> 'member'
  ) or exists (
    select 1
    from service_area_leaders sal
    where sal.church_id = p_church_id
      and sal.person_id in (select app.current_person_ids())
      and (sal.ends_at is null or sal.ends_at > now())
  );
$$;

-- Lectura de una actividad (usada por la política RLS de activities).
-- Orden: primero las comprobaciones baratas por fila.
create or replace function app.can_read_activity_row(
  p_activity_id uuid,
  p_church_id uuid,
  p_campus_id uuid,
  p_status activity_status,
  p_visibility activity_visibility,
  p_organizer_person_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not (p_church_id = any (app.church_ids_for_user())) then
    return false;
  end if;

  -- Audiencia general: solo actividades publicadas o ya cerradas (no
  -- borradores, planificadas ni archivadas).
  if p_status in ('published', 'completed', 'cancelled') then
    if p_visibility in ('members', 'public_future') then
      return true;
    end if;
    if p_visibility = 'leaders' and app.is_church_leader(p_church_id) then
      return true;
    end if;
  end if;

  if p_organizer_person_id is not null
     and p_organizer_person_id = app.current_person_id(p_church_id) then
    return true;
  end if;

  if app.activity_cap(p_church_id, p_campus_id, p_activity_id, 'activity.read')
     or app.activity_cap(p_church_id, p_campus_id, p_activity_id, 'activity.manage')
     or app.activity_cap(p_church_id, p_campus_id, p_activity_id, 'activity.publish')
     or app.activity_cap(p_church_id, p_campus_id, p_activity_id, 'activity.cancel')
     or app.activity_cap(p_church_id, p_campus_id, p_activity_id, 'activity.archive')
     or app.activity_cap(p_church_id, p_campus_id, p_activity_id, 'activity_plan.manage') then
    return true;
  end if;

  -- Líder de un área que participa en la actividad.
  return exists (
    select 1
    from activity_service_areas asa
    where asa.activity_id = p_activity_id
      and asa.service_area_id is not null
      and (
        app.has_capability(p_church_id, 'activity.read', 'service_area', asa.service_area_id)
        or app.has_capability(p_church_id, 'activity_positions.manage', 'service_area', asa.service_area_id)
      )
  );
end;
$$;

create or replace function app.can_read_activity(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select app.can_read_activity_row(a.id, a.church_id, a.campus_id, a.status, a.visibility, a.organizer_person_id)
    from activities a
    where a.id = p_activity_id
  ), false);
$$;

-- Notas administrativas: no se exponen con la audiencia general ni a líderes
-- de área; solo a quien lee o gestiona la actividad en su ámbito.
create or replace function app.can_read_activity_admin_notes(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select app.activity_cap(a.church_id, a.campus_id, a.id, 'activity.read')
        or app.activity_cap(a.church_id, a.campus_id, a.id, 'activity.manage')
    from activities a
    where a.id = p_activity_id
  ), false);
$$;

create or replace function app.can_read_activity_templates(p_church_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_church_id = any (app.church_ids_for_user())
    and (
      app.has_capability_any_scope(p_church_id, 'activity_template.manage')
      or app.has_capability_any_scope(p_church_id, 'activity.create')
    );
$$;

revoke all on function app.activity_cap(uuid, uuid, uuid, text) from public, anon;
revoke all on function app.activity_area_positions_cap(uuid, uuid, uuid, uuid) from public, anon;
revoke all on function app.has_capability_any_scope(uuid, text) from public, anon;
revoke all on function app.is_church_leader(uuid) from public, anon;
revoke all on function app.can_read_activity_row(uuid, uuid, uuid, activity_status, activity_visibility, uuid) from public, anon;
revoke all on function app.can_read_activity(uuid) from public, anon;
revoke all on function app.can_read_activity_admin_notes(uuid) from public, anon;
revoke all on function app.can_read_activity_templates(uuid) from public, anon;
grant execute on function app.activity_cap(uuid, uuid, uuid, text) to authenticated;
grant execute on function app.activity_area_positions_cap(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function app.has_capability_any_scope(uuid, text) to authenticated;
grant execute on function app.is_church_leader(uuid) to authenticated;
grant execute on function app.can_read_activity_row(uuid, uuid, uuid, activity_status, activity_visibility, uuid) to authenticated;
grant execute on function app.can_read_activity(uuid) to authenticated;
grant execute on function app.can_read_activity_admin_notes(uuid) to authenticated;
grant execute on function app.can_read_activity_templates(uuid) to authenticated;

-- ===========================================================================
-- Matriz de estados
-- ===========================================================================
-- Devuelve la capability necesaria para la transición, o null si no existe.
--
--   draft      -> planned                 activity.manage
--   planned    -> draft                   activity.manage
--   draft|planned -> published            activity.publish (estructura sin bloqueos)
--   published  -> planned (despublicar)   activity.publish
--   published  -> completed               activity.publish (no si aún no ha empezado)
--   completed  -> published (reabrir)     activity.publish
--   draft|planned|published -> cancelled  activity.cancel
--   cancelled  -> draft (reactivar)       activity.cancel
--   cualquiera -> archived                activity.archive
--   archived   -> estado previo           activity.archive
create or replace function app.activity_transition_capability(
  p_from activity_status,
  p_to activity_status,
  p_status_before_archive activity_status
)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when p_from = p_to then null
    when p_to = 'archived' then 'activity.archive'
    when p_from = 'archived' then
      case when p_to = coalesce(p_status_before_archive, 'draft') then 'activity.archive' end
    when p_from = 'draft' and p_to = 'planned' then 'activity.manage'
    when p_from = 'planned' and p_to = 'draft' then 'activity.manage'
    when p_from in ('draft', 'planned') and p_to = 'published' then 'activity.publish'
    when p_from = 'published' and p_to = 'planned' then 'activity.publish'
    when p_from = 'published' and p_to = 'completed' then 'activity.publish'
    when p_from = 'completed' and p_to = 'published' then 'activity.publish'
    when p_from in ('draft', 'planned', 'published') and p_to = 'cancelled' then 'activity.cancel'
    when p_from = 'cancelled' and p_to = 'draft' then 'activity.cancel'
  end;
$$;

grant execute on function app.activity_transition_capability(activity_status, activity_status, activity_status) to authenticated;

-- ===========================================================================
-- Cobertura (Fase 4: assigned_count siempre 0)
-- ===========================================================================
-- uncovered: 0 asignados y mínimo > 0
-- partially_covered: 0 < asignados < mínimo
-- covered: mínimo <= asignados <= máximo (o sin máximo). Mínimo 0 con 0
--          asignados cuenta como covered: el puesto no exige a nadie.
-- overstaffed: asignados > máximo (nunca si máximo es null)
create or replace function app.position_coverage_status(p_min integer, p_max integer, p_assigned integer)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case
    when p_max is not null and p_assigned > p_max then 'overstaffed'
    when p_assigned >= p_min then 'covered'
    when p_assigned = 0 then 'uncovered'
    else 'partially_covered'
  end;
$$;

grant execute on function app.position_coverage_status(integer, integer, integer) to authenticated;

-- ===========================================================================
-- Incidencias de estructura
-- ===========================================================================
-- severity 'blocking' impide publicar. 'warning' informa.
-- Variante interna sin comprobación de lectura: la usan triggers y funciones
-- definer que ya validaron el acceso. No se concede a authenticated.
create or replace function app.activity_structure_issues_unchecked(p_activity_id uuid)
returns table (
  code text,
  severity text,
  activity_service_area_id uuid,
  activity_position_id uuid
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_activity activities%rowtype;
  v_item record;
  v_cursor integer := 0;
  v_end integer := 0;
  v_has_plan boolean := false;
  v_overlap boolean := false;
  v_previous_end integer;
begin
  select * into v_activity from activities a where a.id = p_activity_id;
  if not found then
    return;
  end if;

  -- Áreas obligatorias sin ningún puesto.
  return query
  select 'required_area_without_positions', 'blocking', asa.id, null::uuid
  from activity_service_areas asa
  where asa.activity_id = p_activity_id
    and asa.requirement = 'required'
    and not exists (select 1 from activity_positions ap where ap.activity_service_area_id = asa.id);

  return query
  select 'optional_area_without_positions', 'warning', asa.id, null::uuid
  from activity_service_areas asa
  where asa.activity_id = p_activity_id
    and asa.requirement = 'optional'
    and not exists (select 1 from activity_positions ap where ap.activity_service_area_id = asa.id);

  -- Sede incompatible según el catálogo vigente (p. ej. el área se movió de
  -- sede después de añadirla).
  if v_activity.campus_id is not null then
    return query
    select 'area_campus_mismatch', 'blocking', asa.id, null::uuid
    from activity_service_areas asa
    left join service_areas sa on sa.id = asa.service_area_id
    where asa.activity_id = p_activity_id
      and coalesce(sa.campus_id, case when sa.id is null then asa.area_campus_id end) is not null
      and coalesce(sa.campus_id, case when sa.id is null then asa.area_campus_id end) <> v_activity.campus_id;

    return query
    select 'position_campus_mismatch', 'blocking', ap.activity_service_area_id, ap.id
    from activity_positions ap
    join service_positions sp on sp.id = ap.service_position_id
    where ap.activity_id = p_activity_id
      and sp.campus_id is not null
      and sp.campus_id <> v_activity.campus_id;
  end if;

  -- Elementos de catálogo retirados después de copiarlos (el snapshot sigue
  -- siendo válido; se avisa por si hay que revisarlo).
  return query
  select 'catalog_area_unavailable', 'warning', asa.id, null::uuid
  from activity_service_areas asa
  left join service_areas sa on sa.id = asa.service_area_id
  where asa.activity_id = p_activity_id
    and (sa.id is null or sa.archived_at is not null or not sa.active);

  return query
  select 'catalog_position_unavailable', 'warning', ap.activity_service_area_id, ap.id
  from activity_positions ap
  left join service_positions sp on sp.id = ap.service_position_id
  where ap.activity_id = p_activity_id
    and ap.catalog_snapshot is not null
    and (sp.id is null or sp.archived_at is not null or not sp.active);

  if v_activity.type in ('service', 'event', 'rehearsal')
     and not exists (select 1 from activity_service_areas asa where asa.activity_id = p_activity_id) then
    return query select 'no_areas', 'warning', null::uuid, null::uuid;
  end if;

  -- Línea temporal del plan: solapes entre bloques y plan más largo que la
  -- actividad (esto último solo con horario). Se permiten; se avisan.
  for v_item in
    select pi.duration_minutes, pi.start_offset_minutes
    from activity_plan_items pi
    where pi.activity_id = p_activity_id
    order by pi.sort_order
  loop
    v_has_plan := true;
    v_cursor := coalesce(v_item.start_offset_minutes, v_cursor);
    if v_previous_end is not null and v_cursor < v_previous_end then
      v_overlap := true;
    end if;
    v_cursor := v_cursor + coalesce(v_item.duration_minutes, 0);
    v_previous_end := v_cursor;
    v_end := greatest(v_end, v_cursor);
  end loop;

  if v_overlap then
    return query select 'plan_items_overlap', 'warning', null::uuid, null::uuid;
  end if;

  if v_has_plan and v_activity.schedule_kind = 'timed'
     and v_end > extract(epoch from (v_activity.ends_at - v_activity.starts_at)) / 60 then
    return query select 'plan_exceeds_activity', 'warning', null::uuid, null::uuid;
  end if;
end;
$$;

-- Variante para usuarios: solo actividades que el usuario puede leer.
create or replace function app.activity_structure_issues(p_activity_id uuid)
returns table (
  code text,
  severity text,
  activity_service_area_id uuid,
  activity_position_id uuid
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select i.*
  from app.activity_structure_issues_unchecked(p_activity_id) i
  where auth.uid() is null or app.can_read_activity(p_activity_id);
$$;

revoke all on function app.activity_structure_issues_unchecked(uuid) from public, anon, authenticated;
revoke all on function app.activity_structure_issues(uuid) from public, anon;
grant execute on function app.activity_structure_issues(uuid) to authenticated;

-- ===========================================================================
-- Contrato para Fase 5
-- ===========================================================================
-- Requisitos efectivos de un puesto en una actividad (heredados no
-- desactivados + añadidos). NO evalúa elegibilidad ni vigencia en la fecha de
-- la actividad: app.evaluate_person_eligibility (Fase 3) trabaja contra el
-- puesto de catálogo y now(). Fase 5 debe añadir la evaluación por actividad.
create or replace function app.activity_position_effective_requirements(p_activity_position_id uuid)
returns setof activity_position_requirements
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select apr.*
  from activity_position_requirements apr
  where apr.activity_position_id = p_activity_position_id
    and not apr.disabled
    and (auth.uid() is null or app.can_read_activity(apr.activity_id))
  order by apr.created_at, apr.id;
$$;

-- ¿Admite la actividad asignaciones futuras? (Fase 5). Canceladas, completadas,
-- archivadas, borradores y actividades ya terminadas no.
create or replace function app.activity_accepts_assignments(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select a.status in ('planned', 'published')
      and (a.schedule_kind = 'flexible' or a.ends_at > now())
    from activities a
    where a.id = p_activity_id
      and (auth.uid() is null or app.can_read_activity(a.id))
  ), false);
$$;

revoke all on function app.activity_position_effective_requirements(uuid) from public, anon;
revoke all on function app.activity_accepts_assignments(uuid) from public, anon;
grant execute on function app.activity_position_effective_requirements(uuid) to authenticated;
grant execute on function app.activity_accepts_assignments(uuid) to authenticated;

-- ===========================================================================
-- Triggers de activities
-- ===========================================================================
create or replace function app.assert_active_church_person(p_church_id uuid, p_person_id uuid, p_label text)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_person_id is not null and not exists (
    select 1 from church_people cp
    where cp.church_id = p_church_id
      and cp.person_id = p_person_id
      and cp.archived_at is null
  ) then
    raise exception '% debe ser una persona activa de la iglesia.', p_label using errcode = '22023';
  end if;
end;
$$;

create or replace function app.activities_before_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  new.timezone := app.resolve_activity_timezone(new.church_id, new.campus_id, new.timezone);

  if auth.uid() is not null and new.status <> 'draft' then
    raise exception 'Una actividad nueva siempre empieza en borrador.' using errcode = '22023';
  end if;

  perform app.assert_active_church_person(new.church_id, new.organizer_person_id, 'El organizador');

  if new.status = 'archived' then
    new.archived_at := coalesce(new.archived_at, now());
  end if;
  if new.status = 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  end if;

  return new;
end;
$$;

create or replace function app.activities_before_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_capability text;
  v_actor uuid := auth.uid();
  v_content_changed boolean;
  v_blocking text;
begin
  if new.id <> old.id or new.church_id <> old.church_id then
    raise exception 'No se puede cambiar la identidad ni la iglesia de una actividad.' using errcode = '22023';
  end if;

  v_content_changed :=
    new.type is distinct from old.type
    or new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.campus_id is distinct from old.campus_id
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.timezone is distinct from old.timezone
    or new.schedule_kind is distinct from old.schedule_kind
    or new.visibility is distinct from old.visibility
    or new.organizer_person_id is distinct from old.organizer_person_id
    or new.location_text is distinct from old.location_text;

  -- Actividades cerradas: histórico inmutable salvo cambios de estado.
  -- (Un organizador que deja de existir se anula por FK: se permite.)
  if old.status in ('completed', 'cancelled', 'archived') and v_content_changed
     and not (
       new.organizer_person_id is null and old.organizer_person_id is not null
       and new.type is not distinct from old.type
       and new.title is not distinct from old.title
       and new.description is not distinct from old.description
       and new.campus_id is not distinct from old.campus_id
       and new.starts_at is not distinct from old.starts_at
       and new.ends_at is not distinct from old.ends_at
       and new.timezone is not distinct from old.timezone
       and new.schedule_kind is not distinct from old.schedule_kind
       and new.visibility is not distinct from old.visibility
       and new.location_text is not distinct from old.location_text
     ) then
    raise exception 'La actividad está %: no se puede modificar su contenido.',
      case old.status when 'completed' then 'completada' when 'cancelled' then 'cancelada' else 'archivada' end
      using errcode = '22023';
  end if;

  if new.timezone is distinct from old.timezone and not app.is_valid_timezone(new.timezone) then
    raise exception 'La zona horaria "%" no es una zona IANA válida.', new.timezone using errcode = '22023';
  end if;

  if new.organizer_person_id is distinct from old.organizer_person_id and new.organizer_person_id is not null then
    perform app.assert_active_church_person(new.church_id, new.organizer_person_id, 'El organizador');
  end if;

  -- Cambio de sede: no puede dejar áreas o puestos incompatibles.
  if new.campus_id is distinct from old.campus_id and new.campus_id is not null then
    if exists (
      select 1
      from activity_service_areas asa
      left join service_areas sa on sa.id = asa.service_area_id
      where asa.activity_id = new.id
        -- Mismo criterio que activity_structure_issues: catálogo vigente si
        -- existe; snapshot solo si el área de catálogo ya no existe.
        and (case when sa.id is null then asa.area_campus_id else sa.campus_id end) is not null
        and (case when sa.id is null then asa.area_campus_id else sa.campus_id end) <> new.campus_id
    ) or exists (
      select 1
      from activity_positions ap
      join service_positions sp on sp.id = ap.service_position_id
      where ap.activity_id = new.id
        and sp.campus_id is not null
        and sp.campus_id <> new.campus_id
    ) then
      raise exception 'La actividad tiene áreas o puestos de otra sede: retíralos antes de cambiar la sede.'
        using errcode = '22023';
    end if;
  end if;

  if new.status = old.status then
    -- Los metadatos de ciclo de vida solo cambian con una transición.
    new.archived_at := old.archived_at;
    new.archived_by := old.archived_by;
    new.cancelled_at := old.cancelled_at;
    new.cancelled_by := old.cancelled_by;
    new.cancellation_reason := old.cancellation_reason;
    new.published_at := old.published_at;
    new.published_by := old.published_by;
    new.completed_at := old.completed_at;
    new.status_before_archive := old.status_before_archive;
    return new;
  end if;

  v_capability := app.activity_transition_capability(old.status, new.status, old.status_before_archive);
  if v_capability is null then
    raise exception 'Transición de estado no permitida: % → %.', old.status, new.status using errcode = '22023';
  end if;

  if v_actor is not null
     and not app.activity_cap(old.church_id, old.campus_id, old.id, v_capability) then
    raise exception 'No autorizado para cambiar el estado de la actividad (%).', v_capability using errcode = '42501';
  end if;

  -- Desarchivar restaura el estado previo tal cual: conserva motivo y fechas
  -- de cancelación, publicación y completado, y no revalida la estructura.
  if old.status = 'archived' then
    new.archived_at := null;
    new.archived_by := null;
    new.status_before_archive := null;
    new.cancelled_at := old.cancelled_at;
    new.cancelled_by := old.cancelled_by;
    new.cancellation_reason := old.cancellation_reason;
    new.published_at := old.published_at;
    new.published_by := old.published_by;
    new.completed_at := old.completed_at;
    return new;
  end if;

  if new.status = 'published' then
    select string_agg(distinct i.code, ', ') into v_blocking
    from app.activity_structure_issues_unchecked(new.id) i
    where i.severity = 'blocking';
    if v_blocking is not null then
      raise exception 'La estructura de la actividad no es válida para publicar: %.', v_blocking using errcode = '22023';
    end if;
    if old.status <> 'completed' then
      new.published_at := now();
      new.published_by := v_actor;
    end if;
    new.completed_at := null;
  elsif new.status = 'completed' then
    if new.schedule_kind = 'timed' and new.starts_at > now() then
      raise exception 'No se puede completar una actividad que todavía no ha empezado.' using errcode = '22023';
    end if;
    new.completed_at := now();
  elsif new.status = 'cancelled' then
    new.cancelled_at := now();
    new.cancelled_by := v_actor;
    new.cancellation_reason := nullif(btrim(coalesce(new.cancellation_reason, '')), '');
  elsif new.status = 'archived' then
    new.archived_at := now();
    new.archived_by := v_actor;
    new.status_before_archive := old.status;
    new.cancellation_reason := old.cancellation_reason;
  elsif new.status = 'planned' and old.status = 'published' then
    new.published_at := null;
    new.published_by := null;
  elsif new.status = 'draft' and old.status = 'cancelled' then
    new.cancelled_at := null;
    new.cancelled_by := null;
    new.cancellation_reason := null;
    new.published_at := null;
    new.published_by := null;
  end if;

  -- El motivo solo se fija al cancelar y solo se borra al reactivar.
  if new.status <> 'cancelled' and not (old.status = 'cancelled' and new.status = 'draft') then
    new.cancellation_reason := old.cancellation_reason;
  end if;

  return new;
end;
$$;

create trigger activities_before_insert
  before insert on activities
  for each row execute function app.activities_before_insert();

create trigger activities_before_update
  before update on activities
  for each row execute function app.activities_before_update();

-- ===========================================================================
-- Triggers de estructura por actividad
-- ===========================================================================

-- Indicador de transacción para copias exactas internas. Solo lo fijan
-- funciones security definer (app.copy_activity_structure); la API no permite
-- ejecutar set_config y las escrituras directas están revocadas.
create or replace function app.is_structure_copy()
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(current_setting('app.structure_copy', true), '') = 'on';
$$;

-- Estructura editable solo en draft/planned/published. Devuelve null si la
-- actividad ya no existe (borrado en cascada de la iglesia).
create or replace function app.activity_structure_editable(p_activity_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status activity_status;
begin
  select a.status into v_status from activities a where a.id = p_activity_id;
  if not found then
    return null;
  end if;
  if v_status not in ('draft', 'planned', 'published') then
    raise exception 'La actividad no admite cambios de estructura en su estado actual.' using errcode = '22023';
  end if;
  return true;
end;
$$;

create or replace function app.activity_service_areas_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_area service_areas%rowtype;
  v_activity_campus uuid;
begin
  if tg_op = 'DELETE' then
    perform app.activity_structure_editable(old.activity_id);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    -- El catálogo borrado anula la referencia (FK set null): se permite.
    if new.service_area_id is null and old.service_area_id is not null
       and new.activity_id = old.activity_id
       and new.area_name = old.area_name
       and new.area_campus_id is not distinct from old.area_campus_id then
      return new;
    end if;
    if new.activity_id <> old.activity_id
       or new.service_area_id is distinct from old.service_area_id
       or new.area_name <> old.area_name
       or new.area_campus_id is distinct from old.area_campus_id then
      raise exception 'El área y su snapshot no se pueden cambiar; retírala y añade otra.' using errcode = '22023';
    end if;
    perform app.activity_structure_editable(new.activity_id);
    return new;
  end if;

  if app.activity_structure_editable(new.activity_id) is null then
    raise exception 'La actividad no existe.' using errcode = 'P0002';
  end if;

  select a.campus_id into v_activity_campus from activities a where a.id = new.activity_id;

  -- Copia exacta interna (duplicar / aplicar estructura a la serie): se
  -- conserva el snapshot de origen aunque el catálogo haya cambiado, pero la
  -- sede sigue teniendo que ser compatible.
  if app.is_structure_copy() then
    if v_activity_campus is not null and new.area_campus_id is not null and new.area_campus_id <> v_activity_campus then
      raise exception 'El área "%" pertenece a otra sede.', new.area_name using errcode = '22023';
    end if;
    return new;
  end if;

  if new.service_area_id is null then
    raise exception 'Selecciona un área de servicio del catálogo.' using errcode = '22023';
  end if;

  select * into v_area from service_areas sa
  where sa.id = new.service_area_id and sa.church_id = new.church_id;
  if not found then
    raise exception 'El área no pertenece a esta iglesia.' using errcode = '22023';
  end if;
  if v_area.archived_at is not null or not v_area.active then
    raise exception 'El área "%" no está activa.', v_area.name using errcode = '22023';
  end if;

  if v_activity_campus is not null and v_area.campus_id is not null and v_area.campus_id <> v_activity_campus then
    raise exception 'El área "%" pertenece a otra sede.', v_area.name using errcode = '22023';
  end if;

  -- Snapshot fijado por el servidor, nunca por el cliente.
  new.area_name := v_area.name;
  new.area_campus_id := v_area.campus_id;
  return new;
end;
$$;

create trigger activity_service_areas_guard
  before insert or update or delete on activity_service_areas
  for each row execute function app.activity_service_areas_guard();

create or replace function app.activity_positions_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_area activity_service_areas%rowtype;
  v_position service_positions%rowtype;
  v_activity_campus uuid;
begin
  if tg_op = 'DELETE' then
    perform app.activity_structure_editable(old.activity_id);
    return old;
  end if;

  select * into v_area from activity_service_areas asa
  where asa.id = new.activity_service_area_id and asa.church_id = new.church_id;
  if not found then
    raise exception 'El área de la actividad no existe.' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' then
    if new.service_position_id is null and old.service_position_id is not null
       and new.catalog_snapshot is not distinct from old.catalog_snapshot then
      -- Puesto de catálogo borrado (FK set null): se conserva el snapshot.
      new.service_area_id := v_area.service_area_id;
      return new;
    end if;
    if new.activity_id <> old.activity_id
       or new.activity_service_area_id <> old.activity_service_area_id
       or new.service_position_id is distinct from old.service_position_id
       or new.catalog_snapshot is distinct from old.catalog_snapshot
       or new.snapshot_taken_at is distinct from old.snapshot_taken_at then
      raise exception 'El origen y el snapshot de un puesto no se pueden cambiar.' using errcode = '22023';
    end if;
    perform app.activity_structure_editable(new.activity_id);
    new.service_area_id := v_area.service_area_id;
    return new;
  end if;

  if new.activity_id <> v_area.activity_id then
    raise exception 'El puesto y su área deben pertenecer a la misma actividad.' using errcode = '22023';
  end if;
  if app.activity_structure_editable(new.activity_id) is null then
    raise exception 'La actividad no existe.' using errcode = 'P0002';
  end if;

  new.service_area_id := v_area.service_area_id;
  select a.campus_id into v_activity_campus from activities a where a.id = new.activity_id;

  if app.is_structure_copy() then
    if v_activity_campus is not null
       and nullif(new.catalog_snapshot ->> 'campus_id', '')::uuid is not null
       and nullif(new.catalog_snapshot ->> 'campus_id', '')::uuid <> v_activity_campus then
      raise exception 'El puesto "%" pertenece a otra sede.', new.name using errcode = '22023';
    end if;
    return new;
  end if;

  if new.service_position_id is not null then
    select * into v_position from service_positions sp
    where sp.id = new.service_position_id and sp.church_id = new.church_id;
    if not found then
      raise exception 'El puesto no pertenece a esta iglesia.' using errcode = '22023';
    end if;
    if v_position.archived_at is not null or not v_position.active then
      raise exception 'El puesto "%" no está activo.', v_position.name using errcode = '22023';
    end if;
    if v_area.service_area_id is null or v_position.service_area_id <> v_area.service_area_id then
      raise exception 'El puesto "%" no pertenece a esa área.', v_position.name using errcode = '22023';
    end if;
    if v_activity_campus is not null and v_position.campus_id is not null and v_position.campus_id <> v_activity_campus then
      raise exception 'El puesto "%" pertenece a otra sede.', v_position.name using errcode = '22023';
    end if;

    new.catalog_snapshot := jsonb_build_object(
      'name', v_position.name,
      'description', v_position.description,
      'critical', v_position.critical,
      'min_people', v_position.min_people,
      'max_people', v_position.max_people,
      'requires_autonomous_person', v_position.requires_autonomous_person,
      'campus_id', v_position.campus_id,
      'catalog_updated_at', v_position.updated_at
    );
    new.snapshot_taken_at := now();
  else
    new.catalog_snapshot := null;
    new.snapshot_taken_at := null;
  end if;

  return new;
end;
$$;

create trigger activity_positions_guard
  before insert or update or delete on activity_positions
  for each row execute function app.activity_positions_guard();

create or replace function app.activity_position_requirements_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_position activity_positions%rowtype;
begin
  if tg_op = 'DELETE' then
    -- Un requisito heredado se desactiva, no se borra, salvo al borrar el
    -- puesto o la actividad completos (cascada: el padre ya no existe).
    if old.origin = 'inherited'
       and exists (
         select 1 from activity_positions ap
         join activities a on a.id = ap.activity_id
         where ap.id = old.activity_position_id
       ) then
      raise exception 'Un requisito heredado no se elimina: desactívalo para esta actividad.' using errcode = '22023';
    end if;
    perform app.activity_structure_editable(old.activity_id);
    return old;
  end if;

  select * into v_position from activity_positions ap
  where ap.id = new.activity_position_id and ap.church_id = new.church_id;
  if not found then
    raise exception 'El puesto de la actividad no existe.' using errcode = '22023';
  end if;
  new.activity_id := v_position.activity_id;

  if tg_op = 'UPDATE' then
    if new.source_requirement_id is null and old.source_requirement_id is not null
       and new.catalog_snapshot is not distinct from old.catalog_snapshot
       and new.origin = old.origin then
      -- Requisito de catálogo borrado (FK set null): se conserva el snapshot.
      return new;
    end if;
    if new.activity_position_id <> old.activity_position_id
       or new.origin <> old.origin
       or new.source_requirement_id is distinct from old.source_requirement_id
       or new.catalog_snapshot is distinct from old.catalog_snapshot then
      raise exception 'El origen y el snapshot de un requisito no se pueden cambiar.' using errcode = '22023';
    end if;
    if old.origin = 'inherited'
       and (new.requirement_type <> old.requirement_type
            or new.qualification_id is distinct from old.qualification_id
            or new.credential_type_id is distinct from old.credential_type_id) then
      raise exception 'Un override solo ajusta nivel, exigencia o vigencia; para otro requisito, añádelo.' using errcode = '22023';
    end if;
  end if;

  perform app.activity_structure_editable(new.activity_id);
  return new;
end;
$$;

create trigger activity_position_requirements_guard
  before insert or update or delete on activity_position_requirements
  for each row execute function app.activity_position_requirements_guard();

create or replace function app.activity_plan_items_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    perform app.activity_structure_editable(old.activity_id);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.activity_id <> old.activity_id then
      raise exception 'Un bloque no se puede mover a otra actividad.' using errcode = '22023';
    end if;
    -- Persona responsable anulada por FK: se permite.
    if new.responsible_person_id is null and old.responsible_person_id is not null
       and row(new.title, new.item_type, new.duration_minutes, new.start_offset_minutes, new.responsible_text, new.notes, new.sort_order)
           is not distinct from
           row(old.title, old.item_type, old.duration_minutes, old.start_offset_minutes, old.responsible_text, old.notes, old.sort_order) then
      return new;
    end if;
  end if;

  if app.activity_structure_editable(new.activity_id) is null then
    raise exception 'La actividad no existe.' using errcode = 'P0002';
  end if;

  if tg_op = 'INSERT' or new.responsible_person_id is distinct from old.responsible_person_id then
    perform app.assert_active_church_person(new.church_id, new.responsible_person_id, 'La persona responsable');
  end if;

  return new;
end;
$$;

create trigger activity_plan_items_guard
  before insert or update or delete on activity_plan_items
  for each row execute function app.activity_plan_items_guard();

-- ===========================================================================
-- Triggers de plantillas (tenant y sede)
-- ===========================================================================
create or replace function app.activity_template_areas_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_area service_areas%rowtype;
  v_template_campus uuid;
begin
  select * into v_area from service_areas sa
  where sa.id = new.service_area_id and sa.church_id = new.church_id;
  if not found then
    raise exception 'El área no pertenece a esta iglesia.' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' and (v_area.archived_at is not null or not v_area.active) then
    raise exception 'El área "%" no está activa.', v_area.name using errcode = '22023';
  end if;
  select t.campus_id into v_template_campus from activity_templates t where t.id = new.template_id;
  if v_template_campus is not null and v_area.campus_id is not null and v_area.campus_id <> v_template_campus then
    raise exception 'El área "%" pertenece a otra sede.', v_area.name using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger activity_template_areas_guard
  before insert or update on activity_template_areas
  for each row execute function app.activity_template_areas_guard();

create or replace function app.activity_template_positions_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_template_area activity_template_areas%rowtype;
  v_position service_positions%rowtype;
  v_template_campus uuid;
begin
  select * into v_template_area from activity_template_areas ta
  where ta.id = new.template_area_id and ta.church_id = new.church_id;
  if not found or v_template_area.template_id <> new.template_id then
    raise exception 'El área de la plantilla no corresponde.' using errcode = '22023';
  end if;

  if new.service_position_id is not null then
    select * into v_position from service_positions sp
    where sp.id = new.service_position_id and sp.church_id = new.church_id;
    if not found then
      raise exception 'El puesto no pertenece a esta iglesia.' using errcode = '22023';
    end if;
    if v_position.service_area_id <> v_template_area.service_area_id then
      raise exception 'El puesto "%" no pertenece a esa área.', v_position.name using errcode = '22023';
    end if;
    if tg_op = 'INSERT' and (v_position.archived_at is not null or not v_position.active) then
      raise exception 'El puesto "%" no está activo.', v_position.name using errcode = '22023';
    end if;
    select t.campus_id into v_template_campus from activity_templates t where t.id = new.template_id;
    if v_template_campus is not null and v_position.campus_id is not null and v_position.campus_id <> v_template_campus then
      raise exception 'El puesto "%" pertenece a otra sede.', v_position.name using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger activity_template_positions_guard
  before insert or update on activity_template_positions
  for each row execute function app.activity_template_positions_guard();

create or replace function app.activity_templates_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.church_id <> old.church_id then
    raise exception 'No se puede cambiar la iglesia de una plantilla.' using errcode = '22023';
  end if;
  if new.campus_id is distinct from old.campus_id and new.campus_id is not null and (
    exists (
      select 1 from activity_template_areas ta
      join service_areas sa on sa.id = ta.service_area_id
      where ta.template_id = new.id and sa.campus_id is not null and sa.campus_id <> new.campus_id
    ) or exists (
      select 1 from activity_template_positions tp
      join service_positions sp on sp.id = tp.service_position_id
      where tp.template_id = new.id and sp.campus_id is not null and sp.campus_id <> new.campus_id
    )
  ) then
    raise exception 'La plantilla tiene áreas o puestos de otra sede.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger activity_templates_guard
  before update on activity_templates
  for each row execute function app.activity_templates_guard();
