-- Fase 15 · Consola de operación y soporte controlado.
--
-- No construye un sistema de observabilidad nuevo: lee lo que las fases
-- anteriores ya registran —avisos, comunicaciones, trabajos, webhooks y la cola
-- de borrado de F13— y lo presenta junto.
--
-- Dos reglas que definen lo que se puede y no se puede hacer aquí:
--
--   * Un proceso sin procesador no se pinta en verde. Si nadie lee esa tabla,
--     el estado honesto es «desconocido», no «correcto». Hoy los webhooks y los
--     trabajos de importación y exportación están en ese caso: sus tablas
--     existen desde la Fase 0 y ningún código las procesa.
--   * Solo se puede reintentar lo que se puede repetir sin efectos duplicados.
--     No hay botón de «reintentar todo», ni forma de marcar algo como
--     completado a mano para que desaparezca del listado.

-- 1. Panorama de procesos ---------------------------------------------------------

create or replace function app.platform_processes_overview()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'avisos', jsonb_build_object(
      'pendientes', (select count(*)::int from notification_events where processed_at is null),
      'procesador', 'cron_diario',
      'ultima_senal', (select max(processed_at) from notification_events)
    ),
    'comunicaciones', jsonb_build_object(
      'programadas', (select count(*)::int from communications where status = 'scheduled'),
      'en_cola', (select count(*)::int from communications where status = 'queued'),
      'sin_preparar', (select count(*)::int from communications where status = 'failed_to_process'),
      'procesador', 'cron_diario',
      'ultima_senal', (select max(sent_at) from communications)
    ),
    'borrado_ficheros', jsonb_build_object(
      'pendientes', (select count(*)::int from storage_deletion_queue where deleted_at is null),
      'agotados', (select count(*)::int from storage_deletion_queue where deleted_at is null and attempts >= 5),
      'procesador', 'cron_diario',
      'ultima_senal', (select max(deleted_at) from storage_deletion_queue)
    ),
    -- Las tres siguientes tienen tabla y no tienen quien las procese. Se
    -- declara así: un cero aquí no significa «todo bien», significa que nadie
    -- lo está mirando.
    'webhooks_entrantes', jsonb_build_object(
      'sin_procesar', (select count(*)::int from webhook_events_inbound where processed_at is null),
      'procesador', 'ninguno',
      'estado', 'desconocido'
    ),
    'importaciones', jsonb_build_object(
      'en_curso', (select count(*)::int from import_jobs where status in ('queued', 'processing')),
      'fallidas', (select count(*)::int from import_jobs where status = 'failed'),
      'procesador', 'ninguno',
      'estado', 'desconocido'
    ),
    'exportaciones', jsonb_build_object(
      'en_curso', (select count(*)::int from export_jobs where status in ('queued', 'processing')),
      'fallidas', (select count(*)::int from export_jobs where status = 'failed'),
      'procesador', 'ninguno',
      'estado', 'desconocido'
    )
  )
  where app.has_platform_capability('platform.operations.read');
$$;

comment on function app.platform_processes_overview() is
  'Estado de los procesos periódicos. Los que no tienen procesador se declaran «desconocido» en vez de pintarse en verde: un cero sin nadie mirando no es una buena noticia.';

revoke all on function app.platform_processes_overview() from public, anon, authenticated;
grant execute on function app.platform_processes_overview() to authenticated;

-- 2. Qué ha fallado, saneado ---------------------------------------------------------
--
-- Devuelve lo justo para diagnosticar: qué falló, de quién, cuándo, cuántas
-- veces y con qué error. Ningún payload, ningún dato personal, ningún secreto.
-- El mensaje de error se recorta: los de los proveedores a veces incluyen el
-- cuerpo de la petición.

create or replace function app.platform_process_failures(p_limit integer default 50)
returns table (
  familia text,
  id uuid,
  church_id uuid,
  estado text,
  intentos integer,
  error text,
  ocurrido_en timestamptz,
  correlation_id uuid,
  reintentable boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select * from (
    select 'comunicaciones'::text, c.id, c.church_id, c.status::text, 0,
           left(coalesce(c.processing_error, ''), 300), c.updated_at, null::uuid,
           -- La recupera la iglesia desde su ficha, con su permiso y su
           -- auditoría. Un operador de plataforma no la toca.
           false
    from communications c
    where c.status = 'failed_to_process'

    union all

    select 'borrado_ficheros', q.id, q.source_church_id, 'failed',
           q.attempts, left(coalesce(q.last_error, ''), 300), q.queued_at, null::uuid,
           -- Volver a intentar borrar un objeto es idempotente: si ya no está,
           -- cuenta como borrado.
           true
    from storage_deletion_queue q
    where q.deleted_at is null and q.attempts > 0

    union all

    select 'importaciones', j.id, j.church_id, j.status::text,
           j.attempts::integer, left(coalesce(j.last_error, ''), 300), j.created_at, j.correlation_id,
           false
    from import_jobs j
    where j.status = 'failed'

    union all

    select 'exportaciones', j.id, j.church_id, j.status::text,
           j.attempts::integer, left(coalesce(j.last_error, ''), 300), j.created_at, j.correlation_id,
           false
    from export_jobs j
    where j.status = 'failed'

    union all

    select 'webhooks_entrantes', w.id, w.church_id, w.status::text,
           w.attempts::integer, left(coalesce(w.last_error, ''), 300), w.received_at, null::uuid,
           -- Sin procesador no hay nada que reintentar, y fingir que sí lo hay
           -- sería peor que no ofrecerlo.
           false
    from webhook_events_inbound w
    where w.status = 'failed' or (w.processed_at is null and w.received_at < now() - interval '1 day')
  ) f (familia, id, church_id, estado, intentos, error, ocurrido_en, correlation_id, reintentable)
  where app.has_platform_capability('platform.operations.read')
  order by f.ocurrido_en desc nulls last
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

comment on function app.platform_process_failures(integer) is
  'Lo que ha fallado en los procesos, de todas las familias, saneado: sin payloads ni datos personales y con el error recortado. La columna «reintentable» dice la verdad sobre cada uno, no ofrece un botón para todos.';

revoke all on function app.platform_process_failures(integer) from public, anon, authenticated;
grant execute on function app.platform_process_failures(integer) to authenticated;

-- 3. Reintentar, solo lo que se puede repetir ------------------------------------------

create or replace function app.platform_retry_storage_deletion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church uuid;
begin
  perform app.assert_platform_capability('platform.operations.retry');

  select source_church_id into v_church
  from storage_deletion_queue where id = p_id and deleted_at is null;

  if not found then
    raise exception 'Ese borrado no existe o ya se completó.' using errcode = 'P0002';
  end if;

  -- Solo se reinician los intentos: el objeto se borra de verdad en la pasada
  -- siguiente del proceso. Nada se marca aquí como hecho sin haberlo hecho.
  update storage_deletion_queue
  set attempts = 0, last_error = null
  where id = p_id;

  perform app.write_platform_audit('operations.retry_storage_deletion', v_church,
    jsonb_build_object('queue_id', p_id));
end;
$$;

revoke all on function app.platform_retry_storage_deletion(uuid) from public, anon, authenticated;
grant execute on function app.platform_retry_storage_deletion(uuid) to authenticated;

-- 4. Sesiones de soporte ------------------------------------------------------------------
--
-- `support_sessions` existe desde la Fase 0 y nunca tuvo funciones. Esto le da
-- ciclo de vida: abrir con motivo y caducidad, comprobar y revocar.
--
-- Lo que NO hace, y es deliberado: conceder acceso a los datos de la iglesia.
-- Abrir una sesión de soporte aquí **no cambia ninguna política RLS**, así que
-- un operador con sesión abierta sigue sin ver el directorio, los menores, los
-- casos pastorales ni las donaciones. Sirve para dejar constancia de que se
-- está atendiendo una incidencia y para el diagnóstico administrativo.
--
-- El acceso excepcional a datos exige una política aprobada —quién lo
-- autoriza, con qué alcance, con qué aviso a la iglesia— y esa decisión no
-- está tomada. Construirlo antes sería crear una puerta sin cerradura
-- acordada, así que los ámbitos que impliquen datos se rechazan.

create or replace function app.platform_open_support_session(
  p_church_id uuid,
  p_reason text,
  p_minutes integer default 120,
  p_scopes text[] default array['diagnostics']
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_minutos integer := least(greatest(coalesce(p_minutes, 120), 5), 480);
  v_scope text;
begin
  perform app.assert_platform_capability('platform.support.manage');

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'Una sesión de soporte sin motivo no se puede justificar después.' using errcode = '22023';
  end if;

  if not exists (select 1 from churches where id = p_church_id) then
    raise exception 'La iglesia no existe.' using errcode = 'P0002';
  end if;

  foreach v_scope in array coalesce(p_scopes, array['diagnostics'])
  loop
    if v_scope <> 'diagnostics' then
      raise exception 'Solo está admitido el ámbito «diagnostics». El acceso a datos de la iglesia necesita una política de autorización aprobada, y todavía no la hay.'
        using errcode = '22023';
    end if;
  end loop;

  -- Una sesión viva por operador e iglesia: abrir otra encima solo enturbia la
  -- traza de quién estaba dentro y cuándo.
  if exists (
    select 1 from support_sessions
    where church_id = p_church_id and operator_user_id = auth.uid()
      and revoked_at is null and expires_at > now()
  ) then
    raise exception 'Ya tienes una sesión de soporte abierta para esta iglesia.' using errcode = '23505';
  end if;

  insert into support_sessions (church_id, operator_user_id, reason, capabilities, expires_at)
  values (p_church_id, auth.uid(), btrim(p_reason), array['diagnostics'], now() + make_interval(mins => v_minutos))
  returning id into v_id;

  perform app.write_platform_audit('support.session_opened', p_church_id,
    jsonb_build_object('session_id', v_id, 'reason', btrim(p_reason), 'minutes', v_minutos,
                       'scopes', array['diagnostics'], 'grants_data_access', false));

  return v_id;
end;
$$;

revoke all on function app.platform_open_support_session(uuid, text, integer, text[]) from public, anon, authenticated;
grant execute on function app.platform_open_support_session(uuid, text, integer, text[]) to authenticated;

create or replace function app.platform_revoke_support_session(p_session_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church uuid;
begin
  perform app.assert_platform_capability('platform.support.manage');

  select church_id into v_church
  from support_sessions where id = p_session_id and revoked_at is null;

  if not found then
    raise exception 'Esa sesión no existe o ya estaba revocada.' using errcode = 'P0002';
  end if;

  update support_sessions set revoked_at = now() where id = p_session_id;

  perform app.write_platform_audit('support.session_revoked', v_church,
    jsonb_build_object('session_id', p_session_id, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
end;
$$;

revoke all on function app.platform_revoke_support_session(uuid, text) from public, anon, authenticated;
grant execute on function app.platform_revoke_support_session(uuid, text) to authenticated;

-- Si una sesión sigue valiendo AHORA. Se comprueba en cada operación, no al
-- abrirla: una sesión revocada hace un minuto deja de valer en la siguiente
-- llamada, sin esperar a que caduque.
create or replace function app.support_session_is_active(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from support_sessions
    where id = p_session_id
      and revoked_at is null
      and expires_at > now()
  );
$$;

revoke all on function app.support_session_is_active(uuid) from public, anon;
grant execute on function app.support_session_is_active(uuid) to authenticated;

create or replace function app.platform_support_sessions(p_church_id uuid default null, p_limit integer default 50)
returns table (
  id uuid,
  church_id uuid,
  church_name text,
  operator_user_id uuid,
  reason text,
  started_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  activa boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select s.id, s.church_id, c.name, s.operator_user_id, s.reason,
         s.started_at, s.expires_at, s.revoked_at,
         s.revoked_at is null and s.expires_at > now()
  from support_sessions s
  join churches c on c.id = s.church_id
  where app.has_platform_capability('platform.support.manage')
    and (p_church_id is null or s.church_id = p_church_id)
  order by s.started_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

revoke all on function app.platform_support_sessions(uuid, integer) from public, anon, authenticated;
grant execute on function app.platform_support_sessions(uuid, integer) to authenticated;

-- 5. Auditoría consultable ----------------------------------------------------------------

create or replace function app.platform_audit(
  p_church_id uuid default null,
  p_action text default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  actor_user_id uuid,
  action text,
  church_id uuid,
  church_name text,
  metadata jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select l.id, l.actor_user_id, l.action, l.church_id, c.name, l.metadata, l.created_at
  from platform_audit_logs l
  left join churches c on c.id = l.church_id
  where app.has_platform_capability('platform.audit.read')
    and (p_church_id is null or l.church_id = p_church_id)
    and (p_action is null or l.action = p_action)
  order by l.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

comment on function app.platform_audit(uuid, text, integer) is
  'Consulta de la auditoría de plataforma. Solo lectura y bajo su propia capacidad: que alguien pueda operar no implica que pueda revisar lo que hicieron los demás.';

revoke all on function app.platform_audit(uuid, text, integer) from public, anon, authenticated;
grant execute on function app.platform_audit(uuid, text, integer) to authenticated;

-- 6. Envoltorios públicos -------------------------------------------------------------------

create or replace function public.platform_processes_overview()
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.platform_processes_overview(); $$;

create or replace function public.platform_process_failures(p_limit integer default 50)
returns table (familia text, id uuid, church_id uuid, estado text, intentos integer,
               error text, ocurrido_en timestamptz, correlation_id uuid, reintentable boolean)
language sql security invoker set search_path = pg_catalog, public
as $$ select * from app.platform_process_failures(p_limit); $$;

create or replace function public.platform_retry_storage_deletion(p_id uuid)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.platform_retry_storage_deletion(p_id); $$;

create or replace function public.platform_open_support_session(
  p_church_id uuid, p_reason text, p_minutes integer default 120, p_scopes text[] default array['diagnostics'])
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.platform_open_support_session(p_church_id, p_reason, p_minutes, p_scopes); $$;

create or replace function public.platform_revoke_support_session(p_session_id uuid, p_reason text default null)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.platform_revoke_support_session(p_session_id, p_reason); $$;

create or replace function public.platform_support_sessions(p_church_id uuid default null, p_limit integer default 50)
returns table (id uuid, church_id uuid, church_name text, operator_user_id uuid, reason text,
               started_at timestamptz, expires_at timestamptz, revoked_at timestamptz, activa boolean)
language sql security invoker set search_path = pg_catalog, public
as $$ select * from app.platform_support_sessions(p_church_id, p_limit); $$;

create or replace function public.platform_audit(
  p_church_id uuid default null, p_action text default null, p_limit integer default 100)
returns table (id uuid, actor_user_id uuid, action text, church_id uuid, church_name text,
               metadata jsonb, created_at timestamptz)
language sql security invoker set search_path = pg_catalog, public
as $$ select * from app.platform_audit(p_church_id, p_action, p_limit); $$;

revoke all on function public.platform_processes_overview() from public, anon;
revoke all on function public.platform_process_failures(integer) from public, anon;
revoke all on function public.platform_retry_storage_deletion(uuid) from public, anon;
revoke all on function public.platform_open_support_session(uuid, text, integer, text[]) from public, anon;
revoke all on function public.platform_revoke_support_session(uuid, text) from public, anon;
revoke all on function public.platform_support_sessions(uuid, integer) from public, anon;
revoke all on function public.platform_audit(uuid, text, integer) from public, anon;

grant execute on function public.platform_processes_overview() to authenticated;
grant execute on function public.platform_process_failures(integer) to authenticated;
grant execute on function public.platform_retry_storage_deletion(uuid) to authenticated;
grant execute on function public.platform_open_support_session(uuid, text, integer, text[]) to authenticated;
grant execute on function public.platform_revoke_support_session(uuid, text) to authenticated;
grant execute on function public.platform_support_sessions(uuid, integer) to authenticated;
grant execute on function public.platform_audit(uuid, text, integer) to authenticated;
