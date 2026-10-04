-- Fase 15 · A2: gating de lectura por estado comercial y superficie de recuperación.
-- Todas las lecturas se hacen con rol authenticated real (no superusuario): la
-- prueba de RLS y de RPC solo vale si el rol de la sesión es el de la app.
-- Cubre: full sin cambio, trial_expired, suspended, cancelled, security_blocked,
-- multi-iglesia (A bloqueada, B operativa), aislamiento con C, RPC que devuelven
-- negocio, Kids por cierre seguro, notificaciones, historial y exportaciones.

begin;
select plan(52);

create or replace function t15a2_set_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function t15a2_reset() returns void as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$ language plpgsql;

create or replace function t15a2_err(p_sql text) returns text as $$
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

create or replace function t15a2_count(p_sql text) returns integer as $$
declare
  v_n integer;
begin
  execute p_sql into v_n;
  return v_n;
end;
$$ language plpgsql;

-- ============================================================
-- Fixtures (como superusuario, antes de cambiar de rol)
-- ============================================================
insert into auth.users (id, email) values
  ('a2000000-0000-0000-0000-000000000001', 'owner.a.f15a2@example.test'),
  ('a2000000-0000-0000-0000-000000000002', 'miembro.a.f15a2@example.test'),
  ('a2000000-0000-0000-0000-000000000003', 'owner.c.f15a2@example.test');

insert into churches (id, name, slug, status) values
  ('a2100000-0000-0000-0000-00000000000a', 'Iglesia A A2', 'iglesia-a-a2', 'trial'),
  ('a2100000-0000-0000-0000-00000000000b', 'Iglesia B A2', 'iglesia-b-a2', 'trial'),
  ('a2100000-0000-0000-0000-00000000000c', 'Iglesia C A2', 'iglesia-c-a2', 'trial');

insert into subscriptions (church_id, plan_key, status, trial_started_at, trial_ends_at) values
  ('a2100000-0000-0000-0000-00000000000a', 'trial', 'trial', now() - interval '5 days', now() + interval '25 days'),
  ('a2100000-0000-0000-0000-00000000000b', 'trial', 'trial', now() - interval '5 days', now() + interval '25 days'),
  ('a2100000-0000-0000-0000-00000000000c', 'trial', 'trial', now() - interval '5 days', now() + interval '25 days');

insert into people (id, first_name, last_name, source, user_id) values
  ('a2200000-0000-0000-0000-000000000001', 'Owner', 'A', 'manual', 'a2000000-0000-0000-0000-000000000001'),
  ('a2200000-0000-0000-0000-000000000002', 'Miembro', 'A', 'manual', 'a2000000-0000-0000-0000-000000000002'),
  ('a2200000-0000-0000-0000-000000000003', 'Owner', 'C', 'manual', 'a2000000-0000-0000-0000-000000000003'),
  ('a2200000-0000-0000-0000-0000000000b1', 'Menor', 'Dentro', 'manual', null),
  ('a2200000-0000-0000-0000-0000000000b2', 'Menor', 'Fuera', 'manual', null),
  ('a2200000-0000-0000-0000-0000000000b3', 'Persona', 'Ajena', 'manual', null);

-- Owner A también es miembro de B (multi-iglesia)
insert into church_people (id, church_id, person_id, relationship, source) values
  ('a2300000-0000-0000-0000-00000000000a', 'a2100000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-000000000001', 'member', 'manual'),
  ('a2300000-0000-0000-0000-00000000000b', 'a2100000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-000000000002', 'member', 'manual'),
  ('a2300000-0000-0000-0000-00000000000c', 'a2100000-0000-0000-0000-00000000000c', 'a2200000-0000-0000-0000-000000000003', 'member', 'manual'),
  ('a2300000-0000-0000-0000-0000000000ab', 'a2100000-0000-0000-0000-00000000000b', 'a2200000-0000-0000-0000-000000000001', 'member', 'manual'),
  ('a2300000-0000-0000-0000-0000000000a1', 'a2100000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-0000000000b1', 'member', 'manual'),
  ('a2300000-0000-0000-0000-0000000000a2', 'a2100000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-0000000000b2', 'member', 'manual'),
  ('a2300000-0000-0000-0000-0000000000a3', 'a2100000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-0000000000b3', 'member', 'manual');

-- Roles: owner de A y de C; miembro sin rol en A.
insert into church_people_roles (church_id, church_people_id, role_key) values
  ('a2100000-0000-0000-0000-00000000000a', 'a2300000-0000-0000-0000-00000000000a', 'church_owner'),
  ('a2100000-0000-0000-0000-00000000000c', 'a2300000-0000-0000-0000-00000000000c', 'church_owner');

-- Datos de negocio (con las iglesias activas)
insert into tags (church_id, name) values
  ('a2100000-0000-0000-0000-00000000000a', 'Etiqueta A'),
  ('a2100000-0000-0000-0000-00000000000b', 'Etiqueta B'),
  ('a2100000-0000-0000-0000-00000000000c', 'Etiqueta C');

insert into activities (id, church_id, type, title, starts_at, ends_at, timezone) values
  ('a2400000-0000-0000-0000-00000000000a', 'a2100000-0000-0000-0000-00000000000a', 'service', 'Culto A2',
   now() - interval '1 hour', now() + interval '1 hour', 'Europe/Madrid');
insert into kids_rooms (id, church_id, name, capacity) values
  ('a2500000-0000-0000-0000-00000000000a', 'a2100000-0000-0000-0000-00000000000a', 'Sala A2', 20);
insert into kids_sessions (id, church_id, activity_id, room_id, status) values
  ('a2600000-0000-0000-0000-00000000000a', 'a2100000-0000-0000-0000-00000000000a',
   'a2400000-0000-0000-0000-00000000000a', 'a2500000-0000-0000-0000-00000000000a', 'open');
insert into kid_checkins (id, church_id, session_id, kid_person_id, room_id, status, pickup_token_hash, checked_in_at) values
  ('a2700000-0000-0000-0000-00000000000a', 'a2100000-0000-0000-0000-00000000000a', 'a2600000-0000-0000-0000-00000000000a',
   'a2200000-0000-0000-0000-0000000000b1', 'a2500000-0000-0000-0000-00000000000a', 'checked_in', 'hash-a2-dentro', now());

insert into notification_events (id, church_id, event_type, entity_type, entity_id, idempotency_key, recipient_person_ids, processed_at)
values ('a2810000-0000-0000-0000-00000000000a', 'a2100000-0000-0000-0000-00000000000a', 'assignment.proposed',
        'activity_assignments', 'a2400000-0000-0000-0000-00000000000a', 'a2-aviso-owner-a',
        array['a2200000-0000-0000-0000-000000000001']::uuid[], now());
insert into notifications (id, event_id, church_id, person_id, event_type, title, body, entity_type, entity_id)
values ('a2800000-0000-0000-0000-00000000000a', 'a2810000-0000-0000-0000-00000000000a', 'a2100000-0000-0000-0000-00000000000a',
        'a2200000-0000-0000-0000-000000000001', 'assignment.proposed', 'Aviso A2', 'Cuerpo', 'activity_assignments',
        'a2400000-0000-0000-0000-00000000000a');

insert into subscription_history (church_id, event, from_status, to_status) values
  ('a2100000-0000-0000-0000-00000000000a', 'status_changed', 'trial', 'trial');

insert into export_jobs (church_id, entity_type) values
  ('a2100000-0000-0000-0000-00000000000a', 'people');

insert into kid_pickup_authorizations (church_id, kid_person_id, authorized_name_snapshot, relation_text, authorization_type)
values ('a2100000-0000-0000-0000-00000000000a', 'a2200000-0000-0000-0000-0000000000b1', 'Madre A2', 'Madre', 'permanent');

-- ============================================================
-- 1. FULL: sin cambios de comportamiento
-- ============================================================
select t15a2_set_uid('a2000000-0000-0000-0000-000000000001');
select is(t15a2_count($$ select count(*)::int from tags where church_id = 'a2100000-0000-0000-0000-00000000000a' $$), 1,
  'full · owner A ve sus etiquetas de negocio');
select is(t15a2_count($$ select count(*)::int from people where id = 'a2200000-0000-0000-0000-0000000000b3' $$), 1,
  'full · owner A ve a una persona de su iglesia');
select is(t15a2_count($$ select count(*)::int from tags where church_id = 'a2100000-0000-0000-0000-00000000000c' $$), 0,
  'full · owner A no ve datos de la iglesia C');
select is(t15a2_count($$ select count(*)::int from kid_checkins where church_id = 'a2100000-0000-0000-0000-00000000000a' $$), 1,
  'full · Kids: lectura normal de presencias');
select is(t15a2_count($$ select app.count_my_unread_notifications('a2100000-0000-0000-0000-00000000000a') $$), 1,
  'full · la bandeja de avisos cuenta el aviso');
select t15a2_reset();

-- ============================================================
-- 2. TRIAL_EXPIRED (A)
-- ============================================================
update subscriptions set trial_ends_at = now() - interval '10 days', trial_started_at = now() - interval '40 days'
where church_id = 'a2100000-0000-0000-0000-00000000000a';

select t15a2_set_uid('a2000000-0000-0000-0000-000000000001');
select is(t15a2_count($$ select count(*)::int from tags where church_id = 'a2100000-0000-0000-0000-00000000000a' $$), 0,
  'trial_expired · negocio: sin lectura de etiquetas');
select is(t15a2_count($$ select count(*)::int from people where id = 'a2200000-0000-0000-0000-0000000000b3' $$), 0,
  'trial_expired · negocio: sin lectura de personas');
select is((select (app.get_church_recovery_context('a2100000-0000-0000-0000-00000000000a')->>'accessMode')),
  'trial_expired', 'trial_expired · recuperación: modo correcto');
select is((select (app.get_church_recovery_context('a2100000-0000-0000-0000-00000000000a')->>'exportAvailable')::boolean),
  true, 'trial_expired · recuperación: exportación disponible');
select is((select (app.get_church_recovery_context('a2100000-0000-0000-0000-00000000000a')->'subscription'->>'trialEndsAt') is not null),
  true, 'trial_expired · recuperación: fecha de fin de prueba');
select is(t15a2_count($$ select count(*)::int from subscription_history where church_id = 'a2100000-0000-0000-0000-00000000000a' $$), 1,
  'trial_expired · historial de suscripción: visible en solo lectura');
select is(t15a2_count($$ select count(*)::int from export_jobs where church_id = 'a2100000-0000-0000-0000-00000000000a' $$), 1,
  'trial_expired · exportaciones propias: visibles');
select is(t15a2_err($$ select * from app.analytics_dashboard('a2100000-0000-0000-0000-00000000000a', 'month', null, null, null) $$), '42501',
  'trial_expired · analytics: denegado');
select is(t15a2_err($$ select * from app.kids_room_ratio_status('a2600000-0000-0000-0000-00000000000a') $$), '42501',
  'trial_expired · ratio de salas Kids: denegado');
select is(t15a2_count($$ select count(*)::int from list_my_notifications('a2100000-0000-0000-0000-00000000000a') $$), 0,
  'trial_expired · bandeja de avisos: vacía');
select is(t15a2_count($$ select app.count_my_unread_notifications('a2100000-0000-0000-0000-00000000000a') $$), 0,
  'trial_expired · contador de avisos: 0');
select t15a2_reset();

-- Kids por cierre seguro en trial_expired
select t15a2_set_uid('a2000000-0000-0000-0000-000000000001');
select is(t15a2_count($$ select count(*)::int from kid_checkins where church_id = 'a2100000-0000-0000-0000-00000000000a' $$), 0,
  'trial_expired · Kids: sin lectura normal de presencias');
select is(t15a2_err($$ select * from kids_authorized_pickups('a2200000-0000-0000-0000-0000000000b1', 'a2100000-0000-0000-0000-00000000000a') $$), 'ok',
  'trial_expired · Kids: recogida de un menor dentro se puede validar (cierre seguro)');
select is(t15a2_err($$ select * from kids_authorized_pickups('a2200000-0000-0000-0000-0000000000b2', 'a2100000-0000-0000-0000-00000000000a') $$), 'ok',
  'trial_expired · Kids: recogida de un menor fuera no devuelve error (y no devuelve filas)');
select is(t15a2_count($$ select count(*)::int from kids_authorized_pickups('a2200000-0000-0000-0000-0000000000b2', 'a2100000-0000-0000-0000-00000000000a') $$), 0,
  'trial_expired · Kids: un menor fuera no devuelve recogidas');
select is(t15a2_count($$ select count(*)::int from kids_authorized_pickups('a2200000-0000-0000-0000-0000000000b1', 'a2100000-0000-0000-0000-00000000000a') $$), 1,
  'trial_expired · Kids: la recogida del menor dentro sí devuelve su autorización');
select is(t15a2_err($$ select public.kids_record_incident_for_present_kid('a2100000-0000-0000-0000-00000000000a',
  'a2200000-0000-0000-0000-0000000000b1', 'a2600000-0000-0000-0000-00000000000a', 'other', 'high', 'Incidencia A2') $$), 'ok',
  'trial_expired · Kids: incidencia de un menor dentro por RPC: ALLOWED');
select is(t15a2_err($$ select public.kids_record_incident_for_present_kid('a2100000-0000-0000-0000-00000000000a',
  'a2200000-0000-0000-0000-0000000000b2', 'a2600000-0000-0000-0000-00000000000a', 'other', 'high', 'Incidencia ajena') $$), '42501',
  'trial_expired · Kids: incidencia de un menor que no está dentro: DENIED');
select is(t15a2_err($$ insert into kid_checkins (church_id, session_id, kid_person_id, room_id, status, pickup_token_hash)
  values ('a2100000-0000-0000-0000-00000000000a', 'a2600000-0000-0000-0000-00000000000a',
          'a2200000-0000-0000-0000-0000000000b2', 'a2500000-0000-0000-0000-00000000000a', 'checked_in', 'hash-nuevo') $$), '42501',
  'trial_expired · Kids: check-in nuevo: DENIED');
select t15a2_reset();

-- ============================================================
-- 3. MULTI-IGLESIA: A bloqueada, B operativa (mismo usuario)
-- ============================================================
select t15a2_set_uid('a2000000-0000-0000-0000-000000000001');
select is(t15a2_count($$ select count(*)::int from tags where church_id = 'a2100000-0000-0000-0000-00000000000b' $$), 1,
  'multi · owner A sigue leyendo la iglesia B operativa');
select is(t15a2_count($$ select count(*)::int from get_my_church_access_modes() where access_mode = 'trial_expired' $$), 1,
  'multi · la lista de modos marca A como trial_expired');
select is(t15a2_count($$ select count(*)::int from get_my_church_access_modes() where access_mode = 'full' $$), 1,
  'multi · la lista de modos marca B como full');
select is(t15a2_count($$ select count(*)::int from get_my_memberships()
  where church_name = 'Iglesia A A2' and access_mode = 'trial_expired' $$), 1,
  'multi · membresías: A aparece aunque esté bloqueada (no depende de RLS de people/church_people)');
select is(t15a2_count($$ select count(*)::int from get_my_memberships() $$), 2,
  'multi · membresías: solo las propias (A y B), nunca C');
select t15a2_reset();

-- ============================================================
-- 4. SUSPENDED (A)
-- ============================================================
update subscriptions set status = 'suspended' where church_id = 'a2100000-0000-0000-0000-00000000000a';

select t15a2_set_uid('a2000000-0000-0000-0000-000000000001');
select is(t15a2_count($$ select count(*)::int from tags where church_id = 'a2100000-0000-0000-0000-00000000000a' $$), 0,
  'suspended · negocio: sin lectura de etiquetas');
select is((select (app.get_church_recovery_context('a2100000-0000-0000-0000-00000000000a')->>'accessMode')),
  'suspended', 'suspended · recuperación: modo correcto');
select is(t15a2_count($$ select count(*)::int from subscription_history where church_id = 'a2100000-0000-0000-0000-00000000000a' $$), 1,
  'suspended · historial de suscripción: visible en solo lectura');
select t15a2_reset();

-- ============================================================
-- 5. CANCELLED (A): archivada con retención
-- ============================================================
update subscriptions set status = 'cancelled', cancelled_at = now() - interval '3 days'
where church_id = 'a2100000-0000-0000-0000-00000000000a';
update churches set status = 'archived', archived_at = now() - interval '3 days'
where id = 'a2100000-0000-0000-0000-00000000000a';

select t15a2_set_uid('a2000000-0000-0000-0000-000000000001');
select is(t15a2_count($$ select count(*)::int from tags where church_id = 'a2100000-0000-0000-0000-00000000000a' $$), 0,
  'cancelled · negocio: sin lectura de etiquetas');
select is((select (app.get_church_recovery_context('a2100000-0000-0000-0000-00000000000a')->>'retentionEndsAt') is not null),
  true, 'cancelled · recuperación: muestra fin de retención');
select is((select (app.get_church_recovery_context('a2100000-0000-0000-0000-00000000000a')->>'exportAvailable')::boolean),
  true, 'cancelled · recuperación: exportación durante retención');
select t15a2_reset();

-- ============================================================
-- 6. SECURITY_BLOCKED (A): el modo más estricto
-- ============================================================
update subscriptions set status = 'active', cancelled_at = null
where church_id = 'a2100000-0000-0000-0000-00000000000a';
update churches set security_block_reason = 'Motivo técnico interno A2', security_blocked_at = now()
where id = 'a2100000-0000-0000-0000-00000000000a';

select t15a2_set_uid('a2000000-0000-0000-0000-000000000001');
select is(t15a2_count($$ select count(*)::int from tags where church_id = 'a2100000-0000-0000-0000-00000000000a' $$), 0,
  'security_blocked · negocio: sin lectura de etiquetas');
select is((select (app.get_church_recovery_context('a2100000-0000-0000-0000-00000000000a')->>'accessMode')),
  'security_blocked', 'security_blocked · recuperación: modo correcto');
select is((select (app.get_church_recovery_context('a2100000-0000-0000-0000-00000000000a')->>'exportAvailable')::boolean),
  false, 'security_blocked · recuperación: sin exportación');
select is((select (app.get_church_recovery_context('a2100000-0000-0000-0000-00000000000a') ? 'history')),
  true, 'security_blocked · recuperación: la clave history existe');
select is((select jsonb_array_length(app.get_church_recovery_context('a2100000-0000-0000-0000-00000000000a')->'history')),
  0, 'security_blocked · recuperación: sin historial');
select is((select (app.get_church_recovery_context('a2100000-0000-0000-0000-00000000000a')::text like '%Motivo técnico interno A2%')),
  false, 'security_blocked · recuperación: el motivo interno no sale');
select is(t15a2_count($$ select count(*)::int from export_jobs where church_id = 'a2100000-0000-0000-0000-00000000000a' $$), 0,
  'security_blocked · exportaciones: sin lectura de trabajos');
select is(t15a2_count($$ select count(*)::int from subscription_history where church_id = 'a2100000-0000-0000-0000-00000000000a' $$), 0,
  'security_blocked · historial de suscripción: sin lectura directa');
select is(t15a2_count($$ select count(*)::int from list_my_notifications('a2100000-0000-0000-0000-00000000000a') $$), 0,
  'security_blocked · bandeja de avisos: vacía');
select is(t15a2_err($$ select * from app.kids_room_ratio_status('a2600000-0000-0000-0000-00000000000a') $$), '42501',
  'security_blocked · Kids ratio: denegado');
select is(t15a2_err($$ select public.kids_record_incident_for_present_kid('a2100000-0000-0000-0000-00000000000a',
  'a2200000-0000-0000-0000-0000000000b1', 'a2600000-0000-0000-0000-00000000000a', 'other', 'high', 'Incidencia en bloqueo') $$), 'ok',
  'security_blocked · Kids: incidencia de un menor dentro: ALLOWED (cierre seguro)');
select is(t15a2_err($$ insert into tags (church_id, name) values ('a2100000-0000-0000-0000-00000000000a', 'Escritura bloqueada') $$), '42501',
  'security_blocked · escritura de negocio: sigue DENIED (A1)');
select t15a2_reset();

-- Miembro sin rol: no puede ver la recuperación
select t15a2_set_uid('a2000000-0000-0000-0000-000000000002');
select is(t15a2_err($$ select app.get_church_recovery_context('a2100000-0000-0000-0000-00000000000a') $$), '42501',
  'recuperación · miembro sin rol: denegada');
select t15a2_reset();

-- Owner de C (otra iglesia, activa) no ve nada de A
select t15a2_set_uid('a2000000-0000-0000-0000-000000000003');
select is(t15a2_count($$ select count(*)::int from tags where church_id = 'a2100000-0000-0000-0000-00000000000a' $$), 0,
  'aislamiento · owner C no ve datos de A bloqueada');
select is(t15a2_count($$ select count(*)::int from tags where church_id = 'a2100000-0000-0000-0000-00000000000c' $$), 1,
  'aislamiento · owner C sigue viendo su propia iglesia');
select is(t15a2_err($$ select app.get_church_recovery_context('a2100000-0000-0000-0000-00000000000a') $$), '42501',
  'aislamiento · owner C no obtiene recuperación de A');
select t15a2_reset();

-- ============================================================
-- 7. Restaurar A (full): vuelve la lectura de negocio
-- ============================================================
update churches set security_block_reason = null, security_blocked_at = null, status = 'trial', archived_at = null
where id = 'a2100000-0000-0000-0000-00000000000a';
update subscriptions set status = 'trial', trial_ends_at = now() + interval '20 days', trial_started_at = now() - interval '2 days'
where church_id = 'a2100000-0000-0000-0000-00000000000a';

select t15a2_set_uid('a2000000-0000-0000-0000-000000000001');
select is(t15a2_count($$ select count(*)::int from tags where church_id = 'a2100000-0000-0000-0000-00000000000a' $$), 1,
  'reactivación · A vuelve a full: lectura de negocio restaurada');
select t15a2_reset();

select * from finish();
rollback;
