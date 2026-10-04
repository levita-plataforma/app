-- Fase 15 · PR B: soporte operacional.
-- Sesiones de soporte con motivo, duración, expiración y revocación; diagnóstico sin
-- datos; banner del tenant sin detalles; sin bypass de estados comerciales, de
-- seguridad ni de módulos sensibles. Lecturas con rol authenticated real.

begin;
select plan(29);

create or replace function t15s_set_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function t15s_reset() returns void as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$ language plpgsql;

create or replace function t15s_err(p_sql text) returns text as $$
declare
  v_state text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate;
  return v_state;
end;
$$ language plpgsql;

create or replace function t15s_count(p_sql text) returns integer as $$
declare
  v_n integer;
begin
  execute p_sql into v_n;
  return v_n;
end;
$$ language plpgsql;

-- ============================================================
-- Fixtures
-- ============================================================
insert into auth.users (id, email) values
  ('d1000000-0000-0000-0000-000000000001', 'owner.a.s@example.test'),
  ('d1000000-0000-0000-0000-000000000002', 'owner.b.s@example.test'),
  ('d1000000-0000-0000-0000-000000000003', 'operador.s@example.test'),
  ('d1000000-0000-0000-0000-000000000004', 'usuario.comun.s@example.test');

insert into churches (id, name, slug, status) values
  ('d2000000-0000-0000-0000-00000000000a', 'Iglesia A S', 'iglesia-a-s', 'trial'),
  ('d2000000-0000-0000-0000-00000000000b', 'Iglesia B S', 'iglesia-b-s', 'trial');

insert into subscriptions (church_id, plan_key, status, trial_started_at, trial_ends_at) values
  ('d2000000-0000-0000-0000-00000000000a', 'trial', 'trial', now() - interval '5 days', now() + interval '25 days'),
  ('d2000000-0000-0000-0000-00000000000b', 'trial', 'trial', now() - interval '5 days', now() + interval '25 days');

insert into people (id, first_name, last_name, source, user_id) values
  ('d3000000-0000-0000-0000-000000000001', 'Owner', 'A', 'manual', 'd1000000-0000-0000-0000-000000000001'),
  ('d3000000-0000-0000-0000-000000000002', 'Owner', 'B', 'manual', 'd1000000-0000-0000-0000-000000000002'),
  ('d3000000-0000-0000-0000-0000000000d1', 'Menor', 'A', 'manual', null);

insert into church_people (id, church_id, person_id, relationship, source) values
  ('d4000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-00000000000a', 'd3000000-0000-0000-0000-000000000001', 'member', 'manual'),
  ('d4000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-00000000000b', 'd3000000-0000-0000-0000-000000000002', 'member', 'manual'),
  ('d4000000-0000-0000-0000-0000000000d1', 'd2000000-0000-0000-0000-00000000000a', 'd3000000-0000-0000-0000-0000000000d1', 'member', 'manual');

insert into church_people_roles (church_id, church_people_id, role_key) values
  ('d2000000-0000-0000-0000-00000000000a', 'd4000000-0000-0000-0000-000000000001', 'church_owner'),
  ('d2000000-0000-0000-0000-00000000000b', 'd4000000-0000-0000-0000-000000000002', 'church_owner');

insert into tags (church_id, name) values
  ('d2000000-0000-0000-0000-00000000000a', 'Etiqueta A S'),
  ('d2000000-0000-0000-0000-00000000000b', 'Etiqueta B S');

-- Presencia Kids en A: el operador no debe verla con una sesión de soporte.
insert into activities (id, church_id, type, title, starts_at, ends_at, timezone) values
  ('d5000000-0000-0000-0000-00000000000a', 'd2000000-0000-0000-0000-00000000000a', 'service', 'Culto S',
   now() - interval '1 hour', now() + interval '1 hour', 'Europe/Madrid');
insert into kids_rooms (id, church_id, name, capacity) values
  ('d6000000-0000-0000-0000-00000000000a', 'd2000000-0000-0000-0000-00000000000a', 'Sala S', 20);
insert into kids_sessions (id, church_id, activity_id, room_id, status) values
  ('d7000000-0000-0000-0000-00000000000a', 'd2000000-0000-0000-0000-00000000000a',
   'd5000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-00000000000a', 'open');
insert into kid_checkins (church_id, session_id, kid_person_id, room_id, status, pickup_token_hash, checked_in_at) values
  ('d2000000-0000-0000-0000-00000000000a', 'd7000000-0000-0000-0000-00000000000a',
   'd3000000-0000-0000-0000-0000000000d1', 'd6000000-0000-0000-0000-00000000000a', 'checked_in', 'hash-s', now());

-- Operador de plataforma: soporte y operaciones, sin lectura de seguridad.
insert into platform_operators (user_id) values ('d1000000-0000-0000-0000-000000000003');
insert into platform_operator_capabilities (user_id, capability_key) values
  ('d1000000-0000-0000-0000-000000000003', 'platform.support.manage'),
  ('d1000000-0000-0000-0000-000000000003', 'platform.operations.read');

-- ============================================================
-- 1. Operador sin sesión: sin datos de tenant
-- ============================================================
select t15s_set_uid('d1000000-0000-0000-0000-000000000003');
select is(t15s_count($$ select count(*)::int from tags where church_id = 'd2000000-0000-0000-0000-00000000000a' $$), 0,
  'sin sesión · operador no lee etiquetas de la iglesia A');
select is(t15s_count($$ select count(*)::int from kid_checkins where church_id = 'd2000000-0000-0000-0000-00000000000a' $$), 0,
  'sin sesión · operador no lee presencias Kids de A');
select t15s_reset();

-- ============================================================
-- 2. Duración, motivo y ámbito
-- ============================================================
select t15s_set_uid('d1000000-0000-0000-0000-000000000003');
select is(t15s_err($$ select app.platform_open_support_session('d2000000-0000-0000-0000-00000000000a', '   ', 60) $$), '22023',
  'motivo obligatorio: un motivo vacío se rechaza');
select is(t15s_err($$ select app.platform_open_support_session('d2000000-0000-0000-0000-00000000000a', 'Incidencia', 45) $$), '22023',
  'duración fuera de la lista (45 min): rechazada, sin recorte silencioso');
select is(t15s_err($$ select app.platform_open_support_session('d2000000-0000-0000-0000-00000000000a', 'Incidencia', 241) $$), '22023',
  'duración máxima: más de 4 horas se rechaza');
select is(t15s_err($$ select app.platform_open_support_session('d2000000-0000-0000-0000-00000000000a', 'Incidencia',
  60, array['people']::text[]) $$), '22023',
  'ámbito de datos (people): rechazado; solo diagnostics');

-- Duración por defecto: 60 minutos exactos
do $$ begin perform app.platform_open_support_session('d2000000-0000-0000-0000-00000000000a', 'Diagnóstico inicial', null); end $$;
select is((select extract(epoch from (expires_at - started_at))::int / 60 from support_sessions
  where church_id = 'd2000000-0000-0000-0000-00000000000a' and reason = 'Diagnóstico inicial'), 60,
  'duración · por defecto 60 minutos');
select is(t15s_err($$ select app.platform_open_support_session('d2000000-0000-0000-0000-00000000000a', 'Otra', 60) $$), '23505',
  'una sola sesión viva por operador e iglesia');
select t15s_reset();

-- Duración máxima válida: 240 minutos (en otra iglesia para no chocar con la de arriba)
select t15s_set_uid('d1000000-0000-0000-0000-000000000003');
select is(t15s_err($$ select app.platform_open_support_session('d2000000-0000-0000-0000-00000000000b', 'Duración máxima', 240) $$), 'ok',
  'duración · 240 minutos (máximo) admitida');
select t15s_reset();

-- ============================================================
-- 3. Banner y aislamiento de tenants
-- ============================================================
select t15s_set_uid('d1000000-0000-0000-0000-000000000001');
select is(app.support_session_active_for_church('d2000000-0000-0000-0000-00000000000a'), true,
  'banner · owner de A ve la sesión activa de su iglesia');
select is(app.support_session_active_for_church('d2000000-0000-0000-0000-00000000000b'), false,
  'banner · owner de A no ve nada de B (sesión de B, sin pertenencia)');
select t15s_reset();

select t15s_set_uid('d1000000-0000-0000-0000-000000000002');
select is(app.support_session_active_for_church('d2000000-0000-0000-0000-00000000000a'), false,
  'aislamiento · owner de B no ve la sesión de A');
select is(app.support_session_active_for_church('d2000000-0000-0000-0000-00000000000b'), true,
  'aislamiento · owner de B ve la sesión de su propia iglesia B');
select t15s_reset();

-- ============================================================
-- 4. Diagnóstico sin datos
-- ============================================================
select t15s_set_uid('d1000000-0000-0000-0000-000000000003');
select ok(
  (select (app.platform_church_diagnostics('d2000000-0000-0000-0000-00000000000a')
           ? 'security_block_reason') = false),
  'diagnóstico · no incluye el motivo de seguridad');
select is((select (app.platform_church_diagnostics('d2000000-0000-0000-0000-00000000000a')->>'active_support_sessions')::int),
  1, 'diagnóstico · cuenta las sesiones activas, sin detalles');
select is(t15s_count($$ select count(*)::int from tags where church_id = 'd2000000-0000-0000-0000-00000000000a' $$), 0,
  'diagnóstico · abrir diagnóstico no abre datos de negocio');
select t15s_reset();

select t15s_set_uid('d1000000-0000-0000-0000-000000000004');
select is(t15s_err($$ select app.platform_church_diagnostics('d2000000-0000-0000-0000-00000000000a') $$), '42501',
  'diagnóstico · usuario común sin capacidad: denegado');
select t15s_reset();

-- ============================================================
-- 5. Expiración y revocación: efecto inmediato, sin job
-- ============================================================
update support_sessions set expires_at = now() - interval '1 minute'
where church_id = 'd2000000-0000-0000-0000-00000000000a';

select is(app.support_session_is_active((select id from support_sessions
  where church_id = 'd2000000-0000-0000-0000-00000000000a' limit 1)), false,
  'expiración · una sesión caducada deja de valer');
select t15s_set_uid('d1000000-0000-0000-0000-000000000001');
select is(app.support_session_active_for_church('d2000000-0000-0000-0000-00000000000a'), false,
  'expiración · el banner se apaga aunque no haya job');
select t15s_reset();

-- Revocación de una sesión viva en B
update support_sessions set expires_at = now() + interval '1 hour'
where church_id = 'd2000000-0000-0000-0000-00000000000a';
select t15s_set_uid('d1000000-0000-0000-0000-000000000003');
select is(t15s_err($$ select app.platform_revoke_support_session((select id from support_sessions
  where church_id = 'd2000000-0000-0000-0000-00000000000a' and revoked_at is null limit 1), 'Fin del soporte') $$), 'ok',
  'revocación · el operador cierra la sesión antes del plazo');
select t15s_reset();
select is(app.support_session_is_active((select id from support_sessions
  where church_id = 'd2000000-0000-0000-0000-00000000000a' limit 1)), false,
  'revocación · la sesión deja de valer al instante');

-- ============================================================
-- 6. Sesión de soporte no reactiva ni desbloquea
-- ============================================================
update subscriptions set status = 'suspended' where church_id = 'd2000000-0000-0000-0000-00000000000a';
insert into support_sessions (church_id, operator_user_id, reason, capabilities, expires_at) values
  ('d2000000-0000-0000-0000-00000000000a', 'd1000000-0000-0000-0000-000000000003', 'Suspendida', array['diagnostics'],
   now() + interval '30 minutes');
select is(app.church_access_mode('d2000000-0000-0000-0000-00000000000a'), 'suspended',
  'comercial · una sesión de soporte no reactiva una iglesia suspendida');
update subscriptions set status = 'trial' where church_id = 'd2000000-0000-0000-0000-00000000000a';

update churches set security_block_reason = 'Motivo S confidencial', security_blocked_at = now()
where id = 'd2000000-0000-0000-0000-00000000000a';
select t15s_set_uid('d1000000-0000-0000-0000-000000000003');
select is(t15s_count($$ select count(*)::int from tags where church_id = 'd2000000-0000-0000-0000-00000000000a' $$), 0,
  'seguridad · security_blocked: la sesión de soporte no abre datos de negocio');
select is(t15s_count($$ select count(*)::int from kid_checkins where church_id = 'd2000000-0000-0000-0000-00000000000a' $$), 0,
  'seguridad · security_blocked: la sesión no abre Kids');
select t15s_reset();
select is(app.church_access_mode('d2000000-0000-0000-0000-00000000000a'), 'security_blocked',
  'seguridad · el modo sigue siendo security_blocked con sesión de soporte');
update churches set security_block_reason = null, security_blocked_at = null
where id = 'd2000000-0000-0000-0000-00000000000a';

-- ============================================================
-- 7. Auditoría y grants
-- ============================================================
select is((select count(*)::int from platform_audit_logs
  where action = 'support.session_opened' and metadata->>'authorized_by' = 'd1000000-0000-0000-0000-000000000003'), 2,
  'auditoría · cada apertura registra quién la autorizó');
select is((select count(*)::int from platform_audit_logs where action = 'support.session_revoked'), 1,
  'auditoría · la revocación queda registrada');
select is(has_function_privilege('anon', 'app.platform_open_support_session(uuid,text,integer,text[])', 'execute'), false,
  'grants · anon no puede abrir sesiones de soporte');
select is(has_function_privilege('anon', 'app.platform_church_diagnostics(uuid)', 'execute'), false,
  'grants · anon no puede leer el diagnóstico');

select * from finish();
rollback;
