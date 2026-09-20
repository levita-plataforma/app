-- Fase 12 (Diogo) · Analítica: dashboard agregado.
--
-- app.analytics_dashboard() construye un jsonb con un bloque por módulo,
-- cada uno con conteos del período actual, del período anterior comparable
-- (misma duración, inmediatamente anterior) y el delta ya resuelto (evita
-- "N/A" mal calculado en el cliente cuando el denominador es cero). Cada
-- bloque solo aparece si:
--   1. el módulo fuente está habilitado para la iglesia (app.module_enabled);
--   2. el llamante tiene analytics.read (comprobado una vez, antes de
--      construir nada);
--   3. para sub-métricas sensibles, el llamante tiene además la capability
--      real del módulo de origen (nunca analytics.read por sí sola).
--
-- No se crea ninguna tabla nueva: todo se calcula desde las tablas de
-- dominio ya existentes (Fase 0-9), sin duplicar datos operacionales
-- (§45-46 del prompt: analítica no es un data warehouse paralelo ni el
-- audit log).
--
-- Agrupación temporal en zona horaria de la iglesia (churches.timezone),
-- nunca en fecha UTC cruda: sigue el mismo patrón que
-- app.local_to_instant/app.resolve_timezone en
-- 20260920000500_activity_funciones_y_reglas.sql.
create or replace function app.analytics_period_bounds(
  p_period text,
  p_from timestamptz,
  p_to timestamptz,
  p_timezone text
)
returns table (period_from timestamptz, period_to timestamptz, previous_from timestamptz, previous_to timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := now();
  v_from timestamptz;
  v_to timestamptz;
  v_span interval;
begin
  case p_period
    when '7d' then
      v_to := v_now;
      v_from := v_now - interval '7 days';
    when '30d' then
      v_to := v_now;
      v_from := v_now - interval '30 days';
    when 'this_month' then
      v_from := date_trunc('month', v_now at time zone p_timezone) at time zone p_timezone;
      v_to := v_now;
    when '3m' then
      v_to := v_now;
      v_from := v_now - interval '3 months';
    when '12m' then
      v_to := v_now;
      v_from := v_now - interval '12 months';
    when 'custom' then
      if p_from is null or p_to is null or p_to <= p_from then
        raise exception 'Intervalo personalizado inválido.' using errcode = '22023';
      end if;
      if p_to - p_from > interval '366 days' then
        raise exception 'El intervalo personalizado no puede superar 366 días.' using errcode = '22023';
      end if;
      v_from := p_from;
      v_to := p_to;
    else
      raise exception 'Período no soportado: %', p_period using errcode = '22023';
  end case;

  v_span := v_to - v_from;

  return query select v_from, v_to, v_from - v_span, v_from;
end;
$$;

revoke all on function app.analytics_period_bounds(text, timestamptz, timestamptz, text) from public, anon;
grant execute on function app.analytics_period_bounds(text, timestamptz, timestamptz, text) to authenticated;

-- Construye {current, previous, delta_abs, delta_pct} a partir de dos
-- conteos enteros. delta_pct es null (no 0 ni Infinity) cuando el período
-- anterior fue cero: el cliente debe mostrar "N/A", nunca inventar un
-- porcentaje (§29 del prompt).
create or replace function app.analytics_trend(p_current bigint, p_previous bigint)
returns jsonb
language sql
immutable
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'current', p_current,
    'previous', p_previous,
    'delta_abs', p_current - p_previous,
    'delta_pct', case when p_previous = 0 then null
      else round(((p_current - p_previous)::numeric / p_previous) * 100, 1) end
  );
$$;

revoke all on function app.analytics_trend(bigint, bigint) from public, anon;
grant execute on function app.analytics_trend(bigint, bigint) to authenticated;

create or replace function app.analytics_dashboard(
  p_church_id uuid,
  p_period text default '30d',
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_campus_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_timezone text;
  v_bounds record;
  v_result jsonb := '{}'::jsonb;
  v_can_read_kids boolean;
  v_can_read_comm_metrics boolean;
  v_can_read_events boolean;
  v_can_read_service boolean;
  v_can_read_people boolean;
  v_can_read_groups boolean;
  v_can_read_courses boolean;
begin
  if not app.has_capability(p_church_id, 'analytics.read') then
    raise exception 'No tiene autorización para ver Informes.' using errcode = '42501';
  end if;

  perform app.require_analytics_module(p_church_id);

  if p_campus_id is not null and not exists (
    select 1 from campuses where id = p_campus_id and church_id = p_church_id
  ) then
    raise exception 'Sede no encontrada.' using errcode = 'P0002';
  end if;

  select coalesce(c.timezone, 'Europe/Madrid') into v_timezone from churches c where c.id = p_church_id;

  select * into v_bounds from app.analytics_period_bounds(p_period, p_from, p_to, v_timezone);

  v_result := jsonb_build_object(
    'church_id', p_church_id,
    'timezone', v_timezone,
    'period', p_period,
    'period_from', v_bounds.period_from,
    'period_to', v_bounds.period_to,
    'previous_from', v_bounds.previous_from,
    'previous_to', v_bounds.previous_to,
    'campus_id', p_campus_id
  );

  -- People ------------------------------------------------------------
  v_can_read_people := app.has_capability(p_church_id, 'people.read');
  if app.module_enabled(p_church_id, 'people') and v_can_read_people then
    v_result := v_result || jsonb_build_object('people', jsonb_build_object(
      'active_people', (
        select count(*) from church_people cp
        where cp.church_id = p_church_id and cp.archived_at is null
          and (p_campus_id is null or cp.primary_campus_id = p_campus_id)
      ),
      'new_people', app.analytics_trend(
        (select count(*) from church_people cp
         where cp.church_id = p_church_id
           and cp.created_at >= v_bounds.period_from and cp.created_at < v_bounds.period_to
           and (p_campus_id is null or cp.primary_campus_id = p_campus_id)),
        (select count(*) from church_people cp
         where cp.church_id = p_church_id
           and cp.created_at >= v_bounds.previous_from and cp.created_at < v_bounds.previous_to
           and (p_campus_id is null or cp.primary_campus_id = p_campus_id))
      ),
      'archived_people', app.analytics_trend(
        (select count(*) from church_people cp
         where cp.church_id = p_church_id and cp.archived_at is not null
           and cp.archived_at >= v_bounds.period_from and cp.archived_at < v_bounds.period_to),
        (select count(*) from church_people cp
         where cp.church_id = p_church_id and cp.archived_at is not null
           and cp.archived_at >= v_bounds.previous_from and cp.archived_at < v_bounds.previous_to)
      ),
      'by_campus', (
        select coalesce(jsonb_object_agg(coalesce(cam.name, 'Sin sede'), cnt), '{}'::jsonb)
        from (
          select cp.primary_campus_id, count(*) as cnt
          from church_people cp
          where cp.church_id = p_church_id and cp.archived_at is null
          group by cp.primary_campus_id
        ) t
        left join campuses cam on cam.id = t.primary_campus_id
      )
    ));
  end if;

  -- Serving / Activity --------------------------------------------------
  v_can_read_service := app.has_capability(p_church_id, 'service.read');
  if app.module_enabled(p_church_id, 'serving') and v_can_read_service then
    v_result := v_result || jsonb_build_object('serving', jsonb_build_object(
      'activities', app.analytics_trend(
        (select count(*) from activities a
         where a.church_id = p_church_id and a.archived_at is null
           and a.starts_at >= v_bounds.period_from and a.starts_at < v_bounds.period_to
           and (p_campus_id is null or a.campus_id = p_campus_id)),
        (select count(*) from activities a
         where a.church_id = p_church_id and a.archived_at is null
           and a.starts_at >= v_bounds.previous_from and a.starts_at < v_bounds.previous_to
           and (p_campus_id is null or a.campus_id = p_campus_id))
      ),
      'by_status', (
        select coalesce(jsonb_object_agg(a.status, cnt), '{}'::jsonb)
        from (
          select status, count(*) as cnt from activities a
          where a.church_id = p_church_id and a.archived_at is null
            and a.starts_at >= v_bounds.period_from and a.starts_at < v_bounds.period_to
            and (p_campus_id is null or a.campus_id = p_campus_id)
          group by status
        ) a
      ),
      'positions_planned', (
        select coalesce(sum(ap.min_people), 0) from activity_positions ap
        join activities a on a.id = ap.activity_id
        where ap.church_id = p_church_id and a.archived_at is null
          and a.starts_at >= v_bounds.period_from and a.starts_at < v_bounds.period_to
          and (p_campus_id is null or a.campus_id = p_campus_id)
      ),
      'assignments_confirmed', (
        select count(*) from activity_assignments aa
        join activities a on a.id = aa.activity_id
        where aa.church_id = p_church_id and aa.status = 'accepted'
          and a.starts_at >= v_bounds.period_from and a.starts_at < v_bounds.period_to
          and (p_campus_id is null or a.campus_id = p_campus_id)
      ),
      'assignments_pending', (
        select count(*) from activity_assignments aa
        join activities a on a.id = aa.activity_id
        where aa.church_id = p_church_id and aa.status in ('proposed', 'pending')
          and a.starts_at >= v_bounds.period_from and a.starts_at < v_bounds.period_to
          and (p_campus_id is null or a.campus_id = p_campus_id)
      ),
      'assignments_declined', (
        select count(*) from activity_assignments aa
        join activities a on a.id = aa.activity_id
        where aa.church_id = p_church_id and aa.status = 'declined'
          and a.starts_at >= v_bounds.period_from and a.starts_at < v_bounds.period_to
          and (p_campus_id is null or a.campus_id = p_campus_id)
      )
    ));
  end if;

  -- Events / Registrations ----------------------------------------------
  v_can_read_events := app.has_capability(p_church_id, 'event.read');
  if app.module_enabled(p_church_id, 'events') and v_can_read_events then
    v_result := v_result || jsonb_build_object('events', jsonb_build_object(
      'events_published', app.analytics_trend(
        (select count(*) from events e
         join activities a on a.id = e.activity_id
         where e.church_id = p_church_id and a.status = 'published'
           and a.starts_at >= v_bounds.period_from and a.starts_at < v_bounds.period_to
           and (p_campus_id is null or a.campus_id = p_campus_id)),
        (select count(*) from events e
         join activities a on a.id = e.activity_id
         where e.church_id = p_church_id and a.status = 'published'
           and a.starts_at >= v_bounds.previous_from and a.starts_at < v_bounds.previous_to
           and (p_campus_id is null or a.campus_id = p_campus_id))
      ),
      'registrations', app.analytics_trend(
        (select count(*) from registrations r
         where r.church_id = p_church_id and r.status in ('confirmed', 'waitlisted')
           and r.registered_at >= v_bounds.period_from and r.registered_at < v_bounds.period_to),
        (select count(*) from registrations r
         where r.church_id = p_church_id and r.status in ('confirmed', 'waitlisted')
           and r.registered_at >= v_bounds.previous_from and r.registered_at < v_bounds.previous_to)
      ),
      'cancelled_registrations', (
        select count(*) from registrations r
        where r.church_id = p_church_id and r.status = 'cancelled'
          and r.registered_at >= v_bounds.period_from and r.registered_at < v_bounds.period_to
      ),
      'waitlisted', (
        select count(*) from registrations r
        where r.church_id = p_church_id and r.status = 'waitlisted'
          and r.registered_at >= v_bounds.period_from and r.registered_at < v_bounds.period_to
      )
    ));
  end if;

  -- Groups ----------------------------------------------------------------
  v_can_read_groups := app.has_capability(p_church_id, 'group.read');
  if app.module_enabled(p_church_id, 'groups') and v_can_read_groups then
    v_result := v_result || jsonb_build_object('groups', app.group_metrics(p_church_id) || jsonb_build_object(
      'new_members', app.analytics_trend(
        (select count(*) from group_members gm
         join groups g on g.id = gm.group_id
         where gm.church_id = p_church_id and g.archived_at is null
           and gm.joined_at >= v_bounds.period_from and gm.joined_at < v_bounds.period_to),
        (select count(*) from group_members gm
         join groups g on g.id = gm.group_id
         where gm.church_id = p_church_id and g.archived_at is null
           and gm.joined_at >= v_bounds.previous_from and gm.joined_at < v_bounds.previous_to)
      ),
      'meetings_held', (
        select count(*) from group_meetings gme
        join groups g on g.id = gme.group_id
        join activities a on a.id = gme.activity_id
        where gme.church_id = p_church_id and gme.cancelled_at is null
          and a.starts_at >= v_bounds.period_from and a.starts_at < v_bounds.period_to
      )
    ));
  end if;

  -- Discipleship ------------------------------------------------------------
  v_can_read_courses := app.has_capability(p_church_id, 'course.read');
  if app.module_enabled(p_church_id, 'discipleship') and v_can_read_courses then
    v_result := v_result || jsonb_build_object('discipleship', app.discipleship_metrics(p_church_id));
  end if;

  -- Kids ------------------------------------------------------------------
  v_can_read_kids := app.has_capability(p_church_id, 'kids.read');
  if app.module_enabled(p_church_id, 'kids') and v_can_read_kids then
    v_result := v_result || jsonb_build_object('kids', jsonb_build_object(
      'checkins', app.analytics_trend(
        (select count(*) from kid_checkins kc
         where kc.church_id = p_church_id
           and kc.checked_in_at >= v_bounds.period_from and kc.checked_in_at < v_bounds.period_to
           and kc.status <> 'cancelled'),
        (select count(*) from kid_checkins kc
         where kc.church_id = p_church_id
           and kc.checked_in_at >= v_bounds.previous_from and kc.checked_in_at < v_bounds.previous_to
           and kc.status <> 'cancelled')
      ),
      'active_profiles', (
        select count(*) from kids_profiles kp
        where kp.church_id = p_church_id and kp.status = 'active' and kp.archived_at is null
      ),
      'incidents', (
        select count(*) from kids_incidents ki
        where ki.church_id = p_church_id
          and ki.occurred_at >= v_bounds.period_from and ki.occurred_at < v_bounds.period_to
      )
    ));
  end if;

  -- Communications ----------------------------------------------------------
  v_can_read_comm_metrics := app.has_capability(p_church_id, 'communications.read_metrics');
  if app.module_enabled(p_church_id, 'communications') and v_can_read_comm_metrics then
    v_result := v_result || jsonb_build_object('communications', jsonb_build_object(
      'communications_sent', app.analytics_trend(
        (select count(*) from communications c
         where c.church_id = p_church_id and c.status in ('sent', 'partially_sent')
           and c.created_at >= v_bounds.period_from and c.created_at < v_bounds.period_to),
        (select count(*) from communications c
         where c.church_id = p_church_id and c.status in ('sent', 'partially_sent')
           and c.created_at >= v_bounds.previous_from and c.created_at < v_bounds.previous_to)
      ),
      'recipients_by_status', (
        select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
        from (
          select cr.status, count(*) as cnt from communication_recipients cr
          join communications c on c.id = cr.communication_id
          where cr.church_id = p_church_id
            and c.created_at >= v_bounds.period_from and c.created_at < v_bounds.period_to
          group by cr.status
        ) t
      ),
      'opt_outs', (
        select count(*) from communication_category_preferences ccp
        where ccp.church_id = p_church_id and ccp.opted_out = true
      )
    ));
  end if;

  return v_result;
end;
$$;

revoke all on function app.analytics_dashboard(uuid, text, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function app.analytics_dashboard(uuid, text, timestamptz, timestamptz, uuid) to authenticated;

create or replace function public.analytics_dashboard(
  p_church_id uuid,
  p_period text default '30d',
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_campus_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select app.analytics_dashboard(p_church_id, p_period, p_from, p_to, p_campus_id);
$$;

revoke all on function public.analytics_dashboard(uuid, text, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.analytics_dashboard(uuid, text, timestamptz, timestamptz, uuid) to authenticated;
