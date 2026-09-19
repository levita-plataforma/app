-- Fase 8 · Tests de Kids: perfiles, notas sensibles, guardianes,
-- autorizaciones de recogida, salas, ratio, personal de sala,
-- check-in/check-out, recogida excepcional, incidencias, superficie sin sesión
-- y aislamiento entre iglesias.
--
-- Además del camino feliz, la suite cubre cada uno de los fallos que corrige
-- supabase/migrations/20260928001000_hotfix_kids_seguridad.sql. Cada aserción
-- está escrita para volver a fallar si ese arreglo se revierte.
--
-- Dos reglas de forma, aprendidas de la Fase 6:
--   · Nada de `\gset`. Es un metacomando de psql y el arnés del proyecto usa un
--     cliente node-postgres: una suite con `\gset` no llega a ejecutarse y, por
--     tanto, no prueba absolutamente nada. Los identificadores y los códigos de
--     recogida se guardan en una tabla temporal.
--   · Ningún `throws_ok(..., null, null, ...)`. Aceptar cualquier error hace que
--     la prueba pase también cuando la función no existe o cuando hay un error
--     de sintaxis. Aquí se compara el SQLSTATE exacto con test_err().

begin;
select plan(72);

-- ---------------------------------------------------------------------------
-- Utilidades de la suite
-- ---------------------------------------------------------------------------

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

-- `reset role` NO borra las claims del JWT, así que auth.uid() seguiría
-- devolviendo al último usuario autenticado. Para probar de verdad la
-- superficie sin sesión hay que limpiarlas y bajar al rol anon.
create or replace function test_set_anon() returns void as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end;
$$ language plpgsql;

create temporary table test_ids (name text primary key, id uuid, val text);
grant all on test_ids to public;

create or replace function test_remember(p_name text, p_id uuid) returns uuid as $$
begin
  insert into test_ids (name, id) values (p_name, p_id)
  on conflict (name) do update set id = excluded.id;
  return p_id;
end;
$$ language plpgsql;

create or replace function test_remember_val(p_name text, p_val text) returns text as $$
begin
  insert into test_ids (name, val) values (p_name, p_val)
  on conflict (name) do update set val = excluded.val;
  return p_val;
end;
$$ language plpgsql;

create or replace function test_id(p_name text) returns uuid as $$
  select id from test_ids where name = p_name;
$$ language sql stable;

create or replace function test_val(p_name text) returns text as $$
  select val from test_ids where name = p_name;
$$ language sql stable;

-- Devuelve el SQLSTATE de una sentencia, o null si no falla. Es la única forma
-- de distinguir «permiso denegado» de «cero filas»: una tabla que conservase el
-- SELECT no lanzaría nada, simplemente devolvería una lista vacía.
create or replace function test_err(p_sql text) returns text as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate;
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

-- Fixture: mete a una persona en el turno de una sesión escribiendo la fila
-- como propietario de la tabla, con la entrada marcada o sin marcar.
--
-- Esta NO es la vía de la aplicación: la vía es app.kids_add_session_staff +
-- app.kids_staff_check_in, y ambas se comprueban aparte en el bloque 6. Hace
-- falta un atajo porque hoy esas dos RPC abortan (ver el bloque 6), y sin un
-- adulto dentro de la sala no se puede ejercitar nada de lo que viene después:
-- ratio, check-in, recogida ni override.
create or replace function test_seed_staff(p_session_id uuid, p_person_id uuid, p_dentro boolean default true)
returns uuid as $$
declare
  v_id uuid;
  v_church uuid;
begin
  select church_id into v_church from kids_sessions where id = p_session_id;
  insert into kids_session_staff (church_id, session_id, person_id, role, checked_in_at)
  values (v_church, p_session_id, p_person_id, 'lead', case when p_dentro then now() end)
  returning id into v_id;
  return v_id;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- Setup: dos iglesias y varios perfiles de usuario, no solo quien lo puede todo
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('80000000-0000-0000-0000-000000000001', 'owner.p8a@example.test'),
  ('80000000-0000-0000-0000-000000000002', 'owner.p8b@example.test'),
  ('80000000-0000-0000-0000-000000000003', 'puerta.p8a@example.test'),
  ('80000000-0000-0000-0000-000000000004', 'lectura.p8a@example.test');

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

select test_remember('church_a', (select id from churches where slug = 'church-a-p8'));
select test_remember('church_b', (select id from churches where slug = 'church-b-p8'));

-- Dos perfiles acotados, porque probarlo todo como church_owner —que tiene las
-- doce capacidades de Kids— no ejercita ni una política en negativo:
--   · puerta: kids.checkin + kids.checkout, SIN kids.pickup.override y SIN
--     kids.sensitive.read. Es quien está en la mesa de entrada.
--   · lectura: solo kids.read. Ve el listado de menores y nada más.
insert into roles (key, name, is_system) values
  ('test_k8_puerta', 'Puerta Kids (test)', false),
  ('test_k8_lectura', 'Solo lectura Kids (test)', false);

insert into role_capabilities (role_key, capability_key) values
  ('test_k8_puerta', 'kids.checkin'),
  ('test_k8_puerta', 'kids.checkout'),
  ('test_k8_lectura', 'kids.read');

insert into people (id, user_id, first_name, last_name, source) values
  ('80000000-0000-0000-0000-0000000e0003', '80000000-0000-0000-0000-000000000003', 'Paula', 'Puerta', 'manual'),
  ('80000000-0000-0000-0000-0000000e0004', '80000000-0000-0000-0000-000000000004', 'Leo', 'Lectura', 'manual'),
  ('80000000-0000-0000-0000-00000000a001', null, 'Kid', 'Uno', 'manual'),
  ('80000000-0000-0000-0000-00000000a002', null, 'Guardian', 'Uno', 'manual'),
  ('80000000-0000-0000-0000-00000000a003', null, 'Staff', 'ConCredencial', 'manual'),
  ('80000000-0000-0000-0000-00000000a004', null, 'Staff', 'SinCredencial', 'manual'),
  ('80000000-0000-0000-0000-00000000a005', null, 'Kid', 'Ratio1', 'manual'),
  ('80000000-0000-0000-0000-00000000a006', null, 'Kid', 'Ratio2', 'manual'),
  ('80000000-0000-0000-0000-00000000a007', null, 'Kid', 'Ratio3', 'manual'),
  ('80000000-0000-0000-0000-00000000a008', null, 'Kid', 'Recogida', 'manual'),
  ('80000000-0000-0000-0000-00000000a009', null, 'Kid', 'Override', 'manual'),
  ('80000000-0000-0000-0000-00000000a010', null, 'Kid', 'Revocada', 'manual'),
  ('80000000-0000-0000-0000-00000000a011', null, 'Monitora', 'DeSala', 'manual');

insert into church_people (id, church_id, person_id, relationship, source) values
  ('80000000-0000-0000-0000-0000000f0003', test_id('church_a'), '80000000-0000-0000-0000-0000000e0003', 'server', 'manual'),
  ('80000000-0000-0000-0000-0000000f0004', test_id('church_a'), '80000000-0000-0000-0000-0000000e0004', 'member', 'manual'),
  ('80000000-0000-0000-0000-0000000f0a01', test_id('church_a'), '80000000-0000-0000-0000-00000000a001', 'member', 'manual'),
  ('80000000-0000-0000-0000-0000000f0a02', test_id('church_a'), '80000000-0000-0000-0000-00000000a002', 'member', 'manual'),
  ('80000000-0000-0000-0000-0000000f0a03', test_id('church_a'), '80000000-0000-0000-0000-00000000a003', 'server', 'manual'),
  ('80000000-0000-0000-0000-0000000f0a04', test_id('church_a'), '80000000-0000-0000-0000-00000000a004', 'server', 'manual'),
  ('80000000-0000-0000-0000-0000000f0a05', test_id('church_a'), '80000000-0000-0000-0000-00000000a005', 'member', 'manual'),
  ('80000000-0000-0000-0000-0000000f0a06', test_id('church_a'), '80000000-0000-0000-0000-00000000a006', 'member', 'manual'),
  ('80000000-0000-0000-0000-0000000f0a07', test_id('church_a'), '80000000-0000-0000-0000-00000000a007', 'member', 'manual'),
  ('80000000-0000-0000-0000-0000000f0a08', test_id('church_a'), '80000000-0000-0000-0000-00000000a008', 'member', 'manual'),
  ('80000000-0000-0000-0000-0000000f0a09', test_id('church_a'), '80000000-0000-0000-0000-00000000a009', 'member', 'manual'),
  ('80000000-0000-0000-0000-0000000f0a10', test_id('church_a'), '80000000-0000-0000-0000-00000000a010', 'member', 'manual'),
  ('80000000-0000-0000-0000-0000000f0a11', test_id('church_a'), '80000000-0000-0000-0000-00000000a011', 'server', 'manual');

insert into church_people_roles (church_id, church_people_id, role_key, scope_type, scope_id) values
  (test_id('church_a'), '80000000-0000-0000-0000-0000000f0003', 'test_k8_puerta', 'church', null),
  (test_id('church_a'), '80000000-0000-0000-0000-0000000f0004', 'test_k8_lectura', 'church', null);

-- Persona de la iglesia B, para el aislamiento.
insert into people (id, first_name, last_name, source) values
  ('80000000-0000-0000-0000-00000000b001', 'Kid', 'DeB', 'manual');
insert into church_people (church_id, person_id, relationship, source) values
  (test_id('church_b'), '80000000-0000-0000-0000-00000000b001', 'member', 'manual');

-- Activity, salas y sesiones de la iglesia A.
select test_set_auth_uid('80000000-0000-0000-0000-000000000001');
select test_remember('activity_culto', test_create_service_activity(test_id('church_a'), 'Culto domingo'));

insert into kids_rooms (id, church_id, name, capacity, min_adults, ratio_children_per_adult) values
  -- Sala de ratio estrecho: un adulto como mínimo y dos niños por adulto.
  ('80000000-0000-0000-0000-0000000b0001', test_id('church_a'), 'Sala 2-3 años', 10, 1, 2),
  -- Sala holgada, para el recorrido de recogida y el override.
  ('80000000-0000-0000-0000-0000000b0002', test_id('church_a'), 'Sala recogida', 10, 1, 10),
  -- Sala que se queda vacía, control de la salida de personal.
  ('80000000-0000-0000-0000-0000000b0003', test_id('church_a'), 'Sala vacía', 10, 1, 10),
  -- Sala sin sesión, reservada para probar la clave foránea compuesta sin que
  -- salte antes el unique (activity_id, room_id).
  ('80000000-0000-0000-0000-0000000b0004', test_id('church_a'), 'Sala sin sesión', 10, 1, 10);

insert into kids_sessions (id, church_id, activity_id, room_id) values
  ('80000000-0000-0000-0000-0000000c0001', test_id('church_a'), test_id('activity_culto'), '80000000-0000-0000-0000-0000000b0001'),
  ('80000000-0000-0000-0000-0000000c0002', test_id('church_a'), test_id('activity_culto'), '80000000-0000-0000-0000-0000000b0002'),
  ('80000000-0000-0000-0000-0000000c0003', test_id('church_a'), test_id('activity_culto'), '80000000-0000-0000-0000-0000000b0003');

insert into kids_profiles (church_id, person_id, medical_alert_flag) values
  (test_id('church_a'), '80000000-0000-0000-0000-00000000a001', true);

reset role;

-- ===========================================================================
-- 1. Las notas médicas y de emergencia salen de kids_profiles
-- ===========================================================================

select is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public' and table_name = 'kids_profiles'
     and column_name in ('accessibility_notes', 'emergency_notes')),
  0,
  'kids_profiles ya no guarda accessibility_notes ni emergency_notes: la RLS filtra filas y no columnas, así que con ambas ahí cualquiera con kids.read leía la alergia de un menor'
);

select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class
   where oid = 'public.kids_sensitive_notes'::regclass),
  'kids_sensitive_notes nace con RLS activada y forzada: es la tabla donde quedan alergias y medicación'
);

-- ===========================================================================
-- 2. La lista de tipos de aviso deja de pisarse entre fases
-- ===========================================================================
--
-- Kids y la Fase 7 reescribían la constraint entera con la lista escrita a
-- mano. La última en aplicarse dejaba rota a la anterior, y en Kids eso no era
-- un aviso perdido: el trigger corre en la misma transacción que el check-in,
-- así que reventaba el check-in de los menores que sí tienen familia dada de alta.

select ok(
  (select bool_and(pg_get_constraintdef(c.oid) like '%''' || t || '''%')
   from pg_constraint c,
        unnest(array['kid.checked_in', 'kid.checked_out', 'assignment.proposed', 'event.published']) as t
   where c.conname = 'notification_events_event_type_check'),
  'El check de notification_events.event_type conserva a la vez los tipos de Kids y los de las fases anteriores'
);

-- ===========================================================================
-- 3. Notas sensibles: kids.read no basta
-- ===========================================================================

select test_set_auth_uid('80000000-0000-0000-0000-000000000001');

select is(
  test_err(format(
    $$ select app.kids_save_sensitive_notes(%L, %L, 'Necesita silla adaptada', 'Alergia grave a los frutos secos') $$,
    test_id('church_a'), '80000000-0000-0000-0000-00000000a001')),
  null,
  'Quien tiene kids.manage y kids.sensitive.read puede guardar las notas sensibles de un menor'
);

select is(
  (select count(*)::int from kids_sensitive_notes
   where kid_person_id = '80000000-0000-0000-0000-00000000a001'),
  1,
  'Con kids.sensitive.read la nota sensible del menor es visible'
);

reset role;
select test_set_auth_uid('80000000-0000-0000-0000-000000000004');

select is(
  (select count(*)::int from kids_sensitive_notes
   where kid_person_id = '80000000-0000-0000-0000-00000000a001'),
  0,
  'Con kids.read pero sin kids.sensitive.read, kids_sensitive_notes devuelve cero filas: la alergia del menor no se lee'
);

select is(
  (select count(*)::int from kids_profiles
   where person_id = '80000000-0000-0000-0000-00000000a001'),
  1,
  'Control: quien solo tiene kids.read sí ve la ficha del menor, así que lo anterior no es que no vea nada'
);

select is(
  test_err(format(
    $$ select app.kids_save_sensitive_notes(%L, %L, 'x', 'y') $$,
    test_id('church_a'), '80000000-0000-0000-0000-00000000a001')),
  '42501',
  'Sin kids.sensitive.read tampoco se pueden escribir las notas sensibles'
);

reset role;

-- ===========================================================================
-- 4. Responsables y autorizaciones de recogida
-- ===========================================================================

select test_set_auth_uid('80000000-0000-0000-0000-000000000001');

insert into kid_guardians (church_id, kid_person_id, guardian_person_id, relationship_type, legal_guardian, can_view)
values (test_id('church_a'), '80000000-0000-0000-0000-00000000a001',
        '80000000-0000-0000-0000-00000000a002', 'madre', true, true);

select is(
  (select count(*)::int from kid_pickup_authorizations
   where kid_person_id = '80000000-0000-0000-0000-00000000a001'),
  0,
  'Ser responsable de un menor no crea por sí solo ninguna autorización de recogida: la relación familiar no es una autorización'
);

select is(
  test_err(format(
    $$ insert into kid_pickup_authorizations (church_id, kid_person_id, authorized_name_snapshot, authorization_type)
       values (%L, %L, 'Sin fecha', 'date_range') $$,
    test_id('church_a'), '80000000-0000-0000-0000-00000000a001')),
  '23514',
  'Una autorización date_range sin valid_until viola su check: una autorización sin caducidad no se cuela como temporal'
);

insert into kid_pickup_authorizations (id, church_id, kid_person_id, authorized_person_id, authorized_name_snapshot, authorization_type)
values ('80000000-0000-0000-0000-0000000d0001', test_id('church_a'),
        '80000000-0000-0000-0000-00000000a008', '80000000-0000-0000-0000-00000000a002', 'Guardian Uno', 'permanent');

insert into kid_pickup_authorizations (id, church_id, kid_person_id, authorized_name_snapshot, authorization_type, status, revoked_at, revoked_by)
values ('80000000-0000-0000-0000-0000000d0002', test_id('church_a'),
        '80000000-0000-0000-0000-00000000a010', 'Tía Revocada', 'permanent', 'revoked', now(),
        '80000000-0000-0000-0000-000000000001');

select is(
  (select status::text from kid_pickup_authorizations where id = '80000000-0000-0000-0000-0000000d0002'),
  'revoked',
  'Una autorización revocada queda registrada como tal, con su fecha de revocación'
);

select is(
  test_err(format(
    $$ insert into kids_rooms (church_id, name, capacity, age_min_months, age_max_months)
       values (%L, 'Sala imposible', 5, 36, 24) $$, test_id('church_a'))),
  '23514',
  'Una sala con age_max_months menor que age_min_months viola su check'
);

reset role;

-- ===========================================================================
-- 5. Las funciones de elegibilidad y de ratio dejan de ser oráculos
-- ===========================================================================
--
-- Eran security definer y no comprobaban nada: desde otra iglesia se sabía si
-- una persona pertenece a ella, si tiene en regla su certificado de antecedentes
-- y cuántos menores hay dentro de cada sala.

select test_set_auth_uid('80000000-0000-0000-0000-000000000002');

select is(
  test_err(format(
    $$ select * from app.kids_staff_eligibility(%L, %L) $$,
    test_id('church_a'), '80000000-0000-0000-0000-00000000a003')),
  '42501',
  'Desde la iglesia B, preguntar por la elegibilidad de una persona de la iglesia A está denegado: ya no revela pertenencia ni estado del certificado de antecedentes'
);

select is(
  test_err($$ select * from app.kids_room_ratio_status('80000000-0000-0000-0000-0000000c0001') $$),
  '42501',
  'Desde la iglesia B, preguntar por el ratio de una sala de la iglesia A está denegado: ya no revela su ocupación'
);

select is(
  test_err($$ select * from public.kids_room_ratio_status('80000000-0000-0000-0000-0000000c0001') $$),
  '42501',
  'El envoltorio público tampoco sirve de rodeo para leer la ocupación de una sala ajena'
);

reset role;

-- ===========================================================================
-- 6. El alta de personal exige la credencial en la base, no en el cliente
-- ===========================================================================
--
-- AVISO: tres de las cuatro aserciones de este bloque fallan hoy, y el fallo es
-- del código, no de la prueba. app.kids_staff_eligibility, tal y como la
-- reescribe el hotfix, consulta person_credentials.expires_on, columna que no
-- existe: se llama expires_at (ver 20260919000300_qualifications_credentials.sql).
-- El SELECT se prepara al primer uso, así que la función devuelve 42703
-- («column pc.expires_on does not exist») siempre, haya o no credenciales
-- requeridas. Arrastra con ella a app.kids_add_session_staff y a
-- app.kids_staff_check_in, que son sus dos únicos llamantes, de modo que hoy no
-- se puede dar de alta ni hacer entrar a nadie en una sala por la vía prevista.
-- Las aserciones se dejan como deben quedar cuando se corrija la columna; no se
-- ajustan al comportamiento roto.

select test_set_auth_uid('80000000-0000-0000-0000-000000000001');

insert into credential_types (id, church_id, name, sensitive)
values ('80000000-0000-0000-0000-0000000e0001', test_id('church_a'), 'Certificado de delitos sexuales', true);

insert into kids_required_credentials (church_id, credential_type_id)
values (test_id('church_a'), '80000000-0000-0000-0000-0000000e0001');

insert into person_credentials (church_id, person_id, credential_type_id, status, expires_at)
values (test_id('church_a'), '80000000-0000-0000-0000-00000000a003',
        '80000000-0000-0000-0000-0000000e0001', 'valid', now() + interval '1 year');

select is(
  test_err($$ select app.kids_add_session_staff('80000000-0000-0000-0000-0000000c0003', '80000000-0000-0000-0000-00000000a004') $$),
  '22023',
  'Meter en la sala a alguien sin la credencial obligatoria incumple una regla de negocio: antes bastaba con enviar eligible_at_assignment=true desde el cliente'
);

select is(
  test_err(format(
    $$ insert into kids_session_staff (church_id, session_id, person_id, role, eligible_at_assignment)
       values (%L, '80000000-0000-0000-0000-0000000c0003', '80000000-0000-0000-0000-00000000a004', 'lead', true) $$,
    test_id('church_a'))),
  '42501',
  'Un insert directo en kids_session_staff está denegado: el alta solo pasa por la RPC, que es quien comprueba la credencial'
);

select is(
  test_err($$ select app.kids_add_session_staff('80000000-0000-0000-0000-0000000c0003', '80000000-0000-0000-0000-00000000a003') $$),
  null,
  'Con la credencial obligatoria en regla, el alta de personal en la sesión funciona'
);

reset role;
select test_remember('staff_por_rpc', test_seed_staff('80000000-0000-0000-0000-0000000c0002', '80000000-0000-0000-0000-00000000a003', false));
select test_set_auth_uid('80000000-0000-0000-0000-000000000001');

select is(
  test_err(format($$ select app.kids_staff_check_in(%L) $$, test_id('staff_por_rpc'))),
  null,
  'Marcar la entrada del personal funciona: sin esta RPC, cerrar la escritura directa de kids_session_staff dejaría a toda sala con min_adults>0 sin poder admitir a un solo menor'
);

reset role;

-- ===========================================================================
-- 7. El ratio bloquea de verdad
-- ===========================================================================

select test_set_auth_uid('80000000-0000-0000-0000-000000000001');

select is(
  (select state::text from app.kids_room_ratio_status('80000000-0000-0000-0000-0000000c0001')),
  'blocked',
  'Una sala con min_adults=1 y sin ningún adulto con la entrada marcada está en estado blocked'
);

select is(
  test_err($$ select * from app.kids_checkin('80000000-0000-0000-0000-0000000c0001', '80000000-0000-0000-0000-00000000a005') $$),
  '22023',
  'Sin adultos dentro, el check-in se rechaza: antes la interfaz avisaba «no aceptes más check-in» y nada lo impedía'
);

reset role;
select test_remember('staff_ratio', test_seed_staff('80000000-0000-0000-0000-0000000c0001', '80000000-0000-0000-0000-00000000a011'));
select test_set_auth_uid('80000000-0000-0000-0000-000000000001');

select isa_ok(
  (select checkin_id from app.kids_checkin('80000000-0000-0000-0000-0000000c0001', '80000000-0000-0000-0000-00000000a005')),
  'uuid',
  'Con un adulto dentro, el check-in del primer menor funciona'
);

select is(
  (select replayed from app.kids_checkin('80000000-0000-0000-0000-0000000c0001', '80000000-0000-0000-0000-00000000a005')),
  true,
  'Repetir el check-in del mismo menor en la misma sesión es idempotente y no duplica la fila'
);

select isa_ok(
  (select checkin_id from app.kids_checkin('80000000-0000-0000-0000-0000000c0001', '80000000-0000-0000-0000-00000000a006')),
  'uuid',
  'El segundo menor entra: con un adulto y dos niños por adulto todavía cabe'
);

select is(
  test_err($$ select * from app.kids_checkin('80000000-0000-0000-0000-0000000c0001', '80000000-0000-0000-0000-00000000a007') $$),
  '22023',
  'El tercer menor no entra: superaría el ratio de dos niños por adulto con un solo adulto dentro'
);

select is(
  (select state::text from app.kids_room_ratio_status('80000000-0000-0000-0000-0000000c0001')),
  'warning',
  'Con la sala justo en el límite del ratio, el estado deja de ser safe'
);

-- ===========================================================================
-- 8. No se puede dejar la sala sin adultos
-- ===========================================================================

select is(
  test_err(format($$ select app.kids_staff_check_out(%L) $$, test_id('staff_ratio'))),
  '22023',
  'El último adulto no puede marcar su salida con dos menores todavía dentro: es la otra mitad de la regla del ratio'
);

reset role;
select test_remember('staff_vacia', test_seed_staff('80000000-0000-0000-0000-0000000c0003', '80000000-0000-0000-0000-00000000a011'));
select test_set_auth_uid('80000000-0000-0000-0000-000000000001');

select is(
  test_err(format($$ select app.kids_staff_check_out(%L) $$, test_id('staff_vacia'))),
  null,
  'Control: en una sala sin menores dentro, el adulto sí puede marcar su salida'
);

reset role;

-- ===========================================================================
-- 9. El recorrido completo de recogida
-- ===========================================================================

select test_remember('staff_recogida', test_seed_staff('80000000-0000-0000-0000-0000000c0002', '80000000-0000-0000-0000-00000000a011'));

select test_set_auth_uid('80000000-0000-0000-0000-000000000001');

select test_remember_val('codigo_recogida',
  (select pickup_code from app.kids_checkin('80000000-0000-0000-0000-0000000c0002', '80000000-0000-0000-0000-00000000a008')));

select is(
  length(test_val('codigo_recogida')),
  8,
  'El check-in devuelve un código de recogida de ocho caracteres, que es lo que se teclea en la puerta'
);

select is(
  (select kid_person_id from app.kids_lookup_pickup('80000000-0000-0000-0000-0000000c0002', test_val('codigo_recogida'))),
  '80000000-0000-0000-0000-00000000a008'::uuid,
  'app.kids_lookup_pickup localiza al menor a partir del código: la huella ya no es legible, así que la pantalla de recogida depende de esta función'
);

select is(
  test_err($$ select * from app.kids_lookup_pickup('80000000-0000-0000-0000-0000000c0002', 'ZZZZZZZZ') $$),
  'P0002',
  'Un código equivocado no encuentra nada, así que la función no sirve de oráculo de códigos'
);

select is(
  test_err($$ select pickup_token_hash from kid_checkins limit 1 $$),
  '42501',
  'Leer pickup_token_hash como authenticated está denegado: con la huella a la vista se recuperó un código real invirtiéndola en menos de un segundo'
);

select is(
  test_err($$ select id, session_id, kid_person_id, status, checked_in_at from kid_checkins limit 1 $$),
  null,
  'Control: el resto de columnas de kid_checkins sí se leen, así que lo anterior no es que la tabla entera esté cerrada'
);

select is(
  (select authorized from app.kids_checkout(
     test_val('codigo_recogida'), '80000000-0000-0000-0000-0000000c0002',
     'Guardian Uno', '80000000-0000-0000-0000-0000000d0001')),
  true,
  'La recogida con una autorización activa y en vigor se acepta'
);

select is(
  (select status::text from kid_checkins where kid_person_id = '80000000-0000-0000-0000-00000000a008'),
  'checked_out',
  'Tras la recogida autorizada el check-in queda en checked_out'
);

select is(
  (select pickup_person_snapshot from kid_checkins where kid_person_id = '80000000-0000-0000-0000-00000000a008'),
  'Guardian Uno',
  'La recogida deja constancia del nombre de quien se llevó al menor'
);

select is(
  test_err(format(
    $$ select * from app.kids_checkout(%L, '80000000-0000-0000-0000-0000000c0002', 'Reintento', '80000000-0000-0000-0000-0000000d0001') $$,
    test_val('codigo_recogida'))),
  'P0002',
  'Un código ya usado no vuelve a valer: no se puede entregar dos veces al mismo menor'
);

reset role;

-- ===========================================================================
-- 10. No se saca a un menor escribiendo en la tabla
-- ===========================================================================

select test_set_auth_uid('80000000-0000-0000-0000-000000000003');

select is(
  test_err($$ update kid_checkins set status = 'checked_out', checked_out_at = now()
              where kid_person_id = '80000000-0000-0000-0000-00000000a005' $$),
  '42501',
  'Con kids.checkout, un update directo sobre kid_checkins está denegado: antes bastaba un PATCH para dejar a un menor como entregado sin rastro de a quién'
);

select is(
  (select status::text from kid_checkins where kid_person_id = '80000000-0000-0000-0000-00000000a005'),
  'checked_in',
  'El menor sigue dentro tras el intento de sacarlo escribiendo en la tabla'
);

select is(
  test_err(format(
    $$ insert into kid_checkins (church_id, session_id, kid_person_id, room_id, pickup_token_hash)
       values (%L, '80000000-0000-0000-0000-0000000c0002', '80000000-0000-0000-0000-00000000a009',
               '80000000-0000-0000-0000-0000000b0002', 'huella-inventada') $$,
    test_id('church_a'))),
  '42501',
  'Tampoco se da de alta un check-in a mano: el código de recogida solo lo genera app.kids_checkin'
);

-- ===========================================================================
-- 11. La recogida excepcional (override)
-- ===========================================================================

select test_remember_val('codigo_override',
  (select pickup_code from app.kids_checkin('80000000-0000-0000-0000-0000000c0002', '80000000-0000-0000-0000-00000000a009')));

select is(
  test_err(format(
    $$ select * from app.kids_checkout(%L, '80000000-0000-0000-0000-0000000c0002', 'Vecina sin autorizar', null, 'La madre no puede venir') $$,
    test_val('codigo_override'))),
  '42501',
  'Quien atiende la puerta sin kids.pickup.override no puede entregar a un menor alegando un motivo'
);

select is(
  (select status::text from kid_checkins where kid_person_id = '80000000-0000-0000-0000-00000000a009'),
  'checked_in',
  'El menor sigue dentro tras el intento de recogida excepcional sin la capacidad para ello'
);

reset role;
select test_set_auth_uid('80000000-0000-0000-0000-000000000001');

select is(
  (select authorized from app.kids_checkout(
     test_val('codigo_override'), '80000000-0000-0000-0000-0000000c0002',
     'Vecina sin autorizar', null, 'La madre está en urgencias')),
  true,
  'Con kids.pickup.override y un motivo registrado, la recogida excepcional se acepta'
);

select is(
  (select count(*)::int from kid_pickup_overrides o
   join kid_checkins c on c.id = o.checkin_id
   where c.kid_person_id = '80000000-0000-0000-0000-00000000a009'),
  1,
  'El override deja su fila en kid_pickup_overrides: nunca es silencioso'
);

select is(
  (select o.reason from kid_pickup_overrides o
   join kid_checkins c on c.id = o.checkin_id
   where c.kid_person_id = '80000000-0000-0000-0000-00000000a009'),
  'La madre está en urgencias',
  'El motivo del override queda guardado tal cual se introdujo'
);

-- Caso límite que abortaba la recogida: se pasaba una autorización revocada, el
-- override salvaba la operación y al final se intentaba marcarla como usada,
-- violando su propio check ((status='revoked') = (revoked_at is not null)).
select test_remember_val('codigo_revocada',
  (select pickup_code from app.kids_checkin('80000000-0000-0000-0000-0000000c0002', '80000000-0000-0000-0000-00000000a010')));

select is(
  test_err(format(
    $$ select * from app.kids_checkout(%L, '80000000-0000-0000-0000-0000000c0002', 'Vecino de siempre',
         '80000000-0000-0000-0000-0000000d0002', 'La autorización estaba revocada y la familia no llega') $$,
    test_val('codigo_revocada'))),
  null,
  'Pasar una autorización revocada junto a un override no rompe la recogida: antes se intentaba consumir esa autorización y el check de la tabla abortaba la operación'
);

select is(
  (select status::text from kid_checkins where kid_person_id = '80000000-0000-0000-0000-00000000a010'),
  'checked_out',
  'La recogida por override con una autorización revocada de por medio llega a completarse'
);

select is(
  (select status::text from kid_pickup_authorizations where id = '80000000-0000-0000-0000-0000000d0002'),
  'revoked',
  'La autorización revocada sigue revocada: el override no la consume ni la resucita'
);

select ok(
  (select authorized_pickup_id is null from kid_checkins where kid_person_id = '80000000-0000-0000-0000-00000000a010'),
  'El check-in entregado por override no queda apuntado a una autorización que no autorizó nada'
);

-- ===========================================================================
-- 12. El aviso de check-in no aborta el check-in
-- ===========================================================================
--
-- El menor a001 tiene una familia dada de alta con can_view, así que el trigger
-- de aviso sí emite. Mientras la lista de tipos se pisaba entre fases, esto
-- reventaba la transacción entera justo para esos menores.

select is(
  test_err($$ select * from app.kids_checkin('80000000-0000-0000-0000-0000000c0002', '80000000-0000-0000-0000-00000000a001') $$),
  null,
  'El check-in de un menor con familia dada de alta funciona: la emisión del aviso corre en la misma transacción y no debe abortarlo'
);

reset role;

select is(
  (select count(*)::int from notification_events
   where event_type = 'kid.checked_in'
     and recipient_person_ids @> array['80000000-0000-0000-0000-00000000a002'::uuid]),
  1,
  'El aviso kid.checked_in llega al responsable del menor, con un tipo que la constraint acepta'
);

-- ===========================================================================
-- 13. Las incidencias no se borran
-- ===========================================================================

select test_set_auth_uid('80000000-0000-0000-0000-000000000001');

insert into kids_incidents (id, church_id, kid_person_id, session_id, incident_type, severity, description)
values ('80000000-0000-0000-0000-0000000a0001', test_id('church_a'), '80000000-0000-0000-0000-00000000a001',
        '80000000-0000-0000-0000-0000000c0001', 'minor', 'low', 'Golpe leve jugando');

select ok(
  exists (select 1 from kids_incidents where id = '80000000-0000-0000-0000-0000000a0001'),
  'Registrar una incidencia funciona'
);

select is(
  test_err($$ delete from kids_incidents where id = '80000000-0000-0000-0000-0000000a0001' $$),
  '42501',
  'Borrar una incidencia está denegado: el historial de lo que le pasó a un menor no puede depender de que a alguien le incomode'
);

select is(
  test_err($$ update kids_incidents set status = 'resolved', resolved_at = now()
              where id = '80000000-0000-0000-0000-0000000a0001' $$),
  null,
  'Control: una incidencia sí se cierra cambiando su estado, que es la vía prevista'
);

reset role;
select test_set_auth_uid('80000000-0000-0000-0000-000000000004');

select is(
  (select count(*)::int from kids_incidents where id = '80000000-0000-0000-0000-0000000a0001'),
  0,
  'Con kids.read pero sin kids.incident.read no se ve ninguna incidencia: su contenido nunca aparece en pantallas generales'
);

reset role;

-- ===========================================================================
-- 14. Sin sesión no se ve nada
-- ===========================================================================
--
-- Importa distinguir «permiso denegado» de «cero filas»: si una tabla conservase
-- el SELECT, PostgREST respondería 200 con una lista vacía y solo la RLS estaría
-- frenando a anon. Se quieren las dos capas.

select test_set_anon();

select is(
  (select string_agg(t, ', ' order by t)
   from unnest(array[
     'kids_profiles', 'kid_guardians', 'kid_pickup_authorizations',
     'kids_rooms', 'kids_sessions', 'kids_session_staff',
     'kid_checkins', 'kids_incidents', 'kid_pickup_overrides',
     'kids_required_credentials', 'kids_sensitive_notes'
   ]) as t
   where coalesce(test_err(format('select 1 from public.%I limit 1', t)), 'sin error') <> '42501'),
  null,
  'Sin sesión, las once tablas de Kids dan permiso denegado y no cero filas: anon ya no conserva los privilegios por defecto de PostgreSQL'
);

select is(
  (select string_agg(s, ' | ' order by s)
   from unnest(array[
     $$ select * from public.kids_checkin('80000000-0000-0000-0000-0000000c0002', '80000000-0000-0000-0000-00000000a001') $$,
     $$ select * from public.kids_checkout('AAAAAAAA', '80000000-0000-0000-0000-0000000c0002', 'X') $$,
     $$ select * from public.kids_lookup_pickup('80000000-0000-0000-0000-0000000c0002', 'AAAAAAAA') $$,
     $$ select * from public.kids_staff_eligibility('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000') $$,
     $$ select * from public.kids_room_ratio_status('80000000-0000-0000-0000-0000000c0002') $$,
     $$ select public.kids_add_session_staff('80000000-0000-0000-0000-0000000c0002', '80000000-0000-0000-0000-00000000a003') $$,
     $$ select public.kids_save_sensitive_notes('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'a', 'b') $$
   ]) as s
   where coalesce(test_err(s), 'sin error') <> '42501'),
  null,
  'Sin sesión no se puede ejecutar ninguna RPC pública de Kids: la fase no tiene superficie pública'
);

reset role;

-- ===========================================================================
-- 15. Aislamiento entre iglesias
-- ===========================================================================

select test_set_auth_uid('80000000-0000-0000-0000-000000000002');

select is(
  (select (select count(*) from kids_rooms where church_id = test_id('church_a'))
        + (select count(*) from kids_sessions where church_id = test_id('church_a'))
        + (select count(*) from kids_profiles where church_id = test_id('church_a'))
        + (select count(*) from kids_incidents where church_id = test_id('church_a'))
        + (select count(*) from kid_pickup_authorizations where church_id = test_id('church_a'))
        + (select count(*) from kid_guardians where church_id = test_id('church_a')))::int,
  0,
  'La iglesia B no ve ni una fila de Kids de la iglesia A en ninguna de sus tablas principales'
);

select is(
  (select count(*)::int from kid_checkins where church_id = test_id('church_a')),
  0,
  'La iglesia B no ve los check-ins de la iglesia A: quién está dentro de qué sala es dato de la iglesia que la organiza'
);

select lives_ok(
  format($$ insert into kids_rooms (church_id, name, capacity) values (%L, 'Sala B', 5) $$, test_id('church_b')),
  'Control: la iglesia B sí puede crear su propia sala, así que lo anterior no es que la RLS lo bloquee todo'
);

select is(
  test_err(format(
    $$ insert into kid_guardians (church_id, kid_person_id, guardian_person_id, relationship_type)
       values (%L, '80000000-0000-0000-0000-00000000a001', '80000000-0000-0000-0000-00000000b001', 'tutor') $$,
    test_id('church_b'))),
  '23503',
  'Un responsable de la iglesia B para un menor de la iglesia A falla por la clave foránea compuesta, no solo por la RLS'
);

select is(
  test_err($$ select * from app.kids_checkin('80000000-0000-0000-0000-0000000c0001', '80000000-0000-0000-0000-00000000a001') $$),
  '42501',
  'Un check-in desde la iglesia B sobre una sesión de la iglesia A está denegado'
);

select is(
  test_err($$ select * from app.kids_lookup_pickup('80000000-0000-0000-0000-0000000c0002', 'AAAAAAAA') $$),
  '42501',
  'Buscar por código en una sesión de la iglesia A desde la iglesia B está denegado antes de mirar ningún código'
);

reset role;

-- La clave foránea compuesta, comprobada sin la RLS de por medio (como
-- propietario de la tabla) para que sea ella y no la política quien rechace.
select is(
  test_err(format(
    $$ insert into kids_sessions (church_id, activity_id, room_id)
       values (%L, %L, '80000000-0000-0000-0000-0000000b0004') $$,
    test_id('church_b'), test_id('activity_culto'))),
  '23503',
  'Una sesión de la iglesia B sobre la activity y la sala de la iglesia A falla por la clave foránea compuesta'
);

select is(
  test_err(format(
    $$ insert into kids_profiles (church_id, person_id) values (%L, '80000000-0000-0000-0000-00000000a001') $$,
    test_id('church_b'))),
  '23503',
  'Una ficha Kids de la iglesia B sobre un menor de la iglesia A falla por la clave foránea compuesta contra church_people'
);

-- ===========================================================================
-- 16. Cobertura de RLS y privilegios de las tablas de Kids
-- ===========================================================================

select is(
  (select string_agg(c.relname, ', ' order by c.relname)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in (
       'kids_profiles', 'kid_guardians', 'kid_pickup_authorizations',
       'kids_rooms', 'kids_sessions', 'kids_session_staff',
       'kid_checkins', 'kids_incidents', 'kid_pickup_overrides',
       'kids_required_credentials', 'kids_sensitive_notes')
     and not (c.relrowsecurity and c.relforcerowsecurity)),
  null,
  'Las once tablas de Kids tienen la RLS activada y forzada, también para el propietario'
);

select is(
  (select string_agg(table_name || '.' || privilege_type, ', ' order by table_name || '.' || privilege_type)
   from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon'
     and table_name in (
       'kids_profiles', 'kid_guardians', 'kid_pickup_authorizations',
       'kids_rooms', 'kids_sessions', 'kids_session_staff',
       'kid_checkins', 'kids_incidents', 'kid_pickup_overrides',
       'kids_required_credentials', 'kids_sensitive_notes')),
  null,
  'anon no conserva ni un privilegio sobre las tablas de Kids: la RLS deja de ser la única capa'
);

select is(
  (select string_agg(privilege_type, ', ' order by privilege_type)
   from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated'
     and table_name = 'kid_checkins'
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  null,
  'authenticated no tiene INSERT, UPDATE ni DELETE sobre kid_checkins: toda entrada y toda salida pasan por sus RPC'
);

select is(
  (select string_agg(privilege_type, ', ' order by privilege_type)
   from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated'
     and table_name = 'kids_session_staff'
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE')),
  null,
  'authenticated tampoco escribe directamente en kids_session_staff: el snapshot de elegibilidad lo calcula la base, no el cliente'
);

select is(
  (select string_agg(privilege_type, ', ' order by privilege_type)
   from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated'
     and table_name = 'kids_incidents' and privilege_type = 'DELETE'),
  null,
  'authenticated no tiene DELETE sobre kids_incidents'
);

select is(
  (select string_agg(column_name, ', ' order by column_name)
   from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'kid_checkins'
     and grantee = 'authenticated' and privilege_type = 'SELECT'
     and column_name = 'pickup_token_hash'),
  null,
  'La huella del código de recogida no está entre las columnas de kid_checkins concedidas a authenticated'
);

select is(
  (select string_agg(p.proname, ', ' order by p.proname)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app'
     and p.proname in ('kids_find_checkin_by_code', 'emit_kid_checkin_notification')
     and has_function_privilege('authenticated', p.oid, 'execute')),
  null,
  'Ni el buscador interno por código ni la función de trigger de avisos son ejecutables por authenticated: la primera sería un oráculo de códigos'
);

select * from finish();
rollback;
