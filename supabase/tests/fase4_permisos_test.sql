-- Fase 4 · Tests de permisos de actividades: modelo de lectura (RLS y
-- audiencias), notas administrativas, scopes church/campus/service_area/
-- activity, publicación, escrituras directas denegadas, anon y lecturas de
-- permisos efectivos para la UI. Ver docs/adr/0013 y docs/adr/0017.

begin;
select plan(65);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function t_set(p_key text, p_value text) returns text as $$
  select set_config('t4p.' || p_key, coalesce(p_value, ''), true);
$$ language sql;

create or replace function t_id(p_key text) returns uuid as $$
  select nullif(current_setting('t4p.' || p_key, true), '')::uuid;
$$ language sql;

-- Usuarios:
--   01 propietario A · 02 miembro · 03 líder (audiencia leaders) · 04 editor
--   sin publicar · 05 admin de sede C2 · 06 líder de área Sonido · 07 editor
--   del plan de una actividad · 08 propietario B · 09 organizador
insert into auth.users (id, email) values
  ('b4000000-0000-0000-0000-000000000001', 'owner.p4pa@example.test'),
  ('b4000000-0000-0000-0000-000000000002', 'miembro.p4p@example.test'),
  ('b4000000-0000-0000-0000-000000000003', 'lider.p4p@example.test'),
  ('b4000000-0000-0000-0000-000000000004', 'editor.p4p@example.test'),
  ('b4000000-0000-0000-0000-000000000005', 'sede.p4p@example.test'),
  ('b4000000-0000-0000-0000-000000000006', 'area.p4p@example.test'),
  ('b4000000-0000-0000-0000-000000000007', 'plan.p4p@example.test'),
  ('b4000000-0000-0000-0000-000000000008', 'owner.p4pb@example.test'),
  ('b4000000-0000-0000-0000-000000000009', 'organizador.p4p@example.test');

select test_set_auth_uid('b4000000-0000-0000-0000-000000000001');
select t_set('church_a', out_church_id::text), t_set('campus_c1', out_campus_id::text)
from app.provision_church(
  'Church A P4P', 'church-a-p4perm', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'A4P', 'owner.p4pa@example.test', null, 'Sede C1', null, null, null, null,
  array['people', 'serving'], null
);

select test_set_auth_uid('b4000000-0000-0000-0000-000000000008');
select t_set('church_b', out_church_id::text)
from app.provision_church(
  'Church B P4P', 'church-b-p4perm', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'B4P', 'owner.p4pb@example.test', null, 'Sede B', null, null, null, null,
  array['people', 'serving'], null
);

reset role;

-- ============================================================
-- Setup (superusuario)
-- ============================================================
insert into campuses (id, church_id, name, slug)
values ('b4000000-0000-0000-0000-0000000c0002', t_id('church_a'), 'Sede C2', 'c2');

insert into people (id, user_id, first_name, last_name, source) values
  ('b4000000-0000-0000-0000-0000000e0002', 'b4000000-0000-0000-0000-000000000002', 'Mario', 'Miembro', 'manual'),
  ('b4000000-0000-0000-0000-0000000e0003', 'b4000000-0000-0000-0000-000000000003', 'Lucía', 'Líder', 'manual'),
  ('b4000000-0000-0000-0000-0000000e0004', 'b4000000-0000-0000-0000-000000000004', 'Elena', 'Editora', 'manual'),
  ('b4000000-0000-0000-0000-0000000e0005', 'b4000000-0000-0000-0000-000000000005', 'Sergio', 'Sede', 'manual'),
  ('b4000000-0000-0000-0000-0000000e0006', 'b4000000-0000-0000-0000-000000000006', 'Álvaro', 'Área', 'manual'),
  ('b4000000-0000-0000-0000-0000000e0007', 'b4000000-0000-0000-0000-000000000007', 'Paula', 'Plan', 'manual'),
  ('b4000000-0000-0000-0000-0000000e0009', 'b4000000-0000-0000-0000-000000000009', 'Óscar', 'Organizador', 'manual');

insert into church_people (id, church_id, person_id, relationship, source) values
  ('b4000000-0000-0000-0000-0000000f0002', t_id('church_a'), 'b4000000-0000-0000-0000-0000000e0002', 'member', 'manual'),
  ('b4000000-0000-0000-0000-0000000f0003', t_id('church_a'), 'b4000000-0000-0000-0000-0000000e0003', 'member', 'manual'),
  ('b4000000-0000-0000-0000-0000000f0004', t_id('church_a'), 'b4000000-0000-0000-0000-0000000e0004', 'member', 'manual'),
  ('b4000000-0000-0000-0000-0000000f0005', t_id('church_a'), 'b4000000-0000-0000-0000-0000000e0005', 'member', 'manual'),
  ('b4000000-0000-0000-0000-0000000f0006', t_id('church_a'), 'b4000000-0000-0000-0000-0000000e0006', 'member', 'manual'),
  ('b4000000-0000-0000-0000-0000000f0007', t_id('church_a'), 'b4000000-0000-0000-0000-0000000e0007', 'member', 'manual'),
  ('b4000000-0000-0000-0000-0000000f0009', t_id('church_a'), 'b4000000-0000-0000-0000-0000000e0009', 'member', 'manual');

-- Roles de prueba (se revierten con la transacción).
insert into roles (key, name) values
  ('test_p4_activity_editor', 'Editor de actividades sin publicar (test)'),
  ('test_p4_plan_editor', 'Editor de planning (test)');
insert into role_capabilities (role_key, capability_key) values
  ('test_p4_activity_editor', 'activity.read'),
  ('test_p4_activity_editor', 'activity.manage'),
  ('test_p4_activity_editor', 'activity.create'),
  ('test_p4_plan_editor', 'activity_plan.manage');

insert into service_areas (id, church_id, name, slug) values
  ('b4000000-0000-0000-0000-0000000a0001', t_id('church_a'), 'Sonido', 'sonido'),
  ('b4000000-0000-0000-0000-0000000a0002', t_id('church_a'), 'Multimedia', 'multimedia');

insert into service_positions (id, church_id, service_area_id, name, min_people) values
  ('b4000000-0000-0000-0000-0000000b0001', t_id('church_a'), 'b4000000-0000-0000-0000-0000000a0001', 'FOH', 1),
  ('b4000000-0000-0000-0000-0000000b0002', t_id('church_a'), 'b4000000-0000-0000-0000-0000000a0002', 'Proyección', 1);

insert into qualifications (id, church_id, name)
values ('b4000000-0000-0000-0000-0000000d0001', t_id('church_a'), 'Mesa');

insert into church_people_roles (church_id, church_people_id, role_key, scope_type, scope_id) values
  (t_id('church_a'), 'b4000000-0000-0000-0000-0000000f0002', 'member', 'church', null),
  (t_id('church_a'), 'b4000000-0000-0000-0000-0000000f0003', 'group_leader', 'church', null),
  (t_id('church_a'), 'b4000000-0000-0000-0000-0000000f0004', 'test_p4_activity_editor', 'church', null),
  (t_id('church_a'), 'b4000000-0000-0000-0000-0000000f0005', 'campus_admin', 'campus', 'b4000000-0000-0000-0000-0000000c0002'),
  (t_id('church_a'), 'b4000000-0000-0000-0000-0000000f0006', 'ministry_leader', 'service_area', 'b4000000-0000-0000-0000-0000000a0001'),
  (t_id('church_a'), 'b4000000-0000-0000-0000-0000000f0009', 'member', 'church', null);

-- Actividades creadas por el propietario.
select test_set_auth_uid('b4000000-0000-0000-0000-000000000001');

select t_set('pub_members', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P4P publicada miembros","visibility":"members","local_start":"2030-03-03T11:00","duration_minutes":60,"admin_notes":"Nota interna"}'::jsonb) ->> 'activity_id');
select t_set('pub_public', public.create_activity(t_id('church_a'),
  '{"type":"event","title":"P4P publicada futura web","visibility":"public_future","local_start":"2030-03-04T11:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pub_leaders', public.create_activity(t_id('church_a'),
  '{"type":"meeting","title":"P4P publicada líderes","visibility":"leaders","local_start":"2030-03-05T11:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pub_private', public.create_activity(t_id('church_a'),
  '{"type":"meeting","title":"P4P publicada privada","visibility":"private","local_start":"2030-03-06T11:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('draft_members', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P4P borrador","visibility":"members","local_start":"2030-03-07T11:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('draft_org', public.create_activity(t_id('church_a'),
  '{"type":"meeting","title":"P4P borrador organizador","local_start":"2030-03-08T11:00","duration_minutes":60,"organizer_person_id":"b4000000-0000-0000-0000-0000000e0009"}'::jsonb) ->> 'activity_id');
select t_set('camp2_act', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P4P sede C2","campus_id":"b4000000-0000-0000-0000-0000000c0002","local_start":"2030-03-09T11:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('area_act', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P4P con áreas","local_start":"2030-03-10T11:00","duration_minutes":60,"admin_notes":"Notas de áreas"}'::jsonb) ->> 'activity_id');
select t_set('plan_act', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P4P planning","local_start":"2030-03-11T11:00","duration_minutes":60}'::jsonb) ->> 'activity_id');

select public.transition_activity_status(t_id('pub_members'), 'published');
select public.transition_activity_status(t_id('pub_public'), 'published');
select public.transition_activity_status(t_id('pub_leaders'), 'published');
select public.transition_activity_status(t_id('pub_private'), 'published');

select t_set('area_s1', public.add_activity_area(t_id('area_act'), 'b4000000-0000-0000-0000-0000000a0001') ->> 'activity_service_area_id');
select t_set('area_s2', public.add_activity_area(t_id('area_act'), 'b4000000-0000-0000-0000-0000000a0002') ->> 'activity_service_area_id');
select t_set('pos_s1', (select id::text from activity_positions where activity_service_area_id = t_id('area_s1')));
select t_set('pos_s2', (select id::text from activity_positions where activity_service_area_id = t_id('area_s2')));

select public.save_activity_template(t_id('church_a'), null, '{"name":"P4P plantilla","type":"service"}'::jsonb);

reset role;
insert into church_people_roles (church_id, church_people_id, role_key, scope_type, scope_id)
values (t_id('church_a'), 'b4000000-0000-0000-0000-0000000f0007', 'test_p4_plan_editor', 'activity', t_id('plan_act'));

-- ============================================================
-- 1. Miembro
-- ============================================================
select test_set_auth_uid('b4000000-0000-0000-0000-000000000002');

select is((select count(*)::int from activities where id = t_id('pub_members')), 1,
  'Miembro ve una actividad publicada con visibilidad members');
select is((select count(*)::int from activities where id = t_id('pub_public')), 1,
  'Miembro ve una actividad publicada con visibilidad public_future');
select is((select count(*)::int from activities where id = t_id('draft_members')), 0,
  'Miembro no ve borradores');
select is((select count(*)::int from activities where id = t_id('pub_leaders')), 0,
  'Miembro no ve actividades para líderes');
select is((select count(*)::int from activities where id = t_id('pub_private')), 0,
  'Miembro no ve actividades privadas');
select is((select count(*)::int from activity_admin_notes where activity_id = t_id('pub_members')), 0,
  'Miembro no ve las notas administrativas de una actividad que sí puede ver');
select is((select count(*)::int from activity_positions where activity_id = t_id('area_act')), 0,
  'Miembro no ve la estructura de un borrador');
select is((select count(*)::int from activity_templates where church_id = t_id('church_a')), 0,
  'Miembro sin permiso de creación no ve plantillas');

select throws_ok(
  $$ select public.create_activity(t_id('church_a'), '{"type":"meeting","title":"Miembro crea","local_start":"2030-03-12T11:00","duration_minutes":60}'::jsonb) $$,
  '42501', null,
  'Miembro no puede crear actividades'
);

select throws_ok(
  $$ select public.update_activity(t_id('pub_members'), '{"title":"Miembro edita"}'::jsonb) $$,
  '42501', null,
  'Miembro no puede editar actividades'
);

select ok(
  (select (c ->> 'manage')::boolean = false and (c ->> 'read_admin_notes')::boolean = false
   from public.activity_capabilities(t_id('pub_members')) c),
  'activity_capabilities del miembro: sin gestión ni notas'
);

-- ============================================================
-- 2. Audiencia leaders y organizador
-- ============================================================
select test_set_auth_uid('b4000000-0000-0000-0000-000000000003');

select is((select count(*)::int from activities where id = t_id('pub_leaders')), 1,
  'Un líder ve las actividades publicadas para líderes');
select is((select count(*)::int from activities where id in (t_id('pub_private'), t_id('draft_members'))), 0,
  'Un líder sin permisos de actividad no ve privadas ni borradores');

select test_set_auth_uid('b4000000-0000-0000-0000-000000000009');

select is((select count(*)::int from activities where id = t_id('draft_org')), 1,
  'El organizador ve su propio borrador');
select is((select count(*)::int from activities where id = t_id('draft_members')), 0,
  'El organizador no ve otros borradores');

-- ============================================================
-- 3. Propietario
-- ============================================================
select test_set_auth_uid('b4000000-0000-0000-0000-000000000001');

select is((select count(*)::int from activities where church_id = t_id('church_a') and title like 'P4P %'), 9,
  'El propietario ve todas las actividades en cualquier estado');
select is((select count(*)::int from activity_admin_notes where activity_id in (t_id('pub_members'), t_id('area_act'))), 2,
  'El propietario ve las notas administrativas');
select is((select count(*)::int from activity_templates where church_id = t_id('church_a')), 1,
  'El propietario ve las plantillas');

-- ============================================================
-- 4. Gestión sin publicación
-- ============================================================
select test_set_auth_uid('b4000000-0000-0000-0000-000000000004');

select is((select count(*)::int from activities where id = t_id('draft_members')), 1,
  'Con activity.read de iglesia se ven borradores');

select lives_ok(
  $$ select public.update_activity(t_id('draft_members'), '{"title":"P4P borrador editado"}'::jsonb) $$,
  'Con activity.manage se edita la actividad'
);

select throws_ok(
  $$ select public.transition_activity_status(t_id('draft_members'), 'published') $$,
  '42501', null,
  'Con activity.manage pero sin activity.publish no se puede publicar'
);

select throws_ok(
  $$ select public.transition_activity_status(t_id('draft_members'), 'cancelled', 'x') $$,
  '42501', null,
  'Sin activity.cancel no se puede cancelar'
);

-- ============================================================
-- 5. Scope campus
-- ============================================================
select test_set_auth_uid('b4000000-0000-0000-0000-000000000005');

select is((select count(*)::int from activities where id = t_id('camp2_act')), 1,
  'Admin de sede ve los borradores de su sede');
select is((select count(*)::int from activities where id = t_id('draft_members')), 0,
  'Admin de sede no ve borradores globales de la iglesia');

select lives_ok(
  $$ select public.update_activity(t_id('camp2_act'), '{"title":"P4P sede C2 editada"}'::jsonb) $$,
  'Admin de sede edita actividades de su sede'
);

select throws_ok(
  $$ select public.update_activity(t_id('draft_members'), '{"title":"Intento"}'::jsonb) $$,
  '42501', null,
  'Admin de sede no edita actividades globales'
);

select throws_ok(
  $$ select public.create_activity(t_id('church_a'), '{"type":"meeting","title":"Global sede","local_start":"2030-03-12T11:00","duration_minutes":60}'::jsonb) $$,
  '42501', null,
  'Admin de sede no crea actividades globales'
);

select lives_ok(
  $$ select public.create_activity(t_id('church_a'), '{"type":"meeting","title":"C2 sede","campus_id":"b4000000-0000-0000-0000-0000000c0002","local_start":"2030-03-12T11:00","duration_minutes":60}'::jsonb) $$,
  'Admin de sede crea actividades en su sede'
);

select throws_ok(
  $$ select public.create_activity(t_id('church_a'), jsonb_build_object('type', 'meeting', 'title', 'C1 sede', 'campus_id', t_id('campus_c1'), 'local_start', '2030-03-12T11:00', 'duration_minutes', 60)) $$,
  '42501', null,
  'Admin de sede no crea actividades en otra sede'
);

select lives_ok(
  $$ select public.transition_activity_status(t_id('camp2_act'), 'published') $$,
  'Admin de sede publica actividades de su sede'
);

select throws_ok(
  $$ select public.update_activity(t_id('camp2_act'), jsonb_build_object('campus_id', t_id('campus_c1'))) $$,
  '42501', null,
  'Admin de sede no puede mover una actividad a otra sede'
);

select ok(
  (select (s ->> 'create_church')::boolean = false
      and s -> 'create_campus_ids' = '["b4000000-0000-0000-0000-0000000c0002"]'::jsonb
      and (s ->> 'read_all')::boolean = false
   from public.activity_creation_scopes(t_id('church_a')) s),
  'activity_creation_scopes del admin de sede: solo su sede'
);

-- ============================================================
-- 6. Scope service_area (líder de área)
-- ============================================================
select test_set_auth_uid('b4000000-0000-0000-0000-000000000006');

select is((select count(*)::int from activities where id = t_id('area_act')), 1,
  'Líder de área ve el borrador donde participa su área');
select is((select count(*)::int from activities where id = t_id('draft_members')), 0,
  'Líder de área no ve borradores sin su área');
select is((select count(*)::int from activity_admin_notes where activity_id = t_id('area_act')), 0,
  'Líder de área no ve las notas administrativas');

select lives_ok(
  $$ select t_set('pos_adhoc', public.add_activity_position(t_id('area_s1'), '{"name":"Ayudante sonido","min_people":0}'::jsonb)::text) $$,
  'Líder de área añade puestos en su área'
);

select lives_ok(
  $$ select public.update_activity_position(t_id('pos_s1'), '{"min_people":2}'::jsonb) $$,
  'Líder de área ajusta puestos de su área'
);

select lives_ok(
  $$ select public.save_activity_position_requirement(t_id('pos_s1'), null,
       '{"requirement_type":"qualification","qualification_id":"b4000000-0000-0000-0000-0000000d0001"}'::jsonb) $$,
  'Líder de área añade requisitos a puestos de su área'
);

select throws_ok(
  $$ select public.add_activity_position(t_id('area_s2'), '{"name":"Intruso"}'::jsonb) $$,
  '42501', null,
  'Líder de área no añade puestos en otra área'
);

select throws_ok(
  $$ select public.update_activity_position(t_id('pos_s2'), '{"min_people":3}'::jsonb) $$,
  '42501', null,
  'Líder de área no edita puestos de otra área'
);

select throws_ok(
  $$ select public.add_activity_area(t_id('area_act'), 'b4000000-0000-0000-0000-0000000a0002') $$,
  '42501', null,
  'Líder de área no añade áreas'
);

select throws_ok(
  $$ select public.update_activity(t_id('area_act'), '{"title":"Editado por líder"}'::jsonb) $$,
  '42501', null,
  'Líder de área no edita la actividad raíz'
);

select throws_ok(
  $$ select public.transition_activity_status(t_id('area_act'), 'published') $$,
  '42501', null,
  'Líder de área no publica'
);

select throws_ok(
  $$ select public.transition_activity_status(t_id('area_act'), 'cancelled', 'x') $$,
  '42501', null,
  'Líder de área no cancela'
);

select throws_ok(
  $$ select public.transition_activity_status(t_id('area_act'), 'archived') $$,
  '42501', null,
  'Líder de área no archiva'
);

select throws_ok(
  $$ select public.add_activity_plan_item(t_id('area_act'), '{"title":"Bloque líder"}'::jsonb) $$,
  '42501', null,
  'Líder de área no gestiona el planning'
);

select ok(
  (select (c ->> 'manage')::boolean = false and (c ->> 'publish')::boolean = false
      and (c ->> 'manage_plan')::boolean = false and (c ->> 'read_admin_notes')::boolean = false
   from public.activity_capabilities(t_id('area_act')) c),
  'activity_capabilities del líder de área: sin gestión de la actividad'
);

select ok(
  (select (c -> 'manage_positions_by_area' ->> t_id('area_s1')::text)::boolean = true
      and (c -> 'manage_positions_by_area' ->> t_id('area_s2')::text)::boolean = false
   from public.activity_capabilities(t_id('area_act')) c),
  'manage_positions_by_area solo es true para el área del líder'
);

-- ============================================================
-- 7. Scope activity (planning)
-- ============================================================
select test_set_auth_uid('b4000000-0000-0000-0000-000000000007');

select is((select count(*)::int from activities where id = t_id('plan_act')), 1,
  'Con activity_plan.manage en scope activity se ve esa actividad');
select is((select count(*)::int from activities where id = t_id('draft_members')), 0,
  'El scope activity no da acceso a otras actividades');

select lives_ok(
  $$ select public.add_activity_plan_item(t_id('plan_act'), '{"item_type":"song","title":"Alabanza"}'::jsonb) $$,
  'Con activity_plan.manage en scope activity se gestiona su planning'
);

select throws_ok(
  $$ select public.update_activity(t_id('plan_act'), '{"title":"Editado desde plan"}'::jsonb) $$,
  '42501', null,
  'activity_plan.manage no permite editar la actividad raíz'
);

select throws_ok(
  $$ select public.add_activity_plan_item(t_id('draft_members'), '{"title":"Otro plan"}'::jsonb) $$,
  '42501', null,
  'activity_plan.manage en scope activity no sirve para otra actividad'
);

-- ============================================================
-- 8. Otra iglesia
-- ============================================================
select test_set_auth_uid('b4000000-0000-0000-0000-000000000008');

select is((select count(*)::int from activities where church_id = t_id('church_a')), 0,
  'Otra iglesia no ve actividades de Church A');
select ok((select public.activity_capabilities(t_id('area_act')) is null),
  'activity_capabilities devuelve null para otra iglesia');
select ok((select public.activity_creation_scopes(t_id('church_a')) is null),
  'activity_creation_scopes devuelve null para otra iglesia');

select throws_ok(
  $$ select public.add_activity_plan_item(t_id('area_act'), '{"title":"Intruso"}'::jsonb) $$,
  'P0002', null,
  'Otra iglesia recibe "no existe" al gestionar el planning'
);

-- ============================================================
-- 9. Escrituras directas denegadas (incluso al propietario)
-- ============================================================
select test_set_auth_uid('b4000000-0000-0000-0000-000000000001');

select throws_ok(
  format($$ insert into activities (church_id, type, title, starts_at, ends_at, timezone)
            values ('%s', 'meeting', 'Directa', '2030-01-01 10:00+00', '2030-01-01 11:00+00', 'Europe/Madrid') $$, t_id('church_a')),
  '42501', null,
  'INSERT directo en activities denegado'
);

select throws_ok(
  $$ update activities set title = 'Directa' where id = t_id('draft_members') $$,
  '42501', null,
  'UPDATE directo en activities denegado'
);

select throws_ok(
  $$ delete from activity_plan_items where activity_id = t_id('plan_act') $$,
  '42501', null,
  'DELETE directo en activity_plan_items denegado'
);

select throws_ok(
  $$ update activity_positions set min_people = 5 where id = t_id('pos_s1') $$,
  '42501', null,
  'UPDATE directo en activity_positions denegado'
);

select throws_ok(
  format($$ insert into activity_templates (church_id, name, type) values ('%s', 'Directa', 'service') $$, t_id('church_a')),
  '42501', null,
  'INSERT directo en activity_templates denegado'
);

select throws_ok(
  format($$ insert into activity_admin_notes (activity_id, church_id, notes) values ('%s', '%s', 'x') $$, t_id('draft_members'), t_id('church_a')),
  '42501', null,
  'INSERT directo en activity_admin_notes denegado'
);

-- ============================================================
-- 10. anon
-- ============================================================
select set_config('request.jwt.claims', '', true);
select set_config('role', 'anon', true);

select throws_ok(
  $$ select count(*) from activities $$,
  '42501', null,
  'anon no puede leer activities'
);

select throws_ok(
  $$ select public.create_activity(t_id('church_a'), '{"type":"meeting","title":"Anon","local_start":"2030-03-12T11:00","duration_minutes":60}'::jsonb) $$,
  '42501', null,
  'anon no puede ejecutar create_activity'
);

reset role;

select * from finish();
rollback;
