-- Fase 5 (DI-02) · Tests de avisos: emisión de eventos y destinatarios,
-- deduplicación, proceso del outbox (bandeja y entregas por canal),
-- silencio 22:00-08:00, recordatorios, escalado de puestos críticos,
-- aislamiento entre iglesias y permisos.
-- Ver migraciones 20260923000200..0500 y docs/FASE-5-AVISOS-DISPONIBILIDAD.md §4.

begin;
select plan(67);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function t_set(p_key text, p_value text) returns text as $$
  select set_config('t5n.' || p_key, coalesce(p_value, ''), true);
$$ language sql;

create or replace function t_id(p_key text) returns uuid as $$
  select nullif(current_setting('t5n.' || p_key, true), '')::uuid;
$$ language sql;

create or replace function t_err(p_sql text) returns text as $$
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

-- Reloj del motor de avisos (permite fijar el instante en las pruebas).
create or replace function t_clock(p_at text) returns text as $$
  select set_config('app.notification_now', coalesce(p_at, ''), true);
$$ language sql;

create or replace function t_area(p_activity uuid, p_service_area uuid) returns uuid as $$
  select (public.add_activity_area(p_activity, p_service_area, 'optional', null, false) ->> 'activity_service_area_id')::uuid;
$$ language sql;

create or replace function t_pos(p_area uuid, p_input jsonb) returns uuid as $$
  select public.add_activity_position(p_area, p_input);
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

-- Eventos del outbox por tipo y entidad.
create or replace function tn_count(p_type text, p_entity uuid) returns integer as $$
  select count(*)::integer from notification_events
  where event_type = p_type and entity_id = p_entity;
$$ language sql security definer;

create or replace function tn_to(p_type text, p_entity uuid) returns uuid[] as $$
  select (select array_agg(x order by x) from unnest(e.recipient_person_ids) x)
  from notification_events e
  where e.event_type = p_type and e.entity_id = p_entity
  order by e.created_at desc, e.id desc limit 1;
$$ language sql security definer;

create or replace function tn_payload(p_type text, p_entity uuid) returns jsonb as $$
  select e.payload from notification_events e
  where e.event_type = p_type and e.entity_id = p_entity
  order by e.created_at desc, e.id desc limit 1;
$$ language sql security definer;

create or replace function t_sorted(p_ids uuid[]) returns uuid[] as $$
  select (select array_agg(x order by x) from unnest(p_ids) x);
$$ language sql;

-- Entrega de un aviso por canal.
create or replace function tn_delivery(p_event_type text, p_entity uuid, p_person uuid, p_channel text)
returns notification_deliveries as $$
  select d.* from notification_deliveries d
  join notifications n on n.id = d.notification_id
  join notification_events e on e.id = n.event_id
  where e.event_type = p_event_type and e.entity_id = p_entity
    and n.person_id = p_person and d.channel = p_channel::notification_channel
  order by d.created_at desc limit 1;
$$ language sql security definer;

-- ============================================================
-- Provisión de iglesias
-- ============================================================
insert into auth.users (id, email) values
  ('d5000000-0000-0000-0000-000000000001', 'owner.di2a@example.test'),
  ('d5000000-0000-0000-0000-000000000002', 'owner.di2b@example.test'),
  ('d5000000-0000-0000-0000-000000000003', 'lider.di2a@example.test'),
  ('d5000000-0000-0000-0000-000000000004', 'paula.di2a@example.test');

select test_set_auth_uid('d5000000-0000-0000-0000-000000000001');
select t_set('church_a', out_church_id::text), t_set('owner_a', out_person_id::text)
from app.provision_church(
  'Church A DI2', 'church-a-di2', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Olga', 'Admin', 'owner.di2a@example.test', null, 'Sede A DI2', null, null, null, null,
  array['people', 'serving'], null
);

select test_set_auth_uid('d5000000-0000-0000-0000-000000000002');
select t_set('church_b', out_church_id::text), t_set('owner_b', out_person_id::text)
from app.provision_church(
  'Church B DI2', 'church-b-di2', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Borja', 'Admin', 'owner.di2b@example.test', null, 'Sede B DI2', null, null, null, null,
  array['people', 'serving'], null
);

reset role;

-- ============================================================
-- Catálogo (superusuario)
-- ============================================================
insert into people (id, user_id, first_name, last_name, source) values
  ('d5000000-0000-0000-0000-0000000e0001', 'd5000000-0000-0000-0000-000000000004', 'Paula', 'Pérez', 'manual'),
  ('d5000000-0000-0000-0000-0000000e0002', null, 'Quique', 'Quirós', 'manual'),
  ('d5000000-0000-0000-0000-0000000e0003', null, 'Rosa', 'Ruiz', 'manual'),
  ('d5000000-0000-0000-0000-0000000e0004', null, 'Sara', 'Soler', 'manual'),
  ('d5000000-0000-0000-0000-0000000e0005', null, 'Tomás', 'Torres', 'manual'),
  ('d5000000-0000-0000-0000-0000000e0020', 'd5000000-0000-0000-0000-000000000003', 'Luis', 'Líder', 'manual'),
  ('d5000000-0000-0000-0000-0000000e0030', null, 'Bea', 'Bautista', 'manual');

insert into church_people (id, church_id, person_id, relationship, source) values
  (default, t_id('church_a'), 'd5000000-0000-0000-0000-0000000e0001', 'member', 'manual'),
  (default, t_id('church_a'), 'd5000000-0000-0000-0000-0000000e0002', 'member', 'manual'),
  (default, t_id('church_a'), 'd5000000-0000-0000-0000-0000000e0003', 'member', 'manual'),
  (default, t_id('church_a'), 'd5000000-0000-0000-0000-0000000e0004', 'member', 'manual'),
  (default, t_id('church_a'), 'd5000000-0000-0000-0000-0000000e0005', 'member', 'manual'),
  ('d5000000-0000-0000-0000-0000000f0020', t_id('church_a'), 'd5000000-0000-0000-0000-0000000e0020', 'member', 'manual'),
  (default, t_id('church_b'), 'd5000000-0000-0000-0000-0000000e0030', 'member', 'manual');

-- Área con líder (Sonido) y área sin líder (Multimedia): regla 2.
insert into service_areas (id, church_id, name, slug) values
  ('d5000000-0000-0000-0000-0000000a0001', t_id('church_a'), 'Sonido DI2', 'sonido-di2'),
  ('d5000000-0000-0000-0000-0000000a0002', t_id('church_a'), 'Multimedia DI2', 'multimedia-di2'),
  ('d5000000-0000-0000-0000-0000000a0003', t_id('church_b'), 'Sonido DI2 B', 'sonido-di2-b');

insert into service_area_leaders (church_id, service_area_id, person_id, is_primary)
values (t_id('church_a'), 'd5000000-0000-0000-0000-0000000a0001', 'd5000000-0000-0000-0000-0000000e0020', true);

insert into church_people_roles (church_id, church_people_id, role_key, scope_type, scope_id)
values (t_id('church_a'), 'd5000000-0000-0000-0000-0000000f0020', 'ministry_leader', 'service_area', 'd5000000-0000-0000-0000-0000000a0001');

insert into service_area_members (church_id, service_area_id, person_id, status, level)
select t_id('church_a'), a, p, 'active', 'autonomous'
from unnest(array['d5000000-0000-0000-0000-0000000a0001'::uuid, 'd5000000-0000-0000-0000-0000000a0002']) a
cross join unnest(array['d5000000-0000-0000-0000-0000000e0001'::uuid, 'd5000000-0000-0000-0000-0000000e0002',
                        'd5000000-0000-0000-0000-0000000e0003', 'd5000000-0000-0000-0000-0000000e0004',
                        'd5000000-0000-0000-0000-0000000e0005']) p;

insert into service_area_members (church_id, service_area_id, person_id, status, level)
values (t_id('church_b'), 'd5000000-0000-0000-0000-0000000a0003', 'd5000000-0000-0000-0000-0000000e0030', 'active', 'autonomous');

select test_set_auth_uid('d5000000-0000-0000-0000-000000000001');

-- ============================================================
-- 1. Emisión: borrador, envío y propuesta
-- ============================================================
select t_set('act1', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"Culto DI2","local_start":"2031-03-02T10:00","duration_minutes":120}'::jsonb) ->> 'activity_id');
select t_set('pos1', t_pos(t_area(t_id('act1'), 'd5000000-0000-0000-0000-0000000a0001'), '{"name":"Mesa DI2","min_people":1}')::text);
select public.transition_activity_status(t_id('act1'), 'published');

select t_set('a_draft', t_asg(t_id('pos1'), 'd5000000-0000-0000-0000-0000000e0001')::text);

select is(tn_count('assignment.proposed', t_id('a_draft')), 0,
  'Una asignación en borrador (proposed) no genera ningún evento de aviso');

select public.send_activity_assignments(t_id('act1'), array[t_id('a_draft')]);

select is(tn_count('assignment.proposed', t_id('a_draft')), 1,
  'Enviar el borrador emite assignment.proposed');

select is(tn_to('assignment.proposed', t_id('a_draft')), array['d5000000-0000-0000-0000-0000000e0001'::uuid],
  'assignment.proposed va solo a la persona asignada');

select ok(
  (tn_payload('assignment.proposed', t_id('a_draft')) ->> 'position_name') = 'Mesa DI2'
  and (tn_payload('assignment.proposed', t_id('a_draft')) ->> 'activity_title') = 'Culto DI2'
  and (tn_payload('assignment.proposed', t_id('a_draft')) ? 'starts_at')
  and (tn_payload('assignment.proposed', t_id('a_draft')) ->> 'timezone') = 'Europe/Madrid',
  'El payload lleva lo mínimo: título, puesto, inicio y zona'
);

-- Creada ya enviada.
select t_set('a_sent', t_asg(t_id('pos1'), 'd5000000-0000-0000-0000-0000000e0002', '{"send":true}')::text);
select is(tn_count('assignment.proposed', t_id('a_sent')), 1,
  'Crear la asignación ya enviada emite assignment.proposed en el alta');

-- ============================================================
-- 2. Respuestas: destinatarios de la regla 2
-- ============================================================
select public.record_assignment_response(t_id('a_draft'), 'accepted');

select is(
  tn_to('assignment.accepted', t_id('a_draft')),
  t_sorted(array[t_id('owner_a'), 'd5000000-0000-0000-0000-0000000e0020'::uuid]),
  'assignment.accepted va a quien creó la asignación y al líder del área'
);

select public.record_assignment_response(t_id('a_sent'), 'declined');

select is(
  tn_to('assignment.declined', t_id('a_sent')),
  t_sorted(array[t_id('owner_a'), 'd5000000-0000-0000-0000-0000000e0020'::uuid]),
  'assignment.declined va al mismo conjunto de destinatarios'
);

-- Área sin líder: la administración de la iglesia.
select t_set('act2', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"Culto sin líder DI2","local_start":"2031-03-09T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos2', t_pos(t_area(t_id('act2'), 'd5000000-0000-0000-0000-0000000a0002'), '{"name":"Proyección DI2","min_people":1}')::text);
select public.transition_activity_status(t_id('act2'), 'published');
select t_set('a_noleader', t_asg(t_id('pos2'), 'd5000000-0000-0000-0000-0000000e0003', '{"send":true}')::text);
select public.record_assignment_response(t_id('a_noleader'), 'accepted');

select is(
  tn_to('assignment.accepted', t_id('a_noleader')),
  array[t_id('owner_a')],
  'Sin líder de área, la respuesta avisa a la administración de la iglesia (regla 2)'
);

-- ============================================================
-- 3. Cancelaciones: solo si el turno se había comunicado
-- ============================================================
select t_set('act3', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"Culto cancelaciones DI2","local_start":"2031-04-06T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos3', t_pos(t_area(t_id('act3'), 'd5000000-0000-0000-0000-0000000a0001'), '{"name":"Monitores DI2","min_people":0}')::text);
select public.transition_activity_status(t_id('act3'), 'published');

select t_set('c_draft', t_asg(t_id('pos3'), 'd5000000-0000-0000-0000-0000000e0001')::text);
select public.cancel_activity_assignment(t_id('c_draft'));

select is(tn_count('assignment.cancelled', t_id('c_draft')), 0,
  'Retirar un borrador nunca comunicado no avisa a la persona');

select t_set('c_sent', t_asg(t_id('pos3'), 'd5000000-0000-0000-0000-0000000e0002', '{"send":true}')::text);
select public.cancel_activity_assignment(t_id('c_sent'));

select is(tn_count('assignment.cancelled', t_id('c_sent')), 1,
  'Retirar un turno ya comunicado emite assignment.cancelled');

select is(tn_to('assignment.cancelled', t_id('c_sent')), array['d5000000-0000-0000-0000-0000000e0002'::uuid],
  'assignment.cancelled va a la persona del turno');

select ok(
  not (tn_payload('assignment.cancelled', t_id('c_sent')) ? 'cancellation_reason')
  and not (tn_payload('assignment.cancelled', t_id('c_sent')) ? 'note'),
  'El payload de una cancelación no lleva motivo ni notas'
);

-- ============================================================
-- 4. Sustitución
-- ============================================================
select t_set('act4', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"Culto sustitución DI2","local_start":"2031-04-13T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos4', t_pos(t_area(t_id('act4'), 'd5000000-0000-0000-0000-0000000a0001'), '{"name":"Directo DI2","min_people":1,"max_people":1}')::text);
select public.transition_activity_status(t_id('act4'), 'published');

select t_set('s_orig', t_asg(t_id('pos4'), 'd5000000-0000-0000-0000-0000000e0001')::text);
select t_respond(t_id('s_orig'), 'accepted');
select t_set('s_req', public.request_assignment_substitution(t_id('s_orig')) ->> 'request_id');

select is(
  tn_to('assignment.substitution_requested', t_id('s_req')),
  t_sorted(array[t_id('owner_a'), 'd5000000-0000-0000-0000-0000000e0020'::uuid]),
  'assignment.substitution_requested va a quien gestiona el puesto'
);

select t_set('s_cand', (public.propose_substitution_candidate(t_id('s_req'), 'd5000000-0000-0000-0000-0000000e0004') ->> 'assignment_id')::text);

select is(tn_count('assignment.proposed', t_id('s_cand')), 1,
  'Proponer un candidato de sustitución le emite assignment.proposed');

select public.record_assignment_response(t_id('s_cand'), 'accepted');

select is(tn_to('assignment.substituted', t_id('s_orig')), array['d5000000-0000-0000-0000-0000000e0001'::uuid],
  'Al aceptar el candidato, la persona original recibe assignment.substituted');

-- ============================================================
-- 5. Reprogramación y cancelación de la actividad
-- ============================================================
select t_set('act5', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"Culto reprogramado DI2","local_start":"2031-05-04T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos5', t_pos(t_area(t_id('act5'), 'd5000000-0000-0000-0000-0000000a0001'), '{"name":"Cámara DI2","min_people":0}')::text);
select public.transition_activity_status(t_id('act5'), 'published');
select t_set('r_sent', t_asg(t_id('pos5'), 'd5000000-0000-0000-0000-0000000e0001', '{"send":true}')::text);
select t_set('r_draft', t_asg(t_id('pos5'), 'd5000000-0000-0000-0000-0000000e0002')::text);

select public.update_activity(t_id('act5'), '{"local_start":"2031-05-04T12:00"}'::jsonb);

select is(tn_count('activity.rescheduled', t_id('r_sent')), 1,
  'Cambiar la hora emite activity.rescheduled a quien tenía el turno comunicado');

select is(tn_count('activity.rescheduled', t_id('r_draft')), 0,
  'Un borrador no recibe activity.rescheduled');

select ok(
  (tn_payload('activity.rescheduled', t_id('r_sent')) ->> 'starts_at')::timestamptz
    = (select starts_at from activities where id = t_id('act5')),
  'El payload de activity.rescheduled lleva ya la hora nueva'
);

-- Cancelar la actividad cancela las asignaciones y avisa a quien la tenía comunicada.
select t_set('act6', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"Culto anulado DI2","local_start":"2031-05-11T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos6', t_pos(t_area(t_id('act6'), 'd5000000-0000-0000-0000-0000000a0001'), '{"name":"Grabación DI2","min_people":0}')::text);
select public.transition_activity_status(t_id('act6'), 'published');
select t_set('x_sent', t_asg(t_id('pos6'), 'd5000000-0000-0000-0000-0000000e0001', '{"send":true}')::text);
select t_set('x_draft', t_asg(t_id('pos6'), 'd5000000-0000-0000-0000-0000000e0002')::text);
select public.transition_activity_status(t_id('act6'), 'cancelled', 'Avería en la sala');

select ok(
  tn_count('assignment.cancelled', t_id('x_sent')) = 1
  and tn_count('assignment.cancelled', t_id('x_draft')) = 0
  and (tn_payload('assignment.cancelled', t_id('x_sent')) ->> 'cause') = 'activity_cancelled',
  'Cancelar la actividad avisa solo a quien tenía el turno comunicado, con la causa en código'
);

select ok(
  not (tn_payload('assignment.cancelled', t_id('x_sent'))::text ilike '%Avería%'),
  'El motivo redactado de la cancelación de la actividad nunca viaja en el payload'
);

-- ============================================================
-- 6. Deduplicación por clave
-- ============================================================
reset role;

select is(
  (select count(*)::integer from notification_events
   where idempotency_key = 'assignment.proposed:' || t_id('a_draft')::text || ':2'),
  1,
  'La clave de deduplicación es <event_type>:<entity_id>:<entity_version>'
);

select ok(
  app.emit_notification_event(
    t_id('church_a'), 'assignment.proposed', 'activity_assignments', t_id('a_draft'), 2,
    array['d5000000-0000-0000-0000-0000000e0001'::uuid], '{}'::jsonb) is null
  and (select count(*)::integer from notification_events
       where idempotency_key = 'assignment.proposed:' || t_id('a_draft')::text || ':2') = 1,
  'Repetir la misma transición no duplica el evento ni rompe la transacción'
);

select is(
  app.emit_notification_event(
    t_id('church_a'), 'assignment.proposed', 'activity_assignments', t_id('a_draft'), 99,
    array['d5000000-0000-0000-0000-0000000e0030'::uuid], '{}'::jsonb),
  null,
  'Un destinatario de otra iglesia se descarta y no se crea el evento (aislamiento)'
);

-- ============================================================
-- 7. Proceso: bandeja y entregas por canal
-- ============================================================
-- Preferencia: Quique desactiva el correo.
select test_set_auth_uid('d5000000-0000-0000-0000-000000000004');
select is(t_err($$ select public.set_my_notification_preference('inapp', false) $$), '22023',
  'La bandeja de la aplicación (inapp) no se puede desactivar');
reset role;

insert into notification_preferences (church_id, person_id, channel, enabled)
values (t_id('church_a'), 'd5000000-0000-0000-0000-0000000e0002', 'email', false);

select t_set('proc1', (app.process_notification_events(500) ->> 'events')::text);

select ok(
  (select count(*) from notification_events where processed_at is null) = 0
  and (select count(*) from notifications where church_id = t_id('church_a')) > 0,
  'El proceso vacía el outbox y crea la bandeja'
);

select is(
  (select count(*)::integer from notifications n
   join notification_events e on e.id = n.event_id
   where e.event_type = 'assignment.proposed' and e.entity_id = t_id('a_draft')),
  1,
  'Cada destinatario de un evento recibe una notificación'
);

select ok(
  (select title = 'Turno por confirmar' and body like '%Mesa DI2%' and body like '%Culto DI2%'
   from notifications n join notification_events e on e.id = n.event_id
   where e.event_type = 'assignment.proposed' and e.entity_id = t_id('a_draft')),
  'El texto del aviso se redacta en español con el puesto y la actividad'
);

select ok(
  (select bool_and(body not like '%correo%' and body not like '%email%' and body not like '%push%')
   from notifications where church_id = t_id('church_a')),
  'Ningún texto promete correo ni push'
);

select is(
  (select status::text from tn_delivery('assignment.proposed', t_id('a_sent'), 'd5000000-0000-0000-0000-0000000e0002', 'email')),
  'suppressed',
  'El canal desactivado por la persona genera una entrega suppressed'
);

select is(
  (select status::text from tn_delivery('assignment.proposed', t_id('a_sent'), 'd5000000-0000-0000-0000-0000000e0002', 'inapp')),
  'queued',
  'El canal inapp se encola aunque la persona desactive los demás'
);

select is(
  (select count(*)::integer from notification_deliveries d
   join notifications n on n.id = d.notification_id
   join notification_events e on e.id = n.event_id
   where e.entity_id = t_id('a_draft') and e.event_type = 'assignment.proposed'),
  3,
  'Se crea una entrega por canal (inapp, email y push)'
);

-- Reprocesar no duplica.
select ok(
  (app.process_notification_events(500) ->> 'notifications')::integer = 0
  and (select count(*)::integer from notifications n join notification_events e on e.id = n.event_id
       where e.event_type = 'assignment.proposed' and e.entity_id = t_id('a_draft')) = 1,
  'Reprocesar el outbox no duplica la bandeja'
);

-- ============================================================
-- 8. Silencio 22:00-08:00 (regla 5)
-- ============================================================
select is(
  app.notification_quiet_shift('2031-07-05T23:30:00+02'::timestamptz, 'Europe/Madrid'),
  '2031-07-06T08:00:00+02'::timestamptz,
  'Lo que cae a las 23:30 se entrega a las 08:00 del día siguiente'
);

select is(
  app.notification_quiet_shift('2031-07-06T03:00:00+02'::timestamptz, 'Europe/Madrid'),
  '2031-07-06T08:00:00+02'::timestamptz,
  'Lo que cae de madrugada se entrega a las 08:00 del mismo día'
);

select is(
  app.notification_quiet_shift('2031-07-06T13:00:00+02'::timestamptz, 'Europe/Madrid'),
  '2031-07-06T13:00:00+02'::timestamptz,
  'Fuera de la franja de silencio no se desplaza nada'
);

select test_set_auth_uid('d5000000-0000-0000-0000-000000000001');
select t_set('act7', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"Culto silencio DI2","local_start":"2031-07-06T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos7', t_pos(t_area(t_id('act7'), 'd5000000-0000-0000-0000-0000000a0001'), '{"name":"Silencio DI2","min_people":0}')::text);
select public.transition_activity_status(t_id('act7'), 'published');
select t_set('q_sent', t_asg(t_id('pos7'), 'd5000000-0000-0000-0000-0000000e0005', '{"send":true}')::text);
reset role;

select t_clock('2031-07-05T23:30:00+02');
select app.process_notification_events(100);

select is(
  (select scheduled_for from tn_delivery('assignment.proposed', t_id('q_sent'), 'd5000000-0000-0000-0000-0000000e0005', 'email')),
  '2031-07-06T08:00:00+02'::timestamptz,
  'El silencio desplaza scheduled_for de las entregas de correo'
);

select is(
  (select scheduled_for from tn_delivery('assignment.proposed', t_id('q_sent'), 'd5000000-0000-0000-0000-0000000e0005', 'inapp')),
  '2031-07-05T23:30:00+02'::timestamptz,
  'El canal inapp nunca se retrasa por el silencio'
);

-- Excepción: cancelar un turno de una actividad que empieza ese mismo día.
select test_set_auth_uid('d5000000-0000-0000-0000-000000000001');
select public.cancel_activity_assignment(t_id('q_sent'));
reset role;

select t_clock('2031-07-06T01:00:00+02');
select app.process_notification_events(100);

select is(
  (select scheduled_for from tn_delivery('assignment.cancelled', t_id('q_sent'), 'd5000000-0000-0000-0000-0000000e0005', 'email')),
  '2031-07-06T01:00:00+02'::timestamptz,
  'Una cancelación de una actividad que empieza el mismo día no se retrasa'
);

select t_clock('');

-- ============================================================
-- 9. Recordatorios (regla 4)
-- ============================================================
select test_set_auth_uid('d5000000-0000-0000-0000-000000000001');
select t_set('act8', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"Culto recordatorio DI2","local_start":"2031-10-05T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos8', t_pos(t_area(t_id('act8'), 'd5000000-0000-0000-0000-0000000a0001'), '{"name":"Recuerdo DI2","min_people":2,"critical":true}')::text);
select public.transition_activity_status(t_id('act8'), 'published');
select t_set('m_pend', t_asg(t_id('pos8'), 'd5000000-0000-0000-0000-0000000e0001', '{"send":true}')::text);
select t_set('m_acc', t_asg(t_id('pos8'), 'd5000000-0000-0000-0000-0000000e0002', '{"send":true}')::text);
select public.record_assignment_response(t_id('m_acc'), 'accepted');
select t_set('m_draft', t_asg(t_id('pos8'), 'd5000000-0000-0000-0000-0000000e0003')::text);
reset role;

-- A cinco días: la pendiente recibe el aviso de 7 días; la aceptada, todavía no.
select t_clock('2031-09-30T10:00:00+02');
select app.enqueue_due_reminders();

select ok(
  tn_count('assignment.reminder', t_id('m_pend')) = 1
  and tn_count('assignment.reminder', t_id('m_acc')) = 0
  and tn_count('assignment.reminder', t_id('m_draft')) = 0,
  'A cinco días solo se recuerda la asignación sin respuesta (plazo de 7 días)'
);

select app.enqueue_due_reminders();
select is(tn_count('assignment.reminder', t_id('m_pend')), 1,
  'Repetir el enganche de recordatorios no crea uno nuevo para el mismo plazo');

-- A un día: la pendiente recibe el de 2 días y la aceptada el de la víspera.
select t_clock('2031-10-04T10:00:00+02');
select app.enqueue_due_reminders();

select ok(
  tn_count('assignment.reminder', t_id('m_pend')) = 2
  and tn_count('assignment.reminder', t_id('m_acc')) = 1,
  'A un día se añade el recordatorio de 2 días de la pendiente y la víspera de la aceptada'
);

select is(
  (select e.payload ->> 'kind' from notification_events e
   where e.event_type = 'assignment.reminder' and e.entity_id = t_id('m_acc')),
  'accepted',
  'El recordatorio de una asignación aceptada se marca como tal'
);

-- Actividad cancelada: no se recuerda.
select test_set_auth_uid('d5000000-0000-0000-0000-000000000001');
select t_set('act9', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"Culto anulado recordatorio DI2","local_start":"2031-10-12T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos9', t_pos(t_area(t_id('act9'), 'd5000000-0000-0000-0000-0000000a0002'), '{"name":"Sin recordatorio DI2","min_people":0}')::text);
select public.transition_activity_status(t_id('act9'), 'published');
select t_set('n_pend', t_asg(t_id('pos9'), 'd5000000-0000-0000-0000-0000000e0004', '{"send":true}')::text);
select public.transition_activity_status(t_id('act9'), 'cancelled', 'Sin sala');
reset role;

select t_clock('2031-10-09T10:00:00+02');
select app.enqueue_due_reminders();
select is(tn_count('assignment.reminder', t_id('n_pend')), 0,
  'Una actividad cancelada no genera recordatorios');

-- ============================================================
-- 10. Escalado de puestos críticos (regla 3)
-- ============================================================
select t_clock('2031-10-03T10:00:00+02');
select app.escalate_uncovered_positions();

select is(tn_count('assignment.coverage_at_risk', t_id('pos8')), 1,
  'Un puesto crítico por debajo de su mínimo a menos de 3 días escala');

select is(tn_to('assignment.coverage_at_risk', t_id('pos8')), array[t_id('owner_a')],
  'El escalado avisa a la administración de la iglesia');

select is(
  (tn_payload('assignment.coverage_at_risk', t_id('pos8')) ->> 'missing'), '1',
  'El escalado indica cuántas personas faltan (mínimo 2, aceptadas 1)');

select app.escalate_uncovered_positions();
select is(tn_count('assignment.coverage_at_risk', t_id('pos8')), 1,
  'El escalado no se repite para el mismo puesto y horario');

-- A más de tres días no escala.
select is(tn_count('assignment.coverage_at_risk', t_id('pos9')), 0,
  'Un puesto no crítico o fuera de plazo no escala');

select t_clock('');

-- ============================================================
-- 11. Aislamiento entre iglesias
-- ============================================================
select test_set_auth_uid('d5000000-0000-0000-0000-000000000002');
select t_set('act_b', public.create_activity(t_id('church_b'),
  '{"type":"service","title":"Culto B DI2","local_start":"2031-03-02T10:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select t_set('pos_b', t_pos(t_area(t_id('act_b'), 'd5000000-0000-0000-0000-0000000a0003'), '{"name":"Mesa B DI2","min_people":0}')::text);
select public.transition_activity_status(t_id('act_b'), 'published');
select t_set('b_sent', t_asg(t_id('pos_b'), 'd5000000-0000-0000-0000-0000000e0030', '{"send":true}')::text);
reset role;

select ok(
  (select church_id = t_id('church_b') from notification_events
   where event_type = 'assignment.proposed' and entity_id = t_id('b_sent'))
  and not exists (
    select 1 from notification_events e
    where e.church_id = t_id('church_a')
      and e.recipient_person_ids && array['d5000000-0000-0000-0000-0000000e0030'::uuid]),
  'Los eventos quedan en su iglesia y no alcanzan a personas de otra'
);

select app.process_notification_events(500);

select test_set_auth_uid('d5000000-0000-0000-0000-000000000001');
select is(public.count_my_unread_notifications(t_id('church_b')), 0,
  'Una persona no cuenta avisos de una iglesia a la que no pertenece');

-- ============================================================
-- 12. Lectura de la persona y permisos
-- ============================================================
select test_set_auth_uid('d5000000-0000-0000-0000-000000000004');

select ok(
  (select count(*) from public.list_my_notifications(t_id('church_a'), false, 100)) > 0
  and (select count(*) from notifications) =
      (select count(*) from notifications where person_id = 'd5000000-0000-0000-0000-0000000e0001'),
  'Una persona solo ve sus propias notificaciones'
);

select t_set('paula_unread', public.count_my_unread_notifications(t_id('church_a'))::text);

select ok(
  (select count(*) from public.list_my_notifications(t_id('church_a'), true, 100))::integer
    = current_setting('t5n.paula_unread')::integer,
  'El contador de no leídos coincide con la bandeja filtrada'
);

select t_set('paula_first', (select id from public.list_my_notifications(t_id('church_a'), true, 1))::text);
select public.mark_notification_read(t_id('paula_first'));

select is(
  public.count_my_unread_notifications(t_id('church_a')),
  current_setting('t5n.paula_unread')::integer - 1,
  'Marcar un aviso como leído baja el contador'
);

select is(t_err($$ select public.mark_notification_read(
  (select id from notifications where person_id <> 'd5000000-0000-0000-0000-0000000e0001' limit 1)) $$),
  'P0002',
  'No se puede marcar como leído el aviso de otra persona');

-- En una misma sentencia, las funciones stable leen la instantánea previa:
-- cada mutación va en su propia sentencia antes de comprobarla.
select t_set('marked_all', (public.mark_all_notifications_read(t_id('church_a')) ->> 'updated')::text);

select ok(
  current_setting('t5n.marked_all')::integer >= 1
  and public.count_my_unread_notifications(t_id('church_a')) = 0,
  'Marcar todo como leído deja el contador a cero'
);

select t_set('pref_email', (public.set_my_notification_preference('email', false) ->> 'enabled')::text);

select ok(
  current_setting('t5n.pref_email')::boolean = false
  and (select not enabled from notification_preferences
       where person_id = 'd5000000-0000-0000-0000-0000000e0001' and channel = 'email'),
  'La persona puede desactivar el correo'
);

select ok(
  (select count(*) from notification_preferences) >= 1
  and (select count(*) from notification_preferences) =
      (select count(*) from notification_preferences where person_id = 'd5000000-0000-0000-0000-0000000e0001'),
  'Una persona solo ve sus propias preferencias'
);

reset role;

select ok(
  not has_table_privilege('authenticated', 'notification_events', 'select')
  and not has_table_privilege('authenticated', 'notification_deliveries', 'select')
  and not has_table_privilege('anon', 'notification_events', 'select')
  and not has_table_privilege('anon', 'notification_deliveries', 'select'),
  'authenticated y anon no leen el outbox ni las entregas'
);

select ok(
  not has_table_privilege('authenticated', 'notifications', 'insert')
  and not has_table_privilege('authenticated', 'notifications', 'update')
  and not has_table_privilege('authenticated', 'notifications', 'delete')
  and not has_table_privilege('authenticated', 'notification_preferences', 'insert')
  and not has_table_privilege('authenticated', 'notification_preferences', 'update')
  and not has_table_privilege('authenticated', 'notification_events', 'insert')
  and not has_table_privilege('authenticated', 'notification_deliveries', 'insert'),
  'La escritura directa está revocada en las cuatro tablas'
);

select ok(
  not has_function_privilege('authenticated', 'public.process_notification_events(integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.enqueue_due_reminders()', 'execute')
  and not has_function_privilege('authenticated', 'public.escalate_uncovered_positions()', 'execute')
  and not has_function_privilege('authenticated', 'public.claim_notification_deliveries(text, integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.complete_notification_delivery(uuid, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.process_notification_events(integer)', 'execute'),
  'El motor de avisos solo lo ejecuta service_role'
);

select ok(
  has_function_privilege('authenticated', 'public.list_my_notifications(uuid, boolean, integer)', 'execute')
  and has_function_privilege('authenticated', 'public.mark_notification_read(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.list_my_notifications(uuid, boolean, integer)', 'execute'),
  'La lectura de la bandeja la ejecuta authenticated, nunca anon'
);

-- ============================================================
-- 13. Cola de salida
-- ============================================================
select t_set('claimed', (select count(*) from app.claim_notification_deliveries('email', 10))::text);

select ok(
  current_setting('t5n.claimed')::integer > 0
  and (select bool_and(attempts >= 1) from notification_deliveries where claimed_at is not null),
  'Reclamar entregas de un canal las marca con un intento'
);

select t_set('one_delivery', (select id from notification_deliveries where channel = 'email' and status = 'queued' limit 1)::text);
select app.complete_notification_delivery(t_id('one_delivery'), 'sent');

select ok(
  (select status = 'sent' and sent_at is not null from notification_deliveries where id = t_id('one_delivery')),
  'Cerrar una entrega como enviada guarda el instante'
);

select is(t_err($$ select app.complete_notification_delivery(t_id('one_delivery'), 'inventado') $$), '22023',
  'Un estado de entrega no válido se rechaza');

select is(t_err($$ select app.claim_notification_deliveries('telepatia', 5) $$), '22023',
  'Un canal no válido se rechaza');

-- ============================================================
-- 14. Borrado de la iglesia en cascada
-- ============================================================
select lives_ok(
  $$ delete from churches where id = t_id('church_a') $$,
  'Borrar la iglesia no falla con avisos, entregas y preferencias'
);

select ok(
  not exists (select 1 from notification_events where church_id = t_id('church_a'))
  and not exists (select 1 from notifications where church_id = t_id('church_a'))
  and not exists (select 1 from notification_deliveries where church_id = t_id('church_a'))
  and not exists (select 1 from notification_preferences where church_id = t_id('church_a')),
  'El borrado de la iglesia arrastra su outbox, su bandeja, sus entregas y sus preferencias'
);

select * from finish();
rollback;
