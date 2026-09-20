-- Fase 12 (Diogo) · Tests de Analítica: dashboard agregado, gating de
-- capability/módulo, aislamiento tenant, tendencias con denominador cero,
-- respeto de las capabilities de los módulos fuente, y superficie CSV.
-- Ver docs/FASE-12-ANALITICA.md.

begin;
select plan(32);

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
  select set_config('t12a.' || p_key, coalesce(p_value, ''), true);
$$ language sql;

create or replace function t_id(p_key text) returns uuid as $$
  select nullif(current_setting('t12a.' || p_key, true), '')::uuid;
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

-- ============================================================
-- Aprovisionamiento: iglesia A (analytics habilitado, con datos de People/
-- Serving/Events/Groups/Kids/Communications) e iglesia B (sin analytics
-- habilitado, para el test de módulo deshabilitado y aislamiento).
-- ============================================================
insert into auth.users (id, email) values
  ('7c000000-0000-0000-0000-000000000001', 'owner.a.c12a@example.test'),
  ('7c000000-0000-0000-0000-000000000002', 'owner.b.c12a@example.test'),
  ('7c000000-0000-0000-0000-000000000003', 'member.a.c12a@example.test');

select test_set_auth_uid('7c000000-0000-0000-0000-000000000001');
select t_set('church_a', out_church_id::text), t_set('campus_a', out_campus_id::text), t_set('owner_a', out_person_id::text)
from app.provision_church(
  'Iglesia A C12A', 'church-a-c12a', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'AC12A', 'owner.a.c12a@example.test', null, 'Sede A C12A', null, null, null, null,
  array['people', 'serving', 'events', 'groups', 'discipleship', 'kids', 'communications', 'analytics'], null
);

select test_set_auth_uid('7c000000-0000-0000-0000-000000000002');
select t_set('church_b', out_church_id::text)
from app.provision_church(
  'Iglesia B C12A', 'church-b-c12a', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'BC12A', 'owner.b.c12a@example.test', null, 'Sede B C12A', null, null, null, null,
  array['people', 'analytics'], null
);
-- B: deshabilitamos explícitamente analytics para probar module gating.
update church_modules set status = 'disabled' where church_id = t_id('church_b') and module_key = 'analytics';

reset role;

-- Miembro simple de A, sin roles: para probar 42501 por falta de analytics.read.
-- user_id vincula a auth.users para que app.current_person_ids() la resuelva.
insert into people (id, first_name, last_name, user_id, source) values
  ('7c000000-0000-0000-0000-0000000e0001', 'Marta', 'Miembro', '7c000000-0000-0000-0000-000000000003', 'manual');
insert into church_people (id, church_id, person_id, relationship, source) values
  ('7c000000-0000-0000-0000-0000000f0001', t_id('church_a'), '7c000000-0000-0000-0000-0000000e0001', 'member', 'manual');
select t_set('member_a', '7c000000-0000-0000-0000-0000000e0001');

-- Una persona más, archivada dentro del período (para "archived_people").
insert into people (id, first_name, last_name, source) values
  ('7c000000-0000-0000-0000-0000000e0002', 'Pedro', 'Baja', 'manual');
insert into church_people (id, church_id, person_id, relationship, source, archived_at) values
  ('7c000000-0000-0000-0000-0000000f0002', t_id('church_a'), '7c000000-0000-0000-0000-0000000e0002', 'member', 'manual', now() - interval '1 hour');

insert into service_areas (id, church_id, name, slug) values
  ('7c000000-0000-0000-0000-000000900001', t_id('church_a'), 'Sonido C12A', 'sonido-c12a');
select t_set('service_area_a', '7c000000-0000-0000-0000-000000900001');

-- Una actividad de servicio publicada dentro del período, con un puesto.
-- La inserción directa de la actividad se hace con reset role (activities
-- no tiene GRANT INSERT directo para authenticated, solo vía RPC); el área,
-- el puesto y la publicación sí usan las RPC reales
-- (public.add_activity_area/add_activity_position/transition_activity_status,
-- igual que fase5_asignaciones_test.sql), autenticados como church_owner de A.
insert into activities (id, church_id, campus_id, type, title, starts_at, ends_at, status, timezone)
values ('7c000000-0000-0000-0000-000000a00001', t_id('church_a'), t_id('campus_a'), 'service', 'Culto C12A', now() - interval '1 hour', now() + interval '1 hour', 'draft', 'Europe/Madrid');
select t_set('activity_a', '7c000000-0000-0000-0000-000000a00001');

select test_set_auth_uid('7c000000-0000-0000-0000-000000000001');

select t_set('aserv_a', (public.add_activity_area(t_id('activity_a'), t_id('service_area_a'), 'optional', null, false) ->> 'activity_service_area_id'));

select t_set('position_a', public.add_activity_position(t_id('aserv_a'), '{"name":"Sonidista","min_people":2}'::jsonb)::text);

select public.transition_activity_status(t_id('activity_a'), 'published');

reset role;

insert into activity_assignments (church_id, activity_id, activity_position_id, person_id, position_name, status, sent_at, responded_at, response_source)
values (t_id('church_a'), t_id('activity_a'), t_id('position_a'), t_id('member_a'), 'Sonidista', 'accepted', now(), now(), 'self');

-- ============================================================
-- 1. Capability ausente: 42501
-- ============================================================
select test_set_auth_uid('7c000000-0000-0000-0000-000000000003');
select is(
  t_err(format($$ select app.analytics_dashboard(%L::uuid) $$, t_id('church_a'))),
  '42501',
  'Miembro sin analytics.read no puede leer el dashboard'
);

-- ============================================================
-- 2. Módulo deshabilitado: 42501, aunque tenga capability
-- ============================================================
select test_set_auth_uid('7c000000-0000-0000-0000-000000000002');
select is(
  t_err(format($$ select app.analytics_dashboard(%L::uuid) $$, t_id('church_b'))),
  '42501',
  'church_owner de B no puede leer el dashboard: módulo analytics deshabilitado'
);

-- ============================================================
-- 3-4. Aislamiento: owner de B no puede leer el dashboard de A
-- ============================================================
select is(
  t_err(format($$ select app.analytics_dashboard(%L::uuid) $$, t_id('church_a'))),
  '42501',
  'Owner de B no tiene rol en A: 42501, no se filtra por capability sino por ausencia de rol'
);

-- ============================================================
-- 5+. Owner de A: dashboard completo
-- ============================================================
select test_set_auth_uid('7c000000-0000-0000-0000-000000000001');

select ok(
  (select app.analytics_dashboard(t_id('church_a'), '30d') is not null),
  'Owner de A obtiene el dashboard'
);

select is(
  (select (app.analytics_dashboard(t_id('church_a'), '30d') -> 'people' ->> 'active_people')::int),
  2,
  'People: 2 personas activas (member_a + owner_a; la archivada no cuenta)'
);

select is(
  (select (app.analytics_dashboard(t_id('church_a'), '30d') -> 'people' -> 'archived_people' ->> 'current')::int),
  1,
  'People: 1 persona archivada en el período'
);

select is(
  (select (app.analytics_dashboard(t_id('church_a'), '30d') -> 'serving' -> 'activities' ->> 'current')::int),
  1,
  'Serving: 1 actividad publicada en el período'
);

select is(
  (select (app.analytics_dashboard(t_id('church_a'), '30d') -> 'serving' ->> 'positions_planned')::int),
  2,
  'Serving: min_people del único puesto (2) es lo planificado'
);

select is(
  (select (app.analytics_dashboard(t_id('church_a'), '30d') -> 'serving' ->> 'assignments_confirmed')::int),
  1,
  'Serving: 1 asignación aceptada'
);

select is(
  (select (app.analytics_dashboard(t_id('church_a'), '30d') -> 'serving' ->> 'assignments_pending')::int),
  0,
  'Serving: 0 asignaciones pendientes'
);

-- ============================================================
-- Módulos habilitados sin datos: el bloque aparece igual (con capability de
-- origen concedida al owner), solo en cero — nunca se omite por falta de
-- datos, solo por falta de módulo/capability.
-- ============================================================
select ok(
  (select (app.analytics_dashboard(t_id('church_a'), '30d') -> 'events') is not null),
  'Events aparece para el owner (tiene event.read), aunque no haya eventos'
);

select is(
  (select (app.analytics_dashboard(t_id('church_a'), '30d') -> 'events' -> 'registrations' ->> 'current')::int),
  0,
  'Events: 0 inscripciones, no null (denominador cero no debe romper el conteo)'
);

select is(
  (select (app.analytics_dashboard(t_id('church_a'), '30d') -> 'events' -> 'registrations' ->> 'delta_pct')),
  null,
  'Events: delta_pct es N/A (null) cuando el período anterior también es cero'
);

select is(
  (select (app.analytics_dashboard(t_id('church_a'), '30d') -> 'groups' ->> 'active_groups')::int),
  0,
  'Groups aparece (group.read del owner) con 0 grupos activos'
);

select is(
  (select (app.analytics_dashboard(t_id('church_a'), '30d') -> 'discipleship' ->> 'active_courses')::int),
  0,
  'Discipleship aparece (course.read del owner) con 0 cursos activos'
);

select is(
  (select (app.analytics_dashboard(t_id('church_a'), '30d') -> 'kids' ->> 'active_profiles')::int),
  0,
  'Kids aparece (kids.read del owner) con 0 perfiles'
);

select is(
  (select (app.analytics_dashboard(t_id('church_a'), '30d') -> 'communications' -> 'communications_sent' ->> 'current')::int),
  0,
  'Communications aparece (communications.read_metrics del owner) con 0 comunicaciones enviadas'
);

-- ============================================================
-- Miembro sin ninguna capability de módulo fuente, pero con analytics.read
-- concedida manualmente: el dashboard no debe filtrar ningún bloque sensible.
-- ============================================================
reset role;
insert into church_people_roles (church_id, church_people_id, role_key, scope_type)
select t_id('church_a'), id, 'member', 'church' from church_people where person_id = t_id('member_a');

insert into role_capabilities (role_key, capability_key)
values ('member', 'analytics.read')
on conflict do nothing;

select test_set_auth_uid('7c000000-0000-0000-0000-000000000003');

select ok(
  (select (app.analytics_dashboard(t_id('church_a'), '30d') -> 'people') is null),
  'Miembro con solo analytics.read no ve el bloque People: analytics.read no sustituye people.read'
);

select ok(
  (select (app.analytics_dashboard(t_id('church_a'), '30d') -> 'kids') is null),
  'Miembro con solo analytics.read no ve el bloque Kids: analytics.read no sustituye kids.read'
);

delete from role_capabilities where role_key = 'member' and capability_key = 'analytics.read';
delete from church_people_roles where church_id = t_id('church_a') and role_key = 'member'
  and church_people_id in (select id from church_people where person_id = t_id('member_a'));

-- ============================================================
-- app.analytics_trend: denominador cero
-- ============================================================
select is(
  (select app.analytics_trend(5, 0) ->> 'delta_pct'),
  null,
  'analytics_trend: delta_pct es null cuando el período anterior es cero, no Infinity ni 0'
);

select is(
  (select (app.analytics_trend(5, 0) ->> 'delta_abs')::int),
  5,
  'analytics_trend: delta_abs es la diferencia simple'
);

select is(
  (select (app.analytics_trend(15, 10) ->> 'delta_pct')::numeric),
  50.0,
  'analytics_trend: 15 vs 10 es +50%'
);

select is(
  (select app.analytics_trend(0, 0) ->> 'delta_pct'),
  null,
  'analytics_trend: 0 vs 0 también es N/A, no 0%'
);

-- ============================================================
-- app.analytics_period_bounds: períodos y validación
-- ============================================================
select is(
  t_err($$ select app.analytics_period_bounds('bogus', null, null, 'Europe/Madrid') $$),
  '22023',
  'Período no soportado se rechaza con 22023'
);

select is(
  t_err($$ select app.analytics_period_bounds('custom', null, null, 'Europe/Madrid') $$),
  '22023',
  'Intervalo personalizado sin from/to se rechaza'
);

select is(
  t_err($$ select app.analytics_period_bounds('custom', now(), now() - interval '1 day', 'Europe/Madrid') $$),
  '22023',
  'Intervalo personalizado con to <= from se rechaza'
);

select is(
  t_err($$ select app.analytics_period_bounds('custom', now() - interval '400 days', now(), 'Europe/Madrid') $$),
  '22023',
  'Intervalo personalizado de más de 366 días se rechaza'
);

select ok(
  (select period_from < period_to from app.analytics_period_bounds('7d', null, null, 'Europe/Madrid')),
  'Período 7d produce un rango válido'
);

select ok(
  (select previous_to = period_from from app.analytics_period_bounds('30d', null, null, 'Europe/Madrid')),
  'El período anterior termina exactamente donde empieza el actual (comparables, sin solape)'
);

-- ============================================================
-- Revokes explícitos: anon no puede llamar a ninguna función nueva
-- ============================================================
select test_set_anon();

select is(
  t_err(format($$ select public.analytics_dashboard(%L::uuid) $$, t_id('church_a'))),
  '42501',
  'anon no puede llamar a public.analytics_dashboard'
);

select is(
  t_err($$ select public.has_capability(gen_random_uuid(), 'analytics.export') $$),
  '42501',
  'has_capability no está concedida a anon (sin cambios de esta fase): anon nunca la alcanza'
);

select is(
  t_err($$ select app.analytics_trend(1, 1) $$),
  '42501',
  'anon no puede llamar a app.analytics_trend directamente (solo authenticated)'
);

select * from finish();
rollback;
