-- Fase 15 · A2 hardening: motivo interno de bloqueo, RPC de Kids fuera de estado
-- operativo, códigos y tokens de recogida, y cambio entre iglesias.
-- Todas las lecturas van con rol authenticated real. Los estados se cambian como
-- superusuario después de crear las presencias, igual que en las pruebas anteriores.

begin;
select plan(46);

create or replace function t15h_set_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function t15h_reset() returns void as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$ language plpgsql;

create or replace function t15h_err(p_sql text) returns text as $$
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

create or replace function t15h_count(p_sql text) returns integer as $$
declare
  v_n integer;
begin
  execute p_sql into v_n;
  return v_n;
end;
$$ language plpgsql;

create or replace function t15h_set(p_key text, p_value text) returns text as $$
  select set_config('t15h.' || p_key, coalesce(p_value, ''), true);
$$ language sql;

create or replace function t15h_get(p_key text) returns text as $$
  select nullif(current_setting('t15h.' || p_key, true), '');
$$ language sql;

-- ============================================================
-- Usuarios: owner A, admin A, miembro A sin rol, operador de plataforma
-- con lectura comercial, usuario de otra iglesia (C), owner de C.
-- ============================================================
insert into auth.users (id, email) values
  ('c1000000-0000-0000-0000-000000000001', 'owner.a.h@example.test'),
  ('c1000000-0000-0000-0000-000000000002', 'admin.a.h@example.test'),
  ('c1000000-0000-0000-0000-000000000003', 'miembro.a.h@example.test'),
  ('c1000000-0000-0000-0000-000000000004', 'plataforma.h@example.test'),
  ('c1000000-0000-0000-0000-000000000005', 'otra.iglesia.h@example.test');

insert into churches (id, name, slug, status) values
  ('c2000000-0000-0000-0000-00000000000a', 'Iglesia A H', 'iglesia-a-h', 'trial'),
  ('c2000000-0000-0000-0000-00000000000c', 'Iglesia C H', 'iglesia-c-h', 'trial');

insert into subscriptions (church_id, plan_key, status, trial_started_at, trial_ends_at) values
  ('c2000000-0000-0000-0000-00000000000a', 'trial', 'trial', now() - interval '5 days', now() + interval '25 days'),
  ('c2000000-0000-0000-0000-00000000000c', 'trial', 'trial', now() - interval '5 days', now() + interval '25 days');

insert into people (id, first_name, last_name, source, user_id) values
  ('c3000000-0000-0000-0000-000000000001', 'Owner', 'A', 'manual', 'c1000000-0000-0000-0000-000000000001'),
  ('c3000000-0000-0000-0000-000000000002', 'Admin', 'A', 'manual', 'c1000000-0000-0000-0000-000000000002'),
  ('c3000000-0000-0000-0000-000000000003', 'Miembro', 'A', 'manual', 'c1000000-0000-0000-0000-000000000003'),
  ('c3000000-0000-0000-0000-000000000005', 'Otra', 'C', 'manual', 'c1000000-0000-0000-0000-000000000005'),
  ('c3000000-0000-0000-0000-0000000000d1', 'Menor', 'K1', 'manual', null),
  ('c3000000-0000-0000-0000-0000000000d2', 'Menor', 'K2', 'manual', null),
  ('c3000000-0000-0000-0000-0000000000d3', 'Menor', 'K3', 'manual', null),
  ('c3000000-0000-0000-0000-0000000000d4', 'Menor', 'K4', 'manual', null),
  ('c3000000-0000-0000-0000-0000000000c1', 'Menor', 'C1', 'manual', null);

insert into church_people (id, church_id, person_id, relationship, source) values
  ('c4000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-000000000001', 'member', 'manual'),
  ('c4000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-000000000002', 'member', 'manual'),
  ('c4000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-000000000003', 'member', 'manual'),
  ('c4000000-0000-0000-0000-000000000005', 'c2000000-0000-0000-0000-00000000000c', 'c3000000-0000-0000-0000-000000000005', 'member', 'manual'),
  ('c4000000-0000-0000-0000-0000000000d1', 'c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-0000000000d1', 'member', 'manual'),
  ('c4000000-0000-0000-0000-0000000000d2', 'c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-0000000000d2', 'member', 'manual'),
  ('c4000000-0000-0000-0000-0000000000d3', 'c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-0000000000d3', 'member', 'manual'),
  ('c4000000-0000-0000-0000-0000000000d4', 'c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-0000000000d4', 'member', 'manual'),
  ('c4000000-0000-0000-0000-0000000000c1', 'c2000000-0000-0000-0000-00000000000c', 'c3000000-0000-0000-0000-0000000000c1', 'member', 'manual');

insert into church_people_roles (church_id, church_people_id, role_key) values
  ('c2000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-000000000001', 'church_owner'),
  ('c2000000-0000-0000-0000-00000000000a', 'c4000000-0000-0000-0000-000000000002', 'church_admin'),
  ('c2000000-0000-0000-0000-00000000000c', 'c4000000-0000-0000-0000-000000000005', 'church_owner');

insert into platform_operators (user_id) values ('c1000000-0000-0000-0000-000000000004');
insert into platform_operator_capabilities (user_id, capability_key) values
  ('c1000000-0000-0000-0000-000000000004', 'platform.commercial.read');

-- Motivo interno de bloqueo: no debe salir por la API del owner/admin/miembro.
update churches set security_block_reason = 'Motivo técnico confidencial H', security_blocked_at = now()
where id = 'c2000000-0000-0000-0000-00000000000a';
update churches set security_block_reason = null, security_blocked_at = null
where id = 'c2000000-0000-0000-0000-00000000000a';

-- Kids: sala, sesión abierta y ¿presencias? (se crean en modo full, abajo)
insert into activities (id, church_id, type, title, starts_at, ends_at, timezone) values
  ('c5000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-00000000000a', 'service', 'Culto H',
   now() - interval '1 hour', now() + interval '1 hour', 'Europe/Madrid'),
  ('c5000000-0000-0000-0000-00000000000c', 'c2000000-0000-0000-0000-00000000000c', 'service', 'Culto C H',
   now() - interval '1 hour', now() + interval '1 hour', 'Europe/Madrid');
insert into kids_rooms (id, church_id, name, capacity) values
  ('c6000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-00000000000a', 'Sala Secreta H', 20),
  ('c6000000-0000-0000-0000-00000000000c', 'c2000000-0000-0000-0000-00000000000c', 'Sala C H', 20);
insert into kids_sessions (id, church_id, activity_id, room_id, status) values
  ('c7000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-00000000000a',
   'c5000000-0000-0000-0000-00000000000a', 'c6000000-0000-0000-0000-00000000000a', 'open'),
  ('c7000000-0000-0000-0000-00000000000c', 'c2000000-0000-0000-0000-00000000000c',
   'c5000000-0000-0000-0000-00000000000c', 'c6000000-0000-0000-0000-00000000000c', 'open');

insert into kid_pickup_authorizations (church_id, kid_person_id, authorized_name_snapshot, relation_text, authorization_type)
values ('c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-0000000000d1', 'Madre K1', 'Madre', 'permanent'),
       ('c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-0000000000d3', 'Padre K3', 'Padre', 'permanent'),
       ('c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-0000000000d4', 'Tutora K4', 'Tutora', 'permanent');

-- Personal asignado a la sesión (para probar el fichaje de entrada fuera de estado)
insert into kids_session_staff (id, church_id, session_id, person_id, checked_in_at) values
  ('c8000000-0000-0000-0000-00000000000a', 'c2000000-0000-0000-0000-00000000000a',
   'c7000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-000000000002', now());

-- ============================================================
-- FULL: presencias creadas por el owner (guardamos sus códigos de recogida)
-- ============================================================
select t15h_set('auth_k1', (select id::text from kid_pickup_authorizations where kid_person_id = 'c3000000-0000-0000-0000-0000000000d1'));
select t15h_set('auth_k3', (select id::text from kid_pickup_authorizations where kid_person_id = 'c3000000-0000-0000-0000-0000000000d3'));
select t15h_set('auth_k4', (select id::text from kid_pickup_authorizations where kid_person_id = 'c3000000-0000-0000-0000-0000000000d4'));

select t15h_set_uid('c1000000-0000-0000-0000-000000000001');
select t15h_set('code_k1', (select pickup_code from public.kids_checkin('c7000000-0000-0000-0000-00000000000a',
  'c3000000-0000-0000-0000-0000000000d1') limit 1));
select t15h_set('code_k3', (select pickup_code from public.kids_checkin('c7000000-0000-0000-0000-00000000000a',
  'c3000000-0000-0000-0000-0000000000d3') limit 1));
select t15h_set('code_k4', (select pickup_code from public.kids_checkin('c7000000-0000-0000-0000-00000000000a',
  'c3000000-0000-0000-0000-0000000000d4') limit 1));
select t15h_reset();

select ok(t15h_get('code_k1') is not null, 'full · el owner crea la presencia de K1 y obtiene su código');

-- Historial de suscripción: owner lo ve también en full (corrección funcional)
insert into subscription_history (church_id, event, from_status, to_status) values
  ('c2000000-0000-0000-0000-00000000000a', 'status_changed', 'trial', 'trial');
select t15h_set_uid('c1000000-0000-0000-0000-000000000001');
select is(t15h_count($$ select count(*)::int from subscription_history where church_id = 'c2000000-0000-0000-0000-00000000000a' $$), 1,
  'full · historial de suscripción visible para owner (corrección aprobada)');
select t15h_reset();

-- ============================================================
-- TRIAL_EXPIRED
-- ============================================================
update subscriptions set trial_ends_at = now() - interval '10 days', trial_started_at = now() - interval '40 days'
where church_id = 'c2000000-0000-0000-0000-00000000000a';

select t15h_set_uid('c1000000-0000-0000-0000-000000000001');
select is(t15h_err($$ select public.kids_checkin('c7000000-0000-0000-0000-00000000000a',
  'c3000000-0000-0000-0000-0000000000d2') $$), '42501',
  'trial · check-in nuevo de menor: denegado');
select is(t15h_err($$ select public.kids_checkin('c7000000-0000-0000-0000-00000000000a',
  'c3000000-0000-0000-0000-0000000000d1') $$), '42501',
  'trial · replay de check-in de K1: denegado (no devuelve el código de recogida)');
select is(t15h_count($$ select count(*)::int from public.kids_lookup_pickup('c7000000-0000-0000-0000-00000000000a',
  '$$ || t15h_get('code_k1') || $$') where room_name is null and kid_name is not null $$), 1,
  'trial · recogida: el nombre de sala no se devuelve y el del menor sí (lo mínimo)');
select is(t15h_err($$ select public.kids_checkout('ZZZZZZZZ', 'c7000000-0000-0000-0000-00000000000a',
  'Madre K1', null, null) $$), 'P0002',
  'trial · check-out con código inválido: denegado');
select is(t15h_err($$ select public.kids_checkout('$$ || t15h_get('code_k1') || $$',
  'c7000000-0000-0000-0000-00000000000c', 'Madre K1', null, null) $$), '42501',
  'trial · código de A con sesión de C: denegado (tenant y sesión no coinciden)');
select is(t15h_count($$ select count(*)::int from public.kids_checkout('$$ || t15h_get('code_k1') || $$',
  'c7000000-0000-0000-0000-00000000000a', 'Madre K1',
  'c9000000-0000-0000-0000-000000000000', null) where authorized = false and status = 'checked_in' $$), 1,
  'trial · check-out con autorización inexistente y sin anulación: no cierra la presencia');
select is(t15h_count($$ select count(*)::int from public.kids_checkout('$$ || t15h_get('code_k1') || $$',
  'c7000000-0000-0000-0000-00000000000a', 'Madre K1', '$$ || t15h_get('auth_k1') || $$'::uuid, null)
  where authorized = true and status = 'checked_out' $$), 1,
  'trial · check-out seguro de K1 con su autorización: ALLOWED y presencia cerrada');
select is(t15h_err($$ select public.kids_checkout('$$ || t15h_get('code_k1') || $$',
  'c7000000-0000-0000-0000-00000000000a', 'Madre K1', null, null) $$), 'P0002',
  'trial · segundo check-out con el mismo código: denegado (la presencia ya no está activa)');
select is(t15h_err($$ select public.kids_save_sensitive_notes('c2000000-0000-0000-0000-00000000000a',
  'c3000000-0000-0000-0000-0000000000d3', 'alergia', 'contacto') $$), '42501',
  'trial · notas sensibles: denegado');
select is(t15h_err($$ select public.people_birth_dates('c2000000-0000-0000-0000-00000000000a',
  array['c3000000-0000-0000-0000-0000000000d3']::uuid[]) $$), '42501',
  'trial · fechas de nacimiento: denegado');
select is(t15h_err($$ select public.kids_staff_check_in('c8000000-0000-0000-0000-00000000000a') $$), '42501',
  'trial · fichaje de entrada de personal: denegado');
select is(app.notify_kid_guardians('c2000000-0000-0000-0000-00000000000a', 'c3000000-0000-0000-0000-0000000000d3',
  'kid.checked_out', 'h-trial'), 0,
  'trial · no se generan avisos a tutores');
select is(t15h_err($$ select public.kids_room_ratio_status('c7000000-0000-0000-0000-00000000000a') $$), '42501',
  'trial · ratio de sala: denegado');
select t15h_reset();

-- Motivo interno: el owner no lo lee por la tabla, por el RPC de estado ni por la recuperación
select t15h_set_uid('c1000000-0000-0000-0000-000000000001');
select is(t15h_err($$ select security_block_reason from churches where id = 'c2000000-0000-0000-0000-00000000000a' $$), '42501',
  'columna · owner no lee security_block_reason');
select is((select (app.church_service_state('c2000000-0000-0000-0000-00000000000a') ? 'security_block_reason')),
  false, 'columna · owner: el estado de servicio no incluye el motivo');
select is((select (app.get_church_recovery_context('c2000000-0000-0000-0000-00000000000a')::text like '%Motivo técnico confidencial H%')),
  false, 'columna · recuperación del owner no contiene el motivo');
select t15h_reset();

-- ============================================================
-- SUSPENDED: incidencia de un menor dentro (RPC), check-out de K3 con código
-- ============================================================
update subscriptions set status = 'suspended' where church_id = 'c2000000-0000-0000-0000-00000000000a';

select t15h_set_uid('c1000000-0000-0000-0000-000000000001');
select is(t15h_err($$ select public.kids_record_incident_for_present_kid('c2000000-0000-0000-0000-00000000000a',
  'c3000000-0000-0000-0000-0000000000d3', 'c7000000-0000-0000-0000-00000000000a', 'other', 'high', 'Incidencia K3') $$), 'ok',
  'suspended · incidencia de menor dentro por RPC: ALLOWED');
select is(t15h_err($$ select public.kids_record_incident_for_present_kid('c2000000-0000-0000-0000-00000000000a',
  'c3000000-0000-0000-0000-0000000000d2', 'c7000000-0000-0000-0000-00000000000a', 'other', 'high', 'Incidencia K2') $$), '42501',
  'suspended · incidencia de menor que no está dentro: DENIED');
select is(t15h_count($$ select count(*)::int from public.kids_checkout('$$ || t15h_get('code_k3') || $$',
  'c7000000-0000-0000-0000-00000000000a', 'Padre K3', '$$ || t15h_get('auth_k3') || $$'::uuid, null)
  where authorized = true and status = 'checked_out' $$), 1,
  'suspended · check-out de K3 con su autorización de recogida: ALLOWED y presencia cerrada');
select t15h_reset();

-- ============================================================
-- CANCELLED
-- ============================================================
update subscriptions set status = 'cancelled', cancelled_at = now() - interval '3 days'
where church_id = 'c2000000-0000-0000-0000-00000000000a';
update churches set status = 'archived', archived_at = now() - interval '3 days'
where id = 'c2000000-0000-0000-0000-00000000000a';

select t15h_set_uid('c1000000-0000-0000-0000-000000000001');
select is(t15h_err($$ select public.kids_checkin('c7000000-0000-0000-0000-00000000000a',
  'c3000000-0000-0000-0000-0000000000d2') $$), '42501',
  'cancelled · check-in nuevo: denegado');
select is(t15h_count($$ select count(*)::int from public.kids_lookup_pickup('c7000000-0000-0000-0000-00000000000a',
  '$$ || t15h_get('code_k4') || $$') $$), 1,
  'cancelled · recogida de K4 (presencia activa): permitida');
select t15h_reset();

-- ============================================================
-- SECURITY_BLOCKED: incidencia y check-out de K4; nada más de Kids
-- ============================================================
update subscriptions set status = 'active', cancelled_at = null where church_id = 'c2000000-0000-0000-0000-00000000000a';
update churches set security_block_reason = 'Motivo técnico confidencial H', security_blocked_at = now(),
  status = 'trial', archived_at = null
where id = 'c2000000-0000-0000-0000-00000000000a';

select t15h_set_uid('c1000000-0000-0000-0000-000000000001');
select is(t15h_err($$ select public.kids_record_incident_for_present_kid('c2000000-0000-0000-0000-00000000000a',
  'c3000000-0000-0000-0000-0000000000d4', 'c7000000-0000-0000-0000-00000000000a', 'security', 'high', 'Incidencia K4') $$), 'ok',
  'security_blocked · incidencia de menor dentro por RPC: ALLOWED');
select is(t15h_err($$ select public.kids_checkin('c7000000-0000-0000-0000-00000000000a',
  'c3000000-0000-0000-0000-0000000000d2') $$), '42501',
  'security_blocked · check-in nuevo: denegado');
select is(t15h_count($$ select count(*)::int from public.kids_checkout('$$ || t15h_get('code_k4') || $$',
  'c7000000-0000-0000-0000-00000000000a', 'Tutora K4', '$$ || t15h_get('auth_k4') || $$'::uuid, null)
  where authorized = true and status = 'checked_out' $$), 1,
  'security_blocked · check-out seguro de K4 con su autorización: ALLOWED y presencia cerrada');
select is(t15h_err($$ select * from app.analytics_dashboard('c2000000-0000-0000-0000-00000000000a', 'month', null, null, null) $$), '42501',
  'security_blocked · analytics: denegado');
select is(t15h_count($$ select count(*)::int from export_jobs where church_id = 'c2000000-0000-0000-0000-00000000000a' $$), 0,
  'security_blocked · exportaciones: sin lectura');
select t15h_reset();

-- ============================================================
-- Motivo interno: admin, miembro sin rol, otro tenant, plataforma
-- ============================================================
select t15h_set_uid('c1000000-0000-0000-0000-000000000002');
select is(t15h_err($$ select security_block_reason from churches where id = 'c2000000-0000-0000-0000-00000000000a' $$), '42501',
  'columna · admin no lee security_block_reason');
select is((select (app.church_service_state('c2000000-0000-0000-0000-00000000000a') ? 'security_block_reason')),
  false, 'columna · admin: el estado de servicio no incluye el motivo');
select is((select (app.get_church_recovery_context('c2000000-0000-0000-0000-00000000000a')::text like '%Motivo técnico confidencial H%')),
  false, 'columna · recuperación del admin no contiene el motivo');
select t15h_reset();

select t15h_set_uid('c1000000-0000-0000-0000-000000000003');
select is(t15h_err($$ select security_block_reason from churches where id = 'c2000000-0000-0000-0000-00000000000a' $$), '42501',
  'columna · miembro sin rol no lee security_block_reason');
select is(t15h_err($$ select app.church_service_state('c2000000-0000-0000-0000-00000000000a') $$), '42501',
  'estado de servicio · miembro sin rol: denegado');
select t15h_reset();

select t15h_set_uid('c1000000-0000-0000-0000-000000000005');
select is(t15h_err($$ select app.church_service_state('c2000000-0000-0000-0000-00000000000a') $$), '42501',
  'aislamiento · owner de C no obtiene el estado de A');
select is(t15h_err($$ select app.get_church_recovery_context('c2000000-0000-0000-0000-00000000000a') $$), '42501',
  'aislamiento · owner de C no obtiene la recuperación de A');
select is(t15h_err($$ select security_block_reason from churches where id = 'c2000000-0000-0000-0000-00000000000c' $$), '42501',
  'columna · owner de C no lee security_block_reason ni de su propia iglesia');
select t15h_reset();

select t15h_set_uid('c1000000-0000-0000-0000-000000000004');
select is(t15h_err($$ select security_block_reason from churches where id = 'c2000000-0000-0000-0000-00000000000a' $$), '42501',
  'plataforma · la tabla no expone el motivo ni con la capacidad de lectura comercial');
select is((select app.church_service_state('c2000000-0000-0000-0000-00000000000a')->>'security_block_reason')
  , 'Motivo técnico confidencial H',
  'plataforma · con platform.commercial.read el estado de servicio sí devuelve el motivo');
select t15h_reset();

-- ============================================================
-- Multi-iglesia: owner de A (suspendida/bloqueada) y de B (full)
-- ============================================================
insert into churches (id, name, slug, status) values
  ('c2000000-0000-0000-0000-00000000000b', 'Iglesia B H', 'iglesia-b-h', 'trial');
insert into subscriptions (church_id, plan_key, status, trial_started_at, trial_ends_at) values
  ('c2000000-0000-0000-0000-00000000000b', 'trial', 'trial', now() - interval '5 days', now() + interval '25 days');
insert into church_people (id, church_id, person_id, relationship, source) values
  ('c4000000-0000-0000-0000-0000000000b1', 'c2000000-0000-0000-0000-00000000000b', 'c3000000-0000-0000-0000-000000000001', 'member', 'manual');
insert into tags (church_id, name) values ('c2000000-0000-0000-0000-00000000000b', 'Etiqueta B H');
update subscriptions set status = 'suspended' where church_id = 'c2000000-0000-0000-0000-00000000000a';
update churches set archived_at = null, status = 'trial' where id = 'c2000000-0000-0000-0000-00000000000a';
update churches set security_block_reason = null, security_blocked_at = null where id = 'c2000000-0000-0000-0000-00000000000a';

select t15h_set_uid('c1000000-0000-0000-0000-000000000001');
select is(t15h_count($$ select count(*)::int from get_my_memberships() $$), 2,
  'multi · membresías: A y B aparecen con el modo de cada una');
select is(t15h_count($$ select count(*)::int from get_my_memberships() where church_id = 'c2000000-0000-0000-0000-00000000000a' and access_mode = 'suspended' $$), 1,
  'multi · A indica suspended');
select is(t15h_count($$ select count(*)::int from get_my_memberships() where church_id = 'c2000000-0000-0000-0000-00000000000b' and access_mode = 'full' $$), 1,
  'multi · B indica full');
select is(t15h_count($$ select count(*)::int from tags where church_id = 'c2000000-0000-0000-0000-00000000000b' $$), 1,
  'multi · con B seleccionada: negocio de B disponible');
select is(t15h_count($$ select count(*)::int from tags where church_id = 'c2000000-0000-0000-0000-00000000000a' $$), 0,
  'multi · A (suspended) no devuelve datos de negocio');
select is(t15h_count($$ select count(*)::int from kid_checkins where church_id = 'c2000000-0000-0000-0000-00000000000a' $$), 0,
  'multi · A (suspended) no devuelve presencias Kids');
select t15h_reset();

-- ============================================================
-- Guardarraíl de catálogo: el almacenamiento de archivos y las tablas de negocio
-- llevan la condición de lectura comercial. Si cambia, falla aquí.
-- ============================================================
select ok(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'files'
     and cmd in ('SELECT', 'ALL') and qual ilike '%readable_church_ids%') >= 1,
  'guardarraíl · la lectura de metadatos de archivos exige lectura comercial');

select ok(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'kid_checkins'
     and cmd in ('SELECT', 'ALL') and qual not ilike '%readable_church_ids%') = 0,
  'guardarraíl · kid_checkins: todas las lecturas exigen lectura comercial');

select * from finish();
rollback;
