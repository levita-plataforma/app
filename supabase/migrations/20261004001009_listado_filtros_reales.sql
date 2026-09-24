-- CA-2.1 · Los dos filtros que la portada prometía y el listado no tenía.
--
-- La portada de operación enlaza sus indicadores a listados filtrados:
-- «Altas sin terminar» va a ?onboarding=pendiente y «Sin propietario» a
-- ?sinPropietario=1. Ninguno de los dos existía: la RPC no acepta esos
-- parámetros y la página los ignoraba, así que ambos enlaces enseñaban el
-- listado entero.
--
-- No es un fallo visible —nada da error, salen iglesias— y ese es justo el
-- problema: alguien mira «3 altas sin terminar», pulsa, ve cuarenta iglesias y
-- tiene que buscarlas a ojo, o peor, se cree que ya están resueltas.
--
-- Los dos criterios ya se calculaban en la propia consulta para pintar las
-- columnas. Solo faltaba poder filtrar por ellos.

-- Se sustituyen las dos firmas anteriores: añadir parámetros crearía una
-- sobrecarga y dejaría la versión antigua accesible, que es como se acumulan
-- dos caminos para lo mismo.
drop function if exists public.platform_churches(text, text, text, text, timestamptz, integer, integer);
drop function if exists app.platform_churches(text, text, text, text, timestamptz, integer, integer);

create or replace function app.platform_churches(
  p_search text default null,
  p_status text default null,
  p_plan text default null,
  p_module text default null,
  p_created_from timestamptz default null,
  -- true = solo las que NO han terminado el alta. null = todas.
  p_onboarding_pendiente boolean default null,
  -- true = solo las que no tienen propietario. null = todas.
  p_sin_propietario boolean default null,
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
      -- Sin registro de alta también cuenta como pendiente: es un caso que
      -- existe —iglesias anteriores al onboarding— y esconderlo del filtro las
      -- dejaría sin que nadie las mire nunca.
      and (p_onboarding_pendiente is not true or not exists (
            select 1 from church_onboarding o
            where o.church_id = c.id and o.completed_at is not null
          ))
      and (p_sin_propietario is not true or not exists (
            select 1 from church_people_roles r
            where r.church_id = c.id and r.role_key = 'church_owner'
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
  limit v_limit
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

comment on function app.platform_churches(text, text, text, text, timestamptz, boolean, boolean, integer, integer) is
  'Listado administrativo de iglesias con búsqueda, filtros y paginación en servidor. Desde CA-2.1 admite los dos filtros a los que ya enlazaba la portada: alta sin terminar y sin propietario.';

revoke all on function app.platform_churches(text, text, text, text, timestamptz, boolean, boolean, integer, integer) from public, anon, authenticated;
grant execute on function app.platform_churches(text, text, text, text, timestamptz, boolean, boolean, integer, integer) to authenticated;

create or replace function public.platform_churches(
  p_search text default null, p_status text default null, p_plan text default null,
  p_module text default null, p_created_from timestamptz default null,
  p_onboarding_pendiente boolean default null, p_sin_propietario boolean default null,
  p_limit integer default 25, p_offset integer default 0
)
returns table (
  id uuid, name text, slug text, status text, created_at timestamptz, archived_at timestamptz,
  plan_key text, subscription_status text, onboarding_completed boolean, modules_enabled integer,
  campuses_count integer, people_count integer, has_owner boolean, total_count integer
)
language sql security invoker set search_path = pg_catalog, public
as $$
  select * from app.platform_churches(
    p_search, p_status, p_plan, p_module, p_created_from,
    p_onboarding_pendiente, p_sin_propietario, p_limit, p_offset);
$$;

revoke all on function public.platform_churches(text, text, text, text, timestamptz, boolean, boolean, integer, integer) from public, anon;
grant execute on function public.platform_churches(text, text, text, text, timestamptz, boolean, boolean, integer, integer) to authenticated;
