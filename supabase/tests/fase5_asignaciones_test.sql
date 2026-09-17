-- Fase 5 · Tests de asignaciones: referencias temporales, elegibilidad por
-- fecha de actividad, avisos y conflictos (solapes, sede, disponibilidad),
-- creación/envío/retirada con versión, concurrencia, cobertura e integración
-- con los cambios de Fase 4 (cancelar, archivar, reprogramar, series,
-- eliminar estructura, duplicar). Ver migraciones 20260922000100..0500.

begin;
select plan(105);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function t_set(p_key text, p_value text) returns text as $$
  select set_config('t5a.' || p_key, coalesce(p_value, ''), true);
$$ language sql;

create or replace function t_id(p_key text) returns uuid as $$
  select nullif(current_setting('t5a.' || p_key, true), '')::uuid;
$$ language sql;

-- Ejecuta SQL y devuelve 'ok' o 'SQLSTATE:DETAIL' (para comprobar los códigos
-- de bloqueo y aviso que viajan en DETAIL).
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

create or replace function t_pos_of(p_activity uuid) returns uuid as $$
  select id from activity_positions where activity_id = p_activity order by sort_order, created_at limit 1;
$$ language sql;

create or replace function t_asg(p_pos uuid, p_person uuid, p_input jsonb default '{}') returns uuid as $$
  select (public.create_activity_assignment(p_pos, p_person, p_input) ->> 'assignment_id')::uuid;
$$ language sql;

create or replace function t_respond(p_asg uuid, p_response text) returns void as $$
begin
  perform public.send_activity_assignments((select activity_id from activity_assignments where id = p_asg), array[p_asg]);
  perform public.record_assignment_response(p_asg, p_response);
end;
$$ language plpgsql;

create or replace function t_state(p_asg uuid) returns text as $$
  select status::text || ':' || version from activity_assignments where id = p_asg;
$$ language sql;

create or replace function t_blocking(p_pos uuid, p_person uuid) returns text[] as $$
  select blocking from public.preview_assignment_eligibility(p_pos, p_person);
$$ language sql;

create or replace function t_warnings(p_pos uuid, p_person uuid) returns text[] as $$
  select warnings from public.preview_assignment_eligibility(p_pos, p_person);
$$ language sql;

-- Usuarios: 01 propietario A · 02 propietario B · 03 líder del área Sonido
insert into auth.users (id, email) values
  ('a5000000-0000-0000-0000-000000000001', 'owner.p5a@example.test'),
  ('a5000000-0000-0000-0000-000000000002', 'owner.p5b@example.test'),
  ('a5000000-0000-0000-0000-000000000003', 'lider.p5a@example.test');

select test_set_auth_uid('a5000000-0000-0000-0000-000000000001');
select t_set('church_a', out_church_id::text), t_set('campus_a1', out_campus_id::text)
from app.provision_church(
  'Church A P5', 'church-a-p5asig', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'A5', 'owner.p5a@example.test', null, 'Sede A5', null, null, null, null,
  array['people', 'serving'], null
);

select test_set_auth_uid('a5000000-0000-0000-0000-000000000002');
select t_set('church_b', out_church_id::text)
from app.provision_church(
  'Church B P5', 'church-b-p5asig', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'B5', 'owner.p5b@example.test', null, 'Sede B5', null, null, null, null,
  array['people', 'serving'], null
);

reset role;

-- ============================================================
-- Setup de catálogo (superusuario)
-- ============================================================
insert into campuses (id, church_id, name, slug)
values ('a5000000-0000-0000-0000-0000000c0002', t_id('church_a'), 'Sede Norte P5', 'norte-p5');

insert into people (id, user_id, first_name, last_name, source) values
  ('a5000000-0000-0000-0000-0000000e0001', null, 'Pedro', 'Autónomo', 'manual'),
  ('a5000000-0000-0000-0000-0000000e0002', null, 'Ana', 'Archivada', 'manual'),
  ('a5000000-0000-0000-0000-0000000e0003', null, 'Berta', 'OtraIglesia', 'manual'),
  ('a5000000-0000-0000-0000-0000000e0004', null, 'Carlos', 'Aprendiz', 'manual'),
  ('a5000000-0000-0000-0000-0000000e0005', null, 'Diana', 'SinÁrea', 'manual'),
  ('a5000000-0000-0000-0000-0000000e0006', null, 'Elena', 'Inactiva', 'manual'),
  ('a5000000-0000-0000-0000-0000000e0007', null, 'Fermín', 'Norte', 'manual'),
  ('a5000000-0000-0000-0000-0000000e0008', null, 'Gloria', 'MesaCaducada', 'manual'),
  ('a5000000-0000-0000-0000-0000000e0009', null, 'Hugo', 'CaducaDurante', 'manual'),
  ('a5000000-0000-0000-0000-0000000e0010', null, 'Irene', 'CaducaDespués', 'manual'),
  ('a5000000-0000-0000-0000-0000000e0011', null, 'Julia', 'CredencialExpirada', 'manual'),
  ('a5000000-0000-0000-0000-0000000e0012', null, 'Kike', 'Básico', 'manual'),
  ('a5000000-0000-0000-0000-0000000e0013', null, 'Lola', 'Básica', 'manual'),
  ('a5000000-0000-0000-0000-0000000e0020', 'a5000000-0000-0000-0000-000000000003', 'Luis', 'Líder', 'manual');

insert into church_people (id, church_id, person_id, relationship, source, archived_at, primary_campus_id) values
  (default, t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0001', 'member', 'manual', null, null),
  (default, t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0002', 'member', 'manual', now(), null),
  (default, t_id('church_b'), 'a5000000-0000-0000-0000-0000000e0003', 'member', 'manual', null, null),
  (default, t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0004', 'member', 'manual', null, null),
  (default, t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0005', 'member', 'manual', null, null),
  (default, t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0006', 'member', 'manual', null, null),
  (default, t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0007', 'member', 'manual', null, 'a5000000-0000-0000-0000-0000000c0002'),
  (default, t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0008', 'member', 'manual', null, null),
  (default, t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0009', 'member', 'manual', null, null),
  (default, t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0010', 'member', 'manual', null, null),
  (default, t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0011', 'member', 'manual', null, null),
  (default, t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0012', 'member', 'manual', null, null),
  (default, t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0013', 'member', 'manual', null, null),
  ('a5000000-0000-0000-0000-0000000f0020', t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0020', 'member', 'manual', null, null);

insert into service_areas (id, church_id, name, slug) values
  ('a5000000-0000-0000-0000-0000000a0001', t_id('church_a'), 'Sonido P5', 'sonido-p5'),
  ('a5000000-0000-0000-0000-0000000a0002', t_id('church_a'), 'Multimedia P5', 'multimedia-p5');

insert into church_people_roles (church_id, church_people_id, role_key, scope_type, scope_id)
values (t_id('church_a'), 'a5000000-0000-0000-0000-0000000f0020', 'ministry_leader', 'service_area', 'a5000000-0000-0000-0000-0000000a0001');

insert into service_area_members (church_id, service_area_id, person_id, status, level) values
  (t_id('church_a'), 'a5000000-0000-0000-0000-0000000a0001', 'a5000000-0000-0000-0000-0000000e0001', 'active', 'autonomous'),
  (t_id('church_a'), 'a5000000-0000-0000-0000-0000000a0001', 'a5000000-0000-0000-0000-0000000e0002', 'active', 'autonomous'),
  (t_id('church_a'), 'a5000000-0000-0000-0000-0000000a0001', 'a5000000-0000-0000-0000-0000000e0004', 'active', 'trainee'),
  (t_id('church_a'), 'a5000000-0000-0000-0000-0000000a0001', 'a5000000-0000-0000-0000-0000000e0006', 'inactive', 'autonomous'),
  (t_id('church_a'), 'a5000000-0000-0000-0000-0000000a0001', 'a5000000-0000-0000-0000-0000000e0007', 'active', 'autonomous'),
  (t_id('church_a'), 'a5000000-0000-0000-0000-0000000a0001', 'a5000000-0000-0000-0000-0000000e0008', 'active', 'autonomous'),
  (t_id('church_a'), 'a5000000-0000-0000-0000-0000000a0001', 'a5000000-0000-0000-0000-0000000e0009', 'active', 'autonomous'),
  (t_id('church_a'), 'a5000000-0000-0000-0000-0000000a0001', 'a5000000-0000-0000-0000-0000000e0010', 'active', 'autonomous'),
  (t_id('church_a'), 'a5000000-0000-0000-0000-0000000a0001', 'a5000000-0000-0000-0000-0000000e0011', 'active', 'autonomous'),
  (t_id('church_a'), 'a5000000-0000-0000-0000-0000000a0001', 'a5000000-0000-0000-0000-0000000e0012', 'active', 'autonomous'),
  (t_id('church_a'), 'a5000000-0000-0000-0000-0000000a0001', 'a5000000-0000-0000-0000-0000000e0013', 'active', 'autonomous');

insert into qualifications (id, church_id, name)
values ('a5000000-0000-0000-0000-0000000d0001', t_id('church_a'), 'Mesa P5');

insert into person_qualifications (church_id, person_id, qualification_id, level, expires_at) values
  (t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0001', 'a5000000-0000-0000-0000-0000000d0001', 'advanced', null),
  (t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0004', 'a5000000-0000-0000-0000-0000000d0001', 'basic', null),
  (t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0008', 'a5000000-0000-0000-0000-0000000d0001', 'advanced', '2031-01-01 00:00+00');

insert into credential_types (id, church_id, name, sensitive) values
  ('a5000000-0000-0000-0000-0000000d0101', t_id('church_a'), 'Primeros auxilios P5', false),
  ('a5000000-0000-0000-0000-0000000d0102', t_id('church_a'), 'Protección de menores P5', true);

insert into person_credentials (church_id, person_id, credential_type_id, status, expires_at) values
  (t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0001', 'a5000000-0000-0000-0000-0000000d0101', 'valid', null),
  (t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0001', 'a5000000-0000-0000-0000-0000000d0102', 'valid', null),
  (t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0011', 'a5000000-0000-0000-0000-0000000d0101', 'expired', '2020-01-01 00:00+00');

-- ============================================================
-- 1. Referencias temporales
-- ============================================================
select test_set_auth_uid('a5000000-0000-0000-0000-000000000001');

select t_set('act_main', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5 culto","local_start":"2031-03-02T10:00","duration_minutes":120}'::jsonb) ->> 'activity_id');
select t_set('task_win', public.create_activity(t_id('church_a'),
  '{"type":"task","title":"P5 tarea ventana","schedule_kind":"flexible","local_start":"2031-06-01T09:00","local_end":"2031-06-30T18:00"}'::jsonb) ->> 'activity_id');
select t_set('task_start', public.create_activity(t_id('church_a'),
  '{"type":"task","title":"P5 tarea inicio","schedule_kind":"flexible","local_start":"2031-06-01T09:00"}'::jsonb) ->> 'activity_id');
select t_set('task_none', public.create_activity(t_id('church_a'),
  '{"type":"task","title":"P5 tarea sin fechas","schedule_kind":"flexible"}'::jsonb) ->> 'activity_id');

reset role;

select ok(
  (select app.activity_eligibility_reference(a) = a.ends_at
      and app.activity_response_deadline(a) = a.starts_at
      and app.activity_time_range(a) = tstzrange(a.starts_at, a.ends_at, '[)')
   from activities a where a.id = t_id('act_main')),
  'Con horario: vigencias hasta el fin, plazo de respuesta hasta el inicio y rango semiabierto [inicio, fin)'
);

select ok(
  (select app.activity_eligibility_reference(a) = a.ends_at and app.activity_response_deadline(a) = a.ends_at
   from activities a where a.id = t_id('task_win')),
  'Tarea flexible con ventana: referencia y plazo = fin de la ventana'
);

select ok(
  (select app.activity_eligibility_reference(a) = a.starts_at and app.activity_response_deadline(a) is null
      and app.activity_time_range(a) is null
   from activities a where a.id = t_id('task_start')),
  'Tarea flexible solo con inicio: referencia = inicio, sin plazo de respuesta ni rango de solape'
);

select ok(
  (select app.activity_eligibility_reference(a) = now() and app.activity_response_deadline(a) is null
   from activities a where a.id = t_id('task_none')),
  'Tarea flexible sin fechas: referencia = momento de evaluar y sin plazo de respuesta'
);

-- Credenciales que caducan durante (Hugo) y justo después (Irene) del culto.
insert into person_credentials (church_id, person_id, credential_type_id, status, expires_at)
select t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0009', 'a5000000-0000-0000-0000-0000000d0101', 'valid', a.ends_at - interval '30 minutes'
from activities a where a.id = t_id('act_main');
insert into person_credentials (church_id, person_id, credential_type_id, status, expires_at)
select t_id('church_a'), 'a5000000-0000-0000-0000-0000000e0010', 'a5000000-0000-0000-0000-0000000d0101', 'valid', a.ends_at + interval '30 minutes'
from activities a where a.id = t_id('act_main');

-- ============================================================
-- 2. Elegibilidad (bloqueos y avisos de requisitos)
-- ============================================================
select test_set_auth_uid('a5000000-0000-0000-0000-000000000001');

select t_set('area_main', t_area(t_id('act_main'), 'a5000000-0000-0000-0000-0000000a0001')::text);
select t_set('pos_free', t_pos(t_id('area_main'), '{"name":"Libre","min_people":0}')::text);
select t_set('pos_auto', t_pos(t_id('area_main'), '{"name":"Autónomo","requires_autonomous_person":true}')::text);
select t_set('pos_qual', t_pos(t_id('area_main'), '{"name":"Mesa"}')::text);
select t_set('pos_cred', t_pos(t_id('area_main'), '{"name":"Auxilios"}')::text);
select t_set('pos_sens', t_pos(t_id('area_main'), '{"name":"Menores"}')::text);
select t_set('pos_rec', t_pos(t_id('area_main'), '{"name":"Recomendado"}')::text);
select t_set('pos_cap', t_pos(t_id('area_main'), '{"name":"Capacidad","min_people":1,"max_people":2}')::text);
select t_set('pos_mask', t_pos(t_id('area_main'), '{"name":"Enmascarado","min_people":0}')::text);

select public.save_activity_position_requirement(t_id('pos_qual'), null,
  '{"requirement_type":"qualification","qualification_id":"a5000000-0000-0000-0000-0000000d0001","min_level":"intermediate"}'::jsonb);
select public.save_activity_position_requirement(t_id('pos_cred'), null,
  '{"requirement_type":"credential","credential_type_id":"a5000000-0000-0000-0000-0000000d0101"}'::jsonb);
select public.save_activity_position_requirement(t_id('pos_sens'), null,
  '{"requirement_type":"credential","credential_type_id":"a5000000-0000-0000-0000-0000000d0102"}'::jsonb);
select public.save_activity_position_requirement(t_id('pos_rec'), null,
  '{"requirement_type":"qualification","qualification_id":"a5000000-0000-0000-0000-0000000d0001","strictness":"recommended"}'::jsonb);
select public.save_activity_position_requirement(t_id('pos_rec'), null,
  '{"requirement_type":"minimum_level","min_operational_level":"autonomous","strictness":"recommended"}'::jsonb);
select public.save_activity_position_requirement(t_id('pos_mask'), null,
  '{"requirement_type":"credential","credential_type_id":"a5000000-0000-0000-0000-0000000d0102","strictness":"recommended"}'::jsonb);
select public.save_activity_position_requirement(t_id('pos_mask'), null,
  '{"requirement_type":"qualification","qualification_id":"a5000000-0000-0000-0000-0000000d0001","strictness":"recommended"}'::jsonb);

select public.transition_activity_status(t_id('act_main'), 'published');

select ok(
  t_blocking(t_id('pos_free'), 'a5000000-0000-0000-0000-0000000e0001') = '{}'
  and t_warnings(t_id('pos_free'), 'a5000000-0000-0000-0000-0000000e0001') = '{}',
  'Una persona activa del área sin requisitos no tiene bloqueos ni avisos'
);

select is(t_blocking(t_id('pos_free'), 'a5000000-0000-0000-0000-0000000e0002'), array['inactive_person'],
  'Pertenencia archivada bloquea con inactive_person');

select is(t_blocking(t_id('pos_free'), 'a5000000-0000-0000-0000-0000000e0003'), array['inactive_person'],
  'Una persona de otra iglesia bloquea con inactive_person');

select ok(
  t_blocking(t_id('pos_auto'), 'a5000000-0000-0000-0000-0000000e0003') = array['inactive_person']
  and t_warnings(t_id('pos_auto'), 'a5000000-0000-0000-0000-0000000e0003') = '{}'
  and t_blocking(t_id('pos_rec'), 'a5000000-0000-0000-0000-0000000e0002') = array['inactive_person']
  and t_warnings(t_id('pos_rec'), 'a5000000-0000-0000-0000-0000000e0002') = '{}',
  'Sin pertenencia activa (otra iglesia o archivada) solo se devuelve inactive_person, sin más bloqueos ni avisos'
);

select is(t_blocking(t_id('pos_free'), 'a5000000-0000-0000-0000-0000000e0005'), array['not_area_member'],
  'Quien no es miembro del área bloquea con not_area_member');

select is(t_blocking(t_id('pos_free'), 'a5000000-0000-0000-0000-0000000e0006'), array['not_area_member'],
  'Un miembro del área con estado inactivo bloquea con not_area_member');

select is(t_blocking(t_id('pos_auto'), 'a5000000-0000-0000-0000-0000000e0004'), array['insufficient_level'],
  'requires_autonomous_person con nivel trainee bloquea con insufficient_level');

select ok(
  t_blocking(t_id('pos_auto'), 'a5000000-0000-0000-0000-0000000e0001') = '{}'
  and t_blocking(t_id('pos_auto'), 'a5000000-0000-0000-0000-0000000e0005') = array['not_area_member', 'insufficient_level'],
  'requires_autonomous_person: autónomo no bloquea; sin pertenencia bloquea por área y por nivel'
);

select is(t_blocking(t_id('pos_qual'), 'a5000000-0000-0000-0000-0000000e0004'), array['missing_qualification'],
  'Cualificación de nivel inferior al mínimo bloquea con missing_qualification');

select is(t_blocking(t_id('pos_qual'), 'a5000000-0000-0000-0000-0000000e0008'), array['qualification_expired_at_activity'],
  'Cualificación que caduca antes de la actividad bloquea con qualification_expired_at_activity');

select is(t_blocking(t_id('pos_cred'), 'a5000000-0000-0000-0000-0000000e0012'), array['missing_credential'],
  'Sin credencial obligatoria bloquea con missing_credential');

select is(t_blocking(t_id('pos_cred'), 'a5000000-0000-0000-0000-0000000e0011'), array['missing_credential'],
  'Una credencial en estado expired no cuenta como credencial válida');

select is(t_blocking(t_id('pos_cred'), 'a5000000-0000-0000-0000-0000000e0009'), array['credential_expired_at_activity'],
  'Credencial vigente hoy pero que caduca antes del fin de la actividad bloquea (credential_expired_at_activity)');

select is(t_blocking(t_id('pos_cred'), 'a5000000-0000-0000-0000-0000000e0010'), '{}'::text[],
  'Credencial que caduca después del fin de la actividad no bloquea');

select is(t_err($q$ select public.create_activity_assignment(t_id('pos_cred'), 'a5000000-0000-0000-0000-0000000e0009') $q$),
  '22023:credential_expired_at_activity',
  'Crear con un requisito obligatorio incumplido falla con 22023 y el código en DETAIL');

select is(t_blocking(t_id('pos_sens'), 'a5000000-0000-0000-0000-0000000e0012'), array['missing_credential'],
  'Con credential.sensitive.read, la credencial sensible ausente se detalla (missing_credential)');

select test_set_auth_uid('a5000000-0000-0000-0000-000000000003');

select is(t_blocking(t_id('pos_sens'), 'a5000000-0000-0000-0000-0000000e0012'), array['requirement_not_met'],
  'Sin credential.sensitive.read, la credencial sensible se oculta como requirement_not_met');

select is(t_blocking(t_id('pos_sens'), 'a5000000-0000-0000-0000-0000000e0001'), '{}'::text[],
  'Sin credential.sensitive.read, quien cumple el requisito sensible no queda bloqueado');

select test_set_auth_uid('a5000000-0000-0000-0000-000000000001');

select ok(
  t_blocking(t_id('pos_rec'), 'a5000000-0000-0000-0000-0000000e0004') = '{}'
  and t_warnings(t_id('pos_rec'), 'a5000000-0000-0000-0000-0000000e0004') = array['insufficient_level_recommended'],
  'Requisito de nivel recomendado incumplido avisa (insufficient_level_recommended) sin bloquear'
);

select is(t_warnings(t_id('pos_rec'), 'a5000000-0000-0000-0000-0000000e0012'), array['missing_qualification_recommended'],
  'Cualificación recomendada ausente avisa con missing_qualification_recommended');

select is(t_err($q$ select public.create_activity_assignment(t_id('pos_rec'), 'a5000000-0000-0000-0000-0000000e0004') $q$),
  'PT412:insufficient_level_recommended',
  'Crear con avisos sin confirmarlos falla con PT412 y los avisos en DETAIL');

select is(t_err($q$ select public.create_activity_assignment(t_id('pos_rec'), 'a5000000-0000-0000-0000-0000000e0004', '{"acknowledge_warnings":true}') $q$),
  'PT412:insufficient_level_recommended',
  'El antiguo acknowledge_warnings booleano ya no confirma nada: sigue fallando con PT412');

select lives_ok(
  $$ select t_set('asg_rec', t_asg(t_id('pos_rec'), 'a5000000-0000-0000-0000-0000000e0004', '{"acknowledged_warnings":["insufficient_level_recommended"]}')::text) $$,
  'Crear confirmando los avisos por su código funciona'
);

select ok(
  (select eligibility_warnings = array['insufficient_level_recommended'] and acknowledged_warnings = array['insufficient_level_recommended']
   from public.activity_assignment_recorded_warnings(t_id('act_main')) where assignment_id = t_id('asg_rec')),
  'La asignación guarda los avisos evaluados y los confirmados (leídos por activity_assignment_recorded_warnings)'
);

-- Confirmación por lista y enmascarado de lo que se guarda.
select ok(
  (select cardinality(w) = 2 and w @> array['missing_credential_recommended', 'missing_qualification_recommended']
   from (select t_warnings(t_id('pos_mask'), 'a5000000-0000-0000-0000-0000000e0009') w) s),
  'Con credential.sensitive.read la previsualización detalla el requisito sensible recomendado'
);

select is(t_err($q$ select public.create_activity_assignment(t_id('pos_mask'), 'a5000000-0000-0000-0000-0000000e0009',
    '{"acknowledged_warnings":["missing_credential_recommended"]}') $q$),
  'PT412:missing_qualification_recommended',
  'Si la lista no incluye todos los avisos falla con PT412 y DETAIL solo con los no confirmados');

select t_set('asg_mask_res', public.create_activity_assignment(t_id('pos_mask'), 'a5000000-0000-0000-0000-0000000e0009',
  '{"acknowledged_warnings":["missing_credential_recommended","missing_qualification_recommended"]}')::text);
select t_set('asg_mask', current_setting('t5a.asg_mask_res')::jsonb ->> 'assignment_id');

select ok(
  (select cardinality(eligibility_warnings) = 2
      and eligibility_warnings @> array['requirement_not_met_recommended', 'missing_qualification_recommended']
      and acknowledged_warnings = eligibility_warnings
      and not ('missing_credential_recommended' = any (eligibility_warnings))
   from public.activity_assignment_recorded_warnings(t_id('act_main')) where assignment_id = t_id('asg_mask')),
  'Los avisos guardados se enmascaran siempre (requirement_not_met_recommended) aunque quien crea lea credenciales sensibles'
);

reset role;
select ok(
  (select metadata -> 'acknowledged_warnings' @> '["requirement_not_met_recommended","missing_qualification_recommended"]'::jsonb
      and not (metadata -> 'acknowledged_warnings' ? 'missing_credential_recommended')
   from audit_logs where action = 'assignment.created' and entity_id = t_id('asg_mask')),
  'La auditoría de assignment.created guarda los avisos confirmados enmascarados'
);
select test_set_auth_uid('a5000000-0000-0000-0000-000000000001');

-- Actividad no asignable: borrador y actividad terminada.
select t_set('act_draft', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5 borrador","local_start":"2031-03-09T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos_draft', t_pos(t_area(t_id('act_draft'), 'a5000000-0000-0000-0000-0000000a0001'), '{"name":"Borrador"}')::text);

select t_set('act_past', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5 pasado","local_start":"2020-03-01T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos_past', t_pos(t_area(t_id('act_past'), 'a5000000-0000-0000-0000-0000000a0001'), '{"name":"Pasado"}')::text);
select public.transition_activity_status(t_id('act_past'), 'published');

select is(t_blocking(t_id('pos_draft'), 'a5000000-0000-0000-0000-0000000e0001'), array['activity_not_assignable'],
  'Una actividad en borrador no admite asignaciones (activity_not_assignable)');

select is(t_err($q$ select public.create_activity_assignment(t_id('pos_draft'), 'a5000000-0000-0000-0000-0000000e0001') $q$),
  '22023:activity_not_assignable',
  'Crear en un borrador falla con 22023');

select is(t_blocking(t_id('pos_past'), 'a5000000-0000-0000-0000-0000000e0001'), array['activity_not_assignable'],
  'Una actividad ya terminada no admite asignaciones');

-- Referencia temporal de tareas flexibles aplicada a la elegibilidad.
select t_set('pos_task_win', t_pos(t_area(t_id('task_win'), 'a5000000-0000-0000-0000-0000000a0001'), '{"name":"Tarea ventana"}')::text);
select t_set('pos_task_none', t_pos(t_area(t_id('task_none'), 'a5000000-0000-0000-0000-0000000a0001'), '{"name":"Tarea sin fechas"}')::text);
select public.save_activity_position_requirement(t_id('pos_task_win'), null,
  '{"requirement_type":"credential","credential_type_id":"a5000000-0000-0000-0000-0000000d0101"}'::jsonb);
select public.save_activity_position_requirement(t_id('pos_task_none'), null,
  '{"requirement_type":"credential","credential_type_id":"a5000000-0000-0000-0000-0000000d0101"}'::jsonb);
select public.transition_activity_status(t_id('task_win'), 'published');
select public.transition_activity_status(t_id('task_none'), 'published');

select ok(
  t_blocking(t_id('pos_task_win'), 'a5000000-0000-0000-0000-0000000e0009') = array['credential_expired_at_activity']
  and t_blocking(t_id('pos_task_none'), 'a5000000-0000-0000-0000-0000000e0009') = '{}',
  'Tarea flexible: la vigencia se evalúa al fin de la ventana; sin fechas, en el momento de evaluar'
);

select t_set('task_closed', public.create_activity(t_id('church_a'),
  '{"type":"task","title":"P5 tarea vencida","schedule_kind":"flexible","local_start":"2020-01-01T09:00","local_end":"2020-01-31T18:00"}'::jsonb) ->> 'activity_id');
select t_set('pos_task_closed', t_pos(t_area(t_id('task_closed'), 'a5000000-0000-0000-0000-0000000a0001'), '{"name":"Tarea vencida"}')::text);
select public.transition_activity_status(t_id('task_closed'), 'published');

select is(t_blocking(t_id('pos_task_closed'), 'a5000000-0000-0000-0000-0000000e0001'), array['activity_not_assignable'],
  'Una tarea flexible con la ventana ya vencida no admite asignaciones');

-- Capacidad (previstos >= máximo).
select t_set('cap1', t_asg(t_id('pos_cap'), 'a5000000-0000-0000-0000-0000000e0001')::text);
select t_set('cap2', t_asg(t_id('pos_cap'), 'a5000000-0000-0000-0000-0000000e0012', '{"send":true}')::text);

select is(t_err($q$ select public.create_activity_assignment(t_id('pos_cap'), 'a5000000-0000-0000-0000-0000000e0013') $q$),
  '22023:position_full',
  'Con previstos (propuesta + pendiente) iguales al máximo, crear otra falla con position_full');

select public.cancel_activity_assignment(t_id('cap2'));

select lives_ok(
  $$ select t_asg(t_id('pos_cap'), 'a5000000-0000-0000-0000-0000000e0013') $$,
  'Una asignación retirada libera la plaza'
);

-- ============================================================
-- 3. Conflictos: solapes, sede y disponibilidad
-- ============================================================
select t_set('ov_a', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5 solape A","local_start":"2031-04-06T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('ov_b', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5 solape B","local_start":"2031-04-06T11:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('ov_c', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5 solape C","local_start":"2031-04-06T10:30","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos_ov_a', t_pos(t_area(t_id('ov_a'), 'a5000000-0000-0000-0000-0000000a0001'), '{"name":"Turno","min_people":0}')::text);
select t_set('pos_ov_b', t_pos(t_area(t_id('ov_b'), 'a5000000-0000-0000-0000-0000000a0001'), '{"name":"Turno","min_people":0}')::text);
select t_set('pos_ov_c', t_pos(t_area(t_id('ov_c'), 'a5000000-0000-0000-0000-0000000a0001'), '{"name":"Turno","min_people":0}')::text);
select public.transition_activity_status(t_id('ov_a'), 'published');
select public.transition_activity_status(t_id('ov_b'), 'published');
select public.transition_activity_status(t_id('ov_c'), 'published');

select t_set('ov_asg_a', t_asg(t_id('pos_ov_a'), 'a5000000-0000-0000-0000-0000000e0012')::text);

select is(t_warnings(t_id('pos_ov_b'), 'a5000000-0000-0000-0000-0000000e0012'), '{}'::text[],
  'Rangos semiabiertos: una actividad que empieza cuando termina la otra no solapa');

select is(t_warnings(t_id('pos_ov_c'), 'a5000000-0000-0000-0000-0000000e0012'), array['overlapping_assignment'],
  'Una actividad que se cruza con otra asignación vigente avisa con overlapping_assignment');

select is(t_err($q$ select public.create_activity_assignment(t_id('pos_ov_c'), 'a5000000-0000-0000-0000-0000000e0012') $q$),
  'PT412:overlapping_assignment',
  'Crear con solape sin confirmarlo falla con PT412');

select lives_ok(
  $$ select t_asg(t_id('pos_ov_c'), 'a5000000-0000-0000-0000-0000000e0012', '{"acknowledged_warnings":["overlapping_assignment"]}') $$,
  'Crear con solape confirmado funciona'
);

select t_set('ov_cancel', t_asg(t_id('pos_ov_a'), 'a5000000-0000-0000-0000-0000000e0013')::text);
select public.cancel_activity_assignment(t_id('ov_cancel'));

select is(t_warnings(t_id('pos_ov_c'), 'a5000000-0000-0000-0000-0000000e0013'), '{}'::text[],
  'Una asignación retirada no genera solape');

select t_set('act_campus', public.create_activity(t_id('church_a'), jsonb_build_object(
  'type', 'service', 'title', 'P5 sede principal', 'campus_id', t_id('campus_a1'),
  'local_start', '2031-05-04T10:00', 'duration_minutes', 60)) ->> 'activity_id');
select t_set('pos_campus', t_pos(t_area(t_id('act_campus'), 'a5000000-0000-0000-0000-0000000a0001'), '{"name":"Sede"}')::text);
select public.transition_activity_status(t_id('act_campus'), 'published');

select ok(
  t_warnings(t_id('pos_campus'), 'a5000000-0000-0000-0000-0000000e0007') = array['different_campus']
  and t_warnings(t_id('pos_campus'), 'a5000000-0000-0000-0000-0000000e0012') = '{}',
  'Sede principal de la persona distinta de la de la actividad avisa con different_campus; sin sede principal no'
);

reset role;
select ok(to_regprocedure('app.person_unavailability(uuid,uuid[],timestamptz,timestamptz)') is null,
  'La función de disponibilidad de Diogo todavía no existe');
select test_set_auth_uid('a5000000-0000-0000-0000-000000000001');

select ok(not ('unavailable' = any (t_warnings(t_id('pos_ov_b'), 'a5000000-0000-0000-0000-0000000e0010'))),
  'Sin la función de disponibilidad no se emite el aviso unavailable');

-- Stub temporal del contrato DI-01 (se revierte con la transacción).
reset role;
create function app.person_unavailability(p_church_id uuid, p_person_ids uuid[], p_from timestamptz, p_to timestamptz)
returns table (person_id uuid)
language sql
stable
as $$
  select x from unnest(p_person_ids) x
  where x = 'a5000000-0000-0000-0000-0000000e0010'
    and p_church_id = public.t_id('church_a')
    and p_from = (select a.starts_at from public.activities a where a.id = public.t_id('ov_b'))
    and p_to = (select a.ends_at from public.activities a where a.id = public.t_id('ov_b'));
$$;
select test_set_auth_uid('a5000000-0000-0000-0000-000000000001');

select ok(
  t_warnings(t_id('pos_ov_b'), 'a5000000-0000-0000-0000-0000000e0010') = array['unavailable']
  and t_warnings(t_id('pos_ov_b'), 'a5000000-0000-0000-0000-0000000e0013') = '{}',
  'Con la función de disponibilidad, una persona no disponible en el rango de la actividad avisa con unavailable'
);

reset role;
drop function app.person_unavailability(uuid, uuid[], timestamptz, timestamptz);
select test_set_auth_uid('a5000000-0000-0000-0000-000000000001');

-- Stub que falla: la evaluación no se interrumpe y avisa availability_unknown.
reset role;
create function app.person_unavailability(p_church_id uuid, p_person_ids uuid[], p_from timestamptz, p_to timestamptz)
returns table (person_id uuid)
language plpgsql
stable
as $$
begin
  raise exception 'Disponibilidad no accesible (stub de test)' using errcode = '42501';
end;
$$;
select test_set_auth_uid('a5000000-0000-0000-0000-000000000001');

select is(t_warnings(t_id('pos_ov_b'), 'a5000000-0000-0000-0000-0000000e0013'), array['availability_unknown'],
  'Si la función de disponibilidad falla, no se interrumpe la evaluación y se avisa availability_unknown');

reset role;
drop function app.person_unavailability(uuid, uuid[], timestamptz, timestamptz);
select test_set_auth_uid('a5000000-0000-0000-0000-000000000001');

-- ============================================================
-- 4. Crear, enviar y retirar: estados, versión, auditoría y concurrencia
-- ============================================================
select t_set('act_flow', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5 flujo","local_start":"2031-05-11T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos_flow', t_pos(t_area(t_id('act_flow'), 'a5000000-0000-0000-0000-0000000a0001'), '{"name":"Flujo"}')::text);
select public.transition_activity_status(t_id('act_flow'), 'published');

select t_set('flow1_res', public.create_activity_assignment(t_id('pos_flow'), 'a5000000-0000-0000-0000-0000000e0001')::text);
select t_set('flow1', current_setting('t5a.flow1_res')::jsonb ->> 'assignment_id');

select ok(
  (select r ->> 'status' = 'proposed' and (r ->> 'version')::int = 1 and not (r ->> 'replayed')::boolean
      and r -> 'warnings' = '[]'::jsonb
   from (select current_setting('t5a.flow1_res')::jsonb r) s),
  'Crear devuelve la asignación en proposed, versión 1, sin avisos y replayed false'
);

select ok(
  (select status = 'proposed' and version = 1 and position_name = 'Flujo'
      and service_area_id = 'a5000000-0000-0000-0000-0000000a0001'
      and created_by = 'a5000000-0000-0000-0000-000000000001' and sent_at is null and activity_id = t_id('act_flow')
   from activity_assignments where id = t_id('flow1')),
  'La fila guarda snapshot del puesto, área, autor y sin envío'
);

select ok(
  (select (r ->> 'replayed')::boolean and (r ->> 'assignment_id')::uuid = t_id('flow1')
   from public.create_activity_assignment(t_id('pos_flow'), 'a5000000-0000-0000-0000-0000000e0001') r)
  and (select count(*) = 1 from activity_assignments where activity_position_id = t_id('pos_flow')
       and person_id = 'a5000000-0000-0000-0000-0000000e0001'),
  'Reintentar la creación devuelve la misma asignación con replayed true sin duplicar'
);

select is(public.send_activity_assignments(t_id('act_flow'), array[t_id('flow1')]), '{"sent":1,"blocked":[]}'::jsonb,
  'Enviar una propuesta devuelve {"sent":1,"blocked":[]}');

select ok(
  (select status = 'pending' and version = 2 and sent_at is not null and sent_by = 'a5000000-0000-0000-0000-000000000001'
   from activity_assignments where id = t_id('flow1')),
  'Enviar pasa proposed -> pending, sube la versión y guarda quién y cuándo'
);

select t_set('flow2', t_asg(t_id('pos_flow'), 'a5000000-0000-0000-0000-0000000e0012', '{"send":true}')::text);
select t_set('flow3', t_asg(t_id('pos_flow'), 'a5000000-0000-0000-0000-0000000e0013')::text);

select is(t_state(t_id('flow2')), 'pending:1',
  'Crear con send true nace ya comunicada (pending, versión 1)');

select is(public.send_activity_assignments(t_id('act_flow'), null), '{"sent":1,"blocked":[]}'::jsonb,
  'Enviar sin ids envía solo las propuestas restantes de la actividad');

select throws_ok(
  $$ select public.cancel_activity_assignment(t_id('flow3'), 1) $$,
  'PT409', null,
  'Retirar con una versión desfasada falla con PT409'
);

select lives_ok(
  $$ select public.cancel_activity_assignment(t_id('flow3'), 2) $$,
  'Retirar con la versión vigente funciona'
);

select ok(
  (select status = 'cancelled' and version = 3 and cancel_cause = 'coordinator' and cancelled_at is not null
      and cancelled_by = 'a5000000-0000-0000-0000-000000000001'
   from activity_assignments where id = t_id('flow3')),
  'La retirada deja cancelled con causa coordinator, autor y nueva versión'
);

select ok(
  (select (r ->> 'replayed')::boolean and r ->> 'status' = 'cancelled' from public.cancel_activity_assignment(t_id('flow3')) r),
  'Retirar de nuevo es idempotente (replayed true)'
);

select ok(
  (select not (r ->> 'replayed')::boolean and (r ->> 'assignment_id')::uuid <> t_id('flow3')
   from public.create_activity_assignment(t_id('pos_flow'), 'a5000000-0000-0000-0000-0000000e0013') r),
  'Tras retirar, volver a asignar a la persona crea una asignación nueva (la historia se conserva)'
);

select throws_ok(
  $$ select public.send_activity_assignments(t_id('act_draft'), null) $$,
  '22023', null,
  'Enviar asignaciones de una actividad que no las admite falla con 22023'
);

select t_set('pos_reval', t_pos((select activity_service_area_id from activity_positions where id = t_id('pos_flow')), '{"name":"Revalidar","min_people":0}')::text);
select t_set('reval', t_asg(t_id('pos_reval'), 'a5000000-0000-0000-0000-0000000e0010')::text);
select public.save_activity_position_requirement(t_id('pos_reval'), null,
  '{"requirement_type":"qualification","qualification_id":"a5000000-0000-0000-0000-0000000d0001"}'::jsonb);

select is(public.send_activity_assignments(t_id('act_flow'), array[t_id('reval')]),
  jsonb_build_object('sent', 0, 'blocked', jsonb_build_array(
    jsonb_build_object('assignment_id', t_id('reval'), 'blocking', jsonb_build_array('missing_qualification')))),
  'Enviar revalida los bloqueos: la que ya no cumple un requisito nuevo se informa en blocked con sus códigos (sin lanzar)');

select is(t_state(t_id('reval')), 'proposed:1',
  'La propuesta que ya no cumple sigue sin enviarse');

-- Envío en bloque parcial: las bloqueadas se quedan en borrador y el resto se
-- envía (la reasignación de e13 y la nueva de e11).
select t_set('flow_ok', t_asg(t_id('pos_flow'), 'a5000000-0000-0000-0000-0000000e0011')::text);

select ok(
  (select (r ->> 'sent')::int = 2
      and jsonb_array_length(r -> 'blocked') = 1
      and (r -> 'blocked' -> 0 ->> 'assignment_id')::uuid = t_id('reval')
      and r -> 'blocked' -> 0 -> 'blocking' = '["missing_qualification"]'::jsonb
   from (select public.send_activity_assignments(t_id('act_flow'), null) r) s)
  and t_state(t_id('flow_ok')) = 'pending:2' and t_state(t_id('reval')) = 'proposed:1',
  'Enviar todas: se envían las que cumplen y las bloqueadas se quedan en proposed y se informan'
);

-- Reintento de crear con send sobre un borrador existente.
select is(t_err($q$ select public.create_activity_assignment(t_id('pos_reval'), 'a5000000-0000-0000-0000-0000000e0010', '{"send":true}') $q$),
  '22023:missing_qualification',
  'Reintentar crear con send sobre un borrador que ya no cumple falla con 22023 y los códigos en DETAIL');

select is(t_state(t_id('reval')), 'proposed:1',
  'El borrador que no cumple sigue sin enviarse tras el reintento con send');

select t_set('resend', t_asg(t_id('pos_flow'), 'a5000000-0000-0000-0000-0000000e0009')::text);

select ok(
  (select (r ->> 'replayed')::boolean and (r ->> 'assignment_id')::uuid = t_id('resend')
      and r ->> 'status' = 'pending' and (r ->> 'version')::int = 2
   from public.create_activity_assignment(t_id('pos_flow'), 'a5000000-0000-0000-0000-0000000e0009', '{"send":true}') r),
  'Reintentar crear con send sobre un borrador existente devuelve la misma asignación, ya pending, con replayed true'
);

select ok(
  (select status = 'pending' and version = 2 and sent_at is not null and sent_by = 'a5000000-0000-0000-0000-000000000001'
   from activity_assignments where id = t_id('resend')),
  'El reintento con send deja el borrador enviado (pending, sent_at y sent_by)'
);

reset role;

select ok(
  exists (select 1 from audit_logs where action = 'assignment.created' and entity_id = t_id('flow1')
          and metadata ->> 'person_id' = 'a5000000-0000-0000-0000-0000000e0001'
          and actor_user_id = 'a5000000-0000-0000-0000-000000000001')
  and exists (select 1 from audit_logs where action = 'assignment.sent' and entity_id = t_id('act_flow'))
  and exists (select 1 from audit_logs where action = 'assignment.cancelled' and entity_id = t_id('flow3')),
  'Se auditan assignment.created, assignment.sent y assignment.cancelled'
);

select throws_ok(
  format($$ insert into activity_assignments (church_id, activity_id, activity_position_id, person_id, position_name)
            values ('%s', '%s', '%s', 'a5000000-0000-0000-0000-0000000e0001', 'x') $$,
         t_id('church_a'), t_id('act_flow'), t_id('pos_flow')),
  '23505', null,
  'El índice único parcial impide dos asignaciones vigentes de la misma persona en el mismo puesto'
);

select throws_ok(
  format($$ insert into activity_assignments (church_id, activity_id, activity_position_id, person_id, position_name)
            values ('%s', '%s', '%s', 'a5000000-0000-0000-0000-0000000e0003', 'x') $$,
         t_id('church_a'), t_id('act_flow'), t_id('pos_flow')),
  '23503', null,
  'La FK de pertenencia impide asignar a una persona de otra iglesia'
);

select throws_ok(
  format($$ insert into activity_assignments (church_id, activity_id, activity_position_id, person_id, position_name)
            values ('%s', '%s', '%s', 'a5000000-0000-0000-0000-0000000e0010', 'x') $$,
         t_id('church_a'), t_id('act_flow'), t_id('pos_free')),
  '22023', null,
  'Un puesto de otra actividad se rechaza aunque sea de la misma iglesia'
);

select throws_ok(
  $$ update activity_assignments set person_id = 'a5000000-0000-0000-0000-0000000e0010' where id = t_id('flow1') $$,
  '22023', null,
  'La identidad de una asignación (persona) es inmutable'
);

select test_set_auth_uid('a5000000-0000-0000-0000-000000000001');

-- ============================================================
-- 5. Cobertura
-- ============================================================
select t_set('act_cov', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5 cobertura","local_start":"2031-05-18T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('area_cov', t_area(t_id('act_cov'), 'a5000000-0000-0000-0000-0000000a0001')::text);
select t_set('cov_zero', t_pos(t_id('area_cov'), '{"name":"Opcional","min_people":0}')::text);
select t_set('cov_main', t_pos(t_id('area_cov'), '{"name":"Principal","min_people":2,"max_people":3}')::text);
select public.transition_activity_status(t_id('act_cov'), 'published');

select ok(
  (select assigned_count = 0 and coverage_status = 'covered' and pending_count = 0 and proposed_count = 0 and expected_count = 0
   from public.activity_position_coverage(t_id('act_cov')) where activity_position_id = t_id('cov_zero'))
  and (select coverage_status = 'uncovered' from public.activity_position_coverage(t_id('act_cov'))
       where activity_position_id = t_id('cov_main')),
  'Mínimo 0 sin nadie cuenta como covered; mínimo 2 sin nadie, uncovered'
);

select t_set('cov_p', t_asg(t_id('cov_main'), 'a5000000-0000-0000-0000-0000000e0001')::text);
select t_set('cov_pend', t_asg(t_id('cov_main'), 'a5000000-0000-0000-0000-0000000e0010', '{"send":true}')::text);
-- Una rechazada no ocupa plaza: se crea antes de llenar los previstos.
select t_set('cov_dec', t_asg(t_id('cov_main'), 'a5000000-0000-0000-0000-0000000e0013', '{"send":true}')::text);
select public.record_assignment_response(t_id('cov_dec'), 'declined');
select t_set('cov_acc', t_asg(t_id('cov_main'), 'a5000000-0000-0000-0000-0000000e0012')::text);
select t_respond(t_id('cov_acc'), 'accepted');

select ok(
  (select assigned_count = 1 and coverage_status = 'partially_covered' and pending_count = 1
      and proposed_count = 1 and expected_count = 3 and min_people = 2 and max_people = 3
   from public.activity_position_coverage(t_id('act_cov')) where activity_position_id = t_id('cov_main')),
  'Cobertura: assigned_count cuenta solo aceptadas y el estado se calcula con ellas; pending/proposed/expected aparte; rechazadas fuera'
);

select is(t_err($q$ select public.create_activity_assignment(t_id('cov_main'), 'a5000000-0000-0000-0000-0000000e0011') $q$),
  '22023:position_full',
  'Con 3 previstos y máximo 3 el puesto está lleno aunque solo haya 1 aceptada');

select public.record_assignment_response(t_id('cov_pend'), 'accepted');

select ok(
  (select assigned_count = 2 and coverage_status = 'covered' and pending_count = 0
   from public.activity_position_coverage(t_id('act_cov')) where activity_position_id = t_id('cov_main')),
  'Con 2 aceptadas y mínimo 2 el puesto queda covered'
);

select t_respond(t_id('cov_p'), 'accepted');
select public.update_activity_position(t_id('cov_main'), '{"max_people":2}'::jsonb);

select is(
  (select coverage_status from public.activity_position_coverage(t_id('act_cov')) where activity_position_id = t_id('cov_main')),
  'overstaffed',
  'Con 3 aceptadas y máximo reducido a 2 el puesto queda overstaffed'
);

select public.update_activity_position(t_id('cov_main'), '{"max_people":""}'::jsonb);

select is(
  (select coverage_status from public.activity_position_coverage(t_id('act_cov')) where activity_position_id = t_id('cov_main')),
  'covered',
  'Sin máximo, el puesto nunca queda overstaffed'
);

select ok(
  (select positions = 2 and positions_requiring_people = 1 and confirmed = 3 and pending = 0 and proposed = 0
      and uncovered_positions = 0
   from public.activity_staffing_summary(array[t_id('act_cov')])),
  'activity_staffing_summary resume puestos, confirmados y puestos sin cubrir'
);

-- ============================================================
-- 6. Integración con Fase 4
-- ============================================================
-- 6.1 Cancelar actividad.
select t_set('act_ic', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5 cancelar","local_start":"2031-06-08T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos_ic', t_pos(t_area(t_id('act_ic'), 'a5000000-0000-0000-0000-0000000a0001'), '{"name":"Cancelar","min_people":0}')::text);
select public.transition_activity_status(t_id('act_ic'), 'published');
select t_set('ic_acc', t_asg(t_id('pos_ic'), 'a5000000-0000-0000-0000-0000000e0001')::text);
select t_respond(t_id('ic_acc'), 'accepted');
select t_set('ic_pend', t_asg(t_id('pos_ic'), 'a5000000-0000-0000-0000-0000000e0010', '{"send":true}')::text);
select t_set('ic_prop', t_asg(t_id('pos_ic'), 'a5000000-0000-0000-0000-0000000e0012')::text);
select t_set('ic_dec', t_asg(t_id('pos_ic'), 'a5000000-0000-0000-0000-0000000e0013')::text);
select t_respond(t_id('ic_dec'), 'declined');
select t_set('ic_req', public.request_assignment_substitution(t_id('ic_acc')) ->> 'request_id');

select public.transition_activity_status(t_id('act_ic'), 'cancelled', 'Lluvia');

select ok(
  (select bool_and(status = 'cancelled' and cancel_cause = 'activity_cancelled' and cancelled_at is not null)
   from activity_assignments where id in (t_id('ic_acc'), t_id('ic_pend'), t_id('ic_prop')))
  and t_state(t_id('ic_acc')) = 'cancelled:4' and t_state(t_id('ic_pend')) = 'cancelled:2'
  and t_state(t_id('ic_prop')) = 'cancelled:2',
  'Cancelar la actividad cancela las asignaciones vigentes (activity_cancelled) y sube su versión'
);

select ok(
  t_state(t_id('ic_dec')) = 'declined:3'
  and (select status = 'cancelled' and cancelled_at is not null from activity_substitution_requests where id = t_id('ic_req')),
  'Cancelar la actividad conserva las rechazadas y cancela las solicitudes de sustitución abiertas'
);

-- 6.2 Archivar desde publicada.
select t_set('act_ia', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5 archivar","local_start":"2031-06-15T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos_ia', t_pos(t_area(t_id('act_ia'), 'a5000000-0000-0000-0000-0000000a0001'), '{"name":"Archivar"}')::text);
select public.transition_activity_status(t_id('act_ia'), 'published');
select t_set('ia_pend', t_asg(t_id('pos_ia'), 'a5000000-0000-0000-0000-0000000e0001', '{"send":true}')::text);
select public.transition_activity_status(t_id('act_ia'), 'archived');

select ok(
  (select status = 'cancelled' and cancel_cause = 'activity_archived' from activity_assignments where id = t_id('ia_pend')),
  'Archivar una actividad publicada cancela sus asignaciones vigentes (activity_archived)'
);

-- 6.3 Archivar una completada conserva la historia.
select t_set('act_icomp', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5 completada","local_start":"2020-02-02T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos_icomp', t_pos(t_area(t_id('act_icomp'), 'a5000000-0000-0000-0000-0000000a0001'), '{"name":"Histórico"}')::text);
select public.transition_activity_status(t_id('act_icomp'), 'published');
select public.transition_activity_status(t_id('act_icomp'), 'completed');

reset role;
insert into activity_assignments (id, church_id, activity_id, activity_position_id, person_id, status, position_name,
  sent_at, responded_at, response_source)
values ('a5000000-0000-0000-0000-0000000aa001', t_id('church_a'), t_id('act_icomp'), t_id('pos_icomp'),
  'a5000000-0000-0000-0000-0000000e0001', 'accepted', 'x', '2020-01-20 10:00+00', '2020-01-21 10:00+00', 'self');
select test_set_auth_uid('a5000000-0000-0000-0000-000000000001');

select is(t_err($q$ select public.cancel_activity_assignment('a5000000-0000-0000-0000-0000000aa001') $q$), '22023',
  'Retirar una asignación vigente de una actividad completada falla con 22023 (la historia no se reescribe)');

select ok(
  (select (r ->> 'replayed')::boolean and r ->> 'status' = 'cancelled'
   from public.cancel_activity_assignment(t_id('ic_acc')) r),
  'Retirar una asignación que ya no está vigente en una actividad cerrada sigue devolviendo replayed'
);

select public.transition_activity_status(t_id('act_icomp'), 'archived');

select is(t_state('a5000000-0000-0000-0000-0000000aa001'), 'accepted:1',
  'Archivar una actividad completada conserva sus asignaciones aceptadas');

-- 6.4 Reprogramar (update_activity) y despublicar.
select t_set('act_ir', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5 reprogramar","local_start":"2031-06-22T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('area_ir', t_area(t_id('act_ir'), 'a5000000-0000-0000-0000-0000000a0001')::text);
select t_set('pos_ir', t_pos(t_id('area_ir'), '{"name":"Reprogramar","min_people":0}')::text);
select public.transition_activity_status(t_id('act_ir'), 'published');
select t_set('ir_acc', t_asg(t_id('pos_ir'), 'a5000000-0000-0000-0000-0000000e0001')::text);
select t_respond(t_id('ir_acc'), 'accepted');
select t_set('ir_pend', t_asg(t_id('pos_ir'), 'a5000000-0000-0000-0000-0000000e0010', '{"send":true}')::text);
select t_set('ir_prop', t_asg(t_id('pos_ir'), 'a5000000-0000-0000-0000-0000000e0012')::text);
select t_set('ir_dec', t_asg(t_id('pos_ir'), 'a5000000-0000-0000-0000-0000000e0013')::text);
select t_respond(t_id('ir_dec'), 'declined');

select public.update_activity(t_id('act_ir'), '{"title":"P5 reprogramar (título)"}'::jsonb);

select ok(
  t_state(t_id('ir_acc')) = 'accepted:3' and t_state(t_id('ir_pend')) = 'pending:1' and t_state(t_id('ir_prop')) = 'proposed:1',
  'Editar la actividad sin cambiar la hora no toca las asignaciones'
);

select public.update_activity(t_id('act_ir'), '{"local_start":"2031-06-22T12:00"}'::jsonb);

select ok(
  (select status = 'pending' and version = 4 and reconfirmation_requested_at is not null
   from activity_assignments where id = t_id('ir_acc'))
  and t_state(t_id('ir_pend')) = 'pending:2' and t_state(t_id('ir_prop')) = 'proposed:2'
  and t_state(t_id('ir_dec')) = 'declined:3',
  'Cambiar la hora: la aceptada vuelve a pending para reconfirmar y todas las vigentes suben versión'
);

select public.record_assignment_response(t_id('ir_acc'), 'accepted');

select ok(
  (select a.status = 'accepted' and a.reconfirmation_requested_at is null and a.confirmed_starts_at = act.starts_at
      and a.confirmed_ends_at = act.ends_at
   from activity_assignments a join activities act on act.id = a.activity_id where a.id = t_id('ir_acc')),
  'Reconfirmar guarda el nuevo horario confirmado y limpia la petición de reconfirmación'
);

select public.transition_activity_status(t_id('act_ir'), 'planned');

select ok(
  t_state(t_id('ir_acc')) = 'accepted:5' and t_state(t_id('ir_pend')) = 'pending:2',
  'Despublicar conserva las asignaciones sin cambios'
);

reset role;
select ok(
  exists (select 1 from audit_logs where action = 'assignment.cancelled_by_activity' and entity_id = t_id('act_ic')
          and metadata ->> 'cause' = 'activity_cancelled' and (metadata ->> 'assignments')::int = 3)
  and exists (select 1 from audit_logs where action = 'assignment.cancelled_by_activity' and entity_id = t_id('act_ia')
              and metadata ->> 'cause' = 'activity_archived')
  and exists (select 1 from audit_logs where action = 'assignment.reconfirmation_requested' and entity_id = t_id('act_ir')
              and (metadata ->> 'assignments')::int = 3),
  'Se auditan assignment.cancelled_by_activity (con causa) y assignment.reconfirmation_requested'
);
select test_set_auth_uid('a5000000-0000-0000-0000-000000000001');

-- 6.5 Eliminar estructura con personas asignadas.
select throws_ok(
  $$ select public.remove_activity_position(t_id('pos_ir')) $$,
  '22023', null,
  'Eliminar un puesto con asignaciones vigentes falla con 22023'
);

select throws_ok(
  $$ select public.remove_activity_area(t_id('area_ir')) $$,
  '22023', null,
  'Eliminar el área de un puesto con asignaciones vigentes falla con 22023'
);

select t_set('act_irm', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5 retirar puesto","local_start":"2031-06-29T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos_irm', t_pos(t_area(t_id('act_irm'), 'a5000000-0000-0000-0000-0000000a0001'), '{"name":"Efímero"}')::text);
select public.transition_activity_status(t_id('act_irm'), 'published');
select t_set('irm_asg', t_asg(t_id('pos_irm'), 'a5000000-0000-0000-0000-0000000e0001')::text);
select public.cancel_activity_assignment(t_id('irm_asg'));

select lives_ok(
  $$ select public.remove_activity_position(t_id('pos_irm')) $$,
  'Sin asignaciones vigentes el puesto se puede eliminar'
);

select ok(
  (select activity_position_id is null and position_name = 'Efímero' and status = 'cancelled'
   from activity_assignments where id = t_id('irm_asg')),
  'La asignación histórica se conserva sin puesto y con el nombre del puesto como snapshot'
);

-- 6.6 Series: aplicar estructura, editar hora y cambiar regla.
select t_set('series', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5 serie","local_start":"2031-09-07T10:00","duration_minutes":60,"recurrence":{"frequency":"weekly","count":4}}'::jsonb) ->> 'series_id');
select t_set('occ1', (select id::text from activities where series_id = t_id('series') order by occurrence_date offset 0 limit 1));
select t_set('occ2', (select id::text from activities where series_id = t_id('series') order by occurrence_date offset 1 limit 1));
select t_set('occ3', (select id::text from activities where series_id = t_id('series') order by occurrence_date offset 2 limit 1));
select t_set('occ4', (select id::text from activities where series_id = t_id('series') order by occurrence_date offset 3 limit 1));
select t_pos(t_area(t_id('occ1'), 'a5000000-0000-0000-0000-0000000a0001'), '{"name":"Serie","min_people":0}');
select public.apply_activity_structure_to_series(t_id('occ1'), 'future');
select public.transition_activity_status(t_id('occ2'), 'planned');
select public.transition_activity_status(t_id('occ3'), 'planned');
select public.transition_activity_status(t_id('occ4'), 'planned');
select t_set('occ2_asg', t_asg(t_pos_of(t_id('occ2')), 'a5000000-0000-0000-0000-0000000e0001')::text);
select t_respond(t_id('occ2_asg'), 'accepted');
select t_set('occ3_asg', t_asg(t_pos_of(t_id('occ3')), 'a5000000-0000-0000-0000-0000000e0010', '{"send":true}')::text);
-- occ4 solo tiene un borrador nunca enviado.
select t_set('occ4_asg', t_asg(t_pos_of(t_id('occ4')), 'a5000000-0000-0000-0000-0000000e0012')::text);

select throws_ok(
  $$ select public.apply_activity_structure_to_series(t_id('occ1'), 'future') $$,
  '22023', null,
  'Aplicar estructura a la serie sobre ocurrencias con personas asignadas falla con 22023'
);

select public.update_activity_series(t_id('occ1'), '{"local_start_time":"12:00"}'::jsonb, 'all');

select ok(
  (select status = 'pending' and reconfirmation_requested_at is not null and version = 4
   from activity_assignments where id = t_id('occ2_asg'))
  and t_state(t_id('occ3_asg')) = 'pending:2' and t_state(t_id('occ4_asg')) = 'proposed:2',
  'Cambiar la hora de la serie (update_activity_series) pide reconfirmar y sube versiones'
);

select public.update_activity_series_rule(t_id('occ1'), '{"frequency":"weekly","count":2}'::jsonb);

select ok(
  (select status = 'cancelled' from activities where id = t_id('occ3'))
  and (select status = 'cancelled' and cancel_cause = 'occurrence_removed' from activity_assignments where id = t_id('occ3_asg')),
  'Cambiar la regla: la ocurrencia planificada con una asignación enviada se cancela (occurrence_removed) en vez de borrarse'
);

select ok(
  not exists (select 1 from activities where id = t_id('occ4'))
  and not exists (select 1 from activity_assignments where id = t_id('occ4_asg')),
  'Cambiar la regla: la ocurrencia con solo borradores nunca enviados se borra normalmente (con sus borradores)'
);

-- Borrado directo de una actividad con solo borradores retirados sin enviar.
select t_set('act_del', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5 borrar","local_start":"2031-08-03T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos_del', t_pos(t_area(t_id('act_del'), 'a5000000-0000-0000-0000-0000000a0001'), '{"name":"Borrar","min_people":0}')::text);
select public.transition_activity_status(t_id('act_del'), 'published');
select t_set('del_draft', t_asg(t_id('pos_del'), 'a5000000-0000-0000-0000-0000000e0001')::text);
select public.cancel_activity_assignment(t_id('del_draft'));
select t_set('act_del_sent', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5 no borrar","local_start":"2031-08-10T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos_del_sent', t_pos(t_area(t_id('act_del_sent'), 'a5000000-0000-0000-0000-0000000a0001'), '{"name":"No borrar","min_people":0}')::text);
select public.transition_activity_status(t_id('act_del_sent'), 'published');
select t_set('del_sent', t_asg(t_id('pos_del_sent'), 'a5000000-0000-0000-0000-0000000e0001', '{"send":true}')::text);
select public.cancel_activity_assignment(t_id('del_sent'));

reset role;
delete from activities where id in (t_id('act_del'), t_id('act_del_sent'));

select ok(
  not exists (select 1 from activities where id = t_id('act_del'))
  and not exists (select 1 from activity_assignments where id = t_id('del_draft'))
  and (select status = 'cancelled' from activities where id = t_id('act_del_sent'))
  and exists (select 1 from activity_assignments where id = t_id('del_sent')),
  'Borrar una actividad: con solo borradores sin enviar se borra; si alguna asignación llegó a enviarse se cancela y se conserva'
);
select test_set_auth_uid('a5000000-0000-0000-0000-000000000001');

-- 6.7 Duplicar no copia asignaciones.
select t_set('ir_dup', public.duplicate_activity(t_id('act_ir'), '{"local_start":"2031-07-06T10:00"}'::jsonb) ->> 'activity_id');

select ok(
  (select count(*) = 1 from activity_positions where activity_id = t_id('ir_dup'))
  and not exists (select 1 from activity_assignments where activity_id = t_id('ir_dup')),
  'Duplicar una actividad copia los puestos pero no las asignaciones'
);

-- ============================================================
-- 7. Borrado de la iglesia en cascada
-- ============================================================
reset role;

select ok(
  exists (select 1 from activity_assignments aa
          where aa.church_id = t_id('church_a') and aa.activity_position_id is not null
            and aa.status in ('proposed', 'pending', 'accepted')),
  'Antes de borrar la iglesia hay puestos con asignaciones vigentes'
);

select lives_ok(
  $$ delete from churches where id = t_id('church_a') $$,
  'Borrar la iglesia en cascada no falla aunque haya puestos con asignaciones vigentes'
);

select ok(
  not exists (select 1 from activity_assignments where church_id = t_id('church_a'))
  and not exists (select 1 from activities where church_id = t_id('church_a')),
  'El borrado de la iglesia elimina sus actividades y asignaciones'
);

select * from finish();
rollback;
