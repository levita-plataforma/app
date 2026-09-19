-- Fase 9 (Diogo) · Tests de comunicación segmentada: aislamiento tenant,
-- segmentación por tags/campus/relationship/service_area, campo "group"
-- reservado, allowlist de segmentación, preview, materialización idempotente,
-- opt-out, canal sin dato disponible, push sin transporte, scope de área,
-- capability ausente, rate limit, auditoría, y superficie de
-- communication_recipients inalcanzable por select directo.

begin;
select plan(39);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function test_set_anon() returns void as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end;
$$ language plpgsql;

create or replace function t_set(p_key text, p_value text) returns text as $$
  select set_config('t9c.' || p_key, coalesce(p_value, ''), true);
$$ language sql;

create or replace function t_id(p_key text) returns uuid as $$
  select nullif(current_setting('t9c.' || p_key, true), '')::uuid;
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

-- communication_recipients no tiene política de select para authenticated
-- (a propósito, ver 20260931000500_rls_comunicaciones.sql): estos helpers
-- leen con security definer, como haría el propio service_role/una RPC de
-- métricas, para poder aserto el resultado real de materialize/send sin
-- exponer una superficie de lectura nueva al cliente.
create or replace function tr_count(p_communication uuid, p_channel notification_channel default null, p_status text default null)
returns integer as $$
  select count(*)::integer from communication_recipients
  where communication_id = p_communication
    and (p_channel is null or channel = p_channel)
    and (p_status is null or status::text = p_status);
$$ language sql security definer;

create or replace function tr_status(p_communication uuid, p_person uuid, p_channel notification_channel)
returns text as $$
  select status::text from communication_recipients
  where communication_id = p_communication and person_id = p_person and channel = p_channel;
$$ language sql security definer;

create or replace function tr_reason(p_communication uuid, p_person uuid, p_channel notification_channel)
returns text as $$
  select excluded_reason from communication_recipients
  where communication_id = p_communication and person_id = p_person and channel = p_channel;
$$ language sql security definer;

create or replace function tn_count_for(p_entity uuid, p_person uuid) returns integer as $$
  select count(*)::integer from notifications where entity_id = p_entity and person_id = p_person;
$$ language sql security definer;

create or replace function td_count_for(p_entity uuid) returns integer as $$
  select count(*)::integer from notification_deliveries
  where notification_id in (select id from notifications where entity_id = p_entity);
$$ language sql security definer;

create or replace function tc_count(p_church uuid) returns integer as $$
  select count(*)::integer from communications where church_id = p_church;
$$ language sql security definer;

-- ============================================================
-- Aprovisionamiento: dos iglesias, personas, tags, campus, área
-- ============================================================
insert into auth.users (id, email) values
  ('79000000-0000-0000-0000-000000000001', 'owner.a.c9@example.test'),
  ('79000000-0000-0000-0000-000000000002', 'owner.b.c9@example.test');

select test_set_auth_uid('79000000-0000-0000-0000-000000000001');
select t_set('church_a', out_church_id::text), t_set('campus_a', out_campus_id::text), t_set('owner_a', out_person_id::text)
from app.provision_church(
  'Iglesia A C9', 'church-a-c9', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'AC9', 'owner.a.c9@example.test', null, 'Sede A C9', null, null, null, null,
  array['people', 'serving', 'communications'], null
);

select test_set_auth_uid('79000000-0000-0000-0000-000000000002');
select t_set('church_b', out_church_id::text)
from app.provision_church(
  'Iglesia B C9', 'church-b-c9', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'BC9', 'owner.b.c9@example.test', null, 'Sede B C9', null, null, null, null,
  array['people', 'serving', 'communications'], null
);

reset role;

-- Segunda sede de A (para segmentar por campus).
insert into campuses (id, church_id, name, slug, timezone)
values ('79000000-0000-0000-0000-0000000c0002', t_id('church_a'), 'Sede Norte C9', 'sede-norte-c9', 'Europe/Madrid');
select t_set('campus_a2', '79000000-0000-0000-0000-0000000c0002');

-- Personas de A: Ana (miembro, sede A2, con email, tag "lider"), Beto (server,
-- sede principal, sin email), Carla (member, sede principal, con email,
-- opt-out de email).
insert into people (id, first_name, last_name, email, source) values
  ('79000000-0000-0000-0000-0000000e0001', 'Ana', 'Uno', 'ana@example.test', 'manual'),
  ('79000000-0000-0000-0000-0000000e0002', 'Beto', 'Dos', null, 'manual'),
  ('79000000-0000-0000-0000-0000000e0003', 'Carla', 'Tres', 'carla@example.test', 'manual');

insert into church_people (id, church_id, person_id, relationship, primary_campus_id, source) values
  ('79000000-0000-0000-0000-0000000f0001', t_id('church_a'), '79000000-0000-0000-0000-0000000e0001', 'member', t_id('campus_a2'), 'manual'),
  ('79000000-0000-0000-0000-0000000f0002', t_id('church_a'), '79000000-0000-0000-0000-0000000e0002', 'server', t_id('campus_a'), 'manual'),
  ('79000000-0000-0000-0000-0000000f0003', t_id('church_a'), '79000000-0000-0000-0000-0000000e0003', 'member', t_id('campus_a'), 'manual');

insert into tags (id, church_id, name) values
  ('79000000-0000-0000-0000-0000000a0001', t_id('church_a'), 'lider-c9');
select t_set('tag_lider', '79000000-0000-0000-0000-0000000a0001');

insert into person_tags (church_id, person_id, tag_id) values
  (t_id('church_a'), '79000000-0000-0000-0000-0000000e0001', t_id('tag_lider'));

insert into notification_preferences (church_id, person_id, channel, enabled) values
  (t_id('church_a'), '79000000-0000-0000-0000-0000000e0003', 'email', false);

insert into service_areas (id, church_id, name, slug) values
  ('79000000-0000-0000-0000-000000090001', t_id('church_a'), 'Sonido C9', 'sonido-c9');
select t_set('area_a', '79000000-0000-0000-0000-000000090001');

insert into service_area_members (church_id, service_area_id, person_id, status) values
  (t_id('church_a'), t_id('area_a'), '79000000-0000-0000-0000-0000000e0002', 'active');

-- ============================================================
-- 1. Allowlist de segmentación
-- ============================================================
select is(
  t_err($$ select app.validate_segment_rules('{"all":[{"field":"notes","op":"eq","value":"x"}]}'::jsonb) $$),
  '42501',
  'Campo fuera de la allowlist (notes) se rechaza'
);

select is(
  t_err($$ select app.validate_segment_rules('{"all":[{"field":"group","op":"eq","value":"x"}]}'::jsonb) $$),
  '0A000',
  'Campo "group" está reservado y se rechaza con feature_not_supported'
);

select is(
  t_err($$ select app.validate_segment_rules('{"all":[]}'::jsonb) $$),
  '22023',
  'Un segmento sin condiciones se rechaza'
);

-- ============================================================
-- 2. Segmentación por campus, tags, relationship, service_area
-- ============================================================
-- app.resolve_segment_recipients es interna: la llaman funciones security
-- definer que ya comprueban capacidad, y está revocada de authenticated para
-- que no sirva como oráculo de quién está en qué segmento. Estos dos bloques
-- prueban su lógica por dentro, así que se ejecutan sin ese rol. Que desde una
-- sesión normal no se pueda invocar se comprueba al final del bloque 3.
select test_set_auth_uid('79000000-0000-0000-0000-000000000001');
reset role;

select is(
  (select array_agg(person_id order by person_id) from app.resolve_segment_recipients(
    t_id('church_a'), jsonb_build_object('all', jsonb_build_array(
      jsonb_build_object('field', 'campus_id', 'op', 'eq', 'value', t_id('campus_a2'))
    ))
  )),
  array['79000000-0000-0000-0000-0000000e0001'::uuid],
  'Segmentación por campus_id devuelve solo a Ana (sede Norte)'
);

select is(
  (select array_agg(person_id order by person_id) from app.resolve_segment_recipients(
    t_id('church_a'), jsonb_build_object('all', jsonb_build_array(
      jsonb_build_object('field', 'tags', 'op', 'contains', 'value', t_id('tag_lider'))
    ))
  )),
  array['79000000-0000-0000-0000-0000000e0001'::uuid],
  'Segmentación por tags (contains) devuelve solo a Ana'
);

select is(
  (select array_agg(person_id order by person_id) from app.resolve_segment_recipients(
    t_id('church_a'), jsonb_build_object('all', jsonb_build_array(
      jsonb_build_object('field', 'relationship', 'op', 'in', 'value', jsonb_build_array('server'))
    ))
  )),
  array['79000000-0000-0000-0000-0000000e0002'::uuid],
  'Segmentación por relationship (in) devuelve solo a Beto (server)'
);

select is(
  (select array_agg(person_id order by person_id) from app.resolve_segment_recipients(
    t_id('church_a'), jsonb_build_object('all', jsonb_build_array(
      jsonb_build_object('field', 'service_area_id', 'op', 'eq', 'value', t_id('area_a'))
    ))
  )),
  array['79000000-0000-0000-0000-0000000e0002'::uuid],
  'Segmentación por service_area_id devuelve solo a Beto (miembro activo de Sonido)'
);

select is(
  (select count(*)::int from app.resolve_segment_recipients(
    t_id('church_a'), jsonb_build_object('all', jsonb_build_array(
      jsonb_build_object('field', 'campus_id', 'op', 'eq', 'value', t_id('campus_a')),
      jsonb_build_object('field', 'relationship', 'op', 'eq', 'value', 'member')
    ))
  )),
  1,
  'Combinar dos condiciones (AND): solo Carla (sede principal + member)'
);

-- ============================================================
-- 3. Aislamiento tenant en resolve_segment_recipients
-- ============================================================
select is(
  t_err(format($$ select count(*) from app.resolve_segment_recipients(%L, '{"all":[{"field":"relationship","op":"eq","value":"member"}]}'::jsonb) $$, t_id('church_b'))),
  'ok',
  'La función no lanza al consultar otra iglesia (RLS no aplica dentro de security definer, pero el filtro por church_id es explícito)'
);

select is(
  (select count(*)::int from app.resolve_segment_recipients(
    t_id('church_b'), jsonb_build_object('all', jsonb_build_array(
      jsonb_build_object('field', 'tags', 'op', 'contains', 'value', t_id('tag_lider'))
    ))
  )),
  0,
  'Un tag de la iglesia A no devuelve personas al consultarlo contra la iglesia B'
);

-- Desde una sesión normal la función interna no se puede invocar: es la otra
-- mitad del aislamiento, y sin esto la prueba de arriba solo diría que filtra
-- bien, no que esté fuera de alcance.
select test_set_auth_uid('79000000-0000-0000-0000-000000000001');
select is(
  t_err($$ select count(*) from app.resolve_segment_recipients(
    '00000000-0000-0000-0000-000000000000'::uuid,
    '{"all":[{"field":"relationship","op":"eq","value":"member"}]}'::jsonb) $$),
  '42501',
  'Una sesión normal no puede llamar a la resolución de segmentos: es interna'
);

-- ============================================================
-- 4. Preview agregado
-- ============================================================
select is(
  (app.preview_communication_segment(
    t_id('church_a'),
    jsonb_build_object('all', jsonb_build_array(jsonb_build_object('field', 'relationship', 'op', 'in', 'value', jsonb_build_array('member', 'server')))),
    array['inapp', 'email', 'push']::notification_channel[]
  ) ->> 'total')::int,
  3,
  'Preview: total de 3 personas coincide con la resolución real'
);

select is(
  (app.preview_communication_segment(
    t_id('church_a'),
    jsonb_build_object('all', jsonb_build_array(jsonb_build_object('field', 'relationship', 'op', 'in', 'value', jsonb_build_array('member', 'server')))),
    array['push']::notification_channel[]
  ) -> 'by_channel' ->> 'push')::int,
  0,
  'Preview: push siempre reporta 0 disponibles (sin tabla de dispositivos), nunca finge un número'
);

-- ============================================================
-- 5. Creación, materialización e idempotencia
-- ============================================================
select t_set('comm_1', (select app.create_communication(
  t_id('church_a'), 'Comunicado C9', 'institutional', 'Asunto', 'Hola {{first_name}}, bienvenido a {{church_name}}.',
  array['inapp', 'email', 'push']::notification_channel[],
  jsonb_build_object('all', jsonb_build_array(jsonb_build_object('field', 'relationship', 'op', 'in', 'value', jsonb_build_array('member', 'server'))))
))::text);

select is(
  (select status::text from communications where id = t_id('comm_1')),
  'draft',
  'La comunicación se crea en draft'
);

select is(
  t_err(format($$ select app.create_communication(%L, 'x', 'institutional', null, 'body {{secret}}', array['inapp']::notification_channel[], '{"all":[{"field":"relationship","op":"eq","value":"member"}]}'::jsonb) $$, t_id('church_a'))),
  '42501',
  'Un placeholder no permitido en el cuerpo se rechaza al crear'
);

select ok(
  ((app.materialize_communication(t_id('comm_1'))) ->> 'already_materialized')::boolean = false,
  'Primera materialización procesa destinatarios'
);

select is(
  tr_count(t_id('comm_1')),
  9,
  '3 personas x 3 canales = 9 filas materializadas'
);

select ok(
  ((app.materialize_communication(t_id('comm_1'))) ->> 'already_materialized')::boolean = true,
  'Segunda materialización es idempotente: no duplica filas'
);

select is(
  tr_count(t_id('comm_1')),
  9,
  'Sigue habiendo exactamente 9 filas tras la segunda llamada'
);

-- ============================================================
-- 6. Opt-out, canal sin dato disponible, push sin transporte
-- ============================================================
select is(
  tr_status(t_id('comm_1'), '79000000-0000-0000-0000-0000000e0003', 'email'),
  'suppressed',
  'Carla tiene opt-out de email: status=suppressed, nunca pending/sent'
);

select is(
  tr_status(t_id('comm_1'), '79000000-0000-0000-0000-0000000e0002', 'email'),
  'excluded',
  'Beto no tiene email: status=excluded'
);

select is(
  tr_reason(t_id('comm_1'), '79000000-0000-0000-0000-0000000e0002', 'email'),
  'sin_email',
  'El motivo de exclusión de Beto es sin_email'
);

select is(
  tr_count(t_id('comm_1'), 'push', 'excluded'),
  3,
  'Los 3 destinatarios quedan excluded en push: sin tabla de dispositivos, nunca se finge disponibilidad'
);

-- ============================================================
-- 7. Envío: inapp real, email/push quedan en cola, nunca "sent" fingido
-- ============================================================
select app.send_communication(t_id('comm_1'));

select is(
  tr_status(t_id('comm_1'), '79000000-0000-0000-0000-0000000e0001', 'inapp'),
  'sent',
  'El canal inapp queda sent de verdad (bandeja real)'
);

select is(
  tn_count_for(t_id('comm_1'), '79000000-0000-0000-0000-0000000e0001'),
  1,
  'La bandeja (notifications) recibe una fila para el destinatario inapp'
);

select is(
  tr_status(t_id('comm_1'), '79000000-0000-0000-0000-0000000e0001', 'email'),
  'queued',
  'El canal email queda "queued", nunca "sent": no hay proveedor real todavía'
);

select is(
  td_count_for(t_id('comm_1')),
  0,
  'send_communication no crea filas en notification_deliveries: email/push viven solo en communication_recipients'
);

reset role;

-- ============================================================
-- 7b. Camino del cron: sin sesión humana, sin capability check
-- ============================================================
select test_set_auth_uid('79000000-0000-0000-0000-000000000001');
select t_set('comm_sched', (select app.create_communication(
  t_id('church_a'), 'Programada C9', 'institutional', null, 'Hola {{first_name}}',
  array['inapp']::notification_channel[],
  '{"all":[{"field":"relationship","op":"eq","value":"member"}]}'::jsonb
))::text);
reset role;
update communications set status = 'scheduled', scheduled_at = now() - interval '1 minute' where id = t_id('comm_sched');

-- Sin ningún set_config de auth: exactamente como llega la petición del cron
-- (service_role, sin JWT de usuario).
set role service_role;

select is(
  (select id from app.due_scheduled_communications(10) where id = t_id('comm_sched')),
  t_id('comm_sched'),
  'due_scheduled_communications encuentra la comunicación programada cuya hora ya llegó'
);

select ok(
  (app.cron_materialize_communication(t_id('comm_sched')) ->> 'already_materialized')::boolean = false,
  'cron_materialize_communication procesa sin sesión humana ni capability check'
);

select is(
  (select id from app.pending_send_communications(10) where id = t_id('comm_sched')),
  t_id('comm_sched'),
  'pending_send_communications encuentra la comunicación recién materializada con destinatarios pendientes'
);

select ok(
  (app.cron_send_communication(t_id('comm_sched')) ->> 'remaining')::int = 0,
  'cron_send_communication envía todos los destinatarios sin sesión humana'
);

reset role;

select is(
  (select status::text from communications where id = t_id('comm_sched')),
  'sent',
  'La comunicación programada queda sent tras el ciclo completo del cron'
);

-- ============================================================
-- 8. Scope de área: líder de service_area solo puede acotar a su área
-- ============================================================
insert into church_people_roles (church_id, church_people_id, role_key, scope_type, scope_id) values
  (t_id('church_a'), '79000000-0000-0000-0000-0000000f0002', 'ministry_leader', 'service_area', t_id('area_a'));

select test_set_auth_uid('79000000-0000-0000-0000-000000000002');
-- Beto no tiene cuenta vinculada (person creada con user_id null): usamos un
-- tercer owner para representar al líder de área con cuenta real.
reset role;

insert into auth.users (id, email) values ('79000000-0000-0000-0000-000000000004', 'lider.area.c9@example.test');
update people set user_id = '79000000-0000-0000-0000-000000000004' where id = '79000000-0000-0000-0000-0000000e0002';

select test_set_auth_uid('79000000-0000-0000-0000-000000000004');

select is(
  t_err(format($$ select app.create_communication(%L, 'Fuera de área', 'institutional', null, 'Hola {{first_name}}', array['inapp']::notification_channel[], '{"all":[{"field":"relationship","op":"eq","value":"member"}]}'::jsonb, null, null, %L) $$, t_id('church_a'), t_id('area_a'))),
  '42501',
  'Un líder de área no puede crear una comunicación cuyo segmento no esté acotado a su área'
);

select ok(
  t_err(format($$ select app.create_communication(%L, 'Dentro de área', 'institutional', null, 'Hola {{first_name}}', array['inapp']::notification_channel[], jsonb_build_object('all', jsonb_build_array(jsonb_build_object('field','service_area_id','op','eq','value',%L::text))), null, null, %L) $$, t_id('church_a'), t_id('area_a'), t_id('area_a'))) = 'ok',
  'Un líder de área SÍ puede crear una comunicación acotada exactamente a su área'
);

reset role;

-- ============================================================
-- 9. Capability ausente
-- ============================================================
insert into auth.users (id, email) values ('79000000-0000-0000-0000-000000000005', 'sinpermiso.c9@example.test');
insert into people (id, first_name, user_id, source) values
  ('79000000-0000-0000-0000-0000000e0009', 'Sin Permiso', '79000000-0000-0000-0000-000000000005', 'manual');
insert into church_people (church_id, person_id, relationship, source) values
  (t_id('church_a'), '79000000-0000-0000-0000-0000000e0009', 'member', 'manual');

select test_set_auth_uid('79000000-0000-0000-0000-000000000005');

select is(
  t_err(format($$ select app.create_communication(%L, 'x', 'institutional', null, 'Hola', array['inapp']::notification_channel[], '{"all":[{"field":"relationship","op":"eq","value":"member"}]}'::jsonb) $$, t_id('church_a'))),
  '42501',
  'Una persona sin communications.create no puede crear comunicaciones'
);

reset role;

-- ============================================================
-- 10. Rate limit de creación por tenant
-- ============================================================
select test_set_auth_uid('79000000-0000-0000-0000-000000000001');

-- Genera comunicaciones hasta dejar el tenant en exactamente 20 (el límite
-- de la RPC es v_recent >= 20, así que con 20 ya creadas la siguiente
-- llamada debe fallar), sin depender de cuántas se crearon antes en este
-- archivo.
select t_set('rate_ok', (
  select count(*)::text from (
    select app.create_communication(
      t_id('church_a'), 'Rate ' || g, 'institutional', null, 'Hola {{first_name}}',
      array['inapp']::notification_channel[],
      '{"all":[{"field":"relationship","op":"eq","value":"member"}]}'::jsonb
    ) from generate_series(1, greatest(20 - tc_count(t_id('church_a')), 0)) g
  ) s
));

select is(tc_count(t_id('church_a')), 20, 'El tenant queda con exactamente 20 comunicaciones antes de probar el límite');

select is(
  t_err($$ select app.create_communication(
    (select id from churches where slug = 'church-a-c9'), 'Rate extra', 'institutional', null, 'Hola {{first_name}}',
    array['inapp']::notification_channel[], '{"all":[{"field":"relationship","op":"eq","value":"member"}]}'::jsonb
  ) $$),
  '53400',
  'Superar 20 comunicaciones creadas en la última hora corta dentro de la RPC'
);

reset role;

-- ============================================================
-- 11. Auditoría sin PII individual
-- ============================================================
select ok(
  exists (
    select 1 from audit_logs
    where church_id = t_id('church_a') and action = 'communication.sent' and entity_id = t_id('comm_1')
      and not (metadata::text ilike '%@example.test%')
  ),
  'communication.sent queda auditado con metadata agregada, sin email de destinatarios individuales'
);

-- ============================================================
-- 12. communication_recipients inalcanzable por select directo
-- ============================================================
select test_set_auth_uid('79000000-0000-0000-0000-000000000001');

select is(
  t_err($$ select count(*) from communication_recipients $$),
  '42501',
  'authenticated no puede leer communication_recipients directamente (sin política de select)'
);

reset role;

select * from finish();
rollback;
