-- Fase 13 · Retención y borrado tras una baja.
--
-- Decisión de Carlos (21 de septiembre de 2026): cuando una iglesia queda
-- archivada, sus datos se conservan 30 días y después se borran. El plazo da
-- margen para arrepentirse o exportar, y evita guardar información de menores y
-- casos pastorales más tiempo del necesario.
--
-- El borrado es real, no un marcado. Las 107 claves foráneas que apuntan a
-- churches son `on delete cascade`, así que eliminar la fila de la iglesia
-- arrastra todo lo suyo. La única excepción es platform_audit_logs, que es
-- `on delete set null`: la traza de qué hizo un operador de plataforma
-- sobrevive sin los datos, que es lo que se quiere.
--
-- Lo que la cascada NO puede hacer es borrar los ficheros del almacenamiento.
-- Esa es la parte delicada: borrar las filas de `files` sin borrar los objetos
-- dejaría vivos en el bucket documentos pastorales y fotos de menores, con el
-- borrado aparentando haber funcionado. Por eso los objetos se encolan antes,
-- en una tabla que la cascada no toca, y un proceso aparte los elimina.

-- 1. La cola de ficheros por borrar ------------------------------------------
--
-- No tiene clave foránea a churches a propósito: debe sobrevivir al borrado de
-- la iglesia, que es justo cuando hace falta. Guarda el church_id solo como
-- traza, y no queda ningún dato personal en ella: un bucket y una ruta.
create table storage_deletion_queue (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  object_path text not null,
  -- Sin FK: la iglesia ya no existirá cuando esto se procese.
  source_church_id uuid,
  reason text not null default 'church_purged',
  queued_at timestamptz not null default now(),
  deleted_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  unique (bucket, object_path)
);

comment on table storage_deletion_queue is
  'Objetos de almacenamiento pendientes de borrar tras eliminar una iglesia. No '
  'tiene clave foránea a churches: debe sobrevivir al borrado. No contiene datos '
  'personales, solo bucket y ruta. La vacía src/server/retention/runner.ts.';

create index storage_deletion_queue_pendientes_idx
  on storage_deletion_queue (queued_at)
  where deleted_at is null;

alter table storage_deletion_queue enable row level security;
alter table storage_deletion_queue force row level security;

-- Nadie la lee desde el cliente: es una cola interna del proceso de borrado,
-- que usa service_role. Sin políticas, RLS deniega todo.
revoke all on table storage_deletion_queue from public, anon, authenticated;

-- 2. Qué se borraría, sin borrar nada -----------------------------------------
--
-- Antes de ejecutar un borrado irreversible conviene poder mirarlo. Esta
-- función responde «qué desaparecería si el proceso corriera ahora», y es de
-- solo lectura.
create or replace function app.churches_due_for_purge(p_retention_days integer default 30)
returns table (
  church_id uuid,
  church_name text,
  archived_at timestamptz,
  days_archived integer,
  people_count integer,
  files_count integer
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select c.id,
         c.name,
         c.archived_at,
         extract(day from (now() - c.archived_at))::integer,
         (select count(*)::integer from church_people cp where cp.church_id = c.id),
         (select count(*)::integer from files f where f.church_id = c.id)
  from churches c
  where c.status = 'archived'
    and c.archived_at is not null
    and c.archived_at < now() - make_interval(days => greatest(p_retention_days, 1))
  order by c.archived_at;
$$;

revoke all on function app.churches_due_for_purge(integer) from public, anon, authenticated;
grant execute on function app.churches_due_for_purge(integer) to service_role;

-- 3. El borrado -----------------------------------------------------------
--
-- Tres salvaguardas, porque esto no se puede deshacer:
--
--   * Solo toca iglesias en estado 'archived' con archived_at cumplido. Una
--     iglesia activa, en prueba o suspendida no entra aunque se la pase por
--     parámetro.
--   * El plazo nunca baja de 7 días, por mucho que se pida. Un error de
--     llamada no puede convertirse en un borrado inmediato.
--   * Procesa como mucho p_limit por pasada, y registra cada borrado en
--     platform_audit_logs antes de ejecutarlo.
create or replace function app.purge_archived_churches(
  p_retention_days integer default 30,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_dias integer := greatest(coalesce(p_retention_days, 30), 7);
  v_limite integer := least(greatest(coalesce(p_limit, 10), 1), 100);
  v_iglesia record;
  v_borradas integer := 0;
  v_ficheros integer := 0;
  v_detalle jsonb := '[]'::jsonb;
begin
  for v_iglesia in
    select c.id, c.name, c.archived_at
    from churches c
    where c.status = 'archived'
      and c.archived_at is not null
      and c.archived_at < now() - make_interval(days => v_dias)
    order by c.archived_at
    limit v_limite
    for update
  loop
    -- Los objetos primero: si algo falla después, quedan encolados de más y se
    -- puede revisar, que es preferible a que se pierda la pista de un fichero
    -- que hay que borrar.
    insert into storage_deletion_queue (bucket, object_path, source_church_id, reason)
    select f.bucket, f.object_path, v_iglesia.id, 'church_purged'
    from files f
    where f.church_id = v_iglesia.id
    on conflict (bucket, object_path) do nothing;

    get diagnostics v_ficheros = row_count;

    -- La traza se escribe antes del borrado y sobrevive a él: la clave foránea
    -- de platform_audit_logs a churches es «on delete set null».
    --
    -- actor_user_id queda nulo a propósito: esto lo ejecuta una tarea
    -- programada, no una persona. Quien decidió el borrado fue quien archivó la
    -- iglesia, y eso ya tiene su propia entrada.
    insert into platform_audit_logs (actor_user_id, church_id, action, metadata)
    values (
      null,
      v_iglesia.id,
      'church.purged',
      jsonb_build_object(
        'church_name', v_iglesia.name,
        'archived_at', v_iglesia.archived_at,
        'retention_days', v_dias,
        'files_queued', v_ficheros
      )
    );

    -- Y ahora sí: la cascada se lleva las 107 tablas.
    delete from churches where id = v_iglesia.id;

    v_borradas := v_borradas + 1;
    v_detalle := v_detalle || jsonb_build_object(
      'church_id', v_iglesia.id,
      'files_queued', v_ficheros
    );
  end loop;

  return jsonb_build_object(
    'purged', v_borradas,
    'retention_days', v_dias,
    'detail', v_detalle
  );
end;
$$;

revoke all on function app.purge_archived_churches(integer, integer) from public, anon, authenticated;
grant execute on function app.purge_archived_churches(integer, integer) to service_role;

-- 4. La cola de objetos, para el proceso que la vacía -------------------------

create or replace function app.due_storage_deletions(p_limit integer default 100)
returns table (id uuid, bucket text, object_path text)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select q.id, q.bucket, q.object_path
  from storage_deletion_queue q
  where q.deleted_at is null
    and q.attempts < 5
  order by q.queued_at
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

revoke all on function app.due_storage_deletions(integer) from public, anon, authenticated;
grant execute on function app.due_storage_deletions(integer) to service_role;

-- Marca el resultado de cada intento. Un objeto que ya no existe en el bucket
-- cuenta como borrado: el fin es que no esté, no haberlo borrado nosotros.
create or replace function app.mark_storage_deletion(
  p_id uuid,
  p_ok boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_ok then
    update storage_deletion_queue
    set deleted_at = now(), last_error = null
    where id = p_id;
  else
    update storage_deletion_queue
    set attempts = attempts + 1, last_error = left(coalesce(p_error, 'sin detalle'), 500)
    where id = p_id;
  end if;
end;
$$;

revoke all on function app.mark_storage_deletion(uuid, boolean, text) from public, anon, authenticated;
grant execute on function app.mark_storage_deletion(uuid, boolean, text) to service_role;

-- 5. Envoltorios públicos -----------------------------------------------------
--
-- Solo para service_role: esto lo llama una tarea programada, nunca la
-- interfaz. Un operador de plataforma tampoco borra iglesias a mano desde aquí;
-- lo que hace es archivarlas, y el plazo corre solo.

create or replace function public.churches_due_for_purge(p_retention_days integer default 30)
returns table (
  church_id uuid, church_name text, archived_at timestamptz,
  days_archived integer, people_count integer, files_count integer
)
language sql security invoker set search_path = pg_catalog, public
as $$ select * from app.churches_due_for_purge(p_retention_days); $$;

revoke all on function public.churches_due_for_purge(integer) from public, anon, authenticated;
grant execute on function public.churches_due_for_purge(integer) to service_role;

create or replace function public.purge_archived_churches(
  p_retention_days integer default 30, p_limit integer default 10
)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.purge_archived_churches(p_retention_days, p_limit); $$;

revoke all on function public.purge_archived_churches(integer, integer) from public, anon, authenticated;
grant execute on function public.purge_archived_churches(integer, integer) to service_role;

create or replace function public.due_storage_deletions(p_limit integer default 100)
returns table (id uuid, bucket text, object_path text)
language sql security invoker set search_path = pg_catalog, public
as $$ select * from app.due_storage_deletions(p_limit); $$;

revoke all on function public.due_storage_deletions(integer) from public, anon, authenticated;
grant execute on function public.due_storage_deletions(integer) to service_role;

create or replace function public.mark_storage_deletion(
  p_id uuid, p_ok boolean, p_error text default null
)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.mark_storage_deletion(p_id, p_ok, p_error); $$;

revoke all on function public.mark_storage_deletion(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.mark_storage_deletion(uuid, boolean, text) to service_role;
