-- Fase 8 (Diogo) · Tests de Kids: guardianes, autorizaciones de recogida,
-- salas, credenciales, ratio, check-in/out, incidencias y permisos.
-- Ver prompt de Fase 8 §50.

begin;
select plan(40);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function test_create_service_activity(
  p_church_id uuid,
  p_title text,
  p_starts_offset interval default interval '2 days'
) returns uuid as $$
declare
  v_result jsonb;
  v_id uuid;
begin
  v_result := app.create_activity(
    p_church_id,
    jsonb_build_object(
      'type', 'service', 'title', p_title, 'schedule_kind', 'timed',
      'local_start', to_char((now() + p_starts_offset), 'YYYY-MM-DD HH24:MI:SS'),
      'local_end', to_char((now() + p_starts_offset + interval '2 hours'), 'YYYY-MM-DD HH24:MI:SS'),
      'timezone', 'Europe/Madrid'
    )
  );
  v_id := (v_result ->> 'activity_id')::uuid;
  perform app.transition_activity_status(v_id, 'planned');
  perform app.transition_activity_status(v_id, 'published');
  return v_id;
end;
$$ language plpgsql;

insert into auth.users (id, email) values
  ('80000000-0000-0000-0000-000000000001', 'owner.p8a@example.test'),
  ('80000000-0000-0000-0000-000000000002', 'owner.p8b@example.test');

select test_set_auth_uid('80000000-0000-0000-0000-000000000001');
select * from app.provision_church(
  'Church A P8', 'church-a-p8', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'A8', 'owner.p8a@example.test', null, 'Sede A8', null, null, null, null,
  array['people', 'kids'], null
);

select test_set_auth_uid('80000000-0000-0000-0000-000000000002');
select * from app.provision_church(
  'Church B P8', 'church-b-p8', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'B8', 'owner.p8b@example.test', null, 'Sede B8', null, null, null, null,
  array['people', 'kids'], null
);

reset role;

-- ============================================================
-- Setup: personas, activity, sala, sesión en Church A
-- ============================================================
select test_set_auth_uid('80000000-0000-0000-0000-000000000001');

insert into people (id, first_name, last_name, source) values
  ('80000000-0000-0000-0000-00000000a001', 'Kid', 'Uno', 'manual'),
  ('80000000-0000-0000-0000-00000000a002', 'Guardian', 'Uno', 'manual'),
  ('80000000-0000-0000-0000-00000000a003', 'Staff', 'Uno', 'manual'),
  ('80000000-0000-0000-0000-00000000a004', 'Externo', 'NoAutorizado', 'manual');

insert into church_people (church_id, person_id, relationship, source) values
  ((select id from churches where slug = 'church-a-p8'), '80000000-0000-0000-0000-00000000a001', 'member', 'manual'),
  ((select id from churches where slug = 'church-a-p8'), '80000000-0000-0000-0000-00000000a002', 'member', 'manual'),
  ((select id from churches where slug = 'church-a-p8'), '80000000-0000-0000-0000-00000000a003', 'server', 'manual'),
  ((select id from churches where slug = 'church-a-p8'), '80000000-0000-0000-0000-00000000a004', 'member', 'manual');

select test_create_service_activity(
  (select id from churches where slug = 'church-a-p8'), 'Culto domingo'
) as activity_culto \gset

insert into kids_rooms (id, church_id, name, capacity, min_adults, ratio_children_per_adult)
values (
  '80000000-0000-0000-0000-0000000b0001',
  (select id from churches where slug = 'church-a-p8'),
  'Sala 2-3 años', 6, 1, 6
);

insert into kids_sessions (id, church_id, activity_id, room_id)
values (
  '80000000-0000-0000-0000-0000000c0001',
  (select id from churches where slug = 'church-a-p8'),
  :'activity_culto',
  '80000000-0000-0000-0000-0000000b0001'
);

-- ============================================================
-- 1. kids_profiles: crear
-- ============================================================
insert into kids_profiles (church_id, person_id)
values ((select id from churches where slug = 'church-a-p8'), '80000000-0000-0000-0000-00000000a001');

select ok(
  exists (select 1 from kids_profiles where person_id = '80000000-0000-0000-0000-00000000a001'),
  'Crear perfil Kids sobre una persona existente funciona'
);

-- ============================================================
-- 2. Guardians: crear, household solo NO autoriza pickup
-- ============================================================
insert into kid_guardians (church_id, kid_person_id, guardian_person_id, relationship_type, legal_guardian)
values (
  (select id from churches where slug = 'church-a-p8'),
  '80000000-0000-0000-0000-00000000a001', '80000000-0000-0000-0000-00000000a002',
  'madre', true
);

select ok(
  exists (select 1 from kid_guardians where kid_person_id = '80000000-0000-0000-0000-00000000a001' and guardian_person_id = '80000000-0000-0000-0000-00000000a002'),
  'Crear relación guardian funciona'
);

select is(
  (select count(*)::int from kid_pickup_authorizations where kid_person_id = '80000000-0000-0000-0000-00000000a001'),
  0,
  'Ser guardian NO crea automáticamente ninguna autorización de recogida (household != pickup authorization)'
);

update kid_guardians set active = false
  where kid_person_id = '80000000-0000-0000-0000-00000000a001' and guardian_person_id = '80000000-0000-0000-0000-00000000a002';
select ok(
  (select not active from kid_guardians where kid_person_id = '80000000-0000-0000-0000-00000000a001' and guardian_person_id = '80000000-0000-0000-0000-00000000a002'),
  'Revocar (desactivar) una relación guardian funciona'
);
update kid_guardians set active = true
  where kid_person_id = '80000000-0000-0000-0000-00000000a001' and guardian_person_id = '80000000-0000-0000-0000-00000000a002';

-- ============================================================
-- 3. Pickup authorizations: permanent, date_range, one_time, expired, revoked
-- ============================================================
insert into kid_pickup_authorizations (id, church_id, kid_person_id, authorized_person_id, authorized_name_snapshot, authorization_type)
values (
  '80000000-0000-0000-0000-0000000d0001',
  (select id from churches where slug = 'church-a-p8'),
  '80000000-0000-0000-0000-00000000a001', '80000000-0000-0000-0000-00000000a002',
  'Guardian Uno', 'permanent'
);
select ok(
  exists (select 1 from kid_pickup_authorizations where id = '80000000-0000-0000-0000-0000000d0001' and status = 'active'),
  'Autorización permanent creada activa'
);

insert into kid_pickup_authorizations (church_id, kid_person_id, authorized_name_snapshot, authorization_type, valid_until)
values (
  (select id from churches where slug = 'church-a-p8'),
  '80000000-0000-0000-0000-00000000a001', 'Tia Externa', 'date_range', now() + interval '7 days'
);
select ok(
  exists (select 1 from kid_pickup_authorizations where authorized_name_snapshot = 'Tia Externa' and authorization_type = 'date_range'),
  'Autorización date_range para persona externa (sin crear people) funciona'
);

insert into kid_pickup_authorizations (id, church_id, kid_person_id, authorized_name_snapshot, authorization_type, one_time)
values (
  '80000000-0000-0000-0000-0000000d0002',
  (select id from churches where slug = 'church-a-p8'),
  '80000000-0000-0000-0000-00000000a001', 'Recogida Puntual', 'one_time', true
);
select ok(
  (select one_time from kid_pickup_authorizations where id = '80000000-0000-0000-0000-0000000d0002'),
  'Autorización one_time creada correctamente'
);

select throws_ok(
  $$ insert into kid_pickup_authorizations (church_id, kid_person_id, authorized_name_snapshot, authorization_type)
     values ((select id from churches where slug = 'church-a-p8'), '80000000-0000-0000-0000-00000000a001', 'Sin fecha', 'date_range') $$,
  null, null,
  'date_range sin valid_until viola constraint'
);

update kid_pickup_authorizations set status = 'revoked', revoked_at = now(), revoked_by = '80000000-0000-0000-0000-000000000001'
  where authorized_name_snapshot = 'Tia Externa';
select is(
  (select status::text from kid_pickup_authorizations where authorized_name_snapshot = 'Tia Externa'),
  'revoked',
  'Revocar una autorización funciona'
);

-- ============================================================
-- 4. Rooms: capacity, age range, campus, cross-tenant
-- ============================================================
select ok(
  (select capacity = 6 and ratio_children_per_adult = 6 from kids_rooms where id = '80000000-0000-0000-0000-0000000b0001'),
  'Sala creada con capacidad y ratio configurados'
);

select throws_ok(
  $$ insert into kids_rooms (church_id, name, capacity, age_min_months, age_max_months)
     values ((select id from churches where slug = 'church-a-p8'), 'Sala inválida', 5, 36, 24) $$,
  null, null,
  'age_max_months < age_min_months viola constraint'
);

-- ============================================================
-- 5. Credenciales requeridas Kids y elegibilidad de staff
-- ============================================================
insert into credential_types (id, church_id, name, sensitive)
values ('80000000-0000-0000-0000-0000000e0001', (select id from churches where slug = 'church-a-p8'), 'Certificado delitos sexuales', true);

insert into kids_required_credentials (church_id, credential_type_id)
values ((select id from churches where slug = 'church-a-p8'), '80000000-0000-0000-0000-0000000e0001');

select is(
  (select eligible from app.kids_staff_eligibility(
    (select id from churches where slug = 'church-a-p8'), '80000000-0000-0000-0000-00000000a003'
  )),
  false,
  'Staff sin la credencial requerida NO es elegible'
);

insert into person_credentials (church_id, person_id, credential_type_id, status, expires_at)
values (
  (select id from churches where slug = 'church-a-p8'), '80000000-0000-0000-0000-00000000a003',
  '80000000-0000-0000-0000-0000000e0001', 'valid', now() + interval '1 year'
);

select is(
  (select eligible from app.kids_staff_eligibility(
    (select id from churches where slug = 'church-a-p8'), '80000000-0000-0000-0000-00000000a003'
  )),
  true,
  'Staff con credencial válida y vigente ES elegible'
);

update person_credentials set expires_at = now() - interval '1 day'
  where person_id = '80000000-0000-0000-0000-00000000a003' and credential_type_id = '80000000-0000-0000-0000-0000000e0001';
select ok(
  (select 'missing_credential' = any(reasons) from app.kids_staff_eligibility(
    (select id from churches where slug = 'church-a-p8'), '80000000-0000-0000-0000-00000000a003'
  )),
  'Credencial vencida produce razón missing_credential'
);
update person_credentials set expires_at = now() + interval '1 year'
  where person_id = '80000000-0000-0000-0000-00000000a003' and credential_type_id = '80000000-0000-0000-0000-0000000e0001';

-- ============================================================
-- 6. Ratio: safe, blocked por falta de staff
-- ============================================================
select is(
  (select state::text from app.kids_room_ratio_status('80000000-0000-0000-0000-0000000c0001')),
  'blocked',
  'Sin staff checked-in, la sesión está blocked (min_adults=1 incumplido)'
);

insert into kids_session_staff (church_id, session_id, person_id, role, checked_in_at)
values ((select id from churches where slug = 'church-a-p8'), '80000000-0000-0000-0000-0000000c0001', '80000000-0000-0000-0000-00000000a003', 'lead', now());

select is(
  (select state::text from app.kids_room_ratio_status('80000000-0000-0000-0000-0000000c0001')),
  'safe',
  'Con 1 staff (min_adults cumplido) y 0 niños, el estado es safe'
);

-- ============================================================
-- 7. Check-in: válido, duplicado bloqueado (idempotente), capacidad
-- ============================================================
select isa_ok(
  (select checkin_id from app.kids_checkin('80000000-0000-0000-0000-0000000c0001', '80000000-0000-0000-0000-00000000a001')),
  'uuid',
  'Check-in de un menor devuelve checkin_id'
);

select is(
  (select replayed from app.kids_checkin('80000000-0000-0000-0000-0000000c0001', '80000000-0000-0000-0000-00000000a001')),
  true,
  'Repetir check-in del mismo menor en la misma sesión es idempotente (replayed=true), sin duplicar'
);

select is(
  (select count(*)::int from kid_checkins where session_id = '80000000-0000-0000-0000-0000000c0001' and kid_person_id = '80000000-0000-0000-0000-00000000a001' and status = 'checked_in'),
  1,
  'Solo existe un check-in activo para ese menor en esa sesión'
);

select is(
  (select status::text from kids_sessions where id = '80000000-0000-0000-0000-0000000c0001'),
  'open',
  'La sesión pasa a open tras el primer check-in'
);

-- Capacidad: llenar la sala (capacity=6, ya hay 1 kid) con 5 más para llegar a 6, luego rechazar el 7º.
-- Los ids se generan explícitamente (no se releen con SELECT) porque bajo
-- RLS como `authenticated` una persona recién insertada sin church_people
-- todavía no sería visible para people_select (mismo patrón que Fase 2).
do $$
declare
  v_id uuid;
  v_church uuid := (select id from churches where slug = 'church-a-p8');
  v_n integer;
begin
  for v_n in 1..6 loop
    v_id := gen_random_uuid();
    insert into people (id, first_name, source) values (v_id, 'Kid Extra ' || v_n, 'manual');
    insert into church_people (church_id, person_id, relationship, source) values (v_church, v_id, 'member', 'manual');
    begin
      perform app.kids_checkin('80000000-0000-0000-0000-0000000c0001', v_id);
    exception when others then
      null; -- se espera que la última (capacity ya llena en 6) falle
    end;
  end loop;
end $$;

select is(
  (select count(*)::int from kid_checkins where session_id = '80000000-0000-0000-0000-0000000c0001' and status = 'checked_in'),
  6,
  'La capacidad de la sala (6) nunca se supera aunque se intenten más check-ins'
);

-- ============================================================
-- 8. Checkout: autorizado, no autorizado, one-time
-- ============================================================
select test_set_auth_uid('80000000-0000-0000-0000-000000000001');

-- Recuperar el código real requiere leerlo de la respuesta original; para
-- probar el flujo completo, hacemos checkin de un menor nuevo y usamos el
-- código devuelto en la misma consulta.
insert into people (id, first_name, last_name, source) values ('80000000-0000-0000-0000-00000000a005', 'Kid', 'Checkout', 'manual');
insert into church_people (church_id, person_id, relationship, source)
values ((select id from churches where slug = 'church-a-p8'), '80000000-0000-0000-0000-00000000a005', 'member', 'manual');

insert into kids_rooms (id, church_id, name, capacity, min_adults, ratio_children_per_adult)
values ('80000000-0000-0000-0000-0000000b0002', (select id from churches where slug = 'church-a-p8'), 'Sala checkout', 10, 1, 10);
insert into kids_sessions (id, church_id, activity_id, room_id)
values ('80000000-0000-0000-0000-0000000c0002', (select id from churches where slug = 'church-a-p8'), :'activity_culto', '80000000-0000-0000-0000-0000000b0002');
insert into kids_session_staff (church_id, session_id, person_id, role, checked_in_at)
values ((select id from churches where slug = 'church-a-p8'), '80000000-0000-0000-0000-0000000c0002', '80000000-0000-0000-0000-00000000a003', 'lead', now());

select pickup_code as checkout_code from app.kids_checkin('80000000-0000-0000-0000-0000000c0002', '80000000-0000-0000-0000-00000000a005') \gset

insert into kid_pickup_authorizations (id, church_id, kid_person_id, authorized_person_id, authorized_name_snapshot, authorization_type)
values ('80000000-0000-0000-0000-0000000d0003', (select id from churches where slug = 'church-a-p8'), '80000000-0000-0000-0000-00000000a005', '80000000-0000-0000-0000-00000000a002', 'Guardian Uno', 'permanent');

select is(
  (select authorized from app.kids_checkout(:'checkout_code', '80000000-0000-0000-0000-0000000c0002', 'Guardian Uno', '80000000-0000-0000-0000-0000000d0003')),
  true,
  'Checkout con autorización activa válida es aceptado'
);

select is(
  (select status::text from kid_checkins where kid_person_id = '80000000-0000-0000-0000-00000000a005'),
  'checked_out',
  'El check-in queda marcado como checked_out tras el checkout autorizado'
);

-- Segundo menor: checkout SIN autorización debe ser rechazado (hard-block).
insert into people (id, first_name, last_name, source) values ('80000000-0000-0000-0000-00000000a006', 'Kid', 'SinAuth', 'manual');
insert into church_people (church_id, person_id, relationship, source)
values ((select id from churches where slug = 'church-a-p8'), '80000000-0000-0000-0000-00000000a006', 'member', 'manual');
select pickup_code as sinauth_code from app.kids_checkin('80000000-0000-0000-0000-0000000c0002', '80000000-0000-0000-0000-00000000a006') \gset

select is(
  (select authorized from app.kids_checkout(:'sinauth_code', '80000000-0000-0000-0000-0000000c0002', 'Externo NoAutorizado')),
  false,
  'Checkout sin autorized_pickup_id es rechazado (hard-block, sin overrides)'
);

select is(
  (select status::text from kid_checkins where kid_person_id = '80000000-0000-0000-0000-00000000a006'),
  'checked_in',
  'El check-in NO cambia de estado tras un intento de recogida no autorizada'
);

-- Tercer menor: consumir autorización one_time.
insert into people (id, first_name, last_name, source) values ('80000000-0000-0000-0000-00000000a007', 'Kid', 'OneTime', 'manual');
insert into church_people (church_id, person_id, relationship, source)
values ((select id from churches where slug = 'church-a-p8'), '80000000-0000-0000-0000-00000000a007', 'member', 'manual');
insert into kid_pickup_authorizations (id, church_id, kid_person_id, authorized_name_snapshot, authorization_type, one_time)
values ('80000000-0000-0000-0000-0000000d0004', (select id from churches where slug = 'church-a-p8'), '80000000-0000-0000-0000-00000000a007', 'Recogida Unica', 'one_time', true);
select pickup_code as onetime_code from app.kids_checkin('80000000-0000-0000-0000-0000000c0002', '80000000-0000-0000-0000-00000000a007') \gset

select app.kids_checkout(:'onetime_code', '80000000-0000-0000-0000-0000000c0002', 'Recogida Unica', '80000000-0000-0000-0000-0000000d0004');

select is(
  (select status::text from kid_pickup_authorizations where id = '80000000-0000-0000-0000-0000000d0004'),
  'used',
  'Autorización one_time queda marcada como used tras consumirse en el checkout'
);

-- Cuarto menor: código ya usado (mismo checkin) no puede reutilizarse.
select throws_ok(
  format($$ select app.kids_checkout('%s', '80000000-0000-0000-0000-0000000c0002', 'Reintento') $$, :'onetime_code'),
  null, null,
  'Reutilizar un código ya usado (checkout repetido) falla'
);

reset role;

-- ============================================================
-- 9. Incidencias: crear, acceso restringido
-- ============================================================
select test_set_auth_uid('80000000-0000-0000-0000-000000000001');

insert into kids_incidents (church_id, kid_person_id, session_id, incident_type, severity, description)
values (
  (select id from churches where slug = 'church-a-p8'), '80000000-0000-0000-0000-00000000a001',
  '80000000-0000-0000-0000-0000000c0001', 'minor', 'low', 'Golpe leve jugando'
);
select ok(
  exists (select 1 from kids_incidents where kid_person_id = '80000000-0000-0000-0000-00000000a001'),
  'Crear incidencia Kids funciona'
);

reset role;

-- ============================================================
-- 10. Cross-tenant: kid/guardian/room/session/checkin/incident
-- ============================================================
select test_set_auth_uid('80000000-0000-0000-0000-000000000002');

select is(
  (select count(*)::int from kids_rooms where id = '80000000-0000-0000-0000-0000000b0001'),
  0,
  'Church B no ve la sala de Church A (RLS select)'
);

select is(
  (select count(*)::int from kids_incidents where kid_person_id = '80000000-0000-0000-0000-00000000a001'),
  0,
  'Church B no ve la incidencia de Church A'
);

select lives_ok(
  $$ insert into kids_rooms (church_id, name, capacity)
     values ((select id from churches where slug = 'church-b-p8'), 'Sala B', 5) $$,
  'Church B puede crear su propia sala sin fallar (control: RLS no bloquea operación propia)'
);

select throws_ok(
  format(
    $$ insert into kids_sessions (church_id, activity_id, room_id)
       values ((select id from churches where slug = 'church-b-p8'), '%s', '80000000-0000-0000-0000-0000000b0001') $$,
    :'activity_culto'
  ),
  null, null,
  'Crear sesión de Church B sobre activity de Church A falla por FK compuesta'
);

insert into people (id, first_name, source) values ('80000000-0000-0000-0000-00000000b001', 'Kid B', 'manual');
insert into church_people (church_id, person_id, relationship, source)
values ((select id from churches where slug = 'church-b-p8'), '80000000-0000-0000-0000-00000000b001', 'member', 'manual');

select throws_ok(
  $$ insert into kid_guardians (church_id, kid_person_id, guardian_person_id, relationship_type)
     values (
       (select id from churches where slug = 'church-b-p8'),
       '80000000-0000-0000-0000-00000000a001',
       '80000000-0000-0000-0000-00000000b001',
       'tutor'
     ) $$,
  null, null,
  'Guardian de Church B para kid de Church A falla por FK compuesta (guardian cross-tenant)'
);

select throws_ok(
  $$ select app.kids_checkin('80000000-0000-0000-0000-0000000c0001', '80000000-0000-0000-0000-00000000a001') $$,
  null, null,
  'Check-in desde Church B sobre sesión de Church A falla (no autorizado / no encontrado)'
);

reset role;

-- ============================================================
-- 11. Permisos: church admin vs usuario sin capability
-- ============================================================
select test_set_auth_uid('80000000-0000-0000-0000-000000000001');

select ok(
  (select app.has_capability((select id from churches where slug = 'church-a-p8'), 'kids.checkin')),
  'church_owner tiene kids.checkin (capability concedida por defecto)'
);

reset role;

-- ============================================================
-- 12. Cobertura RLS de las tablas nuevas
-- ============================================================
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where relname = 'kids_profiles'),
  'kids_profiles tiene RLS enable+force'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where relname = 'kid_guardians'),
  'kid_guardians tiene RLS enable+force'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where relname = 'kid_pickup_authorizations'),
  'kid_pickup_authorizations tiene RLS enable+force'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where relname = 'kid_checkins'),
  'kid_checkins tiene RLS enable+force'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where relname = 'kids_incidents'),
  'kids_incidents tiene RLS enable+force'
);

select * from finish();
rollback;
