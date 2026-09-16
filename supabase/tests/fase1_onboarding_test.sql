-- Fase 1 · Tests de onboarding: provisioning, reanudación, finalización,
-- alta asistida, invitaciones y slug. Ver encargo de Fase 1 §25.

begin;
select plan(26);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

insert into auth.users (id, email) values
  ('30000000-0000-0000-0000-000000000001', 'owner1@example.test'),
  ('30000000-0000-0000-0000-000000000002', 'owner2@example.test'),
  ('30000000-0000-0000-0000-000000000003', 'operador@example.test'),
  ('30000000-0000-0000-0000-000000000004', 'invitado@example.test');

-- ============================================================
-- 1. Crear nueva iglesia (provisioning autoservicio)
-- ============================================================
select test_set_auth_uid('30000000-0000-0000-0000-000000000001');

select lives_ok(
  $$ select * from app.provision_church(
    'Iglesia Central', 'iglesia-central', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
    'Ana', 'Gómez', 'owner1@example.test', null,
    'Sede principal', 'Calle Real 5', 'Madrid', 'Madrid', '28004',
    array['people','serving','events','communications'], 'test-key-1'
  ) $$,
  'provision_church no lanza excepción con datos válidos'
);

reset role;

select ok(
  exists (select 1 from churches where slug = 'iglesia-central' and status = 'trial'),
  'La iglesia se crea con status trial'
);

select ok(
  exists (select 1 from campuses where church_id = (select id from churches where slug = 'iglesia-central') and is_primary),
  'Se crea la sede principal con is_primary = true'
);

select ok(
  exists (
    select 1 from church_people_roles cpr
    join church_people cp on cp.id = cpr.church_people_id
    join people p on p.id = cp.person_id
    where p.user_id = '30000000-0000-0000-0000-000000000001'
      and cpr.role_key = 'church_owner'
      and cpr.church_id = (select id from churches where slug = 'iglesia-central')
  ),
  'El creador queda vinculado como church_owner'
);

select is(
  (select count(*)::int from church_modules where church_id = (select id from churches where slug = 'iglesia-central') and status = 'enabled'),
  4,
  'Se habilitan los 4 módulos base'
);

select ok(
  exists (select 1 from subscriptions where church_id = (select id from churches where slug = 'iglesia-central') and status = 'trial'),
  'Se crea la suscripción en estado trial'
);

select ok(
  exists (select 1 from church_onboarding where church_id = (select id from churches where slug = 'iglesia-central') and current_step = 'campus'),
  'El onboarding queda en el paso "campus" tras el provisioning inicial'
);

-- ============================================================
-- 2. Idempotencia: repetir con la misma idempotency_key no duplica
-- ============================================================
select test_set_auth_uid('30000000-0000-0000-0000-000000000001');

select lives_ok(
  $$ select * from app.provision_church(
    'Iglesia Central', 'iglesia-central', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
    'Ana', 'Gómez', 'owner1@example.test', null,
    'Sede principal', 'Calle Real 5', 'Madrid', 'Madrid', '28004',
    array['people','serving','events','communications'], 'test-key-1'
  ) $$,
  'Repetir provision_church con la misma idempotency_key no lanza excepción'
);

reset role;

select is(
  (select count(*)::int from churches where slug = 'iglesia-central'),
  1,
  'No se duplica la iglesia al repetir con la misma idempotency_key'
);

-- ============================================================
-- 3. No permite duplicar persona: mismo usuario, segunda iglesia
-- ============================================================
select test_set_auth_uid('30000000-0000-0000-0000-000000000001');

select * from app.provision_church(
  'Segunda Iglesia de Ana', 'segunda-iglesia-de-ana', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Ana', 'Gómez', 'owner1@example.test', null,
  'Sede principal', null, null, null, null,
  array['people'], null
);

reset role;

select is(
  (select count(*)::int from people where user_id = '30000000-0000-0000-0000-000000000001'),
  1,
  'La misma cuenta no crea una persona duplicada al provisionar una segunda iglesia'
);

select is(
  (select count(*)::int from church_people where person_id = (select id from people where user_id = '30000000-0000-0000-0000-000000000001')),
  2,
  'La persona existente queda vinculada a ambas iglesias vía church_people'
);

-- ============================================================
-- 4. Slug: único, reservado, sanitizado
-- ============================================================
select ok(not (select app.slug_available('iglesia-central')), 'Slug ya usado no está disponible');
select ok(not (select app.slug_available('admin')), 'Slug reservado "admin" no está disponible');
select ok(not (select app.slug_available('app')), 'Slug reservado "app" no está disponible');
select ok((select app.slug_available('una-iglesia-nueva')), 'Slug nuevo y no reservado está disponible');
select is((select app.slugify('Iglesia Ñandú & Café')), 'iglesia-nandu-cafe', 'slugify normaliza acentos, espacios y símbolos');

-- ============================================================
-- 5. Alta asistida por operación LEVITA
-- ============================================================
insert into platform_operators (user_id) values ('30000000-0000-0000-0000-000000000003');
select test_set_auth_uid('30000000-0000-0000-0000-000000000003');

select lives_ok(
  $$ select * from app.assisted_provision_church(
    'Iglesia Asistida', 'iglesia-asistida', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
    'invitado@example.test', array['people','serving']
  ) $$,
  'assisted_provision_church no lanza excepción para un operador de plataforma'
);

reset role;

select ok(
  exists (select 1 from churches where slug = 'iglesia-asistida' and status = 'provisioning'),
  'La iglesia de alta asistida queda en estado provisioning hasta que el owner acepte'
);

select ok(
  exists (select 1 from invitations where church_id = (select id from churches where slug = 'iglesia-asistida') and email = 'invitado@example.test' and status = 'pending'),
  'Se crea una invitación pendiente para el owner'
);

-- Un usuario sin capacidad de operador no puede hacer alta asistida.
select test_set_auth_uid('30000000-0000-0000-0000-000000000001');

select throws_like(
  $$ select * from app.assisted_provision_church(
    'Iglesia No Autorizada', 'iglesia-no-autorizada', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
    'x@example.test', array['people']
  ) $$,
  '%FORBIDDEN%',
  'Un usuario sin capacidad de operador no puede usar assisted_provision_church'
);

-- ============================================================
-- 6. Aceptar invitación: token válido, expirado, ya usado
-- ============================================================
reset role;
-- Recuperar el token real emitido para el invitado (vía tabla, ya que la
-- función no persiste el token en claro; usamos el hash conocido para
-- fabricar un escenario determinista con una invitación de prueba propia).
insert into invitations (church_id, email, role_key, token_hash, expires_at)
values (
  (select id from churches where slug = 'iglesia-asistida'),
  'invitado@example.test', 'church_owner',
  encode(digest('token-valido-test', 'sha256'), 'hex'),
  now() + interval '7 days'
);

insert into invitations (church_id, email, role_key, token_hash, expires_at, status)
values (
  (select id from churches where slug = 'iglesia-asistida'),
  'expirado@example.test', 'church_owner',
  encode(digest('token-expirado-test', 'sha256'), 'hex'),
  now() - interval '1 day', 'pending'
);

select test_set_auth_uid('30000000-0000-0000-0000-000000000004');

select lives_ok(
  $$ select * from app.accept_invitation('token-valido-test', 'Invitado', 'Prueba', null) $$,
  'accept_invitation con token válido no lanza excepción'
);

reset role;

select ok(
  exists (
    select 1 from church_people_roles cpr
    join church_people cp on cp.id = cpr.church_people_id
    join people p on p.id = cp.person_id
    where p.user_id = '30000000-0000-0000-0000-000000000004'
      and cpr.role_key = 'church_owner'
  ),
  'El invitado queda vinculado como church_owner tras aceptar'
);

select ok(
  (select status from churches where slug = 'iglesia-asistida') = 'trial',
  'La iglesia pasa de provisioning a trial al aceptarse la invitación del owner'
);

select test_set_auth_uid('30000000-0000-0000-0000-000000000004');

select throws_like(
  $$ select * from app.accept_invitation('token-valido-test', 'Invitado', 'Prueba', null) $$,
  '%INVITATION_ALREADY_ACCEPTED%',
  'Un token ya usado falla al reintentar'
);

select throws_like(
  $$ select * from app.accept_invitation('token-expirado-test', 'X', 'Y', null) $$,
  '%INVITATION_EXPIRED%',
  'Un token expirado falla'
);

select throws_like(
  $$ select * from app.accept_invitation('token-que-no-existe', 'X', 'Y', null) $$,
  '%INVITATION_NOT_FOUND%',
  'Un token inexistente falla'
);

select * from finish();
rollback;
