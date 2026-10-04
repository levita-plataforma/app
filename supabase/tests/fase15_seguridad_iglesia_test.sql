-- Fase 15 · PR B (ajuste final): capacidades de seguridad de iglesia.
-- platform.church_security.read lee el motivo; platform.church_security.manage
-- bloquea y desbloquea; ninguna se concede por la otra; soporte y comercial no leen
-- el motivo; owner y otros tenants no alteran nada; todo queda auditado; el
-- desbloqueo no cambia la suscripción. Lecturas y escrituras con rol authenticated.

begin;
select plan(21);

create or replace function t15q_set_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function t15q_reset() returns void as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$ language plpgsql;

create or replace function t15q_err(p_sql text) returns text as $$
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

create or replace function t15q_count_text(p_sql text) returns integer as $$
declare
  v_n integer;
begin
  execute p_sql into v_n;
  return v_n;
end;
$$ language plpgsql;

create or replace function t15q_msg(p_sql text) returns text as $$
declare
  v_msg text;
begin
  execute p_sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_msg = message_text;
  return v_msg;
end;
$$ language plpgsql;

-- ============================================================
-- Fixtures: iglesia A y B, owner de A, operadores con una capacidad cada uno
-- ============================================================
insert into auth.users (id, email) values
  ('e1000000-0000-0000-0000-000000000001', 'owner.a.q@example.test'),
  ('e1000000-0000-0000-0000-000000000002', 'owner.b.q@example.test'),
  ('e1000000-0000-0000-0000-000000000011', 'op.soporte.q@example.test'),
  ('e1000000-0000-0000-0000-000000000012', 'op.comercial.q@example.test'),
  ('e1000000-0000-0000-0000-000000000013', 'op.lee.motivo.q@example.test'),
  ('e1000000-0000-0000-0000-000000000014', 'op.gestiona.q@example.test');

insert into churches (id, name, slug, status) values
  ('e2000000-0000-0000-0000-00000000000a', 'Iglesia A Q', 'iglesia-a-q', 'trial'),
  ('e2000000-0000-0000-0000-00000000000b', 'Iglesia B Q', 'iglesia-b-q', 'trial');

insert into subscriptions (church_id, plan_key, status, trial_started_at, trial_ends_at) values
  ('e2000000-0000-0000-0000-00000000000a', 'trial', 'trial', now() - interval '5 days', now() + interval '25 days'),
  ('e2000000-0000-0000-0000-00000000000b', 'trial', 'trial', now() - interval '5 days', now() + interval '25 days');

insert into people (id, first_name, last_name, source, user_id) values
  ('e3000000-0000-0000-0000-000000000001', 'Owner', 'A', 'manual', 'e1000000-0000-0000-0000-000000000001'),
  ('e3000000-0000-0000-0000-000000000002', 'Owner', 'B', 'manual', 'e1000000-0000-0000-0000-000000000002');

insert into church_people (id, church_id, person_id, relationship, source) values
  ('e4000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-00000000000a', 'e3000000-0000-0000-0000-000000000001', 'member', 'manual'),
  ('e4000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-00000000000b', 'e3000000-0000-0000-0000-000000000002', 'member', 'manual');

insert into church_people_roles (church_id, church_people_id, role_key) values
  ('e2000000-0000-0000-0000-00000000000a', 'e4000000-0000-0000-0000-000000000001', 'church_owner'),
  ('e2000000-0000-0000-0000-00000000000b', 'e4000000-0000-0000-0000-000000000002', 'church_owner');

insert into platform_operators (user_id) values
  ('e1000000-0000-0000-0000-000000000011'),
  ('e1000000-0000-0000-0000-000000000012'),
  ('e1000000-0000-0000-0000-000000000013'),
  ('e1000000-0000-0000-0000-000000000014');

insert into platform_operator_capabilities (user_id, capability_key) values
  ('e1000000-0000-0000-0000-000000000011', 'platform.support.manage'),
  ('e1000000-0000-0000-0000-000000000011', 'platform.operations.read'),
  ('e1000000-0000-0000-0000-000000000011', 'platform.churches.read'),
  ('e1000000-0000-0000-0000-000000000012', 'platform.commercial.read'),
  ('e1000000-0000-0000-0000-000000000012', 'platform.churches.read'),
  ('e1000000-0000-0000-0000-000000000013', 'platform.church_security.read'),
  ('e1000000-0000-0000-0000-000000000013', 'platform.churches.read'),
  ('e1000000-0000-0000-0000-000000000014', 'platform.church_security.manage'),
  ('e1000000-0000-0000-0000-000000000014', 'platform.churches.read');

-- Bloqueo inicial hecho por superusuario, con una suscripción en un estado concreto
update subscriptions set status = 'suspended' where church_id = 'e2000000-0000-0000-0000-00000000000a';
update churches set security_block_reason = 'Motivo interno Q', security_blocked_at = now()
where id = 'e2000000-0000-0000-0000-00000000000a';

-- ============================================================
-- Lectura del motivo: solo con platform.church_security.read
-- ============================================================
select t15q_set_uid('e1000000-0000-0000-0000-000000000011');
select is(t15q_err($$ select app.church_service_state('e2000000-0000-0000-0000-00000000000a') $$), '42501',
  'lectura · soporte.manage no lee el estado ni el motivo');
select t15q_reset();

select t15q_set_uid('e1000000-0000-0000-0000-000000000012');
select is((select app.church_service_state('e2000000-0000-0000-0000-00000000000a') ? 'security_block_reason'), false,
  'lectura · commercial.read no lee el motivo');
select t15q_reset();

select t15q_set_uid('e1000000-0000-0000-0000-000000000013');
select is((select app.church_service_state('e2000000-0000-0000-0000-00000000000a')->>'security_block_reason'),
  'Motivo interno Q', 'lectura · church_security.read lee el motivo');
select is(t15q_msg($$ select app.platform_set_security_block('e2000000-0000-0000-0000-00000000000a', 'intento') $$),
  'No tienes permiso para esta operación.', 'no altera · church_security.read no puede bloquear ni cambiar el motivo');
select t15q_reset();

select t15q_set_uid('e1000000-0000-0000-0000-000000000001');
select is((select app.church_service_state('e2000000-0000-0000-0000-00000000000a') ? 'security_block_reason'), false,
  'lectura · el owner de A no lee el motivo');
select is(t15q_err($$ select app.platform_clear_security_block('e2000000-0000-0000-0000-00000000000a', 'owner') $$), '42501',
  'no altera · el owner no puede desbloquear su propia iglesia');
select t15q_reset();

-- ============================================================
-- Gestión: solo platform.church_security.manage. Gestionar no concede lectura.
-- ============================================================
select t15q_set_uid('e1000000-0000-0000-0000-000000000014');
select is(t15q_err($$ select app.platform_set_security_block('e2000000-0000-0000-0000-00000000000b', '   ') $$), '22023',
  'motivo · bloquear sin motivo: rechazado');
select is(t15q_err($$ select app.church_service_state('e2000000-0000-0000-0000-00000000000a') $$), '42501',
  'lectura · manage no concede lectura del estado ni del motivo');
select is(t15q_err($$ select app.platform_clear_security_block('e2000000-0000-0000-0000-00000000000a', null) $$), '22023',
  'motivo · desbloquear sin motivo: rechazado');
select is(t15q_err($$ select app.platform_clear_security_block('e2000000-0000-0000-0000-00000000000a', 'Revisión completada') $$), 'ok',
  'desbloqueo · manage desbloquea con motivo');
select t15q_reset();

select is((select security_block_reason from churches where id = 'e2000000-0000-0000-0000-00000000000a'), null,
  'desbloqueo · la iglesia queda sin bloqueo');
select is((select status::text from subscriptions where church_id = 'e2000000-0000-0000-0000-00000000000a'), 'suspended',
  'desbloqueo · no cambia el estado de la suscripción');

-- Bloqueo de B por manage: queda auditado
select t15q_set_uid('e1000000-0000-0000-0000-000000000014');
select is(t15q_err($$ select app.platform_set_security_block('e2000000-0000-0000-0000-00000000000b', 'Sospecha de acceso indebido') $$), 'ok',
  'bloqueo · manage bloquea con motivo');
select t15q_reset();

-- ============================================================
-- Tenant: owner de A no altera B ni a sí mismo; owner de B no toca A
-- ============================================================
select t15q_set_uid('e1000000-0000-0000-0000-000000000001');
select is(t15q_err($$ select app.platform_set_security_block('e2000000-0000-0000-0000-00000000000b', 'owner A') $$), '42501',
  'tenant · owner de A no bloquea B');
select t15q_reset();
select t15q_set_uid('e1000000-0000-0000-0000-000000000002');
select is(t15q_err($$ select app.platform_clear_security_block('e2000000-0000-0000-0000-00000000000a', 'owner B') $$), '42501',
  'tenant · owner de B no desbloquea A');
select t15q_reset();

select is((select security_block_reason from churches where id = 'e2000000-0000-0000-0000-00000000000b'),
  'Sospecha de acceso indebido', 'tenant · B mantiene su bloqueo intacto frente a los intentos de A');

-- ============================================================
-- Auditoría: bloqueo y desbloqueo con actor, motivo y momento, sin motivo anterior
-- ============================================================
select is((select count(*)::int from platform_audit_logs
  where action = 'church.security_blocked' and actor_user_id = 'e1000000-0000-0000-0000-000000000014'
    and created_at is not null), 1, 'auditoría · el bloqueo queda con operador y momento');
select is((select count(*)::int from platform_audit_logs
  where action = 'church.security_unblocked' and actor_user_id = 'e1000000-0000-0000-0000-000000000014'
    and created_at is not null), 1, 'auditoría · el desbloqueo queda con operador y momento');
select is((select (metadata ? 'reason') or (metadata ? 'previous_reason') from platform_audit_logs
  where action = 'church.security_unblocked' limit 1), false,
  'auditoría · el payload del desbloqueo no guarda el texto del motivo');
-- platform.audit.read: lee la auditoría pero no obtiene el texto interno
insert into auth.users (id, email) values ('e1000000-0000-0000-0000-000000000015', 'op.auditoria.q@example.test');
insert into platform_operators (user_id) values ('e1000000-0000-0000-0000-000000000015');
insert into platform_operator_capabilities (user_id, capability_key) values
  ('e1000000-0000-0000-0000-000000000015', 'platform.audit.read');
select t15q_set_uid('e1000000-0000-0000-0000-000000000015');
select is(t15q_count_text($$ select count(*)::int from app.platform_audit(null, null, 200)
  where metadata::text like '%Sospecha de acceso indebido%' $$), 0,
  'auditoría · platform.audit.read no obtiene el texto interno del motivo de bloqueo');
select is(t15q_count_text($$ select count(*)::int from app.platform_audit(null, 'church.security_blocked', 200) $$), 1,
  'auditoría · platform.audit.read sí ve que hubo un bloqueo (acción y tenant)');
select t15q_reset();

select * from finish();
rollback;
