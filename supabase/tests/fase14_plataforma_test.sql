-- Fase 14 · Panel de operación de LEVITA.
--
-- Lo que esta suite tiene que demostrar no es que el panel funcione, sino que
-- no funciona para quien no debe: un administrador de iglesia no es
-- administrador de LEVITA, y un operador con una capacidad no las tiene todas.

begin;
select plan(28);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function test_set_anon() returns void as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end;
$$ language plpgsql;

create or replace function t_err(p_sql text) returns text as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$ language plpgsql;

create table if not exists t_ids (k text primary key, v uuid);
create table if not exists t_nums (k text primary key, v integer);
create or replace function t_setn(p_k text, p_v integer) returns integer as $$
  insert into t_nums values (p_k, p_v) on conflict (k) do update set v = excluded.v returning v;
$$ language sql;
create or replace function t_num(p_k text) returns integer as $$ select v from t_nums where k = p_k; $$ language sql;
create or replace function t_set(p_k text, p_v uuid) returns uuid as $$
  insert into t_ids values (p_k, p_v) on conflict (k) do update set v = excluded.v returning v;
$$ language sql;
create or replace function t_id(p_k text) returns uuid as $$ select v from t_ids where k = p_k; $$ language sql;

-- Cuatro cuentas: el dueño de una iglesia (que NO es de plataforma), un
-- operador con todo, uno que solo puede leer, y uno que solo gestiona módulos.
insert into auth.users (id, email) values
  ('fe000000-0000-0000-0000-000000000001', 'owner.iglesia@example.test'),
  ('fe000000-0000-0000-0000-000000000002', 'op.total@levita.test'),
  ('fe000000-0000-0000-0000-000000000003', 'op.lectura@levita.test'),
  ('fe000000-0000-0000-0000-000000000004', 'op.modulos@levita.test');

select test_set_auth_uid('fe000000-0000-0000-0000-000000000001');
select * from app.provision_church(
  'Iglesia F14', 'iglesia-f14', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'F14', 'owner.iglesia@example.test', null, 'Sede F14', null, null, null, null,
  array['people'], null
);

reset role;
select t_set('church', (select id from churches where slug = 'iglesia-f14'));

-- ============================================================
-- 1. El arranque: crear al primer operador
-- ============================================================
select is(
  (select count(*)::int from platform_operator_capabilities),
  0,
  'Al principio no hay ningún operador con capacidades'
);

select lives_ok(
  $$ select app.bootstrap_platform_operator('fe000000-0000-0000-0000-000000000002', 'Alta inicial del equipo') $$,
  'El primer operador se crea con el procedimiento de arranque'
);

select is(
  (select count(*)::int from platform_operator_capabilities
   where user_id = 'fe000000-0000-0000-0000-000000000002'),
  5,
  'Y recibe las cinco capacidades'
);

select is(
  t_err($$ select app.bootstrap_platform_operator('fe000000-0000-0000-0000-000000000003', 'Otro más') $$),
  '22023',
  'El arranque no se puede repetir una vez hay quien gestione operadores'
);

select is(
  t_err($$ select app.bootstrap_platform_operator('fe000000-0000-0000-0000-000000000003', '') $$),
  '22023',
  'Y exige un motivo: la operación queda registrada'
);

select is(
  (select count(*)::int from platform_audit_logs where action = 'platform.bootstrap'),
  1,
  'El arranque deja constancia'
);

-- ============================================================
-- 2. Quién NO entra
-- ============================================================

-- Anónimo.
select test_set_anon();
select is(
  t_err($$ select * from app.platform_overview() $$),
  '42501',
  'Sin sesión no se ve el panel'
);

-- El dueño de una iglesia: es administrador de lo suyo, no de LEVITA.
select test_set_auth_uid('fe000000-0000-0000-0000-000000000001');
select is(
  t_err($$ select * from app.platform_overview() $$),
  '42501',
  'El propietario de una iglesia no entra en el panel de plataforma'
);

select is(
  t_err(format($$ select app.platform_set_module(%L, 'events', true) $$, t_id('church'))),
  '42501',
  'Ni puede encender módulos por RPC, aunque sea su propia iglesia'
);

reset role;
select is(
  (select count(*)::int from platform_audit_logs),
  1,
  'Y esos intentos no ensucian la auditoría de plataforma: solo consta el arranque'
);

-- ============================================================
-- 3. Capacidades separadas de verdad
-- ============================================================
select test_set_auth_uid('fe000000-0000-0000-0000-000000000002');

-- Se dan de alta los otros dos operadores con capacidades distintas.
reset role;
insert into platform_operators (user_id, granted_by) values
  ('fe000000-0000-0000-0000-000000000003', 'fe000000-0000-0000-0000-000000000002'),
  ('fe000000-0000-0000-0000-000000000004', 'fe000000-0000-0000-0000-000000000002');

select test_set_auth_uid('fe000000-0000-0000-0000-000000000002');
select lives_ok(
  $$ select app.grant_platform_capability('fe000000-0000-0000-0000-000000000003', 'platform.churches.read') $$,
  'Se concede solo lectura a un operador'
);
select lives_ok(
  $$ select app.grant_platform_capability('fe000000-0000-0000-0000-000000000004', 'platform.modules.manage') $$,
  'Y solo módulos a otro'
);

-- Quien solo lee: ve el panel, no actúa.
reset role;
select t_setn('activas', (select count(*)::int from churches where archived_at is null));

select test_set_auth_uid('fe000000-0000-0000-0000-000000000003');
select is(
  (select iglesias_activas from app.platform_overview()),
  t_num('activas'),
  'Quien solo tiene lectura ve la portada, y el indicador cuenta las iglesias que hay de verdad'
);

select is(
  t_err(format($$ select app.platform_set_module(%L, 'events', true) $$, t_id('church'))),
  '42501',
  'Pero no enciende módulos'
);

select is(
  t_err(format($$ select app.platform_invite_admin(%L, 'nuevo@example.test') $$, t_id('church'))),
  '42501',
  'Ni invita responsables'
);

select is(
  t_err(format($$ select * from app.platform_church_contacts(%L) $$, t_id('church'))),
  '42501',
  'Ni ve los correos: los contactos exigen su propia capacidad'
);

-- Quien gestiona módulos: enciende, pero no lee el panel ni invita.
select test_set_auth_uid('fe000000-0000-0000-0000-000000000004');
select lives_ok(
  format($$ select app.platform_set_module(%L, 'events', true, 'Contratado') $$, t_id('church')),
  'Quien gestiona módulos puede encenderlos'
);

select is(
  t_err($$ select * from app.platform_overview() $$),
  '42501',
  'Y sin lectura no ve la portada, aunque sea operador'
);

-- ============================================================
-- 4. Nadie se asciende a sí mismo
-- ============================================================
select test_set_auth_uid('fe000000-0000-0000-0000-000000000003');
select is(
  t_err($$ select app.grant_platform_capability('fe000000-0000-0000-0000-000000000003', 'platform.operators.manage') $$),
  '42501',
  'Un operador sin permiso de gestión no se concede capacidades'
);

select test_set_auth_uid('fe000000-0000-0000-0000-000000000002');
select is(
  t_err($$ select app.grant_platform_capability('fe000000-0000-0000-0000-000000000002', 'platform.churches.read') $$),
  '42501',
  'Ni siquiera quien gestiona operadores se concede capacidades a sí mismo'
);

select is(
  t_err($$ select app.revoke_platform_capability('fe000000-0000-0000-0000-000000000002', 'platform.operators.manage') $$),
  '22023',
  'Y no se puede retirar la última cuenta capaz de gestionar operadores'
);

-- ============================================================
-- 5. Módulos: encender no concede permisos, apagar no borra
-- ============================================================
reset role;
select is(
  (select status::text from church_modules where church_id = t_id('church') and module_key = 'events'),
  'enabled',
  'El módulo quedó encendido'
);

select test_set_auth_uid('fe000000-0000-0000-0000-000000000004');
select lives_ok(
  format($$ select app.platform_set_module(%L, 'events', false, 'Fin de prueba') $$, t_id('church')),
  'Se puede apagar'
);

reset role;
select is(
  (select count(*)::int from church_modules where church_id = t_id('church') and module_key = 'events'),
  1,
  'Apagar conserva la fila y su historial: no se borra nada'
);

-- ============================================================
-- 6. Alta idempotente
-- ============================================================
select test_set_auth_uid('fe000000-0000-0000-0000-000000000002');

select lives_ok(
  $$ select * from app.platform_create_church('Nueva', 'iglesia-nueva-f14', 'es-ES', 'Europe/Madrid',
       'EUR', 'España', 'nuevo.owner@example.test', array['people']) $$,
  'Se da de alta una iglesia'
);

select is(
  t_err($$ select * from app.platform_create_church('Nueva otra vez', 'iglesia-nueva-f14', 'es-ES',
       'Europe/Madrid', 'EUR', 'España', 'nuevo.owner@example.test', array['people']) $$),
  '23505',
  'Repetir el alta con la misma dirección no crea una segunda iglesia'
);

reset role;
select is(
  (select count(*)::int from churches where slug = 'iglesia-nueva-f14'),
  1,
  'Y solo hay una'
);

-- ============================================================
-- 7. La ficha no filtra datos de miembros
-- ============================================================
select test_set_auth_uid('fe000000-0000-0000-0000-000000000003');

select unalike(
  (app.platform_church_detail(t_id('church')))::text,
  '%owner.iglesia@example.test%',
  'La ficha administrativa no lleva correos de nadie'
);

reset role;

select * from finish();
rollback;
