-- Fase 3 · Tests de áreas de servicio, líderes, miembros, equipos, puestos,
-- cualificaciones, credenciales y elegibilidad. Ver prompt de Fase 3 §35.

begin;
select plan(39);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

insert into auth.users (id, email) values
  ('60000000-0000-0000-0000-000000000001', 'owner.p3a@example.test'),
  ('60000000-0000-0000-0000-000000000002', 'owner.p3b@example.test');

-- Church A con owner
select test_set_auth_uid('60000000-0000-0000-0000-000000000001');
select * from app.provision_church(
  'Church A P3', 'church-a-p3', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'A3', 'owner.p3a@example.test', null, 'Sede A3', null, null, null, null,
  array['people', 'serving'], null
);

-- Church B con owner
select test_set_auth_uid('60000000-0000-0000-0000-000000000002');
select * from app.provision_church(
  'Church B P3', 'church-b-p3', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'B3', 'owner.p3b@example.test', null, 'Sede B3', null, null, null, null,
  array['people', 'serving'], null
);

reset role;

-- ============================================================
-- Setup: personas de prueba en Church A
-- ============================================================
select test_set_auth_uid('60000000-0000-0000-0000-000000000001');

insert into people (id, first_name, last_name, source) values
  ('60000000-0000-0000-0000-00000000a001', 'Ana', 'Sonido', 'manual'),
  ('60000000-0000-0000-0000-00000000a002', 'Bruno', 'Multimedia', 'manual');

insert into church_people (church_id, person_id, relationship, source) values
  ((select id from churches where slug = 'church-a-p3'), '60000000-0000-0000-0000-00000000a001', 'server', 'manual'),
  ((select id from churches where slug = 'church-a-p3'), '60000000-0000-0000-0000-00000000a002', 'server', 'manual');

-- ============================================================
-- 1. service_areas: crear, editar, archivar
-- ============================================================
insert into service_areas (id, church_id, name, slug)
values ('60000000-0000-0000-0000-0000000b0001', (select id from churches where slug = 'church-a-p3'), 'Sonido', 'sonido');

select ok(
  exists (select 1 from service_areas where id = '60000000-0000-0000-0000-0000000b0001'),
  'Crear área de servicio funciona'
);

update service_areas set name = 'Sonido y PA' where id = '60000000-0000-0000-0000-0000000b0001';
select is(
  (select name from service_areas where id = '60000000-0000-0000-0000-0000000b0001'),
  'Sonido y PA',
  'Editar área de servicio funciona'
);

update service_areas set archived_at = now() where id = '60000000-0000-0000-0000-0000000b0001';
select ok(
  (select archived_at is not null from service_areas where id = '60000000-0000-0000-0000-0000000b0001'),
  'Archivar área de servicio funciona'
);
update service_areas set archived_at = null where id = '60000000-0000-0000-0000-0000000b0001';

-- ============================================================
-- 2. service_area_leaders: añadir, scope correcto
-- ============================================================
insert into service_area_leaders (church_id, service_area_id, person_id, is_primary)
values ((select id from churches where slug = 'church-a-p3'), '60000000-0000-0000-0000-0000000b0001', '60000000-0000-0000-0000-00000000a001', true);

select ok(
  exists (
    select 1 from service_area_leaders
    where service_area_id = '60000000-0000-0000-0000-0000000b0001' and person_id = '60000000-0000-0000-0000-00000000a001'
  ),
  'Añadir líder de área funciona'
);

update service_area_leaders set ends_at = now()
  where service_area_id = '60000000-0000-0000-0000-0000000b0001' and person_id = '60000000-0000-0000-0000-00000000a001';
select ok(
  (select ends_at is not null from service_area_leaders where service_area_id = '60000000-0000-0000-0000-0000000b0001' and person_id = '60000000-0000-0000-0000-00000000a001'),
  'Quitar líder de área (ends_at) funciona'
);

-- ============================================================
-- 3. service_area_members: añadir, nivel específico por área
-- ============================================================
insert into service_area_members (church_id, service_area_id, person_id, status, level)
values ((select id from churches where slug = 'church-a-p3'), '60000000-0000-0000-0000-0000000b0001', '60000000-0000-0000-0000-00000000a001', 'active', 'autonomous');

select is(
  (select level::text from service_area_members where service_area_id = '60000000-0000-0000-0000-0000000b0001' and person_id = '60000000-0000-0000-0000-00000000a001'),
  'autonomous',
  'Añadir miembro de área con nivel operativo funciona'
);

insert into service_areas (id, church_id, name, slug)
values ('60000000-0000-0000-0000-0000000b0002', (select id from churches where slug = 'church-a-p3'), 'Multimedia', 'multimedia');

insert into service_area_members (church_id, service_area_id, person_id, status, level)
values ((select id from churches where slug = 'church-a-p3'), '60000000-0000-0000-0000-0000000b0002', '60000000-0000-0000-0000-00000000a001', 'active', 'trainee');

select is(
  (select level::text from service_area_members where service_area_id = '60000000-0000-0000-0000-0000000b0002' and person_id = '60000000-0000-0000-0000-00000000a001'),
  'trainee',
  'Misma persona puede tener nivel distinto en otra área (autonomous en Sonido, trainee en Multimedia)'
);

update service_area_members set left_at = now(), status = 'inactive'
  where service_area_id = '60000000-0000-0000-0000-0000000b0002' and person_id = '60000000-0000-0000-0000-00000000a001';
select ok(
  (select status = 'inactive' from service_area_members where service_area_id = '60000000-0000-0000-0000-0000000b0002' and person_id = '60000000-0000-0000-0000-00000000a001'),
  'Quitar miembro de área (status inactive) funciona'
);

-- ============================================================
-- 4. service_teams: crear, añadir miembro, líder
-- ============================================================
insert into service_teams (id, church_id, service_area_id, name)
values ('60000000-0000-0000-0000-0000000c0001', (select id from churches where slug = 'church-a-p3'), '60000000-0000-0000-0000-0000000b0001', 'Equipo A Sonido');

select ok(
  exists (select 1 from service_teams where id = '60000000-0000-0000-0000-0000000c0001'),
  'Crear equipo permanente funciona'
);

insert into service_team_members (church_id, service_team_id, person_id, is_leader)
values ((select id from churches where slug = 'church-a-p3'), '60000000-0000-0000-0000-0000000c0001', '60000000-0000-0000-0000-00000000a001', true);

select ok(
  (select is_leader from service_team_members where service_team_id = '60000000-0000-0000-0000-0000000c0001' and person_id = '60000000-0000-0000-0000-00000000a001'),
  'Añadir miembro de equipo con líder funciona'
);

-- ============================================================
-- 5. service_positions: crear, critical, min_people, requires_autonomous
-- ============================================================
insert into service_positions (id, church_id, service_area_id, name, critical, min_people, requires_autonomous_person)
values ('60000000-0000-0000-0000-0000000d0001', (select id from churches where slug = 'church-a-p3'), '60000000-0000-0000-0000-0000000b0001', 'FOH', true, 1, true);

select ok(
  (select critical and requires_autonomous_person from service_positions where id = '60000000-0000-0000-0000-0000000d0001'),
  'Crear puesto crítico que requiere persona autónoma funciona'
);

select throws_ok(
  $$ insert into service_positions (church_id, service_area_id, name, min_people, max_people)
     values ((select id from churches where slug = 'church-a-p3'), '60000000-0000-0000-0000-0000000b0001', 'Bad', 3, 1) $$,
  null,
  null,
  'max_people < min_people viola constraint'
);

-- ============================================================
-- 6. qualifications: asignar, verificar
-- ============================================================
insert into qualifications (id, church_id, name, category)
values ('60000000-0000-0000-0000-0000000e0001', (select id from churches where slug = 'church-a-p3'), 'Mesa de sonido', 'tecnico');

select ok(
  exists (select 1 from qualifications where id = '60000000-0000-0000-0000-0000000e0001'),
  'Crear cualificación funciona'
);

insert into person_qualifications (church_id, person_id, qualification_id, level, verified)
values ((select id from churches where slug = 'church-a-p3'), '60000000-0000-0000-0000-00000000a001', '60000000-0000-0000-0000-0000000e0001', 'advanced', false);

select ok(
  exists (
    select 1 from person_qualifications
    where person_id = '60000000-0000-0000-0000-00000000a001' and qualification_id = '60000000-0000-0000-0000-0000000e0001'
  ),
  'Asignar cualificación a persona funciona'
);

update person_qualifications set verified = true, verified_at = now()
  where person_id = '60000000-0000-0000-0000-00000000a001' and qualification_id = '60000000-0000-0000-0000-0000000e0001';
select ok(
  (select verified from person_qualifications where person_id = '60000000-0000-0000-0000-00000000a001' and qualification_id = '60000000-0000-0000-0000-0000000e0001'),
  'Verificar cualificación funciona'
);

-- ============================================================
-- 7. credentials: valid, expired, revoked
-- ============================================================
insert into credential_types (id, church_id, name, sensitive)
values ('60000000-0000-0000-0000-0000000f0001', (select id from churches where slug = 'church-a-p3'), 'Certificado delitos sexuales', true);

insert into person_credentials (id, church_id, person_id, credential_type_id, status, issued_at, expires_at)
values (
  '60000000-0000-0000-0000-000000010001',
  (select id from churches where slug = 'church-a-p3'),
  '60000000-0000-0000-0000-00000000a001',
  '60000000-0000-0000-0000-0000000f0001',
  'valid', now() - interval '1 month', now() + interval '1 year'
);

select is(
  (select status::text from person_credentials where id = '60000000-0000-0000-0000-000000010001'),
  'valid',
  'Credencial vigente (valid) funciona'
);

update person_credentials set status = 'expired' where id = '60000000-0000-0000-0000-000000010001';
select is(
  (select status::text from person_credentials where id = '60000000-0000-0000-0000-000000010001'),
  'expired',
  'Marcar credencial como expired funciona'
);

update person_credentials set status = 'revoked' where id = '60000000-0000-0000-0000-000000010001';
select is(
  (select status::text from person_credentials where id = '60000000-0000-0000-0000-000000010001'),
  'revoked',
  'Revocar credencial funciona'
);
update person_credentials set status = 'valid', expires_at = now() + interval '1 year'
  where id = '60000000-0000-0000-0000-000000010001';

-- ============================================================
-- 8. Elegibilidad
-- ============================================================
-- Ana: miembro activo autonomous en Sonido, cualificación verificada, sin
-- requisitos aún en el puesto FOH -> eligible.
select is(
  (select status::text from app.evaluate_person_eligibility(
    (select id from churches where slug = 'church-a-p3'),
    '60000000-0000-0000-0000-0000000d0001',
    '60000000-0000-0000-0000-00000000a001'
  )),
  'eligible',
  'Persona válida sin requisitos pendientes -> eligible'
);

-- Añadimos requisito de cualificación obligatoria que Ana NO tiene.
insert into qualifications (id, church_id, name)
values ('60000000-0000-0000-0000-000000020001', (select id from churches where slug = 'church-a-p3'), 'OBS');

insert into position_requirements (church_id, service_position_id, requirement_type, strictness, qualification_id)
values ((select id from churches where slug = 'church-a-p3'), '60000000-0000-0000-0000-0000000d0001', 'qualification', 'required', '60000000-0000-0000-0000-000000020001');

select is(
  (select status::text from app.evaluate_person_eligibility(
    (select id from churches where slug = 'church-a-p3'),
    '60000000-0000-0000-0000-0000000d0001',
    '60000000-0000-0000-0000-00000000a001'
  )),
  'not_eligible',
  'Falta cualificación obligatoria -> not_eligible'
);

select ok(
  (select 'missing_qualification' = any(reasons) from app.evaluate_person_eligibility(
    (select id from churches where slug = 'church-a-p3'),
    '60000000-0000-0000-0000-0000000d0001',
    '60000000-0000-0000-0000-00000000a001'
  )),
  'Razón estructurada missing_qualification presente'
);

-- Quitamos ese requisito obligatorio y probamos credencial vencida.
delete from position_requirements where service_position_id = '60000000-0000-0000-0000-0000000d0001' and qualification_id = '60000000-0000-0000-0000-000000020001';

insert into position_requirements (church_id, service_position_id, requirement_type, strictness, credential_type_id)
values ((select id from churches where slug = 'church-a-p3'), '60000000-0000-0000-0000-0000000d0001', 'credential', 'required', '60000000-0000-0000-0000-0000000f0001');

update person_credentials set expires_at = now() - interval '1 day' where id = '60000000-0000-0000-0000-000000010001';

select is(
  (select status::text from app.evaluate_person_eligibility(
    (select id from churches where slug = 'church-a-p3'),
    '60000000-0000-0000-0000-0000000d0001',
    '60000000-0000-0000-0000-00000000a001'
  )),
  'not_eligible',
  'Credencial vencida -> not_eligible'
);

select ok(
  (select 'expired_credential' = any(reasons) from app.evaluate_person_eligibility(
    (select id from churches where slug = 'church-a-p3'),
    '60000000-0000-0000-0000-0000000d0001',
    '60000000-0000-0000-0000-00000000a001'
  )),
  'Razón estructurada expired_credential presente'
);

update person_credentials set expires_at = now() + interval '1 year' where id = '60000000-0000-0000-0000-000000010001';
delete from position_requirements where service_position_id = '60000000-0000-0000-0000-0000000d0001' and credential_type_id = '60000000-0000-0000-0000-0000000f0001';

-- Nivel insuficiente: Bruno como trainee en un puesto requires_autonomous.
insert into service_area_members (church_id, service_area_id, person_id, status, level)
values ((select id from churches where slug = 'church-a-p3'), '60000000-0000-0000-0000-0000000b0001', '60000000-0000-0000-0000-00000000a002', 'active', 'trainee');

select is(
  (select status::text from app.evaluate_person_eligibility(
    (select id from churches where slug = 'church-a-p3'),
    '60000000-0000-0000-0000-0000000d0001',
    '60000000-0000-0000-0000-00000000a002'
  )),
  'not_eligible',
  'Nivel operativo insuficiente (trainee en puesto requires_autonomous) -> not_eligible'
);

-- Warning no bloqueante: requisito recomendado que falta.
insert into qualifications (id, church_id, name)
values ('60000000-0000-0000-0000-000000030001', (select id from churches where slug = 'church-a-p3'), 'Primeros auxilios');

insert into position_requirements (church_id, service_position_id, requirement_type, strictness, qualification_id)
values ((select id from churches where slug = 'church-a-p3'), '60000000-0000-0000-0000-0000000d0001', 'qualification', 'recommended', '60000000-0000-0000-0000-000000030001');

select is(
  (select status::text from app.evaluate_person_eligibility(
    (select id from churches where slug = 'church-a-p3'),
    '60000000-0000-0000-0000-0000000d0001',
    '60000000-0000-0000-0000-00000000a001'
  )),
  'eligible_with_warning',
  'Requisito recomendado ausente -> eligible_with_warning (no bloqueante)'
);

-- eligible_people_for_position: devuelve solo miembros del área.
select ok(
  (select count(*) from app.eligible_people_for_position(
    (select id from churches where slug = 'church-a-p3'),
    '60000000-0000-0000-0000-0000000d0001'
  )) >= 1,
  'eligible_people_for_position devuelve candidatos del área'
);

reset role;

-- ============================================================
-- 9. Aislamiento cross-tenant
-- ============================================================
select test_set_auth_uid('60000000-0000-0000-0000-000000000002');

-- Church B no debe ver el área de Church A.
select is(
  (select count(*)::int from service_areas where id = '60000000-0000-0000-0000-0000000b0001'),
  0,
  'Church B no ve el área de servicio de Church A (RLS select)'
);

select throws_ok(
  $$ insert into service_area_members (church_id, service_area_id, person_id, status, level)
     values (
       (select id from churches where slug = 'church-b-p3'),
       '60000000-0000-0000-0000-0000000b0001',
       '60000000-0000-0000-0000-00000000a001',
       'active', 'trainee'
     ) $$,
  null, null,
  'Insertar miembro cross-tenant (área de otra iglesia) falla por FK compuesta'
);

select throws_ok(
  $$ insert into service_positions (church_id, service_area_id, name)
     values (
       (select id from churches where slug = 'church-b-p3'),
       '60000000-0000-0000-0000-0000000b0001',
       'Puesto cruzado'
     ) $$,
  null, null,
  'Crear puesto de Church B en área de Church A falla por FK compuesta'
);

select throws_ok(
  $$ insert into service_teams (church_id, service_area_id, name)
     values (
       (select id from churches where slug = 'church-b-p3'),
       '60000000-0000-0000-0000-0000000b0001',
       'Equipo cruzado'
     ) $$,
  null, null,
  'Crear equipo de Church B en área de Church A falla por FK compuesta'
);

insert into qualifications (id, church_id, name)
values ('60000000-0000-0000-0000-000000040001', (select id from churches where slug = 'church-b-p3'), 'Cualificación B');

select throws_ok(
  format(
    $$ insert into position_requirements (church_id, service_position_id, requirement_type, strictness, qualification_id)
       values ('%s', '60000000-0000-0000-0000-0000000d0001', 'qualification', 'required', '60000000-0000-0000-0000-000000040001') $$,
    (select id from churches where slug = 'church-b-p3')
  ),
  null, null,
  'Requisito de puesto de Church A con cualificación de Church B falla por FK compuesta'
);

insert into people (id, first_name, source) values ('60000000-0000-0000-0000-00000000b001', 'Carla', 'manual');
insert into church_people (church_id, person_id, relationship, source)
values ((select id from churches where slug = 'church-b-p3'), '60000000-0000-0000-0000-00000000b001', 'server', 'manual');

select throws_ok(
  $$ insert into person_qualifications (church_id, person_id, qualification_id, level)
     values (
       (select id from churches where slug = 'church-b-p3'),
       '60000000-0000-0000-0000-00000000b001',
       '60000000-0000-0000-0000-0000000e0001',
       'basic'
     ) $$,
  null, null,
  'Asignar cualificación de Church A a persona de Church B falla por FK compuesta'
);

reset role;

-- ============================================================
-- 10. Cobertura RLS de las nuevas tablas (enable+force)
-- ============================================================
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where relname = 'service_areas'),
  'service_areas tiene RLS enable+force'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where relname = 'service_area_leaders'),
  'service_area_leaders tiene RLS enable+force'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where relname = 'service_area_members'),
  'service_area_members tiene RLS enable+force'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where relname = 'service_teams'),
  'service_teams tiene RLS enable+force'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where relname = 'service_positions'),
  'service_positions tiene RLS enable+force'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where relname = 'qualifications'),
  'qualifications tiene RLS enable+force'
);
select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where relname = 'person_credentials'),
  'person_credentials tiene RLS enable+force'
);

select * from finish();
rollback;
