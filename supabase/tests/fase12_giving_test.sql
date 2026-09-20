-- Fase 12 (Diogo) · Tests de Giving: aislamiento tenant, CRUD de fondos/
-- campañas/aportaciones, dinero (rechazo de 0/negativo), separación resumen
-- vs. detalle (deny-by-default para owner sin capability financiera),
-- refunds (parcial, tope, cross-tenant), conciliación, RLS forzada,
-- superficie pública/anon, module gating, auditoría.

begin;
select plan(57);

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
  select set_config('t12g.' || p_key, coalesce(p_value, ''), true);
$$ language sql;

create or replace function t_id(p_key text) returns uuid as $$
  select nullif(current_setting('t12g.' || p_key, true), '')::uuid;
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
-- Aprovisionamiento: dos iglesias con módulo giving habilitado.
-- Church A: owner (sin capability financiera propia), finance_manager
-- (financial_user, con giving.read_contributions/refund/reconcile/export).
-- ============================================================
insert into auth.users (id, email) values
  ('c1200000-0000-0000-0000-000000000001', 'owner.a.f12@example.test'),
  ('c1200000-0000-0000-0000-000000000002', 'owner.b.f12@example.test'),
  ('c1200000-0000-0000-0000-000000000003', 'finance.a.f12@example.test');

select test_set_auth_uid('c1200000-0000-0000-0000-000000000001');
select t_set('church_a', out_church_id::text), t_set('owner_a', out_person_id::text)
from app.provision_church(
  'Iglesia A F12', 'church-a-f12', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'AF12', 'owner.a.f12@example.test', null, 'Sede A F12', null, null, null, null,
  array['people', 'giving'], null
);

select test_set_auth_uid('c1200000-0000-0000-0000-000000000002');
select t_set('church_b', out_church_id::text)
from app.provision_church(
  'Iglesia B F12', 'church-b-f12', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'BF12', 'owner.b.f12@example.test', null, 'Sede B F12', null, null, null, null,
  array['people', 'giving'], null
);

reset role;

-- Persona financiera: church_people + rol finance_manager, scope church.
insert into people (id, first_name, last_name, user_id) values
  ('c1200000-0000-0000-0000-0000000e0001', 'Finance', 'User A', 'c1200000-0000-0000-0000-000000000003');
select t_set('person_finance', 'c1200000-0000-0000-0000-0000000e0001');

insert into church_people (id, church_id, person_id, relationship)
values ('c1200000-0000-0000-0000-0000000f0001', t_id('church_a'), t_id('person_finance'), 'member');
select t_set('cp_finance', 'c1200000-0000-0000-0000-0000000f0001');

insert into church_people_roles (church_id, church_people_id, role_key, scope_type)
values (t_id('church_a'), t_id('cp_finance'), 'finance_manager', 'church');

-- Donante identificado en Church A (para probar person_id opcional).
insert into people (id, first_name, last_name) values ('c1200000-0000-0000-0000-0000000e0002', 'Donante', 'Uno');
select t_set('person_donor', 'c1200000-0000-0000-0000-0000000e0002');
insert into church_people (church_id, person_id, relationship) values (t_id('church_a'), t_id('person_donor'), 'member');

-- ============================================================
-- 1. Fondos: crear, un solo default por iglesia
-- ============================================================
select test_set_auth_uid('c1200000-0000-0000-0000-000000000001');

select t_set('fund_a1', public.create_giving_fund(t_id('church_a'), 'Fondo general', null, true)::text);
select ok(t_id('fund_a1') is not null, 'create_giving_fund crea el fondo por owner (giving.manage_funds)');

select is(
  (select is_default from giving_funds where id = t_id('fund_a1')),
  true,
  'El primer fondo queda marcado como default'
);

select t_set('fund_a2', public.create_giving_fund(t_id('church_a'), 'Misiones')::text);

select is(
  t_err(format(
    $$ update giving_funds set is_default = true where id = %L $$, t_id('fund_a2')
  )),
  '42501',
  'Escritura directa sobre giving_funds sigue revocada (solo RPC)'
);

select lives_ok(
  format($$ select public.set_giving_fund_default(%L::uuid, %L::uuid) $$, t_id('fund_a2'), t_id('church_a')),
  'set_giving_fund_default cambia el default de forma atómica'
);

select is(
  (select is_default from giving_funds where id = t_id('fund_a1')),
  false,
  'El fondo anterior deja de ser default'
);
select is(
  (select is_default from giving_funds where id = t_id('fund_a2')),
  true,
  'El nuevo fondo queda como default'
);

select is(
  t_err(format($$ select public.archive_giving_fund(%L::uuid, %L::uuid) $$, t_id('fund_a2'), t_id('church_a'))),
  '22023',
  'No se puede archivar el fondo default sin reasignar antes'
);

select lives_ok(
  format($$ select public.archive_giving_fund(%L::uuid, %L::uuid) $$, t_id('fund_a1'), t_id('church_a')),
  'archive_giving_fund archiva un fondo que no es default'
);

-- ============================================================
-- 2. Campañas
-- ============================================================
select t_set('campaign_a1', public.create_giving_campaign(t_id('church_a'), t_id('fund_a2'), 'Navidad 2026')::text);
select ok(t_id('campaign_a1') is not null, 'create_giving_campaign crea la campaña');

select is(
  (select currency from giving_campaigns where id = t_id('campaign_a1')),
  'EUR',
  'La campaña hereda churches.currency cuando no se especifica'
);

select is(
  (select status::text from giving_campaigns where id = t_id('campaign_a1')),
  'draft',
  'La campaña nace en draft'
);

select lives_ok(
  format($$ select public.transition_giving_campaign_status(%L::uuid, %L::uuid, 'active') $$, t_id('campaign_a1'), t_id('church_a')),
  'transition_giving_campaign_status permite draft -> active'
);

select is(
  t_err(format(
    $$ select public.transition_giving_campaign_status(%L::uuid, %L::uuid, 'draft') $$, t_id('campaign_a1'), t_id('church_a')
  )),
  '22023',
  'Transición active -> draft no está permitida'
);

-- ============================================================
-- 3. Owner NO tiene giving.create_contribution por defecto (deny-by-default,
-- encargo §0/§33): solo finance_manager la tiene.
-- ============================================================
select is(
  t_err(format(
    $$ select public.create_giving_contribution(%L::uuid, %L::uuid, 1000, 'cash') $$, t_id('church_a'), t_id('fund_a2')
  )),
  '42501',
  'church_owner sin capability financiera NO puede registrar aportaciones'
);

-- ============================================================
-- 4. Financial user: dinero (0, negativo, válido), con y sin persona,
-- anónima
-- ============================================================
select test_set_auth_uid('c1200000-0000-0000-0000-000000000003');

select is(
  t_err(format(
    $$ select public.create_giving_contribution(%L::uuid, %L::uuid, 0, 'cash') $$, t_id('church_a'), t_id('fund_a2')
  )),
  '22023',
  'amount_minor = 0 se rechaza (ya con capability, se llega a la validación de importe)'
);

select is(
  t_err(format(
    $$ select public.create_giving_contribution(%L::uuid, %L::uuid, -500, 'cash') $$, t_id('church_a'), t_id('fund_a2')
  )),
  '22023',
  'amount_minor negativo se rechaza'
);

select t_set('contrib_a1', public.create_giving_contribution(
  t_id('church_a'), t_id('fund_a2'), 1000, 'cash', t_id('campaign_a1'), t_id('person_donor')
)::text);
select ok(t_id('contrib_a1') is not null, 'finance_manager registra una aportación con persona identificada');

select is(
  (select status::text from giving_contributions where id = t_id('contrib_a1')),
  'succeeded',
  'Una aportación manual (cash) puede registrarse directamente como succeeded'
);

select t_set('contrib_a2', public.create_giving_contribution(
  t_id('church_a'), t_id('fund_a2'), 500, 'cash', null, null, true
)::text);

select is(
  (select person_id from giving_contributions where id = t_id('contrib_a2')),
  null,
  'anonymous=true implica person_id NULL'
);
select is(
  (select anonymous from giving_contributions where id = t_id('contrib_a2')),
  true,
  'anonymous queda marcado correctamente'
);

-- Aportación sin persona ni anónima (donación no vinculada, encargo §11).
select t_set('contrib_a3', public.create_giving_contribution(t_id('church_a'), t_id('fund_a2'), 2000, 'bank_transfer')::text);
select is(
  (select person_id from giving_contributions where id = t_id('contrib_a3')),
  null,
  'Una aportación sin persona ni anónima es válida (persona simplemente no registrada)'
);

-- ============================================================
-- 6. Persona de otro tenant rechazada
-- ============================================================
reset role;
insert into people (id, first_name, last_name) values ('c1200000-0000-0000-0000-0000000e0003', 'Donante', 'De B');
select t_set('person_donor_b', 'c1200000-0000-0000-0000-0000000e0003');
insert into church_people (church_id, person_id, relationship) values (t_id('church_b'), t_id('person_donor_b'), 'member');
select test_set_auth_uid('c1200000-0000-0000-0000-000000000003');

select is(
  t_err(format(
    $$ select public.create_giving_contribution(%L::uuid, %L::uuid, 1000, 'cash', null, %L::uuid) $$,
    t_id('church_a'), t_id('fund_a2'), t_id('person_donor_b')
  )),
  'P0002',
  'No se puede registrar una aportación de Church A vinculada a una persona de Church B'
);

-- ============================================================
-- 7. Summary vs. detail (encargo §34/§43)
-- ============================================================
select test_set_auth_uid('c1200000-0000-0000-0000-000000000001');

select isnt(
  (select public.giving_summary(t_id('church_a')) ->> 'totalAmountMinor'),
  null,
  'church_owner con giving.read_summary SÍ ve el total agregado'
);

select is(
  (select count(*)::integer from giving_contributions where church_id = t_id('church_a')),
  0,
  'church_owner sin giving.read_contributions no lee NINGUNA fila individual de giving_contributions (RLS)'
);

-- ============================================================
-- 8. Financial user sí ve detalle
-- ============================================================
select test_set_auth_uid('c1200000-0000-0000-0000-000000000003');

select is(
  (select count(*)::integer from giving_contributions where church_id = t_id('church_a')),
  3,
  'finance_manager (giving.read_contributions) sí lee las filas individuales de su iglesia'
);

-- ============================================================
-- 9. Refunds: parcial, tope, cross-tenant
-- ============================================================
select t_set('refund_a1', public.create_giving_refund(t_id('contrib_a1'), t_id('church_a'), 400, 'Devolución parcial de prueba')::text);
select ok(t_id('refund_a1') is not null, 'create_giving_refund registra una devolución parcial');

select is(
  t_err(format(
    $$ select public.create_giving_refund(%L::uuid, %L::uuid, 700) $$, t_id('contrib_a1'), t_id('church_a')
  )),
  '22023',
  'Una segunda devolución que supere el importe original (400+700 > 1000) se rechaza'
);

select lives_ok(
  format($$ select public.create_giving_refund(%L::uuid, %L::uuid, 600) $$, t_id('contrib_a1'), t_id('church_a')),
  'Una devolución que completa exactamente el importe restante (400+600=1000) sí se acepta'
);

select is(
  t_err(format(
    $$ select public.create_giving_refund(%L::uuid, %L::uuid, 100) $$, t_id('contrib_a1'), t_id('church_a')
  )),
  '22023',
  'No se puede seguir devolviendo una aportación ya completamente devuelta'
);

-- Cross-tenant: el usuario financiero de A, sin ningún rol en B, no puede
-- reembolsar pasando church_b como church_id (la capability se comprueba
-- primero, y no la tiene en B: deny-by-default, nunca llega a buscar la
-- contribution).
select is(
  t_err(format(
    $$ select public.create_giving_refund(%L::uuid, %L::uuid, 100) $$, t_id('contrib_a2'), t_id('church_b')
  )),
  '42501',
  'Sin capability en Church B, ni siquiera se llega a comprobar la contribución (deny-by-default)'
);

-- ============================================================
-- 10. Conciliación
-- ============================================================
select lives_ok(
  format(
    $$ select public.reconcile_giving_contribution(%L::uuid, %L::uuid, 'EXT-REF-001') $$,
    t_id('contrib_a2'), t_id('church_a')
  ),
  'reconcile_giving_contribution marca una aportación como conciliada'
);

select is(
  (select reconciliation_status::text from giving_contributions where id = t_id('contrib_a2')),
  'reconciled',
  'El estado de conciliación de la aportación cambia a reconciled'
);

select is(
  (select count(*)::integer from giving_contributions where church_id = t_id('church_a') and reconciliation_status = 'unreconciled'),
  2,
  'contrib_a1 (refunded, nunca conciliada) y contrib_a3 siguen sin conciliar; solo contrib_a2 se marcó'
);

-- ============================================================
-- 11. Aislamiento cross-tenant
-- ============================================================
select test_set_auth_uid('c1200000-0000-0000-0000-000000000002');

select is(
  (select count(*)::integer from giving_funds where church_id = t_id('church_a')),
  0,
  'Church B no ve fondos de Church A'
);
select is(
  (select count(*)::integer from giving_campaigns where church_id = t_id('church_a')),
  0,
  'Church B no ve campañas de Church A'
);
select is(
  (select count(*)::integer from giving_contributions where church_id = t_id('church_a')),
  0,
  'Church B no ve aportaciones de Church A (aunque tuviera capability, RLS filtra por su propio church_id)'
);

-- Church B owner sí tiene giving.manage_funds (rol general), pero al pasar
-- su propio church_id con un fund_id de Church A, la búsqueda tenant-safe
-- no encuentra el fondo bajo ese church_id: P0002, no 42501.
select is(
  t_err(format(
    $$ select public.update_giving_fund(%L::uuid, %L::uuid, 'Hackeado') $$, t_id('fund_a2'), t_id('church_b')
  )),
  'P0002',
  'Church B no puede editar un fondo de Church A: no lo encuentra bajo su propio church_id'
);

-- Campaña de B no puede referenciar fondo de A (FK tenant-safe).
select test_set_auth_uid('c1200000-0000-0000-0000-000000000002');
select is(
  t_err(format(
    $$ select public.create_giving_campaign(%L::uuid, %L::uuid, 'Cruzada') $$, t_id('church_b'), t_id('fund_a2')
  )),
  'P0002',
  'Church B no puede crear una campaña sobre un fondo de Church A'
);

-- ============================================================
-- 12. Recurrencia: crear plan, nunca genera contribution automáticamente
-- ============================================================
select test_set_auth_uid('c1200000-0000-0000-0000-000000000003');

select t_set('plan_a1', public.create_giving_recurring_plan(t_id('church_a'), t_id('fund_a2'), 2500, 'monthly', t_id('person_donor'))::text);
select ok(t_id('plan_a1') is not null, 'create_giving_recurring_plan crea el plan');

select is(
  (select status::text from giving_recurring_plans where id = t_id('plan_a1')),
  'active',
  'El plan nace activo'
);

select is(
  (select count(*)::integer from giving_contributions where recurring_plan_id = t_id('plan_a1')),
  0,
  'Crear un plan recurrente NO genera ninguna contribution automáticamente'
);

select lives_ok(
  format($$ select public.set_giving_recurring_plan_status(%L::uuid, %L::uuid, 'paused') $$, t_id('plan_a1'), t_id('church_a')),
  'set_giving_recurring_plan_status pausa el plan'
);

-- ============================================================
-- 13. RLS forzada + superficie anon
-- ============================================================
select ok((select relforcerowsecurity from pg_class where relname = 'giving_funds'), 'giving_funds tiene FORCE RLS');
select ok((select relforcerowsecurity from pg_class where relname = 'giving_campaigns'), 'giving_campaigns tiene FORCE RLS');
select ok((select relforcerowsecurity from pg_class where relname = 'giving_contributions'), 'giving_contributions tiene FORCE RLS');
select ok((select relforcerowsecurity from pg_class where relname = 'giving_refunds'), 'giving_refunds tiene FORCE RLS');
select ok((select relforcerowsecurity from pg_class where relname = 'giving_recurring_plans'), 'giving_recurring_plans tiene FORCE RLS');
select ok((select relforcerowsecurity from pg_class where relname = 'giving_reconciliations'), 'giving_reconciliations tiene FORCE RLS');

select test_set_anon();

select is(
  t_err(format($$ select public.create_giving_fund(%L::uuid, 'Intento anon') $$, t_id('church_a'))),
  '42501',
  'anon no puede ejecutar create_giving_fund'
);
select is(
  t_err($$ select * from giving_contributions limit 1 $$),
  '42501',
  'anon no tiene SELECT directo sobre giving_contributions'
);

reset role;

-- ============================================================
-- 14. Module gating
-- ============================================================
insert into churches (id, name, slug, status, timezone, currency)
values ('c1200000-0000-0000-0000-0000000c0009', 'Iglesia sin Giving F12', 'church-no-giving-f12', 'active', 'Europe/Madrid', 'EUR');
select t_set('church_nogiving', 'c1200000-0000-0000-0000-0000000c0009');

insert into church_modules (church_id, module_key, status) values (t_id('church_nogiving'), 'giving', 'disabled');

insert into church_people (church_id, person_id, relationship) values (t_id('church_nogiving'), t_id('person_finance'), 'leader');
insert into church_people_roles (church_id, church_people_id, role_key, scope_type)
select t_id('church_nogiving'), id, 'finance_manager', 'church'
from church_people where church_id = t_id('church_nogiving') and person_id = t_id('person_finance');

select test_set_auth_uid('c1200000-0000-0000-0000-000000000003');
select is(
  t_err(format($$ select public.create_giving_fund(%L::uuid, 'Sin módulo') $$, t_id('church_nogiving'))),
  '42501',
  'Con el módulo giving deshabilitado, create_giving_fund se rechaza aunque haya capability'
);

-- ============================================================
-- 15. Auditoría
-- ============================================================
select test_set_auth_uid('c1200000-0000-0000-0000-000000000001');
reset role;

select ok(
  exists(select 1 from audit_logs where church_id = t_id('church_a') and action = 'giving.fund.created' and entity_id = t_id('fund_a1')),
  'giving.fund.created queda auditado'
);
select ok(
  exists(select 1 from audit_logs where church_id = t_id('church_a') and action = 'giving.campaign.created' and entity_id = t_id('campaign_a1')),
  'giving.campaign.created queda auditado'
);
select ok(
  exists(select 1 from audit_logs where church_id = t_id('church_a') and action = 'giving.contribution.created' and entity_id = t_id('contrib_a1')),
  'giving.contribution.created queda auditado'
);
select ok(
  exists(select 1 from audit_logs where church_id = t_id('church_a') and action = 'giving.contribution.refunded' and entity_id = t_id('contrib_a1')),
  'giving.contribution.refunded queda auditado'
);
select ok(
  exists(select 1 from audit_logs where church_id = t_id('church_a') and action = 'giving.reconciliation.completed' and entity_id = t_id('contrib_a2')),
  'giving.reconciliation.completed queda auditado'
);

-- Auditoría nunca incluye notas/importe con contexto personal innecesario:
-- comprobamos que el metadata de creación no contiene la clave "notes".
select ok(
  not (
    (select metadata from audit_logs where church_id = t_id('church_a') and action = 'giving.contribution.created' and entity_id = t_id('contrib_a1') limit 1)
    ? 'notes'
  ),
  'El payload de auditoría de contribution.created no incluye las notas'
);

select * from finish();
rollback;
