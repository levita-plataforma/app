-- Fase 15 · A1: gating comercial a nivel de tabla.
-- Cubre: modo de acceso por estado, escritura de negocio bloqueada o permitida,
-- excepciones de Kids por transición, exportaciones, bypass de lifecycle acotado,
-- aislamiento entre tenants y guardarraíl de cobertura por catálogo.

begin;
select plan(48);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function test_reset() returns void as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$ language plpgsql;

create or replace function t_set(p_key text, p_value text) returns text as $$
  select set_config('t15g.' || p_key, coalesce(p_value, ''), true);
$$ language sql;

create or replace function t_id(p_key text) returns uuid as $$
  select nullif(current_setting('t15g.' || p_key, true), '')::uuid;
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

create or replace function t_err_detail(p_sql text) returns text as $$
declare
  v_detail text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return coalesce(v_detail, 'sin detalle');
end;
$$ language plpgsql;

-- ============================================================
-- Fixtures: dos iglesias y sus owners
-- ============================================================
insert into auth.users (id, email) values
  ('f1500000-0000-0000-0000-000000000001', 'owner.a.f15@example.test'),
  ('f1500000-0000-0000-0000-000000000002', 'owner.b.f15@example.test');

select test_set_auth_uid('f1500000-0000-0000-0000-000000000001');
select t_set('church_a', out_church_id::text), t_set('owner_a', out_person_id::text)
from app.provision_church(
  'Iglesia A F15', 'church-a-f15', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'AF15', 'owner.a.f15@example.test', null, 'Sede A F15', null, null, null, null,
  array['people', 'serving', 'communications'], null
);

select test_set_auth_uid('f1500000-0000-0000-0000-000000000002');
select t_set('church_b', out_church_id::text)
from app.provision_church(
  'Iglesia B F15', 'church-b-f15', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'BF15', 'owner.b.f15@example.test', null, 'Sede B F15', null, null, null, null,
  array['people', 'serving', 'communications'], null
);

select test_reset();

-- Personas y pertenencia para los niños (los crea el superusuario en estado full).
insert into people (id, first_name, last_name, source) values
  ('f1500000-0000-0000-0000-0000000000a1', 'Niño', 'Uno', 'manual'),
  ('f1500000-0000-0000-0000-0000000000a2', 'Niño', 'Dos', 'manual'),
  ('f1500000-0000-0000-0000-0000000000a3', 'Niño', 'Tres', 'manual'),
  ('f1500000-0000-0000-0000-0000000000a4', 'Niño', 'Cuatro', 'manual');
insert into church_people (church_id, person_id, relationship, source) values
  (t_id('church_a'), 'f1500000-0000-0000-0000-0000000000a1', 'member', 'manual'),
  (t_id('church_a'), 'f1500000-0000-0000-0000-0000000000a2', 'member', 'manual'),
  (t_id('church_a'), 'f1500000-0000-0000-0000-0000000000a3', 'member', 'manual'),
  (t_id('church_a'), 'f1500000-0000-0000-0000-0000000000a4', 'member', 'manual');

-- Actividad, sala y sesión Kids abierta, check-ins activos (todo en full).
insert into activities (id, church_id, type, title, starts_at, ends_at, timezone)
values ('f1500000-0000-0000-0000-0000000000c1', t_id('church_a'), 'service', 'Culto F15',
        now() - interval '1 hour', now() + interval '1 hour', 'Europe/Madrid');
insert into kids_rooms (id, church_id, name, capacity)
values ('f1500000-0000-0000-0000-0000000000d1', t_id('church_a'), 'Sala F15', 20);
insert into kids_sessions (id, church_id, activity_id, room_id, status)
values ('f1500000-0000-0000-0000-0000000000e1', t_id('church_a'),
        'f1500000-0000-0000-0000-0000000000c1', 'f1500000-0000-0000-0000-0000000000d1', 'open');

insert into kid_checkins (id, church_id, session_id, kid_person_id, room_id, status, pickup_token_hash, checked_in_at)
values
  ('f1500000-0000-0000-0000-0000000000f1', t_id('church_a'), 'f1500000-0000-0000-0000-0000000000e1',
   'f1500000-0000-0000-0000-0000000000a1', 'f1500000-0000-0000-0000-0000000000d1', 'checked_in', 'hash-1', now()),
  ('f1500000-0000-0000-0000-0000000000f2', t_id('church_a'), 'f1500000-0000-0000-0000-0000000000e1',
   'f1500000-0000-0000-0000-0000000000a2', 'f1500000-0000-0000-0000-0000000000d1', 'checked_in', 'hash-2', now());

-- ============================================================
-- 1. Modo de acceso por estado
-- ============================================================
-- Estado inicial: trial, por tanto full.
select is(app.church_access_mode(t_id('church_a')), 'full', 'Trial se trata como full');

select test_set_auth_uid('f1500000-0000-0000-0000-000000000001');
select is(
  t_err($$ insert into tags (church_id, name) values ('00000000-0000-0000-0000-000000000000', 'x') $$),
  '42501',
  'Insertar en una iglesia ajena se rechaza (RLS, no el trigger)'
);
select test_reset();

-- ACTIVE
update subscriptions set status = 'active' where church_id = t_id('church_a');
select is(app.church_access_mode(t_id('church_a')), 'full', 'ACTIVE: modo full');

select test_set_auth_uid('f1500000-0000-0000-0000-000000000001');
select is(t_err($$ insert into tags (church_id, name) values (t_id('church_a'), 'etiqueta active') $$),
  'ok', 'ACTIVE: escritura de negocio permitida');
select test_reset();

-- Un superusuario tampoco escribe negocio en una iglesia bloqueada (sin acceso silencioso).
insert into tags (id, church_id, name) values ('f1500000-0000-0000-0000-0000000000b1', t_id('church_a'), 'mover');

-- PAST_DUE dentro de gracia
update subscriptions set status = 'past_due', past_due_since = now() - interval '2 days'
where church_id = t_id('church_a');
select is(app.church_access_mode(t_id('church_a')), 'grace', 'PAST_DUE dentro de 15 días: grace');
select test_set_auth_uid('f1500000-0000-0000-0000-000000000001');
select is(t_err($$ insert into tags (church_id, name) values (t_id('church_a'), 'etiqueta grace') $$),
  'ok', 'GRACE: escritura de negocio permitida, sin pérdida inmediata');
select test_reset();

-- PAST_DUE pasada la gracia: suspended
update subscriptions set past_due_since = now() - interval '16 days' where church_id = t_id('church_a');
select is(app.church_access_mode(t_id('church_a')), 'suspended', 'PAST_DUE tras 15 días: suspended');

select test_set_auth_uid('f1500000-0000-0000-0000-000000000001');
select is(t_err($$ insert into tags (church_id, name) values (t_id('church_a'), 'etiqueta suspended') $$),
  '42501', 'SUSPENDED: el owner no puede escribir negocio');
select is(t_err_detail($$ insert into tags (church_id, name) values (t_id('church_a'), 'otra') $$),
  'CHURCH_SUSPENDED', 'SUSPENDED: código interno seguro en DETAIL');
select is(
  (select count(*)::int from churches where id = t_id('church_a')),
  1,
  'SUSPENDED: el owner conserva la superficie de recuperación (su fila de iglesia)'
);
select test_reset();

-- CANCELLED
update subscriptions set status = 'cancelled' where church_id = t_id('church_a');
select is(app.church_access_mode(t_id('church_a')), 'cancelled', 'CANCELLED: modo cancelled');
select test_set_auth_uid('f1500000-0000-0000-0000-000000000001');
select is(t_err($$ insert into tags (church_id, name) values (t_id('church_a'), 'etiqueta cancelled') $$),
  '42501', 'CANCELLED: sin operación normal');
select test_reset();

-- SECURITY_BLOCKED tiene prioridad sobre la suscripción activa
update subscriptions set status = 'active', past_due_since = null where church_id = t_id('church_a');
update churches set security_block_reason = 'Revisión de seguridad F15', security_blocked_at = now()
where id = t_id('church_a');
select is(app.church_access_mode(t_id('church_a')), 'security_blocked',
  'SECURITY_BLOCKED gana a una suscripción activa');
select test_set_auth_uid('f1500000-0000-0000-0000-000000000001');
select is(t_err($$ insert into tags (church_id, name) values (t_id('church_a'), 'etiqueta blocked') $$),
  '42501', 'SECURITY_BLOCKED: el owner no puede escribir negocio');
select is(
  (select count(*)::int from churches where id = t_id('church_a')),
  1,
  'SECURITY_BLOCKED: la superficie mínima de recuperación sigue leyéndose'
);
select test_reset();

-- Recuperación: el owner puede cambiar su configuración ni siquiera en SECURITY_BLOCKED,
-- pero el superusuario de plataforma sí puede limpiar el bloqueo.
select test_set_auth_uid('f1500000-0000-0000-0000-000000000001');
select is(
  t_err($$ update churches set name = 'Nombre nuevo' where id = t_id('church_a') $$),
  '42501',
  'SECURITY_BLOCKED: el owner no cambia la configuración de la iglesia'
);
select test_reset();

-- Desbloqueo de seguridad: solo campos de control.
update churches set security_block_reason = null, security_blocked_at = null where id = t_id('church_a');
select is(app.church_access_mode(t_id('church_a')), 'full', 'Tras desbloquear vuelve al modo de la suscripción activa (full)');

-- ============================================================
-- 2. Excepciones de Kids (por transición concreta)
-- ============================================================
update subscriptions set status = 'suspended' where church_id = t_id('church_a');

-- SUSPENDED
select is(
  t_err($$ insert into kid_checkins (church_id, session_id, kid_person_id, room_id, status, pickup_token_hash)
           values (t_id('church_a'), 'f1500000-0000-0000-0000-0000000000e1',
                   'f1500000-0000-0000-0000-0000000000a3', 'f1500000-0000-0000-0000-0000000000d1',
                   'checked_in', 'hash-nuevo') $$),
  '42501', 'Kids · suspended + check-in nuevo: DENIED'
);
select is(
  t_err($$ update kid_checkins set status = 'checked_out', checked_out_at = now()
           where id = 'f1500000-0000-0000-0000-0000000000f1' $$),
  'ok', 'Kids · suspended + check-out de check-in existente: ALLOWED'
);
select is(
  t_err($$ insert into kids_incidents (church_id, kid_person_id, description)
           values (t_id('church_a'), 'f1500000-0000-0000-0000-0000000000a2', 'Incidencia de seguridad') $$),
  'ok', 'Kids · suspended + incidencia de un menor que sigue dentro: ALLOWED'
);
select is(
  t_err($$ insert into kids_rooms (church_id, name, capacity) values (t_id('church_a'), 'Sala nueva', 5) $$),
  '42501', 'Kids · suspended + configuración nueva de sala: DENIED'
);

-- SECURITY_BLOCKED
update subscriptions set status = 'active' where church_id = t_id('church_a');
update churches set security_block_reason = 'Bloqueo Kids F15', security_blocked_at = now()
where id = t_id('church_a');
select is(
  t_err($$ insert into kid_checkins (church_id, session_id, kid_person_id, room_id, status, pickup_token_hash)
           values (t_id('church_a'), 'f1500000-0000-0000-0000-0000000000e1',
                   'f1500000-0000-0000-0000-0000000000a4', 'f1500000-0000-0000-0000-0000000000d1',
                   'checked_in', 'hash-nuevo-2') $$),
  '42501', 'Kids · security_blocked + check-in nuevo: DENIED'
);
select is(
  t_err($$ update kid_checkins set status = 'checked_out', checked_out_at = now()
           where id = 'f1500000-0000-0000-0000-0000000000f2' $$),
  'ok', 'Kids · security_blocked + cierre seguro de check-in activo: ALLOWED'
);
select is(
  t_err($$ insert into kids_incidents (church_id, kid_person_id, description)
           values (t_id('church_a'), 'f1500000-0000-0000-0000-0000000000a1', 'Incidencia bloqueada') $$),
  '42501', 'Kids · security_blocked + incidencia nueva: DENIED (no es acción mínima de cierre)'
);
select test_reset();

-- ============================================================
-- 3. Exportaciones
-- ============================================================
update churches set security_block_reason = null, security_blocked_at = null where id = t_id('church_a');
update subscriptions set status = 'suspended' where church_id = t_id('church_a');
select test_set_auth_uid('f1500000-0000-0000-0000-000000000001');
select is(
  t_err($$ insert into export_jobs (church_id, entity_type) values (t_id('church_a'), 'people') $$),
  'ok', 'Exportación · suspended: el owner puede solicitarla'
);
select test_reset();

update churches set security_block_reason = 'Bloqueo export F15', security_blocked_at = now()
where id = t_id('church_a');
select test_set_auth_uid('f1500000-0000-0000-0000-000000000001');
select is(
  t_err($$ insert into export_jobs (church_id, entity_type) values (t_id('church_a'), 'people') $$),
  '42501', 'Exportación · security_blocked: denegada'
);
select test_reset();

-- ============================================================
-- 4. Aislamiento entre tenants
-- ============================================================
-- Iglesia A suspendida no afecta a B, que sigue activa.
select is(app.church_access_mode(t_id('church_b')), 'full', 'Tenant B sigue en full mientras A está bloqueada');
select test_set_auth_uid('f1500000-0000-0000-0000-000000000002');
select is(t_err($$ insert into tags (church_id, name) values (t_id('church_b'), 'etiqueta B') $$),
  'ok', 'Owner de B escribe en B aunque A esté bloqueada');
select test_reset();

-- Trasladar un registro de A a B está prohibido, aunque sea superusuario.
select is(
  t_err($$ update tags set church_id = t_id('church_b') where id = 'f1500000-0000-0000-0000-0000000000b1' $$),
  '42501', 'Trasladar un registro entre tenants se rechaza'
);

-- ============================================================
-- 5. Bypass de lifecycle: solo service_role, transaccional, sin flag por sí solo
-- ============================================================
select test_set_auth_uid('f1500000-0000-0000-0000-000000000001');
select is(
  t_err($$ select set_config('app.lifecycle_bypass', 'on', true) $$),
  'ok', 'Un usuario autenticado puede intentar poner el flag'
);
select is(
  t_err($$ insert into tags (church_id, name) values (t_id('church_a'), 'bypass falso') $$),
  '42501', 'El flag activado por authenticated NO evita el trigger'
);
-- SET ROLE depende de la pertenencia de rol, no de la sesión simulada (un superusuario
-- puede cambiar de rol a cualquiera). La barrera real es que authenticated y anon no
-- sean miembros de service_role.
select ok(
  not pg_has_role('authenticated', 'service_role', 'MEMBER')
  and not pg_has_role('anon', 'service_role', 'MEMBER'),
  'authenticated y anon no son miembros de service_role: no pueden hacer SET ROLE service_role'
);
select test_reset();

select is(
  t_err($$ select app.run_lifecycle(gen_random_uuid(), 'purge_church') $$),
  '42501', 'anon no puede ejecutar run_lifecycle'
);
select test_set_auth_uid('f1500000-0000-0000-0000-000000000001');
select is(
  t_err($$ select app.run_lifecycle(t_id('church_a'), 'purge_church') $$),
  '42501', 'authenticated no puede ejecutar run_lifecycle'
);
select test_reset();

-- service_role (ruta de servicio): llega a la función y responde con su motivo.
select set_config('role', 'service_role', true);
select is(
  (select (app.run_lifecycle(t_id('church_a'), 'purge_church') ->> 'reason')),
  'not_due',
  'service_role ejecuta run_lifecycle; una iglesia no archivada no se purga'
);
select set_config('role', 'none', true);

-- El flag es transaccional: se revierte con el savepoint (y con la transacción).
select set_config('app.lifecycle_bypass', 'off', true);
savepoint f15_bypass;
select set_config('app.lifecycle_bypass', 'on', true);
rollback to savepoint f15_bypass;
select is(current_setting('app.lifecycle_bypass', true), 'off',
  'El flag de bypass vuelve a su valor previo al revertir el savepoint');

-- ============================================================
-- 6. Purga de retención: iglesia archivada hace más de 30 días
-- ============================================================
insert into churches (id, name, slug, status)
values ('f1500000-0000-0000-0000-0000000000c9', 'Iglesia C F15', 'church-c-f15', 'provisioning');
insert into tags (church_id, name) values ('f1500000-0000-0000-0000-0000000000c9', 'etiqueta purgable');
update churches set status = 'archived', archived_at = now() - interval '40 days'
where id = 'f1500000-0000-0000-0000-0000000000c9';
select set_config('role', 'service_role', true);
select is(
  (select (app.run_lifecycle('f1500000-0000-0000-0000-0000000000c9', 'purge_church') ->> 'purged')),
  'true',
  'service_role purga una iglesia archivada hace más de 30 días'
);
select set_config('role', 'none', true);
select is(
  (select count(*)::int from churches where id = 'f1500000-0000-0000-0000-0000000000c9'),
  0,
  'La iglesia purgada ya no existe'
);
select is(
  (select count(*)::int from tags where church_id = 'f1500000-0000-0000-0000-0000000000c9'),
  0,
  'La purga arrastra sus filas de negocio por cascada'
);
select is(
  t_err($$ insert into tags (church_id, name) values ('f1500000-0000-0000-0000-0000000000c9', 'fuera de bypass') $$),
  '42501',
  'Fuera de la purga, nadie escribe en una iglesia borrada'
);

-- ============================================================
-- 6b. Jobs: solo operan para full y grace (comunicaciones y avisos)
-- ============================================================
update churches set security_block_reason = null, security_blocked_at = null where id = t_id('church_a');
update subscriptions set status = 'active', past_due_since = null where church_id = t_id('church_a');

insert into communications (id, church_id, title, body_template, channels, status, scheduled_at)
values ('f1500000-0000-0000-0000-0000000000d7', t_id('church_a'), 'Comunicado F15', 'Hola',
        array['inapp']::notification_channel[], 'scheduled', now() - interval '1 minute');

insert into notification_events (id, church_id, event_type, entity_type, entity_id, idempotency_key, recipient_person_ids)
values ('f1500000-0000-0000-0000-0000000000d8', t_id('church_a'), 'assignment.proposed',
        'activity_assignment', 'f1500000-0000-0000-0000-0000000000db', 'f15-job-1',
        array['f1500000-0000-0000-0000-0000000000a1']::uuid[]);
insert into notifications (id, event_id, church_id, person_id, event_type, title, body, entity_type, entity_id)
values ('f1500000-0000-0000-0000-0000000000d9', 'f1500000-0000-0000-0000-0000000000d8', t_id('church_a'),
        'f1500000-0000-0000-0000-0000000000a1', 'assignment.proposed', 'Aviso F15', 'Cuerpo',
        'activity_assignment', 'f1500000-0000-0000-0000-0000000000db');
insert into notification_deliveries (id, church_id, notification_id, person_id, channel, status, scheduled_for)
values ('f1500000-0000-0000-0000-0000000000da', t_id('church_a'), 'f1500000-0000-0000-0000-0000000000d9',
        'f1500000-0000-0000-0000-0000000000a1', 'inapp', 'queued', now() - interval '1 minute');

select ok(
  'f1500000-0000-0000-0000-0000000000d7'::uuid = any (array(select id from app.due_scheduled_communications(50))),
  'Jobs · iglesia full: la comunicación programada sí se materializa'
);
select ok(
  'f1500000-0000-0000-0000-0000000000da'::uuid = any (array(select delivery_id from app.claim_notification_deliveries('inapp', 50))),
  'Jobs · iglesia full: la entrega en cola sí se reclama'
);

update notification_deliveries set status = 'queued', claimed_at = null, attempts = 0
where id = 'f1500000-0000-0000-0000-0000000000da';
update communications set status = 'scheduled', materialized_at = null
where id = 'f1500000-0000-0000-0000-0000000000d7';
update subscriptions set status = 'suspended' where church_id = t_id('church_a');

select ok(
  not ('f1500000-0000-0000-0000-0000000000d7'::uuid = any (array(select id from app.due_scheduled_communications(50)))),
  'Jobs · iglesia suspended: la comunicación no se materializa (se salta)'
);
select ok(
  not ('f1500000-0000-0000-0000-0000000000da'::uuid = any (array(select delivery_id from app.claim_notification_deliveries('inapp', 50)))),
  'Jobs · iglesia suspended: la entrega no se reclama ni se envía'
);

-- ============================================================
-- 7. Guardarraíl de cobertura por catálogo
-- ============================================================
select is(
  (select count(*)::int
   from information_schema.columns c
   where c.table_schema = 'public'
     and c.column_name = 'church_id'
     and c.table_name not in (select table_name from commercial_gate_classification)),
  0,
  'Toda tabla con church_id está clasificada (un test falla si aparece una nueva sin clasificar)'
);

select is(
  (select count(*)::int
   from commercial_gate_classification c
   where c.category = 'business'
     and not exists (
       select 1 from pg_trigger t
       join pg_class r on r.oid = t.tgrelid
       join pg_namespace n on n.oid = r.relnamespace
       where n.nspname = 'public' and r.relname = c.table_name
         and t.tgname = c.table_name || '_commercial_gate' and not t.tgisinternal
     )),
  0,
  'Toda tabla de negocio tiene su trigger de gating'
);

select ok(
  exists (select 1 from pg_trigger t join pg_class r on r.oid = t.tgrelid
          where r.relname = 'churches' and t.tgname = 'churches_commercial_gate' and not t.tgisinternal),
  'La tabla churches tiene su guardarraíl propio'
);

select ok(
  exists (select 1 from pg_trigger t join pg_class r on r.oid = t.tgrelid
          where r.relname = 'export_jobs' and t.tgname = 'export_jobs_commercial_gate' and not t.tgisinternal),
  'export_jobs tiene su regla de exportación'
);

select * from finish();
rollback;
