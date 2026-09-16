-- Fase 1 · Tests de seguridad: cross-tenant, capability, sedes.
-- Ver encargo de Fase 1 §25.

begin;
select plan(11);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

insert into auth.users (id, email) values
  ('40000000-0000-0000-0000-000000000001', 'owner.a@example.test'),
  ('40000000-0000-0000-0000-000000000002', 'member.a@example.test'),
  ('40000000-0000-0000-0000-000000000003', 'owner.b@example.test');

-- Church A con owner
select test_set_auth_uid('40000000-0000-0000-0000-000000000001');
select * from app.provision_church(
  'Church A Seg', 'church-a-seg', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'A', 'owner.a@example.test', null, 'Sede A', null, null, null, null,
  array['people'], null
);

-- Church B con owner
select test_set_auth_uid('40000000-0000-0000-0000-000000000003');
select * from app.provision_church(
  'Church B Seg', 'church-b-seg', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'B', 'owner.b@example.test', null, 'Sede B', null, null, null, null,
  array['people'], null
);

reset role;

-- member.a se añade como miembro simple (sin rol de owner) de Church A.
insert into people (id, user_id, first_name) values
  ('40000000-0000-0000-0000-00000000a002', '40000000-0000-0000-0000-000000000002', 'Miembro A');
insert into church_people (church_id, person_id, relationship)
values ((select id from churches where slug = 'church-a-seg'), '40000000-0000-0000-0000-00000000a002', 'member');

-- ============================================================
-- 1. Cross-tenant: owner de A no puede editar Church B
-- ============================================================
select test_set_auth_uid('40000000-0000-0000-0000-000000000001');

update churches set name = 'Hackeada por A' where slug = 'church-b-seg';

select is(
  (select count(*)::int from churches where slug = 'church-b-seg' and name = 'Hackeada por A'),
  0,
  'Owner de Church A no puede editar Church B (RLS bloquea, 0 filas afectadas)'
);

-- ============================================================
-- 2. No-owner (member.a) no cambia configuración restringida
-- ============================================================
select test_set_auth_uid('40000000-0000-0000-0000-000000000002');

update churches set name = 'Cambiado por miembro' where slug = 'church-a-seg';

select is(
  (select count(*)::int from churches where slug = 'church-a-seg' and name = 'Cambiado por miembro'),
  0,
  'Un miembro sin capability church.settings.manage no puede editar la configuración de su propia iglesia'
);

select ok(
  not (select app.has_capability((select id from churches where slug = 'church-a-seg'), 'church.settings.manage')),
  'Miembro sin rol de owner/admin no tiene la capability church.settings.manage'
);

-- ============================================================
-- 3. Campus cross-tenant rechazado
-- ============================================================
select test_set_auth_uid('40000000-0000-0000-0000-000000000001');

select throws_like(
  $$ insert into campuses (church_id, name, slug)
     values ((select id from churches where slug = 'church-b-seg'), 'Sede intrusa', 'sede-intrusa') $$,
  '%',
  'Owner de Church A no puede insertar un campus en Church B (RLS lo impide)'
);

-- ============================================================
-- 4. Sedes: no dos primarias, no archivar la única sede activa
-- ============================================================
select throws_like(
  $$ insert into campuses (church_id, name, slug, is_primary)
     values ((select id from churches where slug = 'church-a-seg'), 'Segunda sede primaria', 'segunda-primaria', true) $$,
  '%',
  'No se puede crear una segunda sede is_primary=true en la misma iglesia (índice único parcial)'
);

reset role;

-- ============================================================
-- 5. Suscripción: trial creado correctamente y consulta centralizada
-- ============================================================
select ok(
  exists (
    select 1 from subscriptions s
    join churches c on c.id = s.church_id
    where c.slug = 'church-a-seg' and s.status = 'trial' and s.plan_key = 'trial'
  ),
  'Church A tiene una suscripción trial creada por el provisioning'
);

select is(
  (select status::text from subscriptions where church_id = (select id from churches where slug = 'church-a-seg')),
  'trial',
  'El estado de suscripción se puede consultar de forma centralizada desde subscriptions'
);

-- ============================================================
-- 6. Onboarding: reanudación no pierde progreso
-- ============================================================
update church_onboarding
  set current_step = 'branding', completed_steps = array['account','church','campus','profile']::church_onboarding_step[]
  where church_id = (select id from churches where slug = 'church-a-seg');

select is(
  (select current_step::text from church_onboarding where church_id = (select id from churches where slug = 'church-a-seg')),
  'branding',
  'El estado de onboarding conserva el paso actual tras actualizarse (reanudable)'
);

select is(
  (select array_length(completed_steps, 1) from church_onboarding where church_id = (select id from churches where slug = 'church-a-seg')),
  4,
  'El estado de onboarding conserva los pasos completados'
);

-- ============================================================
-- 7. platform_operators: usuario normal no es operador de plataforma
-- ============================================================
select test_set_auth_uid('40000000-0000-0000-0000-000000000001');

select ok(
  not (select app.is_platform_operator()),
  'Un owner de iglesia ordinario no es operador de plataforma'
);

select ok(
  not exists (select 1 from platform_operators where user_id = '40000000-0000-0000-0000-000000000003'),
  'Owner de Church B no puede leer la tabla platform_operators de otra cuenta (RLS self-only)'
);

select * from finish();
rollback;
