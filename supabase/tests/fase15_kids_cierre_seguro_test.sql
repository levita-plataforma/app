-- Fase 15 · A1 (ajuste Kids): cierre seguro de un menor ya presente en cualquier
-- modo no activo. Cubre: check-out y recogida de presencia activa, incidencia de
-- un menor dentro, denegación de check-in y sesión nuevos, DETAIL de bloqueo, y
-- aislamiento entre tenants. No abre lectura de Kids (eso es A2).

begin;
select plan(19);

create or replace function t15k_err(p_sql text) returns text as $$
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

create or replace function t15k_err_detail(p_sql text) returns text as $$
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
-- Fixtures: cinco iglesias, cada una con una sala, una sesión y un menor dentro.
--   K1 trial_expired · K2 security_blocked · K3 suspended · K4 cancelled · F full
-- Los estados se aplican después de crear las presencias (con la iglesia activa),
-- porque un check-in nuevo en un modo no activo debe fallar.
-- ============================================================
insert into churches (id, name, slug, status) values
  ('f1520000-0000-0000-0000-0000000000a1', 'Kids K1 F15', 'kids-k1-f15', 'trial'),
  ('f1520000-0000-0000-0000-0000000000a2', 'Kids K2 F15', 'kids-k2-f15', 'trial'),
  ('f1520000-0000-0000-0000-0000000000a3', 'Kids K3 F15', 'kids-k3-f15', 'trial'),
  ('f1520000-0000-0000-0000-0000000000a4', 'Kids K4 F15', 'kids-k4-f15', 'trial'),
  ('f1520000-0000-0000-0000-0000000000a5', 'Kids F F15', 'kids-f-f15', 'trial');

insert into subscriptions (church_id, plan_key, status, trial_started_at, trial_ends_at) values
  ('f1520000-0000-0000-0000-0000000000a1', 'trial', 'trial', now() - interval '40 days', now() + interval '1 day'),
  ('f1520000-0000-0000-0000-0000000000a2', 'trial', 'trial', now() - interval '5 days', now() + interval '25 days'),
  ('f1520000-0000-0000-0000-0000000000a3', 'trial', 'trial', now() - interval '5 days', now() + interval '25 days'),
  ('f1520000-0000-0000-0000-0000000000a4', 'trial', 'trial', now() - interval '5 days', now() + interval '25 days'),
  ('f1520000-0000-0000-0000-0000000000a5', 'trial', 'trial', now() - interval '5 days', now() + interval '25 days');

insert into people (id, first_name, last_name, source) values
  ('f1520000-0000-0000-0000-0000000000b1', 'Menor', 'K1', 'manual'),
  ('f1520000-0000-0000-0000-0000000000b2', 'Menor', 'K2', 'manual'),
  ('f1520000-0000-0000-0000-0000000000b3', 'Menor', 'K3', 'manual'),
  ('f1520000-0000-0000-0000-0000000000b4', 'Menor', 'K4', 'manual'),
  ('f1520000-0000-0000-0000-0000000000b5', 'Menor', 'F', 'manual'),
  ('f1520000-0000-0000-0000-0000000000b6', 'Menor', 'Nuevo', 'manual');

insert into church_people (church_id, person_id, relationship, source) values
  ('f1520000-0000-0000-0000-0000000000a1', 'f1520000-0000-0000-0000-0000000000b1', 'member', 'manual'),
  ('f1520000-0000-0000-0000-0000000000a2', 'f1520000-0000-0000-0000-0000000000b2', 'member', 'manual'),
  ('f1520000-0000-0000-0000-0000000000a3', 'f1520000-0000-0000-0000-0000000000b3', 'member', 'manual'),
  ('f1520000-0000-0000-0000-0000000000a4', 'f1520000-0000-0000-0000-0000000000b4', 'member', 'manual'),
  ('f1520000-0000-0000-0000-0000000000a5', 'f1520000-0000-0000-0000-0000000000b5', 'member', 'manual'),
  ('f1520000-0000-0000-0000-0000000000a5', 'f1520000-0000-0000-0000-0000000000b6', 'member', 'manual');

insert into activities (id, church_id, type, title, starts_at, ends_at, timezone) values
  ('f1520000-0000-0000-0000-0000000000c1', 'f1520000-0000-0000-0000-0000000000a1', 'service', 'Culto K1',
   now() - interval '1 hour', now() + interval '1 hour', 'Europe/Madrid'),
  ('f1520000-0000-0000-0000-0000000000c2', 'f1520000-0000-0000-0000-0000000000a2', 'service', 'Culto K2',
   now() - interval '1 hour', now() + interval '1 hour', 'Europe/Madrid'),
  ('f1520000-0000-0000-0000-0000000000c3', 'f1520000-0000-0000-0000-0000000000a3', 'service', 'Culto K3',
   now() - interval '1 hour', now() + interval '1 hour', 'Europe/Madrid'),
  ('f1520000-0000-0000-0000-0000000000c4', 'f1520000-0000-0000-0000-0000000000a4', 'service', 'Culto K4',
   now() - interval '1 hour', now() + interval '1 hour', 'Europe/Madrid'),
  ('f1520000-0000-0000-0000-0000000000c5', 'f1520000-0000-0000-0000-0000000000a5', 'service', 'Culto F',
   now() - interval '1 hour', now() + interval '1 hour', 'Europe/Madrid');

insert into kids_rooms (id, church_id, name, capacity) values
  ('f1520000-0000-0000-0000-0000000000d1', 'f1520000-0000-0000-0000-0000000000a1', 'Sala K1', 20),
  ('f1520000-0000-0000-0000-0000000000d2', 'f1520000-0000-0000-0000-0000000000a2', 'Sala K2', 20),
  ('f1520000-0000-0000-0000-0000000000d3', 'f1520000-0000-0000-0000-0000000000a3', 'Sala K3', 20),
  ('f1520000-0000-0000-0000-0000000000d4', 'f1520000-0000-0000-0000-0000000000a4', 'Sala K4', 20),
  ('f1520000-0000-0000-0000-0000000000d5', 'f1520000-0000-0000-0000-0000000000a5', 'Sala F', 20);

insert into kids_sessions (id, church_id, activity_id, room_id, status) values
  ('f1520000-0000-0000-0000-0000000000e1', 'f1520000-0000-0000-0000-0000000000a1', 'f1520000-0000-0000-0000-0000000000c1', 'f1520000-0000-0000-0000-0000000000d1', 'open'),
  ('f1520000-0000-0000-0000-0000000000e2', 'f1520000-0000-0000-0000-0000000000a2', 'f1520000-0000-0000-0000-0000000000c2', 'f1520000-0000-0000-0000-0000000000d2', 'open'),
  ('f1520000-0000-0000-0000-0000000000e3', 'f1520000-0000-0000-0000-0000000000a3', 'f1520000-0000-0000-0000-0000000000c3', 'f1520000-0000-0000-0000-0000000000d3', 'open'),
  ('f1520000-0000-0000-0000-0000000000e4', 'f1520000-0000-0000-0000-0000000000a4', 'f1520000-0000-0000-0000-0000000000c4', 'f1520000-0000-0000-0000-0000000000d4', 'open'),
  ('f1520000-0000-0000-0000-0000000000e5', 'f1520000-0000-0000-0000-0000000000a5', 'f1520000-0000-0000-0000-0000000000c5', 'f1520000-0000-0000-0000-0000000000d5', 'open');

insert into kid_checkins (id, church_id, session_id, kid_person_id, room_id, status, pickup_token_hash, checked_in_at) values
  ('f1520000-0000-0000-0000-0000000000f1', 'f1520000-0000-0000-0000-0000000000a1', 'f1520000-0000-0000-0000-0000000000e1', 'f1520000-0000-0000-0000-0000000000b1', 'f1520000-0000-0000-0000-0000000000d1', 'checked_in', 'hash-k1', now()),
  ('f1520000-0000-0000-0000-0000000000f2', 'f1520000-0000-0000-0000-0000000000a2', 'f1520000-0000-0000-0000-0000000000e2', 'f1520000-0000-0000-0000-0000000000b2', 'f1520000-0000-0000-0000-0000000000d2', 'checked_in', 'hash-k2', now()),
  ('f1520000-0000-0000-0000-0000000000f3', 'f1520000-0000-0000-0000-0000000000a3', 'f1520000-0000-0000-0000-0000000000e3', 'f1520000-0000-0000-0000-0000000000b3', 'f1520000-0000-0000-0000-0000000000d3', 'checked_in', 'hash-k3', now()),
  ('f1520000-0000-0000-0000-0000000000f4', 'f1520000-0000-0000-0000-0000000000a4', 'f1520000-0000-0000-0000-0000000000e4', 'f1520000-0000-0000-0000-0000000000b4', 'f1520000-0000-0000-0000-0000000000d4', 'checked_in', 'hash-k4', now()),
  ('f1520000-0000-0000-0000-0000000000f5', 'f1520000-0000-0000-0000-0000000000a5', 'f1520000-0000-0000-0000-0000000000e5', 'f1520000-0000-0000-0000-0000000000b5', 'f1520000-0000-0000-0000-0000000000d5', 'checked_in', 'hash-f', now());

-- Estados: se aplican tras las presencias.
update subscriptions set trial_ends_at = now() - interval '10 days'
where church_id = 'f1520000-0000-0000-0000-0000000000a1';
update churches set security_block_reason = 'Bloqueo Kids F15', security_blocked_at = now()
where id = 'f1520000-0000-0000-0000-0000000000a2';
update subscriptions set status = 'suspended'
where church_id = 'f1520000-0000-0000-0000-0000000000a3';
update subscriptions set status = 'cancelled'
where church_id = 'f1520000-0000-0000-0000-0000000000a4';

-- ============================================================
-- trial_expired (K1)
-- ============================================================
select is(app.church_access_mode('f1520000-0000-0000-0000-0000000000a1'), 'trial_expired',
  'K1 · precondición: prueba vencida');
select is(t15k_err($$ insert into kids_incidents (church_id, kid_person_id, description)
  values ('f1520000-0000-0000-0000-0000000000a1', 'f1520000-0000-0000-0000-0000000000b1', 'Incidencia K1') $$), 'ok',
  'K1 · incidencia de menor dentro: ALLOWED');
select is(t15k_err($$ update kid_checkins set status = 'checked_out', checked_out_at = now()
  where id = 'f1520000-0000-0000-0000-0000000000f1' $$), 'ok',
  'K1 · menor ya dentro + check-out: ALLOWED');
select is(t15k_err($$ insert into kid_checkins (church_id, session_id, kid_person_id, room_id, status, pickup_token_hash)
  values ('f1520000-0000-0000-0000-0000000000a1', 'f1520000-0000-0000-0000-0000000000e1',
          'f1520000-0000-0000-0000-0000000000b6', 'f1520000-0000-0000-0000-0000000000d1', 'checked_in', 'hash-nuevo-k1') $$), '42501',
  'K1 · nuevo check-in: DENIED');
select is(t15k_err($$ insert into kids_sessions (church_id, activity_id, room_id, status)
  values ('f1520000-0000-0000-0000-0000000000a1', 'f1520000-0000-0000-0000-0000000000c1',
          'f1520000-0000-0000-0000-0000000000d1', 'open') $$), '42501',
  'K1 · nueva sesión: DENIED');
select is(t15k_err($$ insert into kids_incidents (church_id, kid_person_id, description)
  values ('f1520000-0000-0000-0000-0000000000a1', 'f1520000-0000-0000-0000-0000000000b6', 'Incidencia K1 ajena') $$), '42501',
  'K1 · incidencia de menor que no está dentro: DENIED');

-- ============================================================
-- security_blocked (K2)
-- ============================================================
select is(app.church_access_mode('f1520000-0000-0000-0000-0000000000a2'), 'security_blocked',
  'K2 · precondición: bloqueada por seguridad');
select is(t15k_err($$ insert into kids_incidents (church_id, kid_person_id, description)
  values ('f1520000-0000-0000-0000-0000000000a2', 'f1520000-0000-0000-0000-0000000000b2', 'Incidencia de seguridad K2') $$), 'ok',
  'K2 · incidencia de seguridad de menor dentro: ALLOWED');
select is(t15k_err($$ update kid_checkins set status = 'checked_out', checked_out_at = now()
  where id = 'f1520000-0000-0000-0000-0000000000f2' $$), 'ok',
  'K2 · menor ya dentro + check-out: ALLOWED');
select is(t15k_err($$ insert into kid_checkins (church_id, session_id, kid_person_id, room_id, status, pickup_token_hash)
  values ('f1520000-0000-0000-0000-0000000000a2', 'f1520000-0000-0000-0000-0000000000e2',
          'f1520000-0000-0000-0000-0000000000b6', 'f1520000-0000-0000-0000-0000000000d2', 'checked_in', 'hash-nuevo-k2') $$), '42501',
  'K2 · nuevo check-in: DENIED');
select is(t15k_err_detail($$ insert into kid_checkins (church_id, session_id, kid_person_id, room_id, status, pickup_token_hash)
  values ('f1520000-0000-0000-0000-0000000000a2', 'f1520000-0000-0000-0000-0000000000e2',
          'f1520000-0000-0000-0000-0000000000b6', 'f1520000-0000-0000-0000-0000000000d2', 'checked_in', 'hash-nuevo-k2b') $$),
  'CHURCH_SECURITY_BLOCKED', 'K2 · nuevo check-in: DETAIL CHURCH_SECURITY_BLOCKED');

-- ============================================================
-- suspended (K3) y cancelled (K4): comportamiento aprobado sin cambios
-- ============================================================
select is(t15k_err($$ insert into kids_incidents (church_id, kid_person_id, description)
  values ('f1520000-0000-0000-0000-0000000000a3', 'f1520000-0000-0000-0000-0000000000b3', 'Incidencia K3') $$), 'ok',
  'K3 · suspended + incidencia de menor dentro: ALLOWED');
select is(t15k_err($$ update kid_checkins set status = 'checked_out', checked_out_at = now()
  where id = 'f1520000-0000-0000-0000-0000000000f3' $$), 'ok',
  'K3 · suspended + check-out: ALLOWED');
select is(t15k_err($$ insert into kid_checkins (church_id, session_id, kid_person_id, room_id, status, pickup_token_hash)
  values ('f1520000-0000-0000-0000-0000000000a3', 'f1520000-0000-0000-0000-0000000000e3',
          'f1520000-0000-0000-0000-0000000000b6', 'f1520000-0000-0000-0000-0000000000d3', 'checked_in', 'hash-nuevo-k3') $$), '42501',
  'K3 · suspended + nuevo check-in: DENIED');
select is(t15k_err($$ insert into kids_incidents (church_id, kid_person_id, description)
  values ('f1520000-0000-0000-0000-0000000000a4', 'f1520000-0000-0000-0000-0000000000b4', 'Incidencia K4') $$), 'ok',
  'K4 · cancelled + incidencia de menor dentro: ALLOWED');
select is(t15k_err($$ insert into kid_checkins (church_id, session_id, kid_person_id, room_id, status, pickup_token_hash)
  values ('f1520000-0000-0000-0000-0000000000a4', 'f1520000-0000-0000-0000-0000000000e4',
          'f1520000-0000-0000-0000-0000000000b6', 'f1520000-0000-0000-0000-0000000000d4', 'checked_in', 'hash-nuevo-k4') $$), '42501',
  'K4 · cancelled + nuevo check-in: DENIED');

-- ============================================================
-- Aislamiento entre tenants
-- ============================================================
select is(t15k_err($$ insert into kids_incidents (church_id, kid_person_id, description)
  values ('f1520000-0000-0000-0000-0000000000a2', 'f1520000-0000-0000-0000-0000000000b1', 'Menor de K1 en K2') $$), '42501',
  'Cross-tenant · incidencia en K2 de un menor que está dentro solo en K1: DENIED');
select is(t15k_err($$ update kid_checkins set church_id = 'f1520000-0000-0000-0000-0000000000a2'
  where id = 'f1520000-0000-0000-0000-0000000000f5' $$), '42501',
  'Cross-tenant · mover una presencia de F a K2: DENIED');

-- ============================================================
-- Regresión: iglesia activa sin cambios
-- ============================================================
select is(t15k_err($$ insert into kid_checkins (church_id, session_id, kid_person_id, room_id, status, pickup_token_hash)
  values ('f1520000-0000-0000-0000-0000000000a5', 'f1520000-0000-0000-0000-0000000000e5',
          'f1520000-0000-0000-0000-0000000000b6', 'f1520000-0000-0000-0000-0000000000d5', 'checked_in', 'hash-nuevo-f') $$), 'ok',
  'Regresión · iglesia full: nuevo check-in ALLOWED');

select * from finish();
rollback;
