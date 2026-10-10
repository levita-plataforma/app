-- Consola · La auditoría se puede paginar (CA-3.5)
--
-- Hasta ahora devolvía las últimas cien entradas y la pantalla pedía doscientas.
-- No había forma de ver la ciento uno: ni «más resultados», ni saber cuántas hay
-- en total. Para una tabla que existe precisamente para poder revisar lo que
-- hizo el equipo, llegar hasta donde alcanza la primera página no es revisar.
--
-- Se añade desplazamiento y el total de la consulta. El total va en cada fila
-- —como en platform_churches— para no partir la lectura en dos consultas que
-- podrían verse en momentos distintos.
--
-- Las dos firmas viejas se retiran con su lista de parámetros exacta. Un
-- `create or replace` con parámetros distintos no reemplaza: crea una sobrecarga
-- y deja la anterior accesible, que es el fallo que hubo que arreglar en CA-0.

drop function if exists public.platform_audit(uuid, text, integer);
drop function if exists app.platform_audit(uuid, text, integer);

create or replace function app.platform_audit(
  p_church_id uuid default null,
  p_action text default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  actor_user_id uuid,
  action text,
  church_id uuid,
  church_name text,
  metadata jsonb,
  created_at timestamptz,
  total_count integer
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with filtradas as (
    select l.id, l.actor_user_id, l.action, l.church_id, c.name as church_name,
           l.metadata, l.created_at
    from platform_audit_logs l
    left join churches c on c.id = l.church_id
    where app.has_platform_capability('platform.audit.read')
      and (p_church_id is null or l.church_id = p_church_id)
      and (p_action is null or l.action = p_action)
  )
  select f.id, f.actor_user_id, f.action, f.church_id, f.church_name, f.metadata, f.created_at,
         (select count(*)::int from filtradas)
  from filtradas f
  order by f.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function app.platform_audit(uuid, text, integer, integer) is
  'Consulta de la auditoría de plataforma. Solo lectura y bajo su propia capacidad: que alguien pueda operar no implica que pueda revisar lo que hicieron los demás. Desde CA-3.5 admite desplazamiento y devuelve el total de la consulta, para poder pasar de la primera página.';

revoke all on function app.platform_audit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function app.platform_audit(uuid, text, integer, integer) to authenticated;

create or replace function public.platform_audit(
  p_church_id uuid default null, p_action text default null,
  p_limit integer default 100, p_offset integer default 0)
returns table (id uuid, actor_user_id uuid, action text, church_id uuid, church_name text,
               metadata jsonb, created_at timestamptz, total_count integer)
language sql security invoker set search_path = pg_catalog, public
as $$ select * from app.platform_audit(p_church_id, p_action, p_limit, p_offset); $$;

revoke all on function public.platform_audit(uuid, text, integer, integer) from public, anon;
grant execute on function public.platform_audit(uuid, text, integer, integer) to authenticated;
