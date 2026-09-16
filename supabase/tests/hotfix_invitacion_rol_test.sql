-- Hotfix · Invitación de personas: el rol concedido no puede superar lo que
-- quien invita puede conceder. Ver migración 20260919000700_hotfix_invitacion_rol.sql.

begin;
select plan(16);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

insert into auth.users (id, email) values
  ('7a000000-0000-0000-0000-000000000001', 'owner.hf@example.test'),
  ('7a000000-0000-0000-0000-000000000002', 'gestor.hf@example.test'),
  ('7a000000-0000-0000-0000-000000000003', 'admin.hf@example.test'),
  ('7a000000-0000-0000-0000-000000000011', 'inv1.hf@example.test'),
  ('7a000000-0000-0000-0000-000000000012', 'inv2.hf@example.test'),
  ('7a000000-0000-0000-0000-000000000013', 'inv3.hf@example.test'),
  ('7a000000-0000-0000-0000-000000000014', 'inv4.hf@example.test'),
  ('7a000000-0000-0000-0000-000000000015', 'inv5.hf@example.test');

select test_set_auth_uid('7a000000-0000-0000-0000-000000000001');
select * from app.provision_church(
  'Church HF', 'church-hf-invitacion', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'HF', 'owner.hf@example.test', null, 'Sede HF', null, null, null, null,
  array['people'], null
);

reset role;

create temp table hf_ctx as select id as church_id from churches where slug = 'church-hf-invitacion';
create temp table hf_tokens (k text primary key, token text);
grant select on hf_ctx to authenticated;
grant select, insert on hf_tokens to authenticated;

-- Rol de prueba que solo gestiona personas (sin roles.manage).
insert into roles (key, name) values ('hf_solo_personas', 'Solo personas (test)');
insert into role_capabilities (role_key, capability_key) values ('hf_solo_personas', 'people.manage');

-- Gestor (solo people.manage) y administrador (church_admin: roles.manage, no propietario).
insert into people (id, user_id, first_name, source) values
  ('7a000000-0000-0000-0000-0000000000a2', '7a000000-0000-0000-0000-000000000002', 'Gestor', 'manual'),
  ('7a000000-0000-0000-0000-0000000000a3', '7a000000-0000-0000-0000-000000000003', 'Admin', 'manual');
insert into church_people (id, church_id, person_id, relationship, source) values
  ('7a000000-0000-0000-0000-0000000000c2', (select church_id from hf_ctx), '7a000000-0000-0000-0000-0000000000a2', 'member', 'manual'),
  ('7a000000-0000-0000-0000-0000000000c3', (select church_id from hf_ctx), '7a000000-0000-0000-0000-0000000000a3', 'member', 'manual');
insert into church_people_roles (church_id, church_people_id, role_key, scope_type) values
  ((select church_id from hf_ctx), '7a000000-0000-0000-0000-0000000000c2', 'hf_solo_personas', 'church'),
  ((select church_id from hf_ctx), '7a000000-0000-0000-0000-0000000000c3', 'church_admin', 'church');

-- Personas sin cuenta a invitar.
insert into people (id, first_name, source) values
  ('7a000000-0000-0000-0000-0000000000b1', 'P1', 'manual'),
  ('7a000000-0000-0000-0000-0000000000b2', 'P2', 'manual'),
  ('7a000000-0000-0000-0000-0000000000b3', 'P3', 'manual'),
  ('7a000000-0000-0000-0000-0000000000b4', 'P4', 'manual'),
  ('7a000000-0000-0000-0000-0000000000b5', 'P5', 'manual');
insert into church_people (church_id, person_id, relationship, source)
select (select church_id from hf_ctx), id, 'member', 'manual'
from people where id in (
  '7a000000-0000-0000-0000-0000000000b1', '7a000000-0000-0000-0000-0000000000b2', '7a000000-0000-0000-0000-0000000000b3',
  '7a000000-0000-0000-0000-0000000000b4', '7a000000-0000-0000-0000-0000000000b5'
);

-- ============================================================
-- 1. Al invitar
-- ============================================================
select test_set_auth_uid('7a000000-0000-0000-0000-000000000002');

select lives_ok(
  $$ insert into hf_tokens select 'p1', out_invitation_token from app.invite_existing_person(
       (select church_id from hf_ctx), '7a000000-0000-0000-0000-0000000000b1', 'inv1.hf@example.test') $$,
  'Con solo people.manage se puede invitar como miembro (rol por defecto)'
);

select throws_like(
  $$ select * from app.invite_existing_person(
       (select church_id from hf_ctx), '7a000000-0000-0000-0000-0000000000b2', 'inv2.hf@example.test', 'church_owner') $$,
  '%FORBIDDEN%',
  'Con solo people.manage NO se puede invitar como church_owner'
);

select throws_like(
  $$ select * from app.invite_existing_person(
       (select church_id from hf_ctx), '7a000000-0000-0000-0000-0000000000b2', 'inv2.hf@example.test', 'church_admin') $$,
  '%FORBIDDEN%',
  'Con solo people.manage NO se puede invitar como church_admin'
);

select test_set_auth_uid('7a000000-0000-0000-0000-000000000003');

select lives_ok(
  $$ insert into hf_tokens select 'p2', out_invitation_token from app.invite_existing_person(
       (select church_id from hf_ctx), '7a000000-0000-0000-0000-0000000000b2', 'inv2.hf@example.test', 'ministry_leader') $$,
  'Con roles.manage se puede invitar con un rol distinto de miembro'
);

select throws_like(
  $$ select * from app.invite_existing_person(
       (select church_id from hf_ctx), '7a000000-0000-0000-0000-0000000000b3', 'inv3.hf@example.test', 'church_owner') $$,
  '%FORBIDDEN%',
  'Un administrador que no es propietario NO puede invitar como church_owner'
);

select throws_like(
  $$ select * from app.invite_existing_person(
       (select church_id from hf_ctx), '7a000000-0000-0000-0000-0000000000b3', 'inv3.hf@example.test', 'rol_inexistente') $$,
  '%INVALID_ROLE%',
  'Un rol inexistente se rechaza antes de crear la invitación'
);

select test_set_auth_uid('7a000000-0000-0000-0000-000000000001');

select lives_ok(
  $$ insert into hf_tokens select 'p3', out_invitation_token from app.invite_existing_person(
       (select church_id from hf_ctx), '7a000000-0000-0000-0000-0000000000b3', 'inv3.hf@example.test', 'church_owner') $$,
  'Un propietario sí puede invitar a otro propietario'
);

select test_set_auth_uid('7a000000-0000-0000-0000-000000000003');
insert into hf_tokens select 'p5', out_invitation_token from app.invite_existing_person(
  (select church_id from hf_ctx), '7a000000-0000-0000-0000-0000000000b5', 'inv5.hf@example.test', 'ministry_leader');

-- ============================================================
-- 2. Al aceptar
-- ============================================================
reset role;

-- Invitación anterior al arreglo: creada por el gestor (solo people.manage)
-- con rol church_owner, insertada directamente como existía antes.
insert into invitations (church_id, person_id, email, role_key, token_hash, invited_by, expires_at)
values (
  (select church_id from hf_ctx), '7a000000-0000-0000-0000-0000000000b4', 'inv4.hf@example.test', 'church_owner',
  encode(extensions.digest('token-legado-hf', 'sha256'), 'hex'),
  '7a000000-0000-0000-0000-000000000002', now() + interval '7 days'
);

-- El administrador pierde roles.manage antes de que se acepte la invitación de P5.
delete from church_people_roles
where church_people_id = '7a000000-0000-0000-0000-0000000000c3' and role_key = 'church_admin';

select test_set_auth_uid('7a000000-0000-0000-0000-000000000014');
select lives_ok(
  $$ select * from app.accept_person_invitation('token-legado-hf') $$,
  'Aceptar una invitación antigua con rol no autorizado vincula la cuenta'
);

reset role;
select is(
  (select array_agg(cpr.role_key order by cpr.role_key) from church_people_roles cpr
   join church_people cp on cp.id = cpr.church_people_id
   where cp.person_id = '7a000000-0000-0000-0000-0000000000b4'),
  array['member'],
  'La invitación antigua de church_owner creada sin roles.manage concede solo member'
);
select ok(
  exists (
    select 1 from audit_logs
    where action = 'person.auth_linked' and entity_id = '7a000000-0000-0000-0000-0000000000b4'
      and (metadata ->> 'role_downgraded')::boolean
      and metadata ->> 'requested_role_key' = 'church_owner'
  ),
  'La degradación de rol queda auditada'
);

select test_set_auth_uid('7a000000-0000-0000-0000-000000000011');
select lives_ok(
  format($$ select * from app.accept_person_invitation(%L) $$, (select token from hf_tokens where k = 'p1')),
  'Aceptar la invitación de miembro funciona'
);

select test_set_auth_uid('7a000000-0000-0000-0000-000000000013');
select lives_ok(
  format($$ select * from app.accept_person_invitation(%L) $$, (select token from hf_tokens where k = 'p3')),
  'Aceptar la invitación de propietario hecha por un propietario funciona'
);

select test_set_auth_uid('7a000000-0000-0000-0000-000000000015');
select lives_ok(
  format($$ select * from app.accept_person_invitation(%L) $$, (select token from hf_tokens where k = 'p5')),
  'Aceptar una invitación cuyo emisor perdió roles.manage vincula la cuenta'
);

reset role;
select is(
  (select array_agg(cpr.role_key) from church_people_roles cpr
   join church_people cp on cp.id = cpr.church_people_id
   where cp.person_id = '7a000000-0000-0000-0000-0000000000b1'),
  array['member'],
  'La invitación de miembro concede member'
);
select is(
  (select array_agg(cpr.role_key) from church_people_roles cpr
   join church_people cp on cp.id = cpr.church_people_id
   where cp.person_id = '7a000000-0000-0000-0000-0000000000b3'),
  array['church_owner'],
  'La invitación válida de un propietario concede church_owner'
);
select is(
  (select array_agg(cpr.role_key) from church_people_roles cpr
   join church_people cp on cp.id = cpr.church_people_id
   where cp.person_id = '7a000000-0000-0000-0000-0000000000b5'),
  array['member'],
  'Si quien invitó perdió roles.manage, se concede solo member'
);

select * from finish();
rollback;
