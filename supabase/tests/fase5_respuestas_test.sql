-- Fase 5 · Tests de respuestas: respuesta de la propia persona (estados,
-- idempotencia, versión, plazo, nota privada), respuesta registrada por un
-- representante y sustituciones (solicitud, candidato, aceptación, rechazo,
-- cancelación). Ver migración 20260922000500_rpc_asignaciones.sql.

begin;
select plan(78);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function t_set(p_key text, p_value text) returns text as $$
  select set_config('t5r.' || p_key, coalesce(p_value, ''), true);
$$ language sql;

create or replace function t_id(p_key text) returns uuid as $$
  select nullif(current_setting('t5r.' || p_key, true), '')::uuid;
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

-- Lectura sin RLS (superusuario) del estado y versión de una asignación.
create or replace function t_state(p_asg uuid) returns text
language sql security definer set search_path = public as $$
  select status::text || ':' || version from activity_assignments where id = p_asg;
$$;

-- Usuarios: 01 propietario A · 02 Pedro · 03 Ana · 04 Luis · 05 Marta ·
-- 06 propietario B. Nuria (e07) no tiene cuenta.
insert into auth.users (id, email) values
  ('b5000000-0000-0000-0000-000000000001', 'owner.p5ra@example.test'),
  ('b5000000-0000-0000-0000-000000000002', 'pedro.p5r@example.test'),
  ('b5000000-0000-0000-0000-000000000003', 'ana.p5r@example.test'),
  ('b5000000-0000-0000-0000-000000000004', 'luis.p5r@example.test'),
  ('b5000000-0000-0000-0000-000000000005', 'marta.p5r@example.test'),
  ('b5000000-0000-0000-0000-000000000006', 'owner.p5rb@example.test');

select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');
select t_set('church_a', out_church_id::text)
from app.provision_church(
  'Church A P5R', 'church-a-p5resp', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'A5R', 'owner.p5ra@example.test', null, 'Sede A5R', null, null, null, null,
  array['people', 'serving'], null
);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000006');
select t_set('church_b', out_church_id::text)
from app.provision_church(
  'Church B P5R', 'church-b-p5resp', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'B5R', 'owner.p5rb@example.test', null, 'Sede B5R', null, null, null, null,
  array['people', 'serving'], null
);

reset role;

-- ============================================================
-- Setup (superusuario)
-- ============================================================
insert into people (id, user_id, first_name, last_name, source) values
  ('b5000000-0000-0000-0000-0000000e0002', 'b5000000-0000-0000-0000-000000000002', 'Pedro', 'Respuesta', 'manual'),
  ('b5000000-0000-0000-0000-0000000e0003', 'b5000000-0000-0000-0000-000000000003', 'Ana', 'Respuesta', 'manual'),
  ('b5000000-0000-0000-0000-0000000e0004', 'b5000000-0000-0000-0000-000000000004', 'Luis', 'Respuesta', 'manual'),
  ('b5000000-0000-0000-0000-0000000e0005', 'b5000000-0000-0000-0000-000000000005', 'Marta', 'Respuesta', 'manual'),
  ('b5000000-0000-0000-0000-0000000e0007', null, 'Nuria', 'SinCuenta', 'manual');

insert into church_people (id, church_id, person_id, relationship, source) values
  ('b5000000-0000-0000-0000-0000000f0002', t_id('church_a'), 'b5000000-0000-0000-0000-0000000e0002', 'member', 'manual'),
  ('b5000000-0000-0000-0000-0000000f0003', t_id('church_a'), 'b5000000-0000-0000-0000-0000000e0003', 'member', 'manual'),
  ('b5000000-0000-0000-0000-0000000f0004', t_id('church_a'), 'b5000000-0000-0000-0000-0000000e0004', 'member', 'manual'),
  ('b5000000-0000-0000-0000-0000000f0005', t_id('church_a'), 'b5000000-0000-0000-0000-0000000e0005', 'member', 'manual'),
  ('b5000000-0000-0000-0000-0000000f0007', t_id('church_a'), 'b5000000-0000-0000-0000-0000000e0007', 'member', 'manual');

insert into church_people_roles (church_id, church_people_id, role_key, scope_type, scope_id) values
  (t_id('church_a'), 'b5000000-0000-0000-0000-0000000f0002', 'member', 'church', null),
  (t_id('church_a'), 'b5000000-0000-0000-0000-0000000f0003', 'member', 'church', null),
  (t_id('church_a'), 'b5000000-0000-0000-0000-0000000f0004', 'member', 'church', null),
  (t_id('church_a'), 'b5000000-0000-0000-0000-0000000f0005', 'member', 'church', null);

insert into service_areas (id, church_id, name, slug)
values ('b5000000-0000-0000-0000-0000000a0001', t_id('church_a'), 'Sonido P5R', 'sonido-p5r');

insert into service_area_members (church_id, service_area_id, person_id, status, level)
select t_id('church_a'), 'b5000000-0000-0000-0000-0000000a0001', p, 'active', 'autonomous'
from unnest(array[
  'b5000000-0000-0000-0000-0000000e0002', 'b5000000-0000-0000-0000-0000000e0003',
  'b5000000-0000-0000-0000-0000000e0004', 'b5000000-0000-0000-0000-0000000e0005',
  'b5000000-0000-0000-0000-0000000e0007']::uuid[]) p;

select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');

select t_set('act_r', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5R respuestas","local_start":"2031-10-05T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('area_r', t_area(t_id('act_r'), 'b5000000-0000-0000-0000-0000000a0001')::text);
select t_set('pos_r', t_pos(t_id('area_r'), '{"name":"Respuestas","min_people":0}')::text);
select t_set('pos_one', t_pos(t_id('area_r'), '{"name":"Plaza única","max_people":1}')::text);
select public.transition_activity_status(t_id('act_r'), 'published');

select t_set('act_s', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5R sustituciones","local_start":"2031-10-12T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('area_s', t_area(t_id('act_s'), 'b5000000-0000-0000-0000-0000000a0001')::text);
select t_set('pos_s1', t_pos(t_id('area_s'), '{"name":"Sustitución 1","max_people":1}')::text);
select t_set('pos_s2', t_pos(t_id('area_s'), '{"name":"Sustitución 2","max_people":1}')::text);
select t_set('pos_s3', t_pos(t_id('area_s'), '{"name":"Sustitución 3","max_people":1}')::text);
select t_set('pos_s4', t_pos(t_id('area_s'), '{"name":"Sustitución 4","max_people":1}')::text);
select public.transition_activity_status(t_id('act_s'), 'published');

select t_set('act_st', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5R en curso","local_start":"2031-10-19T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos_st', t_pos(t_area(t_id('act_st'), 'b5000000-0000-0000-0000-0000000a0001'), '{"name":"En curso","min_people":0}')::text);
select public.transition_activity_status(t_id('act_st'), 'published');

select t_set('act_c', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"P5R plazas","local_start":"2031-10-26T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('area_c', t_area(t_id('act_c'), 'b5000000-0000-0000-0000-0000000a0001')::text);
select t_set('pos_c1', t_pos(t_id('area_c'), '{"name":"Dos plazas","max_people":2}')::text);
select t_set('pos_c2', t_pos(t_id('area_c'), '{"name":"Retirada representante","max_people":1}')::text);
select t_set('pos_c3', t_pos(t_id('area_c'), '{"name":"Retirada persona","max_people":1}')::text);
select public.transition_activity_status(t_id('act_c'), 'published');

-- ============================================================
-- 1. Respuesta de la propia persona
-- ============================================================
select t_set('r1', t_asg(t_id('pos_r'), 'b5000000-0000-0000-0000-0000000e0002')::text);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000002');

select throws_ok(
  $$ select public.respond_activity_assignment(t_id('r1'), 'accepted') $$,
  'P0002', null,
  'Una propuesta (borrador) no existe para la persona: responder falla con P0002'
);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');
select public.send_activity_assignments(t_id('act_r'), array[t_id('r1')]);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000003');

select throws_ok(
  $$ select public.respond_activity_assignment(t_id('r1'), 'accepted') $$,
  'P0002', null,
  'Otro usuario de la misma iglesia no puede responder la asignación ajena (P0002)'
);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000006');

select throws_ok(
  $$ select public.respond_activity_assignment(t_id('r1'), 'accepted') $$,
  'P0002', null,
  'Un usuario de otra iglesia no puede responder (P0002)'
);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000002');

select throws_ok(
  $$ select public.respond_activity_assignment(t_id('r1'), 'maybe') $$,
  '22023', null,
  'Una respuesta distinta de accepted/declined se rechaza'
);

select throws_ok(
  $$ select public.respond_activity_assignment(t_id('r1'), 'accepted', 1) $$,
  'PT409', null,
  'Responder con una versión desfasada falla con PT409'
);

select ok(
  (select r ->> 'status' = 'accepted' and (r ->> 'version')::int = 3 and not (r ->> 'replayed')::boolean
   from public.respond_activity_assignment(t_id('r1'), 'accepted', 2, '  Llego 10 minutos tarde  ') r),
  'Aceptar con la versión vigente pasa pending -> accepted y devuelve la nueva versión'
);

select ok(
  (select a.status = 'accepted' and a.response_source = 'self' and a.responded_at is not null
      and a.responded_by = 'b5000000-0000-0000-0000-000000000002'
      and a.confirmed_starts_at = act.starts_at and a.confirmed_ends_at = act.ends_at
   from activity_assignments a join activities act on act.id = a.activity_id where a.id = t_id('r1')),
  'La aceptación guarda origen self, quién, cuándo y el horario confirmado'
);

select is((select note from activity_assignment_notes where assignment_id = t_id('r1')), 'Llego 10 minutos tarde',
  'La persona lee su nota privada (recortada)');

select ok(
  (select (r ->> 'replayed')::boolean and (r ->> 'version')::int = 3
   from public.respond_activity_assignment(t_id('r1'), 'accepted') r)
  and t_state(t_id('r1')) = 'accepted:3',
  'Repetir la misma respuesta es idempotente: replayed true y misma versión'
);

select throws_ok(
  $$ select public.respond_activity_assignment(t_id('r1'), 'declined') $$,
  '22023', null,
  'Tras aceptar, la propia persona no puede rechazar: debe pedir sustitución'
);

select lives_ok(
  $$ select public.respond_activity_assignment(t_id('r1'), 'accepted', null, '') $$,
  'Responder con nota vacía funciona'
);

select is((select count(*)::int from activity_assignment_notes where assignment_id = t_id('r1')), 0,
  'Una nota vacía borra la nota privada');

select public.respond_activity_assignment(t_id('r1'), 'accepted', null, 'Nota para el coordinador no');

select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');

select is((select count(*)::int from activity_assignment_notes where assignment_id = t_id('r1')), 0,
  'Quien gestiona la actividad no lee la nota privada de la persona');

-- pending -> declined -> accepted.
select t_set('r2', t_asg(t_id('pos_r'), 'b5000000-0000-0000-0000-0000000e0003', '{"send":true}')::text);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000003');

select ok(
  (select r ->> 'status' = 'declined' and (r ->> 'version')::int = 2 from public.respond_activity_assignment(t_id('r2'), 'declined') r),
  'La persona rechaza una asignación pendiente'
);

select ok(
  (select r ->> 'status' = 'accepted' and (r ->> 'version')::int = 3 from public.respond_activity_assignment(t_id('r2'), 'accepted', 2) r),
  'Tras rechazar, la persona puede aceptar si queda hueco'
);

-- declined -> accepted sin hueco.
select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');
select t_set('o1', t_asg(t_id('pos_one'), 'b5000000-0000-0000-0000-0000000e0004', '{"send":true}')::text);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000004');
select public.respond_activity_assignment(t_id('o1'), 'declined');

select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');

select lives_ok(
  $$ select t_set('o2', t_asg(t_id('pos_one'), 'b5000000-0000-0000-0000-0000000e0005', '{"send":true}')::text) $$,
  'Una rechazada no ocupa plaza: se puede asignar a otra persona al puesto de plaza única'
);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000004');

select is(t_err($q$ select public.respond_activity_assignment(t_id('o1'), 'accepted') $q$), '22023:position_full',
  'Volver a aceptar tras rechazar sin hueco falla con 22023 position_full');

select is(t_state(t_id('o1')), 'declined:2',
  'La asignación rechazada no cambia al fallar la aceptación');

-- Plazo de respuesta: la actividad ya ha empezado.
select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');
select t_set('st1', t_asg(t_id('pos_st'), 'b5000000-0000-0000-0000-0000000e0004', '{"send":true}')::text);
select t_set('st2', t_asg(t_id('pos_st'), 'b5000000-0000-0000-0000-0000000e0005', '{"send":true}')::text);

reset role;
select set_config('request.jwt.claims', '', true);
update activities set starts_at = now() - interval '1 hour', ends_at = now() + interval '1 day' where id = t_id('act_st');

select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');
select public.record_assignment_response(t_id('st2'), 'accepted');

select test_set_auth_uid('b5000000-0000-0000-0000-000000000004');

select throws_ok(
  $$ select public.respond_activity_assignment(t_id('st1'), 'accepted') $$,
  '22023', null,
  'Responder después del inicio de una actividad con horario falla con 22023'
);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000005');

select ok(
  (select (r ->> 'replayed')::boolean from public.respond_activity_assignment(t_id('st2'), 'accepted') r),
  'Repetir la respuesta ya registrada después del inicio sigue siendo idempotente'
);

select throws_ok(
  $$ select public.request_assignment_substitution(t_id('st2')) $$,
  '22023', null,
  'La persona no puede pedir sustitución una vez empezada la actividad'
);

-- Contador de turnos que la persona todavía puede responder.
select is(public.my_respondable_assignments_count(t_id('church_a')), 1,
  'my_respondable_assignments_count cuenta la asignación pendiente propia con plazo abierto');

select test_set_auth_uid('b5000000-0000-0000-0000-000000000004');

select is(public.my_respondable_assignments_count(t_id('church_a')), 0,
  'my_respondable_assignments_count no cuenta pendientes con el plazo vencido ni rechazadas');

select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');
select t_set('cnt_pend', t_asg(t_id('pos_r'), 'b5000000-0000-0000-0000-0000000e0007', '{"send":true}')::text);
select t_set('cnt_draft', t_asg(t_id('pos_c1'), 'b5000000-0000-0000-0000-0000000e0005')::text);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000005');

select ok(
  public.my_respondable_assignments_count(t_id('church_a')) = 1
  and public.my_respondable_assignments_count(t_id('church_b')) = 0,
  'my_respondable_assignments_count no cuenta borradores ni asignaciones de otras personas, ni de otra iglesia'
);

reset role;
select set_config('request.jwt.claims', '', true);
update activities set status = 'planned' where id = t_id('act_r');
select test_set_auth_uid('b5000000-0000-0000-0000-000000000005');

select is(public.my_respondable_assignments_count(t_id('church_a')), 1,
  'my_respondable_assignments_count cuenta también actividades planificadas');

reset role;
select set_config('request.jwt.claims', '', true);
update activities set status = 'draft' where id = t_id('act_r');
select test_set_auth_uid('b5000000-0000-0000-0000-000000000005');

select is(public.my_respondable_assignments_count(t_id('church_a')), 0,
  'my_respondable_assignments_count no cuenta actividades que no están planificadas ni publicadas');

reset role;
select set_config('request.jwt.claims', '', true);
update activities set status = 'planned' where id = t_id('act_r');
update activities set status = 'published' where id = t_id('act_r');
select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');
select public.cancel_activity_assignment(t_id('cnt_pend'));
select public.cancel_activity_assignment(t_id('cnt_draft'));

-- ============================================================
-- 2. Respuesta registrada por un representante
-- ============================================================
select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');
select t_set('rep1', t_asg(t_id('pos_r'), 'b5000000-0000-0000-0000-0000000e0007')::text);

select throws_ok(
  $$ select public.record_assignment_response(t_id('rep1'), 'accepted') $$,
  '22023', null,
  'No se registra respuesta de una propuesta sin enviar'
);

select public.send_activity_assignments(t_id('act_r'), array[t_id('rep1')]);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000003');

select throws_ok(
  $$ select public.record_assignment_response(t_id('rep1'), 'accepted') $$,
  '42501', null,
  'Un miembro sin assignment.manage no puede registrar respuestas en nombre de otro'
);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');

select throws_ok(
  $$ select public.record_assignment_response(t_id('rep1'), 'accepted', 1) $$,
  'PT409', null,
  'El representante con una versión desfasada recibe PT409'
);

select ok(
  (select r ->> 'status' = 'accepted' and (r ->> 'version')::int = 3 from public.record_assignment_response(t_id('rep1'), 'accepted', 2) r),
  'El representante registra la aceptación de una persona sin cuenta'
);

select ok(
  (select response_source = 'representative' and responded_by = 'b5000000-0000-0000-0000-000000000001'
      and responded_at is not null
   from activity_assignments where id = t_id('rep1')),
  'La respuesta queda marcada como representative con el usuario que la registró'
);

select ok(
  (select r ->> 'status' = 'declined' from public.record_assignment_response(t_id('rep1'), 'declined') r),
  'El representante sí puede pasar una aceptada a rechazada'
);

-- ============================================================
-- 3. Sustituciones: solicitud, candidato y aceptación
-- ============================================================
select t_set('s1', t_asg(t_id('pos_s1'), 'b5000000-0000-0000-0000-0000000e0002', '{"send":true}')::text);
select t_set('p4', t_asg(t_id('pos_r'), 'b5000000-0000-0000-0000-0000000e0004', '{"send":true}')::text);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000002');
select public.respond_activity_assignment(t_id('s1'), 'accepted');

select test_set_auth_uid('b5000000-0000-0000-0000-000000000003');

select throws_ok(
  $$ select public.request_assignment_substitution(t_id('s1')) $$,
  '42501', null,
  'Quien no es la persona ni gestiona el puesto no puede pedir sustitución'
);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000004');

select throws_ok(
  $$ select public.request_assignment_substitution(t_id('p4')) $$,
  '22023', null,
  'La persona no pide sustitución de una asignación pendiente (debe rechazarla)'
);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');
select is(t_err($q$ select public.create_activity_assignment(t_id('pos_r'), 'b5000000-0000-0000-0000-0000000e0005', '{"acknowledge_warnings":true}') $q$),
  'PT412:overlapping_assignment',
  'El antiguo acknowledge_warnings booleano se ignora: los avisos siguen sin confirmar (PT412)');
select t_set('draft5', t_asg(t_id('pos_r'), 'b5000000-0000-0000-0000-0000000e0005', '{"acknowledged_warnings":["overlapping_assignment"]}')::text);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000005');

select throws_ok(
  $$ select public.request_assignment_substitution(t_id('draft5')) $$,
  'P0002', null,
  'Pedir sustitución de un borrador propio (sin gestionar el puesto) responde P0002: el borrador no existe para la persona'
);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000002');

select lives_ok(
  $$ select t_set('req1_res', public.request_assignment_substitution(t_id('s1'))::text) $$,
  'La persona pide sustitución de su asignación aceptada antes del inicio'
);
select t_set('req1', current_setting('t5r.req1_res')::jsonb ->> 'request_id');

select ok(
  not (current_setting('t5r.req1_res')::jsonb ->> 'replayed')::boolean
  and (select status = 'open' and requested_by_self and requested_by = 'b5000000-0000-0000-0000-000000000002'
          and original_assignment_id = t_id('s1') and candidate_assignment_id is null
       from activity_substitution_requests where id = t_id('req1')),
  'La solicitud queda abierta, marcada como pedida por la propia persona y sin candidato'
);

select ok(
  (select (r ->> 'replayed')::boolean and (r ->> 'request_id')::uuid = t_id('req1')
   from public.request_assignment_substitution(t_id('s1')) r),
  'Pedir sustitución de nuevo es idempotente'
);

select is(t_state(t_id('s1')), 'accepted:2',
  'La asignación original sigue aceptada mientras no haya sustituto');

select throws_ok(
  $$ select public.propose_substitution_candidate(t_id('req1'), 'b5000000-0000-0000-0000-0000000e0003') $$,
  '42501', null,
  'La persona asignada no puede elegir candidato'
);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');

select throws_ok(
  $$ select public.propose_substitution_candidate(t_id('req1'), 'b5000000-0000-0000-0000-0000000e0002') $$,
  '22023', null,
  'El candidato debe ser una persona distinta de la original'
);

select lives_ok(
  $$ select t_set('cand1', public.propose_substitution_candidate(t_id('req1'), 'b5000000-0000-0000-0000-0000000e0003') ->> 'assignment_id') $$,
  'Quien gestiona propone un candidato aunque el puesto (máximo 1) esté ocupado por la original'
);

select ok(
  (select status = 'pending' and substitutes_assignment_id = t_id('s1') and sent_at is not null
      and person_id = 'b5000000-0000-0000-0000-0000000e0003'
   from activity_assignments where id = t_id('cand1'))
  and (select candidate_assignment_id = t_id('cand1') from activity_substitution_requests where id = t_id('req1')),
  'El candidato nace pendiente, vinculado a la original y registrado en la solicitud'
);

select ok(
  (select assigned_count = 1 and pending_count = 1 and proposed_count = 0 and expected_count = 1
   from public.activity_position_coverage(t_id('act_s')) where activity_position_id = t_id('pos_s1')),
  'La original y su candidato vigente cuentan como una sola plaza prevista (expected_count = 1)'
);

select throws_ok(
  $$ select public.propose_substitution_candidate(t_id('req1'), 'b5000000-0000-0000-0000-0000000e0004') $$,
  '23505', 'La solicitud ya tiene un candidato pendiente: retíralo antes de proponer otro.',
  'Con un candidato vigente no se puede proponer otro (23505) y no se sobrescribe'
);

select ok(
  (select candidate_assignment_id = t_id('cand1') from activity_substitution_requests where id = t_id('req1'))
  and t_state(t_id('cand1')) = 'pending:1',
  'Tras el intento fallido, la solicitud conserva su candidato vigente'
);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000003');
select public.respond_activity_assignment(t_id('cand1'), 'declined');

select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');

select ok(
  (select status = 'open' and candidate_assignment_id is null from activity_substitution_requests where id = t_id('req1'))
  and t_state(t_id('s1')) = 'accepted:2',
  'Si el candidato rechaza, la solicitud sigue abierta sin candidato y la original sigue aceptada'
);

select lives_ok(
  $$ select t_set('cand2', public.propose_substitution_candidate(t_id('req1'), 'b5000000-0000-0000-0000-0000000e0004') ->> 'assignment_id') $$,
  'Tras el rechazo se puede proponer otro candidato'
);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000003');

select throws_ok(
  $$ select public.respond_activity_assignment(t_id('cand1'), 'accepted') $$,
  '22023', 'Esta propuesta de sustitución ya no está activa.',
  'Un candidato que rechazó y ya no es el candidato activo no puede aceptar después'
);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000004');

select ok(
  (select r ->> 'status' = 'accepted' from public.respond_activity_assignment(t_id('cand2'), 'accepted') r),
  'El candidato acepta'
);

select ok(
  t_state(t_id('s1')) = 'substituted:3' and t_state(t_id('cand2')) = 'accepted:2',
  'Al aceptar el candidato la original pasa a substituted (nueva versión) y el candidato queda aceptado'
);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');

select ok(
  (select status = 'completed' and completed_at is not null from activity_substitution_requests where id = t_id('req1'))
  and (select substituted_at is not null from activity_assignments where id = t_id('s1')),
  'La solicitud queda completed y la original guarda substituted_at'
);

select ok(
  (select assigned_count = 1 and pending_count = 0 and expected_count = 1
   from public.activity_position_coverage(t_id('act_s')) where activity_position_id = t_id('pos_s1')),
  'Tras la sustitución el puesto cuenta una sola aceptada (la del sustituto)'
);

select throws_ok(
  $$ select public.request_assignment_substitution(t_id('s1')) $$,
  '22023', null,
  'Una asignación ya sustituida no admite nueva solicitud'
);

select throws_ok(
  $$ select public.propose_substitution_candidate(t_id('req1'), 'b5000000-0000-0000-0000-0000000e0005') $$,
  '22023', null,
  'Una solicitud completada no admite candidatos'
);

-- ============================================================
-- 4. Cancelar solicitudes
-- ============================================================
select t_set('s2', t_asg(t_id('pos_s2'), 'b5000000-0000-0000-0000-0000000e0005', '{"send":true}')::text);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000005');
select public.respond_activity_assignment(t_id('s2'), 'accepted');

select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');
select t_set('req2', public.request_assignment_substitution(t_id('s2')) ->> 'request_id');

select ok(
  (select not requested_by_self and requested_by = 'b5000000-0000-0000-0000-000000000001'
   from activity_substitution_requests where id = t_id('req2')),
  'Quien gestiona el puesto también puede abrir la solicitud (requested_by_self false)'
);

select t_set('cand3', public.propose_substitution_candidate(t_id('req2'), 'b5000000-0000-0000-0000-0000000e0003') ->> 'assignment_id');

select test_set_auth_uid('b5000000-0000-0000-0000-000000000004');

select throws_ok(
  $$ select public.cancel_substitution_request(t_id('req2')) $$,
  '42501', null,
  'Quien no es la persona original ni gestiona el puesto no cancela la solicitud'
);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000005');

select throws_ok(
  $$ select public.cancel_substitution_request(t_id('req2')) $$,
  '42501', null,
  'La persona original no cancela una solicitud abierta por quien gestiona el puesto (requested_by_self false)'
);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');

select lives_ok(
  $$ select public.cancel_substitution_request(t_id('req2')) $$,
  'Quien gestiona el puesto cancela la solicitud que abrió'
);

select ok(
  (select status = 'cancelled' and cancelled_at is not null and cancelled_by = 'b5000000-0000-0000-0000-000000000001'
   from activity_substitution_requests where id = t_id('req2'))
  and t_state(t_id('cand3')) = 'cancelled:2'
  and t_state(t_id('s2')) = 'accepted:2',
  'Cancelar la solicitud cancela el candidato y la original sigue aceptada'
);

reset role;
select is((select cancel_cause from activity_assignments where id = t_id('cand3')), 'substitution_withdrawn',
  'El candidato retirado queda con causa substitution_withdrawn');
select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');

select lives_ok(
  $$ select public.cancel_substitution_request(t_id('req2')) $$,
  'Cancelar una solicitud ya cancelada no falla'
);

-- Retirar la asignación original con solicitud abierta.
select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');
select t_set('s3', t_asg(t_id('pos_s3'), 'b5000000-0000-0000-0000-0000000e0003', '{"send":true}')::text);
select public.record_assignment_response(t_id('s3'), 'accepted');
select t_set('req3', public.request_assignment_substitution(t_id('s3')) ->> 'request_id');
select ok(
  t_err($q$ select public.propose_substitution_candidate(t_id('req3'), 'b5000000-0000-0000-0000-0000000e0004') $q$) = 'PT412:overlapping_assignment'
  and t_err($q$ select public.propose_substitution_candidate(t_id('req3'), 'b5000000-0000-0000-0000-0000000e0004', array['different_campus']) $q$) = 'PT412:overlapping_assignment',
  'Proponer un candidato con avisos sin confirmar su código (lista vacía u otros códigos) falla con PT412 y los no confirmados'
);
select t_set('cand4', public.propose_substitution_candidate(t_id('req3'), 'b5000000-0000-0000-0000-0000000e0004', array['overlapping_assignment']) ->> 'assignment_id');
select public.cancel_activity_assignment(t_id('s3'));

select ok(
  (select status = 'cancelled' and cancel_cause = 'coordinator' from activity_assignments where id = t_id('s3'))
  and (select status = 'cancelled' and cancel_cause = 'substitution_withdrawn' from activity_assignments where id = t_id('cand4'))
  and (select status = 'cancelled' from activity_substitution_requests where id = t_id('req3')),
  'Retirar la original con solicitud abierta cancela también el candidato y la solicitud'
);

-- Un candidato que rechazó no puede sustituir tras cancelarse la solicitud.
select t_set('s4', t_asg(t_id('pos_s4'), 'b5000000-0000-0000-0000-0000000e0002', '{"send":true}')::text);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000002');
select public.respond_activity_assignment(t_id('s4'), 'accepted');
select t_set('req4', public.request_assignment_substitution(t_id('s4')) ->> 'request_id');

select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');
select t_set('cand5', public.propose_substitution_candidate(t_id('req4'), 'b5000000-0000-0000-0000-0000000e0003') ->> 'assignment_id');

select test_set_auth_uid('b5000000-0000-0000-0000-000000000003');
select public.respond_activity_assignment(t_id('cand5'), 'declined');

select test_set_auth_uid('b5000000-0000-0000-0000-000000000002');
select public.cancel_substitution_request(t_id('req4'));

select test_set_auth_uid('b5000000-0000-0000-0000-000000000003');
select t_set('cand5_try', t_err($q$ select public.respond_activity_assignment(t_id('cand5'), 'accepted') $q$));

select ok(
  current_setting('t5r.cand5_try') = '22023'
  and t_state(t_id('s4')) like 'accepted:%' and t_state(t_id('cand5')) = 'declined:2',
  'Tras cancelar la solicitud, el candidato que había rechazado no puede aceptar ni sustituir a la original'
);

-- ============================================================
-- 5. Plazas de una sustitución y original que deja de estar vigente
-- ============================================================
select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');

-- Original + candidato vigente ocupan una sola plaza.
select t_set('c_orig', t_asg(t_id('pos_c1'), 'b5000000-0000-0000-0000-0000000e0002', '{"send":true}')::text);
select public.record_assignment_response(t_id('c_orig'), 'accepted');
select t_set('c_req', public.request_assignment_substitution(t_id('c_orig')) ->> 'request_id');
select t_set('c_cand', public.propose_substitution_candidate(t_id('c_req'), 'b5000000-0000-0000-0000-0000000e0003',
  array['overlapping_assignment']) ->> 'assignment_id');

select lives_ok(
  $$ select t_set('c_third', t_asg(t_id('pos_c1'), 'b5000000-0000-0000-0000-0000000e0004',
       '{"send":true,"acknowledged_warnings":["overlapping_assignment"]}')::text) $$,
  'En un puesto de 2 plazas con original y candidato vigente (una plaza) cabe otra persona'
);

select ok(
  (select assigned_count = 1 and pending_count = 2 and expected_count = 2
   from public.activity_position_coverage(t_id('act_c')) where activity_position_id = t_id('pos_c1')),
  'Cobertura: original + candidato + tercera persona son 2 plazas previstas'
);

select is(t_err($q$ select public.create_activity_assignment(t_id('pos_c1'), 'b5000000-0000-0000-0000-0000000e0005',
    '{"acknowledged_warnings":["overlapping_assignment"]}') $q$),
  '22023:position_full',
  'Con las 2 plazas ocupadas (una por el par original-candidato) crear otra falla con position_full');

-- El representante rechaza una original aceptada con solicitud abierta.
select t_set('c2_orig', t_asg(t_id('pos_c2'), 'b5000000-0000-0000-0000-0000000e0005',
  '{"send":true,"acknowledged_warnings":["overlapping_assignment"]}')::text);
select public.record_assignment_response(t_id('c2_orig'), 'accepted');
select t_set('c2_req', public.request_assignment_substitution(t_id('c2_orig')) ->> 'request_id');
select t_set('c2_cand', public.propose_substitution_candidate(t_id('c2_req'), 'b5000000-0000-0000-0000-0000000e0007',
  array['overlapping_assignment']) ->> 'assignment_id');
select public.record_assignment_response(t_id('c2_orig'), 'declined');

select ok(
  t_state(t_id('c2_orig')) like 'declined:%'
  and (select status = 'cancelled' and cancelled_at is not null from activity_substitution_requests where id = t_id('c2_req'))
  and t_state(t_id('c2_cand')) = 'cancelled:2'
  and (select cancel_cause = 'substitution_withdrawn' from activity_assignments where id = t_id('c2_cand')),
  'Si el representante rechaza una original aceptada con solicitud abierta, se cancelan la solicitud y su candidato (substitution_withdrawn)'
);

-- La persona rechaza una original pendiente con solicitud abierta por quien gestiona.
select t_set('c3_orig', t_asg(t_id('pos_c3'), 'b5000000-0000-0000-0000-0000000e0004',
  '{"send":true,"acknowledged_warnings":["overlapping_assignment"]}')::text);
select t_set('c3_req', public.request_assignment_substitution(t_id('c3_orig')) ->> 'request_id');
select t_set('c3_cand', public.propose_substitution_candidate(t_id('c3_req'), 'b5000000-0000-0000-0000-0000000e0002',
  array['overlapping_assignment']) ->> 'assignment_id');

select test_set_auth_uid('b5000000-0000-0000-0000-000000000004');
select public.respond_activity_assignment(t_id('c3_orig'), 'declined');

select test_set_auth_uid('b5000000-0000-0000-0000-000000000001');

select ok(
  t_state(t_id('c3_orig')) = 'declined:2'
  and (select status = 'cancelled' and cancelled_by = 'b5000000-0000-0000-0000-000000000004'
       from activity_substitution_requests where id = t_id('c3_req'))
  and (select status = 'cancelled' and cancel_cause = 'substitution_withdrawn' from activity_assignments where id = t_id('c3_cand')),
  'Si la persona rechaza su original pendiente con solicitud abierta, se cancelan la solicitud y su candidato'
);

select test_set_auth_uid('b5000000-0000-0000-0000-000000000002');

select is(t_err($q$ select public.respond_activity_assignment(t_id('c3_cand'), 'accepted') $q$), '22023',
  'El candidato retirado por el rechazo de la original ya no puede aceptar');

-- La original deja de estar vigente sin pasar por las RPC: al aceptar el
-- candidato no se marca substituted ni se audita assignment.substituted.
reset role;
select set_config('request.jwt.claims', '', true);
update activity_assignments set status = 'declined' where id = t_id('c_orig');

select test_set_auth_uid('b5000000-0000-0000-0000-000000000003');
select public.respond_activity_assignment(t_id('c_cand'), 'accepted');

reset role;
select ok(
  (select status = 'declined' and substituted_at is null from activity_assignments where id = t_id('c_orig'))
  and t_state(t_id('c_cand')) = 'accepted:2'
  and (select status = 'completed' from activity_substitution_requests where id = t_id('c_req'))
  and not exists (select 1 from audit_logs where action = 'assignment.substituted' and entity_id = t_id('c_orig')),
  'assignment.substituted solo se audita si la original pasó realmente a substituted'
);

-- ============================================================
-- 6. Auditoría
-- ============================================================
reset role;

select ok(
  exists (select 1 from audit_logs where action = 'assignment.accepted' and entity_id = t_id('r1')
          and metadata ->> 'source' = 'self' and actor_user_id = 'b5000000-0000-0000-0000-000000000002')
  and exists (select 1 from audit_logs where action = 'assignment.declined' and entity_id = t_id('r2')),
  'Se auditan assignment.accepted y assignment.declined con origen y actor'
);

select ok(
  exists (select 1 from audit_logs where action = 'assignment.response_recorded' and entity_id = t_id('rep1')
          and metadata ->> 'source' = 'representative' and actor_user_id = 'b5000000-0000-0000-0000-000000000001')
  and not exists (select 1 from audit_logs where action = 'assignment.accepted' and entity_id = t_id('rep1')),
  'La respuesta del representante se audita como assignment.response_recorded'
);

select ok(
  exists (select 1 from audit_logs where action = 'assignment.substitution_requested' and entity_id = t_id('s1')
          and (metadata ->> 'by_self')::boolean)
  and (select count(*) = 2 from audit_logs where action = 'assignment.substitution_candidate_proposed'
       and metadata ->> 'request_id' = t_id('req1')::text)
  and exists (select 1 from audit_logs where action = 'assignment.substituted' and entity_id = t_id('s1')
              and metadata ->> 'substitute_assignment_id' = t_id('cand2')::text)
  and exists (select 1 from audit_logs where action = 'assignment.substitution_cancelled' and entity_id = t_id('s2')),
  'Se auditan solicitud, candidatos, sustitución completada y cancelación de la solicitud'
);

select ok(
  (select metadata -> 'acknowledged_warnings' = '["overlapping_assignment"]'::jsonb
   from audit_logs where action = 'assignment.substitution_candidate_proposed' and entity_id = t_id('cand4'))
  and (select metadata -> 'acknowledged_warnings' = '[]'::jsonb
       from audit_logs where action = 'assignment.substitution_candidate_proposed' and entity_id = t_id('cand1')),
  'La auditoría de assignment.substitution_candidate_proposed incluye los avisos confirmados'
);

select ok(
  not exists (select 1 from audit_logs where metadata::text like '%Llego 10 minutos%' or metadata::text like '%coordinador no%'),
  'La nota privada nunca se escribe en la auditoría'
);

select * from finish();
rollback;
