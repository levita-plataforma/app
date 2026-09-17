-- Fase 5 (DI-01) · Tests de disponibilidad, frecuencia y sus avisos:
-- solape de periodos con bordes semiabiertos, expansión de la pauta semanal en
-- la zona de la iglesia (incluido el cambio de hora), aislamiento entre
-- iglesias, autorización de app.person_unavailability, avisos `unavailable` y
-- `frequency_exceeded` en la elegibilidad, RPC de la persona y revocación de
-- la escritura directa. Ver migración 20260923000100_disponibilidad.sql.

begin;
select plan(62);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function t_set(p_key text, p_value text) returns text as $$
  select set_config('t5d.' || p_key, coalesce(p_value, ''), true);
$$ language sql;

create or replace function t_id(p_key text) returns uuid as $$
  select nullif(current_setting('t5d.' || p_key, true), '')::uuid;
$$ language sql;

-- Ejecuta SQL y devuelve 'ok' o 'SQLSTATE:DETAIL'.
create or replace function t_err(p_sql text) returns text as $$
declare
  v_state text;
  v_detail text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_detail = pg_exception_detail;
  return v_state || coalesce(':' || nullif(v_detail, ''), '');
end;
$$ language plpgsql;

create or replace function t_unav_count(p_church uuid, p_people uuid[], p_from timestamptz, p_to timestamptz)
returns integer as $$
  select count(*)::integer from app.person_unavailability(p_church, p_people, p_from, p_to);
$$ language sql;

-- Representación estable de las filas devueltas: source e instantes en UTC.
create or replace function t_unav_rows(p_church uuid, p_people uuid[], p_from timestamptz, p_to timestamptz)
returns text as $$
  select coalesce(string_agg(
    source || '|' || to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
           || '|' || to_char(ends_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI'),
    ' ; ' order by starts_at), '')
  from app.person_unavailability(p_church, p_people, p_from, p_to);
$$ language sql;

create or replace function t_area(p_activity uuid, p_service_area uuid) returns uuid as $$
  select (public.add_activity_area(p_activity, p_service_area, 'optional', null, false) ->> 'activity_service_area_id')::uuid;
$$ language sql;

create or replace function t_pos(p_area uuid, p_input jsonb) returns uuid as $$
  select public.add_activity_position(p_area, p_input);
$$ language sql;

create or replace function t_warnings(p_pos uuid, p_person uuid) returns text[] as $$
  select warnings from public.preview_assignment_eligibility(p_pos, p_person);
$$ language sql;

create or replace function t_act(p_church uuid, p_input jsonb) returns uuid as $$
  select (public.create_activity(p_church, p_input) ->> 'activity_id')::uuid;
$$ language sql;

-- Usuarios: 01 propietario A · 02 propietario B · 03 líder de Sonido ·
-- 04 Marta (miembro con cuenta) · 05 Pablo (miembro con cuenta)
insert into auth.users (id, email) values
  ('d1000000-0000-0000-0000-000000000001', 'owner.di1a@example.test'),
  ('d1000000-0000-0000-0000-000000000002', 'owner.di1b@example.test'),
  ('d1000000-0000-0000-0000-000000000003', 'lider.di1a@example.test'),
  ('d1000000-0000-0000-0000-000000000004', 'marta.di1a@example.test'),
  ('d1000000-0000-0000-0000-000000000005', 'pablo.di1a@example.test');

select test_set_auth_uid('d1000000-0000-0000-0000-000000000001');
select t_set('church_a', out_church_id::text)
from app.provision_church(
  'Church A DI1', 'church-a-di1', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'ADI1', 'owner.di1a@example.test', null, 'Sede ADI1', null, null, null, null,
  array['people', 'serving'], null
);

select test_set_auth_uid('d1000000-0000-0000-0000-000000000002');
select t_set('church_b', out_church_id::text)
from app.provision_church(
  'Church B DI1', 'church-b-di1', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'BDI1', 'owner.di1b@example.test', null, 'Sede BDI1', null, null, null, null,
  array['people', 'serving'], null
);

reset role;

-- ============================================================
-- Catálogo (superusuario)
-- ============================================================
insert into people (id, user_id, first_name, last_name, source) values
  ('d1000000-0000-0000-0000-0000000e0001', 'd1000000-0000-0000-0000-000000000004', 'Marta', 'Periodos', 'manual'),
  ('d1000000-0000-0000-0000-0000000e0002', null, 'Nuria', 'Semanal', 'manual'),
  ('d1000000-0000-0000-0000-0000000e0003', null, 'Olga', 'Frecuencia', 'manual'),
  ('d1000000-0000-0000-0000-0000000e0004', null, 'Rosa', 'PorÁrea', 'manual'),
  ('d1000000-0000-0000-0000-0000000e0005', 'd1000000-0000-0000-0000-000000000005', 'Pablo', 'Miembro', 'manual'),
  ('d1000000-0000-0000-0000-0000000e0006', null, 'Sara', 'Disponible', 'manual'),
  ('d1000000-0000-0000-0000-0000000e0007', null, 'Nieves', 'Lunes', 'manual'),
  ('d1000000-0000-0000-0000-0000000e0010', null, 'Berta', 'IglesiaB', 'manual'),
  ('d1000000-0000-0000-0000-0000000e0020', 'd1000000-0000-0000-0000-000000000003', 'Luis', 'Líder', 'manual');

insert into church_people (id, church_id, person_id, relationship, source) values
  (default, t_id('church_a'), 'd1000000-0000-0000-0000-0000000e0001', 'member', 'manual'),
  (default, t_id('church_a'), 'd1000000-0000-0000-0000-0000000e0002', 'member', 'manual'),
  (default, t_id('church_a'), 'd1000000-0000-0000-0000-0000000e0003', 'member', 'manual'),
  (default, t_id('church_a'), 'd1000000-0000-0000-0000-0000000e0004', 'member', 'manual'),
  ('d1000000-0000-0000-0000-0000000f0005', t_id('church_a'), 'd1000000-0000-0000-0000-0000000e0005', 'member', 'manual'),
  (default, t_id('church_a'), 'd1000000-0000-0000-0000-0000000e0006', 'member', 'manual'),
  (default, t_id('church_a'), 'd1000000-0000-0000-0000-0000000e0007', 'member', 'manual'),
  (default, t_id('church_b'), 'd1000000-0000-0000-0000-0000000e0010', 'member', 'manual'),
  ('d1000000-0000-0000-0000-0000000f0020', t_id('church_a'), 'd1000000-0000-0000-0000-0000000e0020', 'member', 'manual');

insert into service_areas (id, church_id, name, slug) values
  ('d1000000-0000-0000-0000-0000000a0001', t_id('church_a'), 'Sonido DI1', 'sonido-di1'),
  ('d1000000-0000-0000-0000-0000000a0002', t_id('church_a'), 'Multimedia DI1', 'multimedia-di1');

-- Luis lidera Sonido: tiene assignment.manage con scope service_area.
insert into church_people_roles (church_id, church_people_id, role_key, scope_type, scope_id)
values (t_id('church_a'), 'd1000000-0000-0000-0000-0000000f0020', 'ministry_leader', 'service_area', 'd1000000-0000-0000-0000-0000000a0001');

insert into service_area_members (church_id, service_area_id, person_id, status, level)
select t_id('church_a'), 'd1000000-0000-0000-0000-0000000a0001', p, 'active', 'autonomous'
from unnest(array[
  'd1000000-0000-0000-0000-0000000e0001'::uuid, 'd1000000-0000-0000-0000-0000000e0002',
  'd1000000-0000-0000-0000-0000000e0003', 'd1000000-0000-0000-0000-0000000e0004',
  'd1000000-0000-0000-0000-0000000e0005', 'd1000000-0000-0000-0000-0000000e0006',
  'd1000000-0000-0000-0000-0000000e0007'
]) p;

insert into service_area_members (church_id, service_area_id, person_id, status, level)
values (t_id('church_a'), 'd1000000-0000-0000-0000-0000000a0002', 'd1000000-0000-0000-0000-0000000e0004', 'active', 'autonomous');

-- No disponibilidad de partida (se escribe como superusuario: las RPC se
-- prueban aparte, al final).
insert into person_unavailability_periods (church_id, person_id, starts_at, ends_at, reason) values
  (t_id('church_a'), 'd1000000-0000-0000-0000-0000000e0001',
   '2031-05-10 08:00+00', '2031-05-10 14:00+00', 'Motivo privado de Marta');

insert into person_unavailability_periods (church_id, person_id, starts_at, ends_at, reason) values
  (t_id('church_b'), 'd1000000-0000-0000-0000-0000000e0010',
   '2031-05-10 08:00+00', '2031-05-10 14:00+00', null);

-- Pauta semanal de Nuria: los domingos de 10:00 a 12:00 hora de la iglesia.
-- El día se deriva de la fecha para no depender del calendario mental.
insert into person_unavailability_weekly (church_id, person_id, weekday, starts_time, ends_time, reason)
values (t_id('church_a'), 'd1000000-0000-0000-0000-0000000e0002',
        (extract(isodow from date '2031-10-19')::integer - 1)::smallint, '10:00', '12:00', 'Motivo privado de Nuria');

-- Pauta de Nieves los lunes (weekday 0), para comprobar la convención.
insert into person_unavailability_weekly (church_id, person_id, weekday, starts_time, ends_time)
values (t_id('church_a'), 'd1000000-0000-0000-0000-0000000e0007', 0, '09:00', '10:00');

-- Identificadores de las filas de Marta, para probar desde otra cuenta que las
-- RPC no tocan lo ajeno (desde esa cuenta la RLS ni siquiera deja verlas).
select t_set('per_marta',
  (select id::text from person_unavailability_periods where person_id = 'd1000000-0000-0000-0000-0000000e0001'));

-- ============================================================
-- 1. Periodos: solape y bordes semiabiertos
-- ============================================================
select test_set_auth_uid('d1000000-0000-0000-0000-000000000001');

select is(
  t_unav_rows(t_id('church_a'), array['d1000000-0000-0000-0000-0000000e0001'::uuid],
              '2031-05-10 06:00+00', '2031-05-10 09:00+00'),
  'period|2031-05-10 08:00|2031-05-10 14:00',
  'Un rango que entra en el periodo devuelve la fila con source period y sus instantes'
);

select is(
  t_unav_count(t_id('church_a'), array['d1000000-0000-0000-0000-0000000e0001'::uuid],
               '2031-05-10 13:00+00', '2031-05-10 16:00+00'),
  1,
  'Un rango que sale del periodo por el final sigue solapando mientras no llegue a ends_at'
);

select is(
  t_unav_count(t_id('church_a'), array['d1000000-0000-0000-0000-0000000e0001'::uuid],
               '2031-05-10 14:00+00', '2031-05-10 16:00+00'),
  0,
  'Borde semiabierto: un rango que empieza justo en ends_at del periodo no solapa'
);

select is(
  t_unav_count(t_id('church_a'), array['d1000000-0000-0000-0000-0000000e0001'::uuid],
               '2031-05-10 06:00+00', '2031-05-10 08:00+00'),
  0,
  'Borde semiabierto: un rango que termina justo en starts_at del periodo no solapa'
);

select is(
  t_unav_count(t_id('church_a'), array['d1000000-0000-0000-0000-0000000e0001'::uuid],
               '2031-05-11 06:00+00', '2031-05-11 20:00+00'),
  0,
  'Otro día sin periodo no devuelve nada'
);

select is(
  (select array_agg(a.attname::text order by a.attnum)
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   cross join lateral unnest(p.proargnames) with ordinality as a(attname, attnum)
   where n.nspname = 'app' and p.proname = 'person_unavailability'
     and a.attnum > 4),
  array['person_id', 'source', 'starts_at', 'ends_at'],
  'La función devuelve exactamente (person_id, source, starts_at, ends_at): nunca el motivo'
);

-- ============================================================
-- 2. Pauta semanal: expansión, rango y cambio de hora
-- ============================================================
-- Europe/Madrid: el 19-10-2031 rige el horario de verano (UTC+2) y el
-- 26-10-2031 ya el estándar (UTC+1). Las 10:00 LOCALES se mantienen fijas.
select is(
  t_unav_rows(t_id('church_a'), array['d1000000-0000-0000-0000-0000000e0002'::uuid],
              '2031-10-18 00:00+00', '2031-10-28 00:00+00'),
  'weekly|2031-10-19 08:00|2031-10-19 10:00 ; weekly|2031-10-26 09:00|2031-10-26 11:00',
  'La pauta semanal se expande a instantes reales y el cambio de hora mantiene la hora local (08:00 UTC en verano, 09:00 UTC en estándar)'
);

select is(
  t_unav_count(t_id('church_a'), array['d1000000-0000-0000-0000-0000000e0002'::uuid],
               '2031-10-20 00:00+00', '2031-10-24 00:00+00'),
  0,
  'Un rango de lunes a viernes no toca una pauta de los domingos'
);

select is(
  t_unav_count(t_id('church_a'), array['d1000000-0000-0000-0000-0000000e0002'::uuid],
               '2031-10-19 12:00+00', '2031-10-19 20:00+00'),
  0,
  'El mismo domingo, fuera de la franja de la pauta, no hay no disponibilidad'
);

select is(
  t_unav_count(t_id('church_a'), array['d1000000-0000-0000-0000-0000000e0002'::uuid],
               '2031-10-19 09:30+00', '2031-10-19 12:00+00'),
  1,
  'Un rango que entra en la franja semanal por el final solapa'
);

select ok(
  (select count(*) >= 4
     and bool_and(extract(isodow from (starts_at at time zone 'Europe/Madrid')) = 1)
     and bool_and((starts_at at time zone 'Europe/Madrid')::time = time '09:00')
   from app.person_unavailability(t_id('church_a'), array['d1000000-0000-0000-0000-0000000e0007'::uuid],
                                  '2031-11-01 00:00+00', '2031-11-30 00:00+00')),
  'weekday 0 es lunes: todas las ocurrencias de noviembre caen en lunes a las 09:00 locales'
);

select is(
  t_unav_count(t_id('church_a'),
               array['d1000000-0000-0000-0000-0000000e0001'::uuid, 'd1000000-0000-0000-0000-0000000e0002'],
               '2031-05-10 06:00+00', '2031-05-10 09:00+00'),
  1,
  'Se consultan varias personas a la vez y solo sale la que no está disponible'
);

select is(
  t_err($q$ select app.person_unavailability(t_id('church_a'), array['d1000000-0000-0000-0000-0000000e0002'::uuid],
                                             '2031-01-01 00:00+00', '2033-01-01 00:00+00') $q$),
  '22023',
  'Un rango desmesurado se rechaza en lugar de expandir años de pauta semanal'
);

-- ============================================================
-- 3. Aislamiento entre iglesias
-- ============================================================
select is(
  t_unav_count(t_id('church_a'), array['d1000000-0000-0000-0000-0000000e0010'::uuid],
               '2031-05-10 06:00+00', '2031-05-10 20:00+00'),
  0,
  'La no disponibilidad de una persona de otra iglesia no se ve consultando la propia'
);

select is(
  t_err($q$ select app.person_unavailability(t_id('church_b'), array['d1000000-0000-0000-0000-0000000e0010'::uuid],
                                             '2031-05-10 06:00+00', '2031-05-10 20:00+00') $q$),
  '42501',
  'Consultar la disponibilidad en una iglesia ajena falla con 42501'
);

-- ============================================================
-- 4. Autorización
-- ============================================================
select test_set_auth_uid('d1000000-0000-0000-0000-000000000004');

select is(
  t_unav_count(t_id('church_a'), array['d1000000-0000-0000-0000-0000000e0001'::uuid],
               '2031-05-10 06:00+00', '2031-05-10 20:00+00'),
  1,
  'La propia persona consulta su disponibilidad'
);

select is(
  t_err($q$ select app.person_unavailability(t_id('church_a'), array['d1000000-0000-0000-0000-0000000e0002'::uuid],
                                             '2031-10-18 00:00+00', '2031-10-28 00:00+00') $q$),
  '42501',
  'Quien no es la persona ni gestiona asignaciones no consulta la disponibilidad ajena: 42501'
);

select test_set_auth_uid('d1000000-0000-0000-0000-000000000003');

select is(
  t_unav_count(t_id('church_a'), array['d1000000-0000-0000-0000-0000000e0002'::uuid],
               '2031-10-18 00:00+00', '2031-10-28 00:00+00'),
  2,
  'El líder del área, con assignment.manage de scope service_area, sí consulta la disponibilidad'
);

-- ============================================================
-- 5. Lectura directa y escritura revocada
-- ============================================================
select test_set_auth_uid('d1000000-0000-0000-0000-000000000005');

select is(
  (select count(*)::integer from person_unavailability_periods),
  0,
  'Otra persona no lee ninguna fila de no disponibilidad (ni, por tanto, los motivos)'
);

select is(
  (select count(*)::integer from person_unavailability_weekly),
  0,
  'Otra persona tampoco lee la pauta semanal ajena'
);

select is(
  substring(t_err($q$ insert into person_unavailability_periods (church_id, person_id, starts_at, ends_at)
                      values (t_id('church_a'), 'd1000000-0000-0000-0000-0000000e0005', now(), now() + interval '1 day') $q$)
            from 1 for 5),
  '42501',
  'La escritura directa en person_unavailability_periods está revocada'
);

select is(
  substring(t_err($q$ insert into person_unavailability_weekly (church_id, person_id, weekday, starts_time, ends_time)
                      values (t_id('church_a'), 'd1000000-0000-0000-0000-0000000e0005', 0, '09:00', '10:00') $q$)
            from 1 for 5),
  '42501',
  'La escritura directa en person_unavailability_weekly está revocada'
);

select is(
  substring(t_err($q$ insert into person_serving_preferences (church_id, person_id, service_area_id, max_activities_per_month)
                      values (t_id('church_a'), 'd1000000-0000-0000-0000-0000000e0005', null, 1) $q$)
            from 1 for 5),
  '42501',
  'La escritura directa en person_serving_preferences está revocada'
);

select is(
  substring(t_err($q$ delete from person_unavailability_periods $q$) from 1 for 5),
  '42501',
  'El borrado directo de no disponibilidad está revocado'
);

select test_set_auth_uid('d1000000-0000-0000-0000-000000000004');

select is(
  (select count(*)::integer from person_unavailability_periods where reason is not null),
  1,
  'La propia persona sí lee su periodo con su motivo'
);

-- ============================================================
-- 6. Aviso `unavailable` en la elegibilidad
-- ============================================================
select test_set_auth_uid('d1000000-0000-0000-0000-000000000001');

select t_set('act_unav', t_act(t_id('church_a'),
  '{"type":"service","title":"DI1 no disponible","local_start":"2031-05-10T11:00","duration_minutes":60}'::jsonb)::text);
select t_set('pos_unav', t_pos(t_area(t_id('act_unav'), 'd1000000-0000-0000-0000-0000000a0001'), '{"name":"Mesa"}')::text);
select public.transition_activity_status(t_id('act_unav'), 'published');

select t_set('act_libre', t_act(t_id('church_a'),
  '{"type":"service","title":"DI1 libre","local_start":"2031-05-11T11:00","duration_minutes":60}'::jsonb)::text);
select t_set('pos_libre', t_pos(t_area(t_id('act_libre'), 'd1000000-0000-0000-0000-0000000a0001'), '{"name":"Mesa"}')::text);
select public.transition_activity_status(t_id('act_libre'), 'published');

select is(
  t_warnings(t_id('pos_unav'), 'd1000000-0000-0000-0000-0000000e0001'),
  array['unavailable'],
  'Con la función real, una persona con un periodo que solapa la actividad avisa con unavailable'
);

select is(
  t_warnings(t_id('pos_libre'), 'd1000000-0000-0000-0000-0000000e0001'),
  '{}'::text[],
  'Otro día sin no disponibilidad no produce aviso'
);

select is(
  t_warnings(t_id('pos_unav'), 'd1000000-0000-0000-0000-0000000e0006'),
  '{}'::text[],
  'Una persona sin no disponibilidad registrada no produce aviso en la misma actividad'
);

select is(
  t_err($q$ select public.create_activity_assignment(t_id('pos_unav'), 'd1000000-0000-0000-0000-0000000e0001') $q$),
  'PT412:unavailable',
  'Crear la asignación sin confirmar el aviso de no disponibilidad falla con PT412'
);

select lives_ok(
  $$ select public.create_activity_assignment(t_id('pos_unav'), 'd1000000-0000-0000-0000-0000000e0001',
       '{"acknowledged_warnings":["unavailable"],"send":true}') $$,
  'El aviso de no disponibilidad se confirma y la asignación se crea'
);

select is(
  (select status::text from activity_assignments
   where activity_position_id = t_id('pos_unav') and person_id = 'd1000000-0000-0000-0000-0000000e0001'),
  'pending',
  'La asignación confirmada pese al aviso queda comunicada'
);

-- El aviso guardado no revela el motivo: solo el código.
select is(
  (select eligibility_warnings from public.activity_assignment_recorded_warnings(t_id('act_unav'))),
  array['unavailable'],
  'El aviso registrado es solo el código: el motivo nunca llega a quien coordina'
);

-- ============================================================
-- 7. Frecuencia
-- ============================================================
-- Junio de 2031: dos actividades de Sonido y una tercera con dos puestos.
select t_set('act_f1', t_act(t_id('church_a'),
  '{"type":"service","title":"DI1 junio 1","local_start":"2031-06-07T10:00","duration_minutes":60}'::jsonb)::text);
select t_set('area_f1', t_area(t_id('act_f1'), 'd1000000-0000-0000-0000-0000000a0001')::text);
select t_set('pos_f1a', t_pos(t_id('area_f1'), '{"name":"Mesa"}')::text);
select t_set('pos_f1b', t_pos(t_id('area_f1'), '{"name":"Monitores"}')::text);
select public.transition_activity_status(t_id('act_f1'), 'published');

select t_set('act_f2', t_act(t_id('church_a'),
  '{"type":"service","title":"DI1 junio 2","local_start":"2031-06-14T10:00","duration_minutes":60}'::jsonb)::text);
select t_set('pos_f2', t_pos(t_area(t_id('act_f2'), 'd1000000-0000-0000-0000-0000000a0001'), '{"name":"Mesa"}')::text);
select public.transition_activity_status(t_id('act_f2'), 'published');

-- Actividad de julio: otro mes natural, no cuenta contra el de junio.
select t_set('act_f3', t_act(t_id('church_a'),
  '{"type":"service","title":"DI1 julio","local_start":"2031-07-05T10:00","duration_minutes":60}'::jsonb)::text);
select t_set('pos_f3', t_pos(t_area(t_id('act_f3'), 'd1000000-0000-0000-0000-0000000a0001'), '{"name":"Mesa"}')::text);
select public.transition_activity_status(t_id('act_f3'), 'published');

reset role;
-- Olga: máximo global de 1 actividad al mes.
insert into person_serving_preferences (church_id, person_id, service_area_id, max_activities_per_month)
values (t_id('church_a'), 'd1000000-0000-0000-0000-0000000e0003', null, 1);
select test_set_auth_uid('d1000000-0000-0000-0000-000000000001');

select is(
  t_warnings(t_id('pos_f1a'), 'd1000000-0000-0000-0000-0000000e0003'),
  '{}'::text[],
  'La primera actividad del mes no supera un máximo de 1'
);

select t_set('asg_olga', (public.create_activity_assignment(t_id('pos_f1a'), 'd1000000-0000-0000-0000-0000000e0003') ->> 'assignment_id'));

select is(
  t_warnings(t_id('pos_f2'), 'd1000000-0000-0000-0000-0000000e0003'),
  array['frequency_exceeded'],
  'Una segunda actividad del mismo mes supera el máximo y avisa con frequency_exceeded'
);

-- El segundo puesto de la misma actividad sí avisa de solape (es otro puesto a
-- la misma hora), pero nunca de frecuencia: la actividad ya estaba contada.
select ok(
  not ('frequency_exceeded' = any (t_warnings(t_id('pos_f1b'), 'd1000000-0000-0000-0000-0000000e0003'))),
  'Dos puestos de la MISMA actividad cuentan como una: el segundo puesto no avisa de frecuencia'
);

select is(
  t_warnings(t_id('pos_f3'), 'd1000000-0000-0000-0000-0000000e0003'),
  '{}'::text[],
  'Una actividad de otro mes natural no cuenta contra el máximo de junio'
);

select is(
  (select blocking from public.preview_assignment_eligibility(t_id('pos_f2'), 'd1000000-0000-0000-0000-0000000e0003')),
  '{}'::text[],
  'La frecuencia nunca bloquea: solo avisa'
);

select is(
  t_err($q$ select public.create_activity_assignment(t_id('pos_f2'), 'd1000000-0000-0000-0000-0000000e0003') $q$),
  'PT412:frequency_exceeded',
  'Crear una asignación que supera la frecuencia pide confirmar el aviso'
);

select lives_ok(
  $$ select public.create_activity_assignment(t_id('pos_f2'), 'd1000000-0000-0000-0000-0000000e0003',
       '{"acknowledged_warnings":["frequency_exceeded"]}') $$,
  'Confirmado el aviso de frecuencia, la asignación se crea'
);

-- Reevaluar una asignación ya creada no la cuenta contra sí misma: Olga tiene
-- dos actividades en junio y un máximo de 1, así que la revisión sí avisa.
select is(
  (select count(*)::integer from public.activity_assignment_review(t_id('act_f1')) r
   where r.assignment_id = t_id('asg_olga') and 'frequency_exceeded' = any (r.warnings)),
  1,
  'La revisión de una asignación existente la excluye del recuento y avisa solo si el resto ya supera el máximo'
);

-- Rosa: máximo global 1 pero máximo de 5 en Sonido. Manda el del área.
reset role;
insert into person_serving_preferences (church_id, person_id, service_area_id, max_activities_per_month) values
  (t_id('church_a'), 'd1000000-0000-0000-0000-0000000e0004', null, 1),
  (t_id('church_a'), 'd1000000-0000-0000-0000-0000000e0004', 'd1000000-0000-0000-0000-0000000a0001', 5);
select test_set_auth_uid('d1000000-0000-0000-0000-000000000001');

select public.create_activity_assignment(t_id('pos_f1a'), 'd1000000-0000-0000-0000-0000000e0004');

select is(
  t_warnings(t_id('pos_f2'), 'd1000000-0000-0000-0000-0000000e0004'),
  '{}'::text[],
  'El máximo del área (5) manda sobre el global (1): la segunda actividad de Sonido no avisa'
);

reset role;
update person_serving_preferences set max_activities_per_month = 5
where person_id = 'd1000000-0000-0000-0000-0000000e0004' and service_area_id is null;
update person_serving_preferences set max_activities_per_month = 1
where person_id = 'd1000000-0000-0000-0000-0000000e0004' and service_area_id = 'd1000000-0000-0000-0000-0000000a0001';
select test_set_auth_uid('d1000000-0000-0000-0000-000000000001');

select is(
  t_warnings(t_id('pos_f2'), 'd1000000-0000-0000-0000-0000000e0004'),
  array['frequency_exceeded'],
  'También en sentido contrario: el máximo del área (1) manda sobre un global más alto (5)'
);

select is(
  t_warnings(t_id('pos_f2'), 'd1000000-0000-0000-0000-0000000e0006'),
  '{}'::text[],
  'Sin preferencia de frecuencia guardada nunca se avisa'
);

-- ============================================================
-- 8. RPC de la persona
-- ============================================================
select test_set_auth_uid('d1000000-0000-0000-0000-000000000005');

select t_set('per_pablo', public.set_my_unavailability_period(jsonb_build_object(
  'church_id', t_id('church_a'), 'starts_at', '2031-08-01T00:00+00', 'ends_at', '2031-08-15T00:00+00',
  'reason', 'Vacaciones secretas de Pablo')) ->> 'id');

select is(
  (select count(*)::integer from person_unavailability_periods
   where id = t_id('per_pablo') and person_id = 'd1000000-0000-0000-0000-0000000e0005'
     and reason = 'Vacaciones secretas de Pablo'),
  1,
  'set_my_unavailability_period crea el periodo de la persona autenticada con su motivo'
);

select is(
  (public.set_my_unavailability_period(jsonb_build_object(
     'church_id', t_id('church_a'), 'id', t_id('per_pablo'),
     'starts_at', '2031-08-02T00:00+00', 'ends_at', '2031-08-10T00:00+00')) ->> 'created')::boolean,
  false,
  'Con id, set_my_unavailability_period edita en lugar de crear'
);

select is(
  (select starts_at from person_unavailability_periods where id = t_id('per_pablo')),
  '2031-08-02 00:00+00'::timestamptz,
  'La edición actualiza el periodo y borra el motivo si no se envía'
);

select is(
  t_err($q$ select public.set_my_unavailability_period(jsonb_build_object(
    'church_id', t_id('church_a'), 'starts_at', '2031-09-02T00:00+00', 'ends_at', '2031-09-01T00:00+00')) $q$),
  '22023',
  'Un periodo con fin anterior al inicio se rechaza'
);

select is(
  t_err($q$ select public.set_my_unavailability_period(jsonb_build_object(
    'church_id', t_id('church_a'), 'starts_at', '2031-09-01T00:00+00', 'ends_at', '2031-09-02T00:00+00',
    'reason', repeat('x', 301))) $q$),
  '22023',
  'Un motivo de más de 300 caracteres se rechaza'
);

-- Escribir sobre otra persona: el periodo de Marta no existe para Pablo.
select is(
  t_err($q$ select public.set_my_unavailability_period(jsonb_build_object(
    'church_id', t_id('church_a'), 'id', t_id('per_marta'),
    'starts_at', '2031-09-01T00:00+00', 'ends_at', '2031-09-02T00:00+00')) $q$),
  'P0002',
  'Editar el periodo de otra persona falla: solo actúa sobre la persona autenticada'
);

select ok(
  not (public.delete_my_unavailability_period(t_id('per_marta')) ->> 'deleted')::boolean,
  'Borrar el periodo de otra persona no borra nada'
);

select t_set('sem_pablo', public.set_my_weekly_unavailability(jsonb_build_object(
  'church_id', t_id('church_a'), 'weekday', 2, 'starts_time', '18:00', 'ends_time', '20:00',
  'reason', 'Clase secreta')) ->> 'id');

select is(
  (select weekday::integer from person_unavailability_weekly where id = t_id('sem_pablo')),
  2,
  'set_my_weekly_unavailability crea la pauta semanal de la persona autenticada'
);

select is(
  t_err($q$ select public.set_my_weekly_unavailability(jsonb_build_object(
    'church_id', t_id('church_a'), 'weekday', 7, 'starts_time', '18:00', 'ends_time', '20:00')) $q$),
  '22023',
  'Un día de la semana fuera de 0..6 se rechaza'
);

select is(
  t_err($q$ select public.set_my_weekly_unavailability(jsonb_build_object(
    'church_id', t_id('church_a'), 'weekday', 3, 'starts_time', '20:00', 'ends_time', '18:00')) $q$),
  '22023',
  'Una franja semanal con fin anterior al inicio se rechaza'
);

select is(
  (public.set_my_serving_preference(t_id('church_a'), null, 2) ->> 'max_activities_per_month')::integer,
  2,
  'set_my_serving_preference guarda el máximo global de la persona'
);

select is(
  (select count(*)::integer from person_serving_preferences
   where person_id = 'd1000000-0000-0000-0000-0000000e0005' and service_area_id is null
     and max_activities_per_month = 2),
  1,
  'La preferencia global se guarda una sola vez (índice único con nulls not distinct)'
);

select public.set_my_serving_preference(t_id('church_a'), null, 4);

select is(
  (select max_activities_per_month from person_serving_preferences
   where person_id = 'd1000000-0000-0000-0000-0000000e0005' and service_area_id is null),
  4,
  'Volver a guardar la preferencia global la actualiza en lugar de duplicarla'
);

select is(
  t_err($q$ select public.set_my_serving_preference(t_id('church_a'), 'd1000000-0000-0000-0000-0000000a0001', -1) $q$),
  '22023',
  'Un máximo negativo se rechaza'
);

select is(
  t_err($q$ select public.set_my_serving_preference(t_id('church_b'), null, 1) $q$),
  '42501',
  'No se puede guardar una preferencia en una iglesia a la que no se pertenece'
);

-- La comprobación va en otra sentencia: la lectura de la misma sentencia usa
-- la instantánea anterior al borrado.
select t_set('sem_borrado', (public.delete_my_weekly_unavailability(t_id('sem_pablo')) ->> 'deleted'));

select ok(
  current_setting('t5d.sem_borrado') = 'true'
  and not exists (select 1 from person_unavailability_weekly where id = t_id('sem_pablo')),
  'delete_my_weekly_unavailability borra la pauta propia'
);

select ok(
  (public.delete_my_unavailability_period(t_id('per_pablo')) ->> 'deleted')::boolean
  and not (public.delete_my_unavailability_period(t_id('per_pablo')) ->> 'deleted')::boolean,
  'delete_my_unavailability_period borra el periodo propio y es idempotente'
);

-- ============================================================
-- 9. Auditoría sin motivo
-- ============================================================
reset role;

select ok(
  exists (select 1 from audit_logs where action = 'availability.period_created')
  and exists (select 1 from audit_logs where action = 'availability.weekly_created')
  and exists (select 1 from audit_logs where action = 'serving_preference.updated'),
  'Las RPC de disponibilidad y frecuencia se auditan'
);

select ok(
  not exists (
    select 1 from audit_logs
    where action like 'availability.%'
      and (metadata::text ilike '%secreta%' or metadata::text ilike '%secretas%' or metadata ? 'reason')
  ),
  'La auditoría nunca incluye el motivo de la no disponibilidad'
);

select * from finish();
rollback;
