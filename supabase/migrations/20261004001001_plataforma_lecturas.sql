-- Fase 14 · Lecturas del panel de operación.
--
-- Todo lo que el panel enseña pasa por estas funciones, y ninguna devuelve
-- datos de miembros: ni el directorio de personas, ni menores, ni información
-- pastoral, ni donaciones. Lo que se ve es administrativo —cuántas iglesias
-- hay, en qué estado, qué módulos tienen encendidos, quién es el propietario—
-- y poco más.
--
-- Por qué funciones y no políticas de RLS sobre las tablas: `churches`,
-- `subscriptions` o `invitations` ya tienen sus políticas pensadas para el
-- tenant, y abrirlas a los operadores significaría añadir un «o si eres
-- operador» a cada una. Eso convierte cada política del sistema en un sitio
-- donde puede colarse un error. Aquí la superficie es explícita: estas
-- funciones y nada más.

-- 1. Resumen de la portada ----------------------------------------------------

create or replace function app.platform_overview()
returns table (
  iglesias_activas integer,
  iglesias_archivadas integer,
  altas_incompletas integer,
  invitaciones_pendientes integer,
  invitaciones_caducadas integer,
  iglesias_sin_propietario integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  perform app.assert_platform_capability('platform.churches.read');

  return query
  select
    (select count(*)::int from churches where archived_at is null),
    (select count(*)::int from churches where archived_at is not null),
    -- Un alta incompleta es una iglesia cuyo onboarding empezó y no terminó, o
    -- que ni siquiera lo tiene. Es el indicador que dice dónde hay que entrar a
    -- ayudar.
    (select count(*)::int
     from churches c
     left join church_onboarding o on o.church_id = c.id
     where c.archived_at is null
       and (o.id is null or o.completed_at is null)),
    (select count(*)::int from invitations
     where status = 'pending' and (expires_at is null or expires_at > now())),
    (select count(*)::int from invitations
     where status = 'pending' and expires_at is not null and expires_at <= now()),
    -- Sin propietario: ni persona con rol church_owner ni invitación viva para
    -- serlo. Es el caso que deja una iglesia bloqueada sin que nadie se entere.
    (select count(*)::int
     from churches c
     where c.archived_at is null
       and not exists (
         select 1 from church_people_roles r
         join church_people cp on cp.id = r.church_people_id
         where r.church_id = c.id and r.role_key = 'church_owner'
       )
       and not exists (
         select 1 from invitations i
         where i.church_id = c.id and i.role_key = 'church_owner' and i.status = 'pending'
       ));
end;
$$;

revoke all on function app.platform_overview() from public, anon;
grant execute on function app.platform_overview() to authenticated;

-- 2. Listado de iglesias --------------------------------------------------------

create or replace function app.platform_churches(
  p_search text default null,
  p_status text default null,
  p_plan text default null,
  p_module text default null,
  p_created_from timestamptz default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  slug text,
  status text,
  created_at timestamptz,
  archived_at timestamptz,
  plan_key text,
  subscription_status text,
  onboarding_completed boolean,
  modules_enabled integer,
  campuses_count integer,
  people_count integer,
  has_owner boolean,
  total_count integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform app.assert_platform_capability('platform.churches.read');

  return query
  with filtradas as (
    select c.*
    from churches c
    left join subscriptions s on s.id = c.subscription_id
    where (v_search is null
           or c.name ilike '%' || v_search || '%'
           or c.slug ilike '%' || v_search || '%')
      and (p_status is null or c.status::text = p_status)
      and (p_plan is null or s.plan_key = p_plan)
      and (p_created_from is null or c.created_at >= p_created_from)
      and (p_module is null or exists (
            select 1 from church_modules m
            where m.church_id = c.id and m.module_key = p_module and m.status = 'enabled'
          ))
  )
  select
    f.id, f.name, f.slug, f.status::text, f.created_at, f.archived_at,
    s.plan_key, s.status::text,
    (o.completed_at is not null),
    (select count(*)::int from church_modules m where m.church_id = f.id and m.status = 'enabled'),
    (select count(*)::int from campuses ca where ca.church_id = f.id and ca.archived_at is null),
    -- Cuántas personas hay, nunca quiénes son. El recuento es administrativo;
    -- el directorio es de la iglesia y no se asoma al panel.
    (select count(*)::int from church_people cp where cp.church_id = f.id and cp.archived_at is null),
    exists (
      select 1 from church_people_roles r
      where r.church_id = f.id and r.role_key = 'church_owner'
    ),
    (select count(*)::int from filtradas)
  from filtradas f
  left join subscriptions s on s.id = f.subscription_id
  left join church_onboarding o on o.church_id = f.id
  order by f.created_at desc
  limit v_limit offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function app.platform_churches(text, text, text, text, timestamptz, integer, integer) from public, anon;
grant execute on function app.platform_churches(text, text, text, text, timestamptz, integer, integer) to authenticated;

-- 3. Ficha administrativa de una iglesia ------------------------------------------

create or replace function app.platform_church_detail(p_church_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church churches%rowtype;
  v_resultado jsonb;
begin
  perform app.assert_platform_capability('platform.churches.read');

  select * into v_church from churches where id = p_church_id;
  if not found then
    raise exception 'La iglesia no existe.' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'id', v_church.id,
    'name', v_church.name,
    'slug', v_church.slug,
    'status', v_church.status,
    'locale', v_church.locale,
    'timezone', v_church.timezone,
    'currency', v_church.currency,
    'created_at', v_church.created_at,
    'archived_at', v_church.archived_at,

    'onboarding', (
      select jsonb_build_object(
        'current_step', o.current_step,
        'completed_steps', o.completed_steps,
        'started_at', o.started_at,
        'completed_at', o.completed_at
      )
      from church_onboarding o where o.church_id = p_church_id
    ),

    'subscription', (
      select jsonb_build_object(
        'plan_key', s.plan_key,
        'status', s.status,
        'trial_ends_at', s.trial_ends_at,
        'started_at', s.started_at,
        'renews_at', s.renews_at,
        'cancel_at', s.cancel_at
      )
      from subscriptions s where s.id = v_church.subscription_id
    ),

    -- Responsables: nombre y rol, porque sin eso no se puede gestionar quién
    -- manda en una iglesia. El correo NO viaja aquí: se sirve aparte, con su
    -- propia capacidad, en app.platform_church_contacts.
    'responsables', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', p.id,
        'name', btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
        'role_key', r.role_key,
        'has_account', (p.user_id is not null)
      ) order by r.role_key)
      from church_people_roles r
      join church_people cp on cp.id = r.church_people_id
      join people p on p.id = cp.person_id
      where r.church_id = p_church_id
        and r.role_key in ('church_owner', 'church_admin')
        and cp.archived_at is null
    ), '[]'::jsonb),

    'invitaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'role_key', i.role_key,
        'status', i.status,
        'expires_at', i.expires_at,
        'created_at', i.created_at,
        'caducada', (i.status = 'pending' and i.expires_at is not null and i.expires_at <= now())
      ) order by i.created_at desc)
      from invitations i where i.church_id = p_church_id
    ), '[]'::jsonb),

    'sedes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ca.id, 'name', ca.name, 'archived_at', ca.archived_at
      ) order by ca.name)
      from campuses ca where ca.church_id = p_church_id
    ), '[]'::jsonb),

    'modulos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'module_key', m.key,
        'name', m.name,
        'status', coalesce(cm.status::text, 'disabled'),
        'enabled_at', cm.enabled_at
      ) order by m.sort_order, m.key)
      from modules m
      left join church_modules cm on cm.module_key = m.key and cm.church_id = p_church_id
    ), '[]'::jsonb),

    'historial', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', a.action,
        'created_at', a.created_at,
        'metadata', a.metadata
      ) order by a.created_at desc)
      from (
        select * from platform_audit_logs
        where church_id = p_church_id
        order by created_at desc
        limit 50
      ) a
    ), '[]'::jsonb)
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function app.platform_church_detail(uuid) from public, anon;
grant execute on function app.platform_church_detail(uuid) to authenticated;

-- 4. Contactos administrativos, con su propia capacidad ----------------------------
--
-- El correo de un responsable es un dato personal. Se sirve aparte de la ficha y
-- solo a quien gestiona responsables, que es quien necesita escribirle para
-- resolver un alta. Quien solo consulta el panel ve nombres y roles, no correos.

create or replace function app.platform_church_contacts(p_church_id uuid)
returns table (person_id uuid, name text, role_key text, email text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  perform app.assert_platform_capability('platform.owners.manage');

  if not exists (select 1 from churches where id = p_church_id) then
    raise exception 'La iglesia no existe.' using errcode = 'P0002';
  end if;

  perform app.write_platform_audit('platform.contacts_viewed', p_church_id, '{}'::jsonb);

  return query
  select p.id,
         btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')),
         r.role_key,
         p.email
  from church_people_roles r
  join church_people cp on cp.id = r.church_people_id
  join people p on p.id = cp.person_id
  where r.church_id = p_church_id
    and r.role_key in ('church_owner', 'church_admin')
    and cp.archived_at is null
  order by r.role_key;
end;
$$;

comment on function app.platform_church_contacts(uuid) is
  'Correos de los responsables de una iglesia. Exige platform.owners.manage y deja constancia de cada consulta: mirar el contacto de alguien es un acto, no una lectura cualquiera.';

revoke all on function app.platform_church_contacts(uuid) from public, anon;
grant execute on function app.platform_church_contacts(uuid) to authenticated;

-- 5. Envoltorios públicos ------------------------------------------------------------

create or replace function public.platform_overview()
returns table (
  iglesias_activas integer, iglesias_archivadas integer, altas_incompletas integer,
  invitaciones_pendientes integer, invitaciones_caducadas integer, iglesias_sin_propietario integer
)
language sql security invoker set search_path = pg_catalog, public
as $$ select * from app.platform_overview(); $$;

create or replace function public.platform_churches(
  p_search text default null, p_status text default null, p_plan text default null,
  p_module text default null, p_created_from timestamptz default null,
  p_limit integer default 25, p_offset integer default 0
)
returns table (
  id uuid, name text, slug text, status text, created_at timestamptz, archived_at timestamptz,
  plan_key text, subscription_status text, onboarding_completed boolean, modules_enabled integer,
  campuses_count integer, people_count integer, has_owner boolean, total_count integer
)
language sql security invoker set search_path = pg_catalog, public
as $$ select * from app.platform_churches(p_search, p_status, p_plan, p_module, p_created_from, p_limit, p_offset); $$;

create or replace function public.platform_church_detail(p_church_id uuid)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.platform_church_detail(p_church_id); $$;

create or replace function public.platform_church_contacts(p_church_id uuid)
returns table (person_id uuid, name text, role_key text, email text)
language sql security invoker set search_path = pg_catalog, public
as $$ select * from app.platform_church_contacts(p_church_id); $$;

do $grants$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.proname in ('platform_overview', 'platform_churches', 'platform_church_detail',
                        'platform_church_contacts')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end;
$grants$;
