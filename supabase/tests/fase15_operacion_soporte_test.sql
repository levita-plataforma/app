-- Fase 15 · Consola de operación y sesiones de soporte.
--
-- Lo que se comprueba aquí es sobre todo lo que NO debe poder hacerse: pedir
-- acceso a datos en una sesión de soporte, reintentar algo que no es seguro
-- repetir, o ver la auditoría sin la capacidad para ello.

begin;
select plan(23);

create or replace function pg_temp.como(p_user text) returns void
language plpgsql as $ayuda$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end
$ayuda$;

create or replace function pg_temp.sin_sesion() returns void
language plpgsql as $ayuda$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end
$ayuda$;

-- Montaje ---------------------------------------------------------------------

insert into auth.users (id, email) values
  ('f1510000-0000-0000-0000-000000000001', 'soporte2@levita.test'),
  ('f1510000-0000-0000-0000-000000000002', 'comercial2@levita.test'),
  ('f1510000-0000-0000-0000-000000000009', 'owner2@iglesia.test')
on conflict do nothing;

insert into platform_operators (user_id) values
  ('f1510000-0000-0000-0000-000000000001'),
  ('f1510000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into platform_operator_capabilities (user_id, capability_key) values
  ('f1510000-0000-0000-0000-000000000001', 'platform.support.manage'),
  ('f1510000-0000-0000-0000-000000000001', 'platform.operations.read'),
  ('f1510000-0000-0000-0000-000000000001', 'platform.operations.retry'),
  ('f1510000-0000-0000-0000-000000000002', 'platform.commercial.manage')
on conflict do nothing;

select pg_temp.como('f1510000-0000-0000-0000-000000000009');

create temporary table t_ig as
select out_church_id as church_id
from app.provision_church(
  'Iglesia F15 Op', 'iglesia-f15-op', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'Op', 'owner2@iglesia.test', null, 'Sede', null, null, null, null,
  array['people'], null);

reset role;
select set_config('request.jwt.claims', '', true);

-- 1. Panorama de procesos ---------------------------------------------------------

select pg_temp.como('f1510000-0000-0000-0000-000000000001');

select isnt(
  (select app.platform_processes_overview()),
  null,
  'El operador de operaciones ve el panorama de procesos'
);

select is(
  (select app.platform_processes_overview() -> 'webhooks_entrantes' ->> 'procesador'),
  'ninguno',
  'Los webhooks declaran que no tienen procesador'
);

select is(
  (select app.platform_processes_overview() -> 'webhooks_entrantes' ->> 'estado'),
  'desconocido',
  'Y su estado es «desconocido», no verde: nadie los está mirando'
);

select is(
  (select app.platform_processes_overview() -> 'importaciones' ->> 'estado'),
  'desconocido',
  'Lo mismo para las importaciones, que tampoco tienen quien las procese'
);

select is(
  (select app.platform_processes_overview() -> 'avisos' ->> 'procesador'),
  'cron_diario',
  'Los avisos sí declaran su procesador real'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- 2. Sin la capacidad, no se ve nada -------------------------------------------------

select pg_temp.como('f1510000-0000-0000-0000-000000000002');

select is(
  (select app.platform_processes_overview()),
  null,
  'Un operador comercial no ve el panorama de procesos'
);

select is(
  (select count(*)::int from app.platform_process_failures(50)),
  0,
  'Ni los fallos de los procesos'
);

select is(
  (select count(*)::int from app.platform_audit(null, null, 100)),
  0,
  'Ni la auditoría: hace falta platform.audit.read para eso'
);

select throws_ok(
  format($q$select app.platform_open_support_session(%L::uuid, 'quiero mirar', 60, array['diagnostics'])$q$,
         (select church_id from t_ig)),
  '42501',
  'No tienes permiso para esta operación.',
  'Un operador comercial no puede abrir una sesión de soporte'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- 3. Fallos, saneados -------------------------------------------------------------------

insert into storage_deletion_queue (bucket, object_path, source_church_id, reason, attempts, last_error)
values ('kids', 'f15-op/roto.jpg', (select church_id from t_ig), 'church_purged', 3,
        'el bucket devolvió 500 con el cuerpo entero de la petición dentro y mucho más texto ' ||
        repeat('x', 500));

create temporary table t_cola as
select id from storage_deletion_queue where object_path = 'f15-op/roto.jpg';

-- La crea postgres, así que hay que dejar que el operador la lea: es una tabla
-- del andamiaje de la prueba, no del esquema.
grant select on t_cola to authenticated;

select pg_temp.como('f1510000-0000-0000-0000-000000000001');

select is(
  (select familia from app.platform_process_failures(50) where estado = 'failed' and intentos = 3 limit 1),
  'borrado_ficheros',
  'El fallo del borrado de ficheros aparece en el listado'
);

select ok(
  (select length(error) <= 300 from app.platform_process_failures(50) where intentos = 3 limit 1),
  'Y su mensaje de error viene recortado, no entero'
);

select ok(
  (select reintentable from app.platform_process_failures(50) where intentos = 3 limit 1),
  'Un borrado de fichero sí se puede reintentar: repetirlo no duplica nada'
);

-- 4. Reintentar lo que se puede ------------------------------------------------------------

-- El id sale de t_cola, capturado sin sesión. Como argumento de la llamada lo
-- evaluaría el operador, y desde la Fase 13 «authenticated» no tiene acceso
-- directo a esa tabla: la subconsulta fallaría antes de entrar en la función.
-- En la aplicación el id llega de platform_process_failures, que es definer.
select lives_ok(
  format($q$select app.platform_retry_storage_deletion(%L::uuid)$q$,
         (select id from t_cola)),
  'El operador con permiso de reintento lo reintenta'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select attempts from storage_deletion_queue where object_path = 'f15-op/roto.jpg'),
  0,
  'El reintento reinicia los intentos para que el proceso vuelva a cogerlo'
);

select is(
  (select deleted_at from storage_deletion_queue where object_path = 'f15-op/roto.jpg'),
  null,
  'Pero NO lo marca como borrado: eso sería ocultar el fallo, no resolverlo'
);

-- 5. Sesiones de soporte ------------------------------------------------------------------

select pg_temp.como('f1510000-0000-0000-0000-000000000001');

select throws_ok(
  format($q$select app.platform_open_support_session(%L::uuid, 'incidencia 42', 60, array['read_church_data'])$q$,
         (select church_id from t_ig)),
  '22023',
  'Solo está admitido el ámbito «diagnostics». El acceso a datos de la iglesia necesita una política de autorización aprobada, y todavía no la hay.',
  'Pedir acceso a los datos de la iglesia se rechaza mientras no haya política aprobada'
);

select throws_ok(
  format($q$select app.platform_open_support_session(%L::uuid, '  ', 60, array['diagnostics'])$q$,
         (select church_id from t_ig)),
  '22023',
  'Una sesión de soporte sin motivo no se puede justificar después.',
  'Una sesión sin motivo se rechaza'
);

create temporary table t_sesion as
select app.platform_open_support_session(
  (select church_id from t_ig), 'incidencia 42: no le llegan los avisos', 60, array['diagnostics']) as id;

select ok(
  (select app.support_session_is_active((select id from t_sesion))),
  'La sesión recién abierta está activa'
);

select throws_ok(
  format($q$select app.platform_open_support_session(%L::uuid, 'otra vez', 60, array['diagnostics'])$q$,
         (select church_id from t_ig)),
  '23505',
  'Ya tienes una sesión de soporte abierta para esta iglesia.',
  'No se abren dos sesiones a la vez sobre la misma iglesia'
);

-- Revocada, deja de valer en la siguiente comprobación, sin esperar a caducar.
select lives_ok(
  format($q$select app.platform_revoke_support_session(%L::uuid, 'resuelta')$q$,
         (select id from t_sesion)),
  'La sesión se revoca'
);

select ok(
  (select not app.support_session_is_active((select id from t_sesion))),
  'Y deja de estar activa inmediatamente, no cuando caduque'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- 6. Abrir soporte NO da acceso a los datos ---------------------------------------------------
-- Es la propiedad más importante de todo esto: la sesión deja constancia, no
-- abre una puerta.

select is(
  (select count(*)::int from support_sessions where church_id = (select church_id from t_ig)),
  1,
  'Queda registrada la sesión con su motivo y su caducidad'
);

select is(
  (select (metadata ->> 'grants_data_access')::boolean
   from platform_audit_logs
   where action = 'support.session_opened' and church_id = (select church_id from t_ig)),
  false,
  'Y la auditoría deja dicho que esa sesión no concedió acceso a datos'
);

select * from finish();
rollback;
