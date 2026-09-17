-- Fase 5 · Tests de permisos de asignaciones: assignment.manage por scope
-- (church, campus, activity, service_area), lectura mínima de la persona
-- asignada, visibilidad del equipo, notas privadas, solicitudes de
-- sustitución, escrituras directas denegadas, anon y aislamiento entre
-- iglesias. Ver migraciones 20260922000200 y 20260922000400.

begin;
select plan(66);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function t_set(p_key text, p_value text) returns text as $$
  select set_config('t5p.' || p_key, coalesce(p_value, ''), true);
$$ language sql;

create or replace function t_id(p_key text) returns uuid as $$
  select nullif(current_setting('t5p.' || p_key, true), '')::uuid;
$$ language sql;

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

create or replace function t_area(p_activity uuid, p_service_area uuid) returns uuid as $$
  select (public.add_activity_area(p_activity, p_service_area, 'optional', null, false) ->> 'activity_service_area_id')::uuid;
$$ language sql;

create or replace function t_pos(p_area uuid, p_input jsonb) returns uuid as $$
  select public.add_activity_position(p_area, p_input);
$$ language sql;

create or replace function t_asg(p_pos uuid, p_person uuid, p_input jsonb default '{}') returns uuid as $$
  select (public.create_activity_assignment(p_pos, p_person, p_input) ->> 'assignment_id')::uuid;
$$ language sql;

-- Usuarios:
--   01 propietario A · 02 miembro · 03 admin de sede C2 · 04 líder del área
--   Sonido · 05 gestor de asignaciones de una actividad · 06 propietario B ·
--   07 Pedro (persona asignada) · 08 Quique (persona asignada)
insert into auth.users (id, email) values
  ('c5000000-0000-0000-0000-000000000001', 'owner.p5pa@example.test'),
  ('c5000000-0000-0000-0000-000000000002', 'miembro.p5p@example.test'),
  ('c5000000-0000-0000-0000-000000000003', 'sede.p5p@example.test'),
  ('c5000000-0000-0000-0000-000000000004', 'area.p5p@example.test'),
  ('c5000000-0000-0000-0000-000000000005', 'actividad.p5p@example.test'),
  ('c5000000-0000-0000-0000-000000000006', 'owner.p5pb@example.test'),
  ('c5000000-0000-0000-0000-000000000007', 'pedro.p5p@example.test'),
  ('c5000000-0000-0000-0000-000000000008', 'quique.p5p@example.test');

select test_set_auth_uid('c5000000-0000-0000-0000-000000000001');
select t_set('church_a', out_church_id::text)
from app.provision_church(
  'Church A P5P', 'church-a-p5perm', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'A5P', 'owner.p5pa@example.test', null, 'Sede C1 P5', null, null, null, null,
  array['people', 'serving'], null
);

select test_set_auth_uid('c5000000-0000-0000-0000-000000000006');
select t_set('church_b', out_church_id::text)
from app.provision_church(
  'Church B P5P', 'church-b-p5perm', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'B5P', 'owner.p5pb@example.test', null, 'Sede B P5', null, null, null, null,
  array['people', 'serving'], null
);

reset role;

-- ============================================================
-- Setup (superusuario)
-- ============================================================
insert into campuses (id, church_id, name, slug)
values ('c5000000-0000-0000-0000-0000000c0002', t_id('church_a'), 'Sede C2 P5', 'c2-p5');

insert into people (id, user_id, first_name, last_name, source) values
  ('c5000000-0000-0000-0000-0000000e0002', 'c5000000-0000-0000-0000-000000000002', 'Mario', 'Miembro', 'manual'),
  ('c5000000-0000-0000-0000-0000000e0003', 'c5000000-0000-0000-0000-000000000003', 'Sergio', 'Sede', 'manual'),
  ('c5000000-0000-0000-0000-0000000e0004', 'c5000000-0000-0000-0000-000000000004', 'Álvaro', 'Área', 'manual'),
  ('c5000000-0000-0000-0000-0000000e0005', 'c5000000-0000-0000-0000-000000000005', 'Alicia', 'Actividad', 'manual'),
  ('c5000000-0000-0000-0000-0000000e0007', 'c5000000-0000-0000-0000-000000000007', 'Pedro', 'Asignado', 'manual'),
  ('c5000000-0000-0000-0000-0000000e0008', 'c5000000-0000-0000-0000-000000000008', 'Quique', 'Asignado', 'manual'),
  ('c5000000-0000-0000-0000-0000000e0010', null, 'Rosa', 'SinCuenta', 'manual'),
  ('c5000000-0000-0000-0000-0000000e0011', null, 'Tomás', 'SinCuenta', 'manual'),
  ('c5000000-0000-0000-0000-0000000e0012', null, 'Úrsula', 'SinCuenta', 'manual'),
  ('c5000000-0000-0000-0000-0000000e0020', null, 'Berta', 'OtraIglesia', 'manual');

insert into church_people (id, church_id, person_id, relationship, source) values
  ('c5000000-0000-0000-0000-0000000f0002', t_id('church_a'), 'c5000000-0000-0000-0000-0000000e0002', 'member', 'manual'),
  ('c5000000-0000-0000-0000-0000000f0003', t_id('church_a'), 'c5000000-0000-0000-0000-0000000e0003', 'member', 'manual'),
  ('c5000000-0000-0000-0000-0000000f0004', t_id('church_a'), 'c5000000-0000-0000-0000-0000000e0004', 'member', 'manual'),
  ('c5000000-0000-0000-0000-0000000f0005', t_id('church_a'), 'c5000000-0000-0000-0000-0000000e0005', 'member', 'manual'),
  ('c5000000-0000-0000-0000-0000000f0007', t_id('church_a'), 'c5000000-0000-0000-0000-0000000e0007', 'member', 'manual'),
  ('c5000000-0000-0000-0000-0000000f0008', t_id('church_a'), 'c5000000-0000-0000-0000-0000000e0008', 'member', 'manual'),
  ('c5000000-0000-0000-0000-0000000f0010', t_id('church_a'), 'c5000000-0000-0000-0000-0000000e0010', 'member', 'manual'),
  ('c5000000-0000-0000-0000-0000000f0011', t_id('church_a'), 'c5000000-0000-0000-0000-0000000e0011', 'member', 'manual'),
  ('c5000000-0000-0000-0000-0000000f0012', t_id('church_a'), 'c5000000-0000-0000-0000-0000000e0012', 'member', 'manual'),
  ('c5000000-0000-0000-0000-0000000f0020', t_id('church_b'), 'c5000000-0000-0000-0000-0000000e0020', 'member', 'manual');

insert into roles (key, name) values ('test_p5_assigner', 'Solo gestionar asignaciones (test)');
insert into role_capabilities (role_key, capability_key) values ('test_p5_assigner', 'assignment.manage');

insert into service_areas (id, church_id, name, slug) values
  ('c5000000-0000-0000-0000-0000000a0001', t_id('church_a'), 'Sonido P5P', 'sonido-p5p'),
  ('c5000000-0000-0000-0000-0000000a0002', t_id('church_a'), 'Multimedia P5P', 'multimedia-p5p');

insert into service_area_members (church_id, service_area_id, person_id, status, level)
select t_id('church_a'), a, p, 'active', 'autonomous'
from unnest(array['c5000000-0000-0000-0000-0000000a0001', 'c5000000-0000-0000-0000-0000000a0002']::uuid[]) a
cross join unnest(array[
  'c5000000-0000-0000-0000-0000000e0007', 'c5000000-0000-0000-0000-0000000e0008',
  'c5000000-0000-0000-0000-0000000e0010', 'c5000000-0000-0000-0000-0000000e0011',
  'c5000000-0000-0000-0000-0000000e0012']::uuid[]) p;

insert into church_people_roles (church_id, church_people_id, role_key, scope_type, scope_id) values
  (t_id('church_a'), 'c5000000-0000-0000-0000-0000000f0002', 'member', 'church', null),
  (t_id('church_a'), 'c5000000-0000-0000-0000-0000000f0003', 'campus_admin', 'campus', 'c5000000-0000-0000-0000-0000000c0002'),
  (t_id('church_a'), 'c5000000-0000-0000-0000-0000000f0004', 'ministry_leader', 'service_area', 'c5000000-0000-0000-0000-0000000a0001'),
  (t_id('church_a'), 'c5000000-0000-0000-0000-0000000f0007', 'member', 'church', null),
  (t_id('church_a'), 'c5000000-0000-0000-0000-0000000f0008', 'member', 'church', null);

select test_set_auth_uid('c5000000-0000-0000-0000-000000000001');

select t_set('act_priv', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5P privada","visibility":"private","local_start":"2031-11-02T10:00","duration_minutes":60,"admin_notes":"Nota admin P5P"}'::jsonb) ->> 'activity_id');
select t_set('pos_ps', t_pos(t_area(t_id('act_priv'), 'c5000000-0000-0000-0000-0000000a0001'), '{"name":"Sonido privado","min_people":0}')::text);
select t_set('pos_pm', t_pos(t_area(t_id('act_priv'), 'c5000000-0000-0000-0000-0000000a0002'), '{"name":"Multimedia privado","min_people":0}')::text);
select public.add_activity_plan_item(t_id('act_priv'), '{"item_type":"song","title":"Alabanza P5P"}'::jsonb);
select public.transition_activity_status(t_id('act_priv'), 'published');

select t_set('act_mem', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5P miembros","visibility":"members","local_start":"2031-11-09T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos_ms', t_pos(t_area(t_id('act_mem'), 'c5000000-0000-0000-0000-0000000a0001'), '{"name":"Sonido miembros","min_people":0}')::text);
select public.transition_activity_status(t_id('act_mem'), 'published');

select t_set('act_c2', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5P sede C2","campus_id":"c5000000-0000-0000-0000-0000000c0002","local_start":"2031-11-16T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos_c2', t_pos(t_area(t_id('act_c2'), 'c5000000-0000-0000-0000-0000000a0001'), '{"name":"Sonido C2","min_people":0}')::text);
select public.transition_activity_status(t_id('act_c2'), 'published');

select t_set('act_scope', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5P scope actividad","visibility":"private","local_start":"2031-11-23T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos_sc', t_pos(t_area(t_id('act_scope'), 'c5000000-0000-0000-0000-0000000a0001'), '{"name":"Sonido scope","min_people":0}')::text);
select public.transition_activity_status(t_id('act_scope'), 'published');

reset role;
insert into church_people_roles (church_id, church_people_id, role_key, scope_type, scope_id)
values (t_id('church_a'), 'c5000000-0000-0000-0000-0000000f0005', 'test_p5_assigner', 'activity', t_id('act_scope'));

-- ============================================================
-- 1. assignment.manage por scope
-- ============================================================
select test_set_auth_uid('c5000000-0000-0000-0000-000000000001');

select lives_ok(
  $$ select t_set('own_pm', t_asg(t_id('pos_pm'), 'c5000000-0000-0000-0000-0000000e0011')::text) $$,
  'El propietario (scope church) crea asignaciones en cualquier puesto'
);

select is(t_err($q$ select public.create_activity_assignment(t_id('pos_ps'), 'c5000000-0000-0000-0000-0000000e0020') $q$) like '22023:%inactive_person%', true,
  'Una persona de otra iglesia no se puede asignar (22023 inactive_person)');

select test_set_auth_uid('c5000000-0000-0000-0000-000000000003');

select lives_ok(
  $$ select t_asg(t_id('pos_c2'), 'c5000000-0000-0000-0000-0000000e0010') $$,
  'Admin de sede (scope campus) crea asignaciones en actividades de su sede'
);

select throws_ok(
  $$ select public.create_activity_assignment(t_id('pos_ps'), 'c5000000-0000-0000-0000-0000000e0010') $$,
  '42501', null,
  'Admin de sede no crea asignaciones en actividades sin sede o de otra sede'
);

select test_set_auth_uid('c5000000-0000-0000-0000-000000000004');

select lives_ok(
  $$ select t_asg(t_id('pos_ps'), 'c5000000-0000-0000-0000-0000000e0010') $$,
  'Líder de área (scope service_area) crea asignaciones en puestos de su área'
);

select throws_ok(
  $$ select public.create_activity_assignment(t_id('pos_pm'), 'c5000000-0000-0000-0000-0000000e0010') $$,
  '42501', null,
  'Líder de área no crea asignaciones en puestos de otra área'
);

select throws_ok(
  $$ select * from public.preview_assignment_eligibility(t_id('pos_pm'), 'c5000000-0000-0000-0000-0000000e0010') $$,
  '42501', null,
  'Líder de área no consulta la elegibilidad de puestos de otra área'
);

select throws_ok(
  $$ select public.cancel_activity_assignment(t_id('own_pm')) $$,
  '42501', null,
  'Líder de área no retira asignaciones de otra área'
);

select test_set_auth_uid('c5000000-0000-0000-0000-000000000005');

select lives_ok(
  $$ select t_asg(t_id('pos_sc'), 'c5000000-0000-0000-0000-0000000e0010') $$,
  'assignment.manage con scope activity permite asignar en esa actividad'
);

select is((select count(*)::int from activities where id = t_id('act_scope')), 1,
  'assignment.manage con scope activity permite leer esa actividad privada');

select throws_ok(
  $$ select public.create_activity_assignment(t_id('pos_ms'), 'c5000000-0000-0000-0000-0000000e0010') $$,
  '42501', null,
  'assignment.manage con scope activity no sirve para otra actividad'
);

-- Miembro sin capability.
select test_set_auth_uid('c5000000-0000-0000-0000-000000000001');
select t_set('mem_prop', t_asg(t_id('pos_ms'), 'c5000000-0000-0000-0000-0000000e0012')::text);

select test_set_auth_uid('c5000000-0000-0000-0000-000000000002');

select throws_ok(
  $$ select public.create_activity_assignment(t_id('pos_ms'), 'c5000000-0000-0000-0000-0000000e0010') $$,
  '42501', null,
  'Un miembro sin assignment.manage no crea asignaciones'
);

select is(public.send_activity_assignments(t_id('act_mem'), null), 0,
  'Un miembro sin capability no envía nada al enviar todas las propuestas');

select throws_ok(
  $$ select public.send_activity_assignments(t_id('act_mem'), array[t_id('mem_prop')]) $$,
  '42501', null,
  'Un miembro sin capability no puede enviar asignaciones concretas'
);

select throws_ok(
  $$ select public.cancel_activity_assignment(t_id('mem_prop')) $$,
  '42501', null,
  'Un miembro sin capability no retira asignaciones'
);

select throws_ok(
  $$ select * from public.preview_assignment_eligibility(t_id('pos_ms'), 'c5000000-0000-0000-0000-0000000e0010') $$,
  '42501', null,
  'Un miembro sin capability no consulta elegibilidad'
);

-- Otra iglesia.
select test_set_auth_uid('c5000000-0000-0000-0000-000000000006');

select throws_ok(
  $$ select public.create_activity_assignment(t_id('pos_ms'), 'c5000000-0000-0000-0000-0000000e0010') $$,
  'P0002', null,
  'Un usuario de otra iglesia recibe P0002 al crear'
);

select throws_ok(
  $$ select public.cancel_activity_assignment(t_id('mem_prop')) $$,
  'P0002', null,
  'Un usuario de otra iglesia recibe P0002 al retirar'
);

select throws_ok(
  $$ select public.send_activity_assignments(t_id('act_mem'), null) $$,
  'P0002', null,
  'Un usuario de otra iglesia recibe P0002 al enviar'
);

select throws_ok(
  $$ select public.record_assignment_response(t_id('mem_prop'), 'accepted') $$,
  'P0002', null,
  'Un usuario de otra iglesia recibe P0002 al registrar respuestas'
);

select throws_ok(
  $$ select public.request_assignment_substitution(t_id('mem_prop')) $$,
  'P0002', null,
  'Un usuario de otra iglesia recibe P0002 al pedir sustitución'
);

-- ============================================================
-- 2. Lectura mínima de la persona asignada
-- ============================================================
select test_set_auth_uid('c5000000-0000-0000-0000-000000000007');

select ok(
  (select count(*) = 0 from activities where id = t_id('act_priv'))
  and (select count(*) = 0 from activity_plan_items where activity_id = t_id('act_priv')),
  'Sin asignación, la persona no lee la actividad privada ni su plan'
);

select test_set_auth_uid('c5000000-0000-0000-0000-000000000001');
select t_set('ap7', t_asg(t_id('pos_ps'), 'c5000000-0000-0000-0000-0000000e0007')::text);

select test_set_auth_uid('c5000000-0000-0000-0000-000000000007');

select ok(
  (select count(*) = 0 from activities where id = t_id('act_priv'))
  and (select count(*) = 0 from activity_assignments where id = t_id('ap7')),
  'Con una propuesta (proposed) la persona no lee la actividad privada ni la propia propuesta'
);

select test_set_auth_uid('c5000000-0000-0000-0000-000000000001');
select public.send_activity_assignments(t_id('act_priv'), array[t_id('ap7')]);
select t_set('ap8', t_asg(t_id('pos_pm'), 'c5000000-0000-0000-0000-0000000e0008', '{"send":true}')::text);
select public.record_assignment_response(t_id('ap8'), 'accepted');

select test_set_auth_uid('c5000000-0000-0000-0000-000000000007');

select is((select count(*)::int from activities where id = t_id('act_priv')), 1,
  'Con la asignación enviada (pending) la persona lee la actividad privada');

select ok(
  (select count(*) = 1 from activity_plan_items where activity_id = t_id('act_priv'))
  and (select count(*) = 2 from activity_positions where activity_id = t_id('act_priv')),
  'La persona asignada lee el plan y la estructura de la actividad'
);

select is((select count(*)::int from activity_admin_notes where activity_id = t_id('act_priv')), 0,
  'La persona asignada no lee las notas administrativas');

select is((select count(*)::int from activity_assignments where activity_id = t_id('act_priv')), 1,
  'La persona asignada solo ve su propia asignación, no las de otras personas (ni aceptadas)');

select is((select count(*)::int from activity_assignments where id = t_id('ap8')), 0,
  'La persona asignada no ve la asignación aceptada de otra persona en la actividad privada');

select test_set_auth_uid('c5000000-0000-0000-0000-000000000008');

select ok(
  (select count(*) = 1 from activities where id = t_id('act_priv'))
  and (select count(*) = 1 from activity_assignments where activity_id = t_id('act_priv')),
  'Con la asignación aceptada la persona lee la actividad y solo su asignación'
);

select test_set_auth_uid('c5000000-0000-0000-0000-000000000002');

select ok(
  (select count(*) = 0 from activities where id = t_id('act_priv'))
  and (select count(*) = 0 from activity_assignments where activity_id = t_id('act_priv')),
  'Un miembro no asignado sigue sin leer la actividad privada ni sus asignaciones'
);

-- Nota privada y pérdida de acceso al rechazar.
select test_set_auth_uid('c5000000-0000-0000-0000-000000000007');

select lives_ok(
  $$ select public.respond_activity_assignment(t_id('ap7'), 'declined', null, 'No puedo ese día') $$,
  'La persona rechaza con una nota privada'
);

select ok(
  (select count(*) = 1 from activity_assignment_notes where assignment_id = t_id('ap7'))
  and (select count(*) = 1 from activity_assignments where id = t_id('ap7')),
  'La persona sigue viendo su asignación rechazada y su nota'
);

select is((select count(*)::int from activities where id = t_id('act_priv')), 0,
  'Tras rechazar, la persona deja de leer la actividad privada');

select test_set_auth_uid('c5000000-0000-0000-0000-000000000001');

select ok(
  (select count(*) = 0 from activity_assignment_notes where assignment_id = t_id('ap7'))
  and (select count(*) = 1 from activity_assignments where id = t_id('ap7')),
  'El propietario ve la asignación rechazada pero no la nota privada (0 filas)'
);

select test_set_auth_uid('c5000000-0000-0000-0000-000000000004');

select is((select count(*)::int from activity_assignment_notes where assignment_id = t_id('ap7')), 0,
  'El líder del área tampoco ve la nota privada');

select is((select count(*)::int from activity_assignment_notes), 0,
  'Nadie distinto de la persona ve notas privadas');

-- ============================================================
-- 3. Visibilidad del equipo
-- ============================================================
select test_set_auth_uid('c5000000-0000-0000-0000-000000000001');
select t_set('m_acc', t_asg(t_id('pos_ms'), 'c5000000-0000-0000-0000-0000000e0010', '{"send":true}')::text);
select public.record_assignment_response(t_id('m_acc'), 'accepted');
select t_set('m_pend', t_asg(t_id('pos_ms'), 'c5000000-0000-0000-0000-0000000e0011', '{"send":true}')::text);
-- mem_prop (e12) sigue en proposed.

select is((select count(*)::int from activity_assignments where activity_id = t_id('act_mem')), 3,
  'Quien gestiona ve todas las asignaciones (aceptada, pendiente y propuesta)');

select ok(
  (select assigned_count = 1 and pending_count = 1 and proposed_count = 1 and expected_count = 3
   from public.activity_position_coverage(t_id('act_mem')) where activity_position_id = t_id('pos_ms')),
  'La cobertura para quien gestiona cuenta confirmadas, pendientes y propuestas'
);

select test_set_auth_uid('c5000000-0000-0000-0000-000000000002');

select is((select count(*)::int from activities where id = t_id('act_mem')), 1,
  'Un miembro lee la actividad publicada para miembros');

select ok(
  (select count(*) = 1 and bool_and(status = 'accepted') from activity_assignments where activity_id = t_id('act_mem')),
  'Un miembro solo ve las asignaciones aceptadas del equipo'
);

select ok(
  (select assigned_count = 1 and pending_count = 1 and proposed_count = 1 and expected_count = 3
   from public.activity_position_coverage(t_id('act_mem')) where activity_position_id = t_id('pos_ms'))
  and (select confirmed = 1 and pending = 1 and proposed = 1
       from public.activity_staffing_summary(array[t_id('act_mem')])),
  'Quien lee la actividad obtiene los mismos conteos de cobertura y resumen que quien la gestiona (sin nombres)'
);

select ok(
  (select count(*) = 0 from public.activity_position_coverage(t_id('act_priv')))
  and (select count(*) = 0 from public.activity_staffing_summary(array[t_id('act_priv')])),
  'Quien no puede leer la actividad no obtiene cobertura ni resumen (0 filas)'
);

select test_set_auth_uid('c5000000-0000-0000-0000-000000000004');

select is((select count(*)::int from activity_assignments where activity_id = t_id('act_mem')), 3,
  'El líder del área ve todas las asignaciones de los puestos de su área');

select ok(
  (select count(*) = 0 from activity_assignments where id = t_id('own_pm'))
  and (select count(*) = 1 from activity_assignments where id = t_id('ap8')),
  'El líder del área lee la actividad por su modelo original: de otra área solo ve el equipo aceptado, no las propuestas'
);

select test_set_auth_uid('c5000000-0000-0000-0000-000000000003');

select is((select count(*)::int from activity_assignments where activity_id = t_id('act_mem')), 1,
  'El admin de otra sede solo ve el equipo confirmado de una actividad para miembros');

-- ============================================================
-- 4. Solicitudes de sustitución
-- ============================================================
select test_set_auth_uid('c5000000-0000-0000-0000-000000000008');
select t_set('req8', public.request_assignment_substitution(t_id('ap8')) ->> 'request_id');

select is((select count(*)::int from activity_substitution_requests where id = t_id('req8')), 1,
  'La persona ve su propia solicitud de sustitución');

select test_set_auth_uid('c5000000-0000-0000-0000-000000000001');

select is((select count(*)::int from activity_substitution_requests where id = t_id('req8')), 1,
  'Quien gestiona el puesto ve la solicitud');

select test_set_auth_uid('c5000000-0000-0000-0000-000000000002');

select is((select count(*)::int from activity_substitution_requests where id = t_id('req8')), 0,
  'Un miembro ajeno no ve la solicitud');

select test_set_auth_uid('c5000000-0000-0000-0000-000000000004');

select is((select count(*)::int from activity_substitution_requests where id = t_id('req8')), 0,
  'El líder de otra área no ve la solicitud');

select throws_ok(
  $$ select public.propose_substitution_candidate(t_id('req8'), 'c5000000-0000-0000-0000-0000000e0010') $$,
  '42501', null,
  'El líder de otra área no propone candidatos'
);

-- ============================================================
-- 5. Escrituras directas denegadas (incluso al propietario)
-- ============================================================
select test_set_auth_uid('c5000000-0000-0000-0000-000000000001');

select throws_ok(
  format($$ insert into activity_assignments (church_id, activity_id, activity_position_id, person_id, position_name)
            values ('%s', '%s', '%s', 'c5000000-0000-0000-0000-0000000e0012', 'x') $$,
         t_id('church_a'), t_id('act_priv'), t_id('pos_ps')),
  '42501', null,
  'INSERT directo en activity_assignments denegado'
);

select throws_ok(
  $$ update activity_assignments set status = 'accepted' where id = t_id('m_pend') $$,
  '42501', null,
  'UPDATE directo en activity_assignments denegado'
);

select throws_ok(
  $$ delete from activity_assignments where id = t_id('m_pend') $$,
  '42501', null,
  'DELETE directo en activity_assignments denegado'
);

select throws_ok(
  format($$ insert into activity_assignment_notes (assignment_id, church_id, person_id, note)
            values ('%s', '%s', 'c5000000-0000-0000-0000-0000000e0011', 'x') $$, t_id('m_pend'), t_id('church_a')),
  '42501', null,
  'INSERT directo en activity_assignment_notes denegado'
);

select throws_ok(
  format($$ insert into activity_substitution_requests (church_id, activity_id, original_assignment_id, requested_by_self)
            values ('%s', '%s', '%s', false) $$, t_id('church_a'), t_id('act_mem'), t_id('m_acc')),
  '42501', null,
  'INSERT directo en activity_substitution_requests denegado'
);

select throws_ok(
  $$ update activity_substitution_requests set status = 'cancelled', cancelled_at = now() where id = t_id('req8') $$,
  '42501', null,
  'UPDATE directo en activity_substitution_requests denegado'
);

select test_set_auth_uid('c5000000-0000-0000-0000-000000000007');

select throws_ok(
  $$ delete from activity_assignment_notes where assignment_id = t_id('ap7') $$,
  '42501', null,
  'La propia persona tampoco borra su nota directamente (solo por RPC)'
);

-- ============================================================
-- 6. anon y aislamiento
-- ============================================================
select set_config('request.jwt.claims', '', true);
select set_config('role', 'anon', true);

select throws_ok(
  $$ select count(*) from activity_assignments $$,
  '42501', null,
  'anon no puede leer activity_assignments'
);

select throws_ok(
  $$ select public.create_activity_assignment(t_id('pos_ms'), 'c5000000-0000-0000-0000-0000000e0010') $$,
  '42501', null,
  'anon no puede ejecutar create_activity_assignment'
);

select test_set_auth_uid('c5000000-0000-0000-0000-000000000006');

select ok(
  (select count(*) = 0 from activity_assignments where church_id = t_id('church_a'))
  and (select count(*) = 0 from activity_assignment_notes where church_id = t_id('church_a'))
  and (select count(*) = 0 from activity_substitution_requests where church_id = t_id('church_a')),
  'Otra iglesia no ve asignaciones, notas ni solicitudes de Church A'
);

select is((select count(*)::int from public.activity_position_coverage(t_id('act_mem'))), 0,
  'Otra iglesia no obtiene la cobertura de puestos de Church A');

select is((select count(*)::int from public.activity_assignment_review(t_id('act_mem'))), 0,
  'Otra iglesia no obtiene la revisión de elegibilidad de Church A');

-- ============================================================
-- 7. Módulo Servicios deshabilitado
-- ============================================================
reset role;
update church_modules set status = 'disabled'
where church_id = t_id('church_a') and module_key = 'serving';

select test_set_auth_uid('c5000000-0000-0000-0000-000000000001');

select throws_ok(
  $$ select * from public.preview_assignment_eligibility(t_id('pos_ms'), 'c5000000-0000-0000-0000-0000000e0010') $$,
  '42501', null,
  'Sin módulo Servicios no se consulta la elegibilidad (42501)'
);

select throws_ok(
  $$ select public.request_assignment_substitution(t_id('m_acc')) $$,
  '42501', null,
  'Sin módulo Servicios no se piden sustituciones (42501)'
);

select throws_ok(
  $$ select public.cancel_substitution_request(t_id('req8')) $$,
  '42501', null,
  'Sin módulo Servicios no se cancelan solicitudes de sustitución (42501)'
);

select is((select count(*)::int from public.activity_assignment_review(t_id('act_mem'))), 0,
  'Sin módulo Servicios la revisión de asignaciones devuelve 0 filas');

reset role;

select * from finish();
rollback;
