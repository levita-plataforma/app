-- Fase 4 · Lecturas de permisos efectivos para la interfaz.
--
-- La UI solo usa estos valores para mostrar u ocultar acciones; la
-- autorización real sigue en las RPC, triggers y RLS. Centralizarlo aquí evita
-- replicar en TypeScript la resolución de scopes church/campus/activity.

create or replace function app.activity_capabilities(p_activity_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_activity activities%rowtype;
  v_areas jsonb;
begin
  select * into v_activity from activities a where a.id = p_activity_id;
  if not found or not app.can_read_activity(p_activity_id) then
    return null;
  end if;

  select coalesce(jsonb_object_agg(asa.id, app.activity_area_positions_cap(
    v_activity.church_id, v_activity.campus_id, v_activity.id, asa.service_area_id)), '{}'::jsonb)
  into v_areas
  from activity_service_areas asa
  where asa.activity_id = p_activity_id;

  return jsonb_build_object(
    'manage', app.activity_cap(v_activity.church_id, v_activity.campus_id, v_activity.id, 'activity.manage'),
    'publish', app.activity_cap(v_activity.church_id, v_activity.campus_id, v_activity.id, 'activity.publish'),
    'cancel', app.activity_cap(v_activity.church_id, v_activity.campus_id, v_activity.id, 'activity.cancel'),
    'archive', app.activity_cap(v_activity.church_id, v_activity.campus_id, v_activity.id, 'activity.archive'),
    'manage_plan', app.activity_cap(v_activity.church_id, v_activity.campus_id, v_activity.id, 'activity_plan.manage')
      or app.activity_cap(v_activity.church_id, v_activity.campus_id, v_activity.id, 'activity.manage'),
    'duplicate', case when v_activity.campus_id is null
      then app.has_capability(v_activity.church_id, 'activity.create')
      else app.has_capability(v_activity.church_id, 'activity.create', 'campus', v_activity.campus_id) end,
    'read_admin_notes', app.can_read_activity_admin_notes(p_activity_id),
    'serving_enabled', app.module_enabled(v_activity.church_id, 'serving'),
    'manage_positions_by_area', v_areas
  );
end;
$$;

-- Ámbitos donde el usuario puede crear actividades o gestionar plantillas.
create or replace function app.activity_creation_scopes(p_church_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_church_id is null or not (p_church_id = any (app.church_ids_for_user())) then
    return null;
  end if;

  return jsonb_build_object(
    'create_church', app.has_capability(p_church_id, 'activity.create'),
    'create_campus_ids', coalesce((
      select jsonb_agg(c.id order by c.sort_order, c.name)
      from campuses c
      where c.church_id = p_church_id and c.archived_at is null
        and app.has_capability(p_church_id, 'activity.create', 'campus', c.id)
    ), '[]'::jsonb),
    'templates_church', app.has_capability(p_church_id, 'activity_template.manage'),
    'templates_campus_ids', coalesce((
      select jsonb_agg(c.id order by c.sort_order, c.name)
      from campuses c
      where c.church_id = p_church_id and c.archived_at is null
        and app.has_capability(p_church_id, 'activity_template.manage', 'campus', c.id)
    ), '[]'::jsonb),
    'read_all', app.has_capability(p_church_id, 'activity.read'),
    'serving_enabled', app.module_enabled(p_church_id, 'serving')
  );
end;
$$;

-- Resumen real para el dashboard. security invoker: solo cuenta actividades
-- que el usuario puede leer (RLS). La semana es lunes-domingo en la zona de la
-- iglesia. "Estructura incompleta": próximas actividades no cerradas con
-- alguna incidencia bloqueante o, en cultos/eventos/ensayos, sin áreas.
create or replace function public.activity_dashboard(p_church_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with tz as (
    select ch.timezone as name from churches ch where ch.id = p_church_id
  ),
  bounds as (
    select
      (date_trunc('week', now() at time zone tz.name)) at time zone tz.name as week_start,
      (date_trunc('week', now() at time zone tz.name) + interval '7 days') at time zone tz.name as week_end,
      tz.name as timezone
    from tz
  ),
  upcoming as (
    select a.id, a.type
    from activities a
    where a.church_id = p_church_id
      and a.status in ('draft', 'planned', 'published')
      and a.schedule_kind = 'timed'
      and a.ends_at >= now()
      and a.starts_at < now() + interval '60 days'
    order by a.starts_at
    limit 200
  )
  select jsonb_build_object(
    'timezone', b.timezone,
    'week_start', b.week_start,
    'week_end', b.week_end,
    'this_week', (
      select count(*) from activities a
      where a.church_id = p_church_id and a.status not in ('archived', 'cancelled')
        and a.schedule_kind = 'timed'
        and a.starts_at < b.week_end and a.ends_at > b.week_start
        and a.starts_at > b.week_start - interval '62 days'
    ),
    'drafts', (
      select count(*) from activities a
      where a.church_id = p_church_id and a.status = 'draft'
    ),
    'upcoming', (select count(*) from upcoming),
    'incomplete_structure', (
      select count(*) from upcoming u
      where exists (
        select 1 from app.activity_structure_issues(u.id) i
        where i.severity = 'blocking' or i.code = 'no_areas'
      )
    ),
    'flexible_open_tasks', (
      select count(*) from activities a
      where a.church_id = p_church_id and a.schedule_kind = 'flexible'
        and a.status in ('draft', 'planned', 'published')
    )
  )
  from bounds b;
$$;

revoke all on function public.activity_dashboard(uuid) from public, anon;
grant execute on function public.activity_dashboard(uuid) to authenticated;

-- Actividades próximas con incidencias de estructura (para listados).
create or replace function public.activities_structure_status(p_activity_ids uuid[])
returns table (activity_id uuid, blocking integer, warnings integer)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select a.id,
         count(*) filter (where i.severity = 'blocking')::integer,
         count(*) filter (where i.severity = 'warning')::integer
  from activities a
  left join lateral app.activity_structure_issues(a.id) i on true
  where a.id = any (p_activity_ids[1:200])
  group by a.id;
$$;

revoke all on function public.activities_structure_status(uuid[]) from public, anon;
grant execute on function public.activities_structure_status(uuid[]) to authenticated;

create or replace function public.activity_capabilities(p_activity_id uuid)
returns jsonb language sql stable security invoker set search_path = pg_catalog, public
as $$ select app.activity_capabilities(p_activity_id); $$;

create or replace function public.activity_creation_scopes(p_church_id uuid)
returns jsonb language sql stable security invoker set search_path = pg_catalog, public
as $$ select app.activity_creation_scopes(p_church_id); $$;

revoke all on function app.activity_capabilities(uuid) from public, anon;
revoke all on function app.activity_creation_scopes(uuid) from public, anon;
revoke all on function public.activity_capabilities(uuid) from public, anon;
revoke all on function public.activity_creation_scopes(uuid) from public, anon;
grant execute on function app.activity_capabilities(uuid) to authenticated;
grant execute on function app.activity_creation_scopes(uuid) to authenticated;
grant execute on function public.activity_capabilities(uuid) to authenticated;
grant execute on function public.activity_creation_scopes(uuid) to authenticated;
