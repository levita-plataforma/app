-- Fase 2 · Tests de personas, familias, tags, custom fields, duplicados,
-- invitación y aislamiento. Ver encargo de Fase 2 §34.

begin;
select plan(30);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

insert into auth.users (id, email) values
  ('50000000-0000-0000-0000-000000000001', 'owner.p2a@example.test'),
  ('50000000-0000-0000-0000-000000000002', 'owner.p2b@example.test'),
  ('50000000-0000-0000-0000-000000000003', 'invitado.p2@example.test');

-- Church A con owner
select test_set_auth_uid('50000000-0000-0000-0000-000000000001');
select * from app.provision_church(
  'Church A P2', 'church-a-p2', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'A2', 'owner.p2a@example.test', null, 'Sede A2', null, null, null, null,
  array['people'], null
);

-- Church B con owner
select test_set_auth_uid('50000000-0000-0000-0000-000000000002');
select * from app.provision_church(
  'Church B P2', 'church-b-p2', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'B2', 'owner.p2b@example.test', null, 'Sede B2', null, null, null, null,
  array['people'], null
);

reset role;

-- ============================================================
-- 1. Normalización
-- ============================================================
select is(app.normalize_email('  Test@Example.COM '), 'test@example.com', 'normalize_email pasa a minúsculas y recorta espacios');
select is(app.normalize_phone('+34 600 12 34 56'), '+34600123456', 'normalize_phone conserva + inicial y elimina separadores');
select is(app.normalize_phone('600123456'), '600123456', 'normalize_phone sin + inicial se mantiene sin él');

-- ============================================================
-- 2. Crear persona sin Auth, editar, archivar, reactivar
-- ============================================================
select test_set_auth_uid('50000000-0000-0000-0000-000000000001');

insert into people (id, first_name, last_name, email, phone, source)
values ('50000000-0000-0000-0000-00000000a001', 'Marta', 'Ruiz', 'marta@example.test', '+34600111111', 'manual');

insert into church_people (church_id, person_id, relationship, source)
values ((select id from churches where slug = 'church-a-p2'), '50000000-0000-0000-0000-00000000a001', 'member', 'manual');

select ok(
  exists (select 1 from people where id = '50000000-0000-0000-0000-00000000a001' and user_id is null),
  'Persona creada sin Auth (user_id null)'
);

update people set last_name = 'Ruiz García' where id = '50000000-0000-0000-0000-00000000a001';
select is(
  (select last_name from people where id = '50000000-0000-0000-0000-00000000a001'),
  'Ruiz García',
  'Editar persona funciona para un usuario con people.manage'
);

update church_people set archived_at = now()
  where church_id = (select id from churches where slug = 'church-a-p2') and person_id = '50000000-0000-0000-0000-00000000a001';
select ok(
  (select archived_at is not null from church_people where person_id = '50000000-0000-0000-0000-00000000a001'),
  'Archivar persona (church_people.archived_at) funciona'
);

update church_people set archived_at = null
  where church_id = (select id from churches where slug = 'church-a-p2') and person_id = '50000000-0000-0000-0000-00000000a001';
select ok(
  (select archived_at is null from church_people where person_id = '50000000-0000-0000-0000-00000000a001'),
  'Reactivar persona (archived_at = null) funciona'
);

-- ============================================================
-- 3. Cross-tenant bloqueado
-- ============================================================
select test_set_auth_uid('50000000-0000-0000-0000-000000000002');

select is(
  (select count(*)::int from people where id = '50000000-0000-0000-0000-00000000a001'),
  0,
  'Owner de Church B no puede leer una persona de Church A'
);

update people set first_name = 'Hackeado' where id = '50000000-0000-0000-0000-00000000a001';
reset role;
select is(
  (select first_name from people where id = '50000000-0000-0000-0000-00000000a001'),
  'Marta',
  'Owner de Church B no puede editar una persona de Church A (RLS bloquea, sin excepción)'
);

-- ============================================================
-- 4. Duplicados: email exacto, teléfono exacto, nombre no basta
-- ============================================================
select test_set_auth_uid('50000000-0000-0000-0000-000000000001');

select ok(
  exists (
    select 1 from app.find_potential_duplicate_people(
      (select id from churches where slug = 'church-a-p2'), 'marta@example.test', null, null, null, null
    ) where out_match_type = 'email'
  ),
  'Email exacto detecta duplicado potencial'
);

select ok(
  exists (
    select 1 from app.find_potential_duplicate_people(
      (select id from churches where slug = 'church-a-p2'), null, '+34600111111', null, null, null
    ) where out_match_type = 'phone'
  ),
  'Teléfono exacto detecta duplicado potencial'
);

select is(
  (select count(*)::int from app.find_potential_duplicate_people(
    (select id from churches where slug = 'church-a-p2'), null, null, 'Marta', null, null
  )),
  0,
  'Nombre solo (sin apellido+fecha nacimiento) NO detecta duplicado por sí mismo'
);

-- ============================================================
-- 5. Households: añadir/remover miembro, cross-tenant rechazado
-- ============================================================
insert into households (id, church_id, name)
values ('50000000-0000-0000-0000-0000000fa001', (select id from churches where slug = 'church-a-p2'), 'Familia Ruiz');

insert into household_members (church_id, household_id, person_id, relationship_type)
values ((select id from churches where slug = 'church-a-p2'), '50000000-0000-0000-0000-0000000fa001', '50000000-0000-0000-0000-00000000a001', 'adult');

select ok(
  exists (select 1 from household_members where household_id = '50000000-0000-0000-0000-0000000fa001' and person_id = '50000000-0000-0000-0000-00000000a001'),
  'Añadir miembro a household funciona'
);

delete from household_members where household_id = '50000000-0000-0000-0000-0000000fa001' and person_id = '50000000-0000-0000-0000-00000000a001';
select ok(
  not exists (select 1 from household_members where household_id = '50000000-0000-0000-0000-0000000fa001' and person_id = '50000000-0000-0000-0000-00000000a001'),
  'Remover miembro de household funciona'
);

select throws_like(
  $$ insert into household_members (church_id, household_id, person_id, relationship_type)
     values (
       (select id from churches where slug = 'church-a-p2'),
       '50000000-0000-0000-0000-0000000fa001',
       (select id from people where email_normalized = 'owner.p2b@example.test'),
       'adult'
     ) $$,
  '%',
  'No se puede añadir a un household una persona de otra iglesia (cross-tenant rechazado)'
);

-- ============================================================
-- 6. Tags: tenant-safe, asignación cross-tenant bloqueada
-- ============================================================
insert into tags (id, church_id, name, color)
values ('50000000-0000-0000-0000-0000000fb001', (select id from churches where slug = 'church-a-p2'), 'Líderes', '#c89b4a');

insert into person_tags (church_id, person_id, tag_id)
values ((select id from churches where slug = 'church-a-p2'), '50000000-0000-0000-0000-00000000a001', '50000000-0000-0000-0000-0000000fb001');

select ok(
  exists (select 1 from person_tags where person_id = '50000000-0000-0000-0000-00000000a001' and tag_id = '50000000-0000-0000-0000-0000000fb001'),
  'Asignar tag a persona funciona'
);

select test_set_auth_uid('50000000-0000-0000-0000-000000000002');
select throws_like(
  $$ insert into person_tags (church_id, person_id, tag_id)
     values (
       (select id from churches where slug = 'church-b-p2'),
       (select id from people where email_normalized = 'owner.p2b@example.test'),
       '50000000-0000-0000-0000-0000000fb001'
     ) $$,
  '%',
  'No se puede asignar un tag de otra iglesia (cross-tenant rechazado por FK compuesta)'
);

-- ============================================================
-- 7. Custom fields: tipos válidos, opción inválida, cross-tenant
-- ============================================================
reset role;
insert into custom_field_definitions (id, church_id, entity_type, name, field_type, options)
values (
  '50000000-0000-0000-0000-0000000fc001',
  (select id from churches where slug = 'church-a-p2'),
  'person', 'Talla camiseta', 'select', '["S","M","L","XL"]'::jsonb
);

select ok(
  exists (select 1 from custom_field_definitions where id = '50000000-0000-0000-0000-0000000fc001' and field_type = 'select'),
  'Custom field de tipo select se crea correctamente'
);

select throws_like(
  $$ insert into custom_field_definitions (church_id, entity_type, name, field_type)
     values ((select id from churches where slug = 'church-a-p2'), 'person', 'Campo raro', 'not_a_type') $$,
  '%',
  'Un field_type fuera del enum es rechazado'
);

insert into custom_field_values (church_id, field_definition_id, entity_type, entity_id, value)
values ((select id from churches where slug = 'church-a-p2'), '50000000-0000-0000-0000-0000000fc001', 'person', '50000000-0000-0000-0000-00000000a001', '"M"'::jsonb);

select ok(
  exists (select 1 from custom_field_values where field_definition_id = '50000000-0000-0000-0000-0000000fc001' and entity_id = '50000000-0000-0000-0000-00000000a001'),
  'Valor de custom field se guarda correctamente'
);

select throws_like(
  $$ insert into custom_field_values (church_id, field_definition_id, entity_type, entity_id, value)
     values (
       (select id from churches where slug = 'church-b-p2'),
       '50000000-0000-0000-0000-0000000fc001',
       'person', '50000000-0000-0000-0000-00000000a001', '"L"'::jsonb
     ) $$,
  '%',
  'Un valor de custom field no puede apuntar a una definición de otra iglesia (cross-tenant rechazado)'
);

-- ============================================================
-- 8. Invitación a persona existente: vincula Auth, no duplica, expira, single-use
-- ============================================================
select test_set_auth_uid('50000000-0000-0000-0000-000000000001');

select lives_ok(
  $$ select * from app.invite_existing_person(
    (select id from churches where slug = 'church-a-p2'),
    '50000000-0000-0000-0000-00000000a001',
    'marta@example.test'
  ) $$,
  'invite_existing_person no lanza excepción con datos válidos'
);

reset role;
insert into invitations (church_id, person_id, email, role_key, token_hash, expires_at)
values (
  (select id from churches where slug = 'church-a-p2'), '50000000-0000-0000-0000-00000000a001',
  'marta@example.test', 'member', encode(digest('token-persona-valido', 'sha256'), 'hex'), now() + interval '7 days'
);
insert into invitations (church_id, person_id, email, role_key, token_hash, expires_at, status)
values (
  (select id from churches where slug = 'church-a-p2'), '50000000-0000-0000-0000-00000000a001',
  'marta@example.test', 'member', encode(digest('token-persona-expirado', 'sha256'), 'hex'), now() - interval '1 day', 'pending'
);

select test_set_auth_uid('50000000-0000-0000-0000-000000000003');

select lives_ok(
  $$ select * from app.accept_person_invitation('token-persona-valido') $$,
  'accept_person_invitation con token válido no lanza excepción'
);

reset role;
select is(
  (select user_id from people where id = '50000000-0000-0000-0000-00000000a001'),
  '50000000-0000-0000-0000-000000000003'::uuid,
  'La persona existente queda vinculada al auth.uid() del invitado, sin crear otra people'
);

select is(
  (select count(*)::int from people where email_normalized = 'marta@example.test'),
  1,
  'No se duplicó la persona al aceptar la invitación'
);

select test_set_auth_uid('50000000-0000-0000-0000-000000000003');
select throws_like(
  $$ select * from app.accept_person_invitation('token-persona-valido') $$,
  '%INVITATION_ALREADY_ACCEPTED%',
  'Un token de persona ya usado falla al reintentar (single-use)'
);

select throws_like(
  $$ select * from app.accept_person_invitation('token-persona-expirado') $$,
  '%INVITATION_EXPIRED%',
  'Un token de persona expirado falla'
);

-- ============================================================
-- 9. Import/export jobs: tenant-safe
-- ============================================================
reset role;
select test_set_auth_uid('50000000-0000-0000-0000-000000000001');

insert into import_jobs (church_id, entity_type, actor_person_id, idempotency_key)
values ((select id from churches where slug = 'church-a-p2'), 'person', '50000000-0000-0000-0000-00000000a001', 'import-test-1');

select ok(
  exists (select 1 from import_jobs where church_id = (select id from churches where slug = 'church-a-p2') and idempotency_key = 'import-test-1'),
  'Crear import_job funciona'
);

select test_set_auth_uid('50000000-0000-0000-0000-000000000002');
select is(
  (select count(*)::int from import_jobs where idempotency_key = 'import-test-1'),
  0,
  'Owner de Church B no ve el import_job de Church A (RLS bloquea)'
);

-- ============================================================
-- 10. Cobertura RLS de las tablas nuevas/ampliadas de esta fase
-- ============================================================
reset role;
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where relname = 'invitations'),
  'invitations mantiene RLS + FORCE tras ampliarse con person_id'
);

select * from finish();
rollback;
