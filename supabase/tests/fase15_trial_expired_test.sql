-- Fase 15 · A1: estado trial_expired y supresión de avisos fuera de full/grace.
-- Cubre: vencimiento por fecha (sin cálculo en la app), bloqueo de escritura con
-- DETAIL propio, exportación permitida al propietario, prioridad de security_blocked,
-- supresión de eventos y entregas en cola, y que una reactivación no reenvía nada.

begin;
select plan(21);

create or replace function t15t_err(p_sql text) returns text as $$
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

create or replace function t15t_err_detail(p_sql text) returns text as $$
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
-- Fixtures: una iglesia con prueba vigente, otra con prueba vencida y una
-- entrega de email en cola de la vencida.
-- ============================================================
insert into churches (id, name, slug, status) values
  ('f1510000-0000-0000-0000-000000000001', 'Iglesia vigente F15T', 'iglesia-vigente-f15t', 'trial'),
  ('f1510000-0000-0000-0000-000000000002', 'Iglesia vencida F15T', 'iglesia-vencida-f15t', 'trial');

insert into subscriptions (church_id, plan_key, status, trial_started_at, trial_ends_at) values
  ('f1510000-0000-0000-0000-000000000001', 'trial', 'trial', now() - interval '5 days', now() + interval '25 days'),
  ('f1510000-0000-0000-0000-000000000002', 'trial', 'trial', now() - interval '40 days', now() + interval '1 day');

insert into people (id, first_name, last_name, source) values
  ('f1510000-0000-0000-0000-000000000003', 'Persona', 'Vencida', 'manual');

-- La membresía se crea con la prueba aún vigente: con la prueba vencida el trigger
-- de negocio la bloquearía. Después la prueba vence (cambio de suscripción, plano de control).
insert into church_people (church_id, person_id, relationship, source) values
  ('f1510000-0000-0000-0000-000000000002', 'f1510000-0000-0000-0000-000000000003', 'member', 'manual');

update subscriptions set trial_ends_at = now() - interval '10 days'
where church_id = 'f1510000-0000-0000-0000-000000000002';

-- Evento ya procesado antes del vencimiento: su entrega email sigue en cola.
insert into notification_events (id, church_id, event_type, entity_type, entity_id, idempotency_key, recipient_person_ids, processed_at)
values ('f1510000-0000-0000-0000-000000000006', 'f1510000-0000-0000-0000-000000000002', 'assignment.reminder',
        'activity_assignments', 'f1510000-0000-0000-0000-000000000005', 'f15t-evento-previo',
        array['f1510000-0000-0000-0000-000000000003']::uuid[], now() - interval '1 minute');

insert into notifications (id, event_id, church_id, person_id, event_type, title, body, entity_type, entity_id)
values ('f1510000-0000-0000-0000-000000000007', 'f1510000-0000-0000-0000-000000000006',
        'f1510000-0000-0000-0000-000000000002', 'f1510000-0000-0000-0000-000000000003',
        'assignment.reminder', 'Aviso F15T', 'Cuerpo', 'activity_assignments', 'f1510000-0000-0000-0000-000000000005');

insert into notification_deliveries (id, church_id, notification_id, person_id, channel, status, scheduled_for)
values ('f1510000-0000-0000-0000-000000000008', 'f1510000-0000-0000-0000-000000000002',
        'f1510000-0000-0000-0000-000000000007', 'f1510000-0000-0000-0000-000000000003',
        'email', 'queued', now() - interval '1 minute');

-- Evento nuevo, emitido cuando la iglesia ya está vencida.
insert into notification_events (id, church_id, event_type, entity_type, entity_id, idempotency_key, recipient_person_ids)
values ('f1510000-0000-0000-0000-000000000004', 'f1510000-0000-0000-0000-000000000002', 'assignment.reminder',
        'activity_assignments', 'f1510000-0000-0000-0000-000000000005', 'f15t-evento-vencida',
        array['f1510000-0000-0000-0000-000000000003']::uuid[]);

-- ============================================================
-- 1. Modo por fecha
-- ============================================================
select is(app.church_access_mode('f1510000-0000-0000-0000-000000000001'), 'full',
  'Prueba vigente: modo full');
select is(app.church_access_mode('f1510000-0000-0000-0000-000000000002'), 'trial_expired',
  'Prueba vencida sin conversión: modo trial_expired (no suspended ni cancelled)');
select is(t15t_err($$ update subscriptions set trial_ends_at = trial_started_at - interval '1 minute'
  where church_id = 'f1510000-0000-0000-0000-000000000001' $$), '23514',
  'Fechas de prueba coherentes: fin posterior al inicio');
select ok(
  (select trial_started_at <= now() from subscriptions where church_id = 'f1510000-0000-0000-0000-000000000001'),
  'Inicio de prueba fijado por el provisioning, no calculado en la app');

-- ============================================================
-- 2. Escritura de negocio y exportación
-- ============================================================
select is(t15t_err($$ insert into tags (church_id, name) values
  ('f1510000-0000-0000-0000-000000000002', 'Etiqueta vencida') $$), '42501',
  'Prueba vencida: no se puede crear negocio');
select is(t15t_err_detail($$ insert into tags (church_id, name) values
  ('f1510000-0000-0000-0000-000000000002', 'Etiqueta vencida 2') $$), 'CHURCH_TRIAL_EXPIRED',
  'Prueba vencida: DETAIL propio CHURCH_TRIAL_EXPIRED');
select is(t15t_err($$ insert into tags (church_id, name) values
  ('f1510000-0000-0000-0000-000000000001', 'Etiqueta vigente') $$), 'ok',
  'Prueba vigente: la escritura sigue permitida');
select is(t15t_err($$ insert into export_jobs (church_id, entity_type) values
  ('f1510000-0000-0000-0000-000000000002', 'people') $$), 'ok',
  'Prueba vencida: el propietario puede exportar sus datos');

-- ============================================================
-- 3. Prioridad: security_blocked gana a trial_expired
-- ============================================================
update churches set security_block_reason = 'Prueba F15T', security_blocked_at = now()
where id = 'f1510000-0000-0000-0000-000000000002';
select is(app.church_access_mode('f1510000-0000-0000-0000-000000000002'), 'security_blocked',
  'Prioridad: security_blocked gana a trial_expired');
update churches set security_block_reason = null, security_blocked_at = null
where id = 'f1510000-0000-0000-0000-000000000002';
select is(app.church_access_mode('f1510000-0000-0000-0000-000000000002'), 'trial_expired',
  'Al quitar el bloqueo vuelve a trial_expired');

-- ============================================================
-- 4. Default de inicio de prueba en altas nuevas
-- ============================================================
insert into churches (id, name, slug, status) values
  ('f1510000-0000-0000-0000-000000000009', 'Iglesia por defecto F15T', 'iglesia-defecto-f15t', 'trial');
insert into subscriptions (church_id, plan_key, status, trial_ends_at) values
  ('f1510000-0000-0000-0000-000000000009', 'trial', 'trial', now() + interval '30 days');
select ok(
  (select trial_started_at is not null and trial_started_at <= now() from subscriptions
   where church_id = 'f1510000-0000-0000-0000-000000000009'),
  'Alta sin fecha de inicio: trial_started_at se rellena por defecto');

-- ============================================================
-- 5. Supresión de avisos
-- ============================================================
select app.process_notification_events(500);

select is((select suppression_reason ->> 'tenant_access_mode' from notification_events
  where id = 'f1510000-0000-0000-0000-000000000004'), 'trial_expired',
  'Evento de prueba vencida: motivo estructurado con el modo');
select ok(
  (select processed_at is not null and suppressed_at is not null from notification_events
   where id = 'f1510000-0000-0000-0000-000000000004'),
  'Evento suprimido queda cerrado (no se borra)');
select is((select count(*)::int from notifications
  where event_id = 'f1510000-0000-0000-0000-000000000004'), 0,
  'Evento suprimido no genera bandeja de avisos');

-- Entrega email ya en cola antes del vencimiento
select is((select count(*)::int from claim_notification_deliveries('email', 50)
  where delivery_id = 'f1510000-0000-0000-0000-000000000008'), 0,
  'Entrega email en cola de prueba vencida: no se reclama');
select is((select status::text from notification_deliveries
  where id = 'f1510000-0000-0000-0000-000000000008'), 'suppressed',
  'Entrega email en cola pasa a suppressed');
select ok(
  (select last_error::jsonb ->> 'tenant_access_mode' = 'trial_expired' from notification_deliveries
   where id = 'f1510000-0000-0000-0000-000000000008'),
  'Entrega suprimida guarda el motivo estructurado');

-- ============================================================
-- 6. Reactivación: no reenvía lo suprimido
-- ============================================================
update subscriptions set trial_started_at = now() - interval '1 day', trial_ends_at = now() + interval '29 days'
where church_id = 'f1510000-0000-0000-0000-000000000002';
select is(app.church_access_mode('f1510000-0000-0000-0000-000000000002'), 'full',
  'Reactivación: la iglesia vuelve a full');
select is((select count(*)::int from claim_notification_deliveries('email', 50)
  where delivery_id = 'f1510000-0000-0000-0000-000000000008'), 0,
  'Reactivación: la entrega suprimida no se reenvía');
select is((select status::text from notification_deliveries
  where id = 'f1510000-0000-0000-0000-000000000008'), 'suppressed',
  'Reactivación: la entrega sigue suprimida y sin sent_at');
select ok(
  (select sent_at is null from notification_deliveries where id = 'f1510000-0000-0000-0000-000000000008'),
  'Reactivación: sin fecha de envío');

select * from finish();
rollback;
