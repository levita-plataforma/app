-- Consola de plataforma: resumen, listado, alta asistida, invitaciones.
-- Operadores con capacidades explícitas (sin superusuario mágico) y rol
-- authenticated real. La consola gestiona metadatos; no lee datos de negocio.

begin;
select plan(36);

create or replace function tpc_as(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function tpc_reset() returns void as $$
begin
  perform set_config('role', 'none', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$ language plpgsql;

create or replace function tpc_err(p_sql text) returns text as $$
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

create or replace function tpc_int(p_sql text) returns integer as $$
declare
  v_n integer;
begin
  execute p_sql into v_n;
  return v_n;
end;
$$ language plpgsql;

create or replace function tpc_set(p_key text, p_value text) returns text as $$
  select set_config('tpc.' || p_key, coalesce(p_value, ''), true);
$$ language sql;

create or replace function tpc_get(p_key text) returns text as $$
  select nullif(current_setting('tpc.' || p_key, true), '');
$$ language sql;

-- ============================================================
-- Operadores: sin capacidades, lector, creador, responsables, soporte
-- ============================================================
insert into auth.users (id, email) values
  ('f9000000-0000-0000-0000-000000000001', 'op.vacio.pc@example.test'),
  ('f9000000-0000-0000-0000-000000000002', 'op.lector.pc@example.test'),
  ('f9000000-0000-0000-0000-000000000003', 'op.altas.pc@example.test'),
  ('f9000000-0000-0000-0000-000000000004', 'op.responsables.pc@example.test'),
  ('f9000000-0000-0000-0000-000000000005', 'op.soporte.pc@example.test'),
  ('f9000000-0000-0000-0000-000000000006', 'usuario.comun.pc@example.test');

insert into platform_operators (user_id) values
  ('f9000000-0000-0000-0000-000000000001'),
  ('f9000000-0000-0000-0000-000000000002'),
  ('f9000000-0000-0000-0000-000000000003'),
  ('f9000000-0000-0000-0000-000000000004'),
  ('f9000000-0000-0000-0000-000000000005');

insert into platform_operator_capabilities (user_id, capability_key) values
  ('f9000000-0000-0000-0000-000000000002', 'platform.churches.read'),
  ('f9000000-0000-0000-0000-000000000003', 'platform.churches.create'),
  ('f9000000-0000-0000-0000-000000000003', 'platform.churches.read'),
  ('f9000000-0000-0000-0000-000000000004', 'platform.owners.manage'),
  ('f9000000-0000-0000-0000-000000000004', 'platform.churches.read'),
  ('f9000000-0000-0000-0000-000000000005', 'platform.support.manage');

-- ============================================================
-- 0. Cada operador lee sus propias capacidades (la consola depende de esto)
-- ============================================================
select tpc_as('f9000000-0000-0000-0000-000000000003');
select is(tpc_err($$ select count(*) from platform_operator_capabilities $$), 'ok',
  'capacidades · leerlas no falla (sin recursión de política)');
select is(tpc_int($$ select count(*)::int from platform_operator_capabilities where user_id = auth.uid() $$), 2,
  'capacidades · el operador ve las suyas');
select is(tpc_int($$ select count(*)::int from platform_operator_capabilities where user_id <> auth.uid() $$), 0,
  'capacidades · sin operators.manage no ve las de otros');
select tpc_reset();

-- ============================================================
-- 1. Sin capacidad: no entra
-- ============================================================
select tpc_as('f9000000-0000-0000-0000-000000000001');
select is(tpc_err($$ select app.platform_console_summary() $$), '42501', 'sin capacidad · no ve el resumen');
select is(tpc_err($$ select * from app.platform_churches() $$), '42501', 'sin capacidad · no ve el listado');
select is(tpc_err($$ select * from app.platform_invitations() $$), '42501', 'sin capacidad · no ve invitaciones');
select is(tpc_err($$ select * from public.assisted_provision_church('X', 'x-pc', 'es-ES', 'Europe/Madrid', 'EUR', 'España', 'a@b.es') $$),
  '42501', 'sin capacidad · no crea iglesias');
select tpc_reset();

select tpc_as('f9000000-0000-0000-0000-000000000006');
select is(tpc_err($$ select app.platform_console_summary() $$), '42501', 'usuario común · no ve el resumen');
select tpc_reset();

select tpc_as('f9000000-0000-0000-0000-000000000002');
select is(tpc_err($$ select * from public.assisted_provision_church('X', 'x-pc', 'es-ES', 'Europe/Madrid', 'EUR', 'España', 'a@b.es') $$),
  '42501', 'lector · churches.read no crea iglesias');
select tpc_reset();

-- ============================================================
-- 2. Alta asistida completa
-- ============================================================
select tpc_as('f9000000-0000-0000-0000-000000000003');
select tpc_set('alta', (select row_to_json(r)::text from public.assisted_provision_church(
  'Iglesia Consola', 'iglesia-consola-pc', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner.Consola@Example.test', array['kids', 'groups'], 'Ana Propietaria') r));
select tpc_reset();

select tpc_set('cid', tpc_get('alta')::json ->> 'church_id');

select ok(tpc_get('cid') is not null, 'alta · devuelve el id de la iglesia');
select ok(length(tpc_get('alta')::json ->> 'invitation_token') = 64, 'alta · devuelve el enlace una sola vez (token de 64 caracteres)');
select is((select status::text from churches where id = tpc_get('cid')::uuid), 'provisioning',
  'alta · estado inicial provisioning');
select is((select count(*)::int from campuses where church_id = tpc_get('cid')::uuid and is_primary), 1,
  'alta · sede principal creada');
select is((select count(*)::int from invitations where church_id = tpc_get('cid')::uuid
  and role_key = 'church_owner' and status = 'pending' and email = 'owner.consola@example.test'
  and invited_name = 'Ana Propietaria'), 1, 'alta · propietario invitado con nombre y correo normalizado');
select ok((select token_hash <> tpc_get('alta')::json ->> 'invitation_token' from invitations
  where church_id = tpc_get('cid')::uuid), 'alta · solo se guarda la huella del token');
select is((select array_agg(module_key order by module_key)::text from church_modules
  where church_id = tpc_get('cid')::uuid and status = 'enabled'),
  '{communications,events,groups,kids,people,serving}', 'alta · núcleo siempre activo más los módulos elegidos');
select is((select status::text from subscriptions where church_id = tpc_get('cid')::uuid), 'trial',
  'alta · suscripción en prueba');
select ok((select trial_ends_at > now() + interval '29 days' and trial_started_at <= now()
  from subscriptions where church_id = tpc_get('cid')::uuid), 'alta · prueba de 30 días fijada por la base');
select is((select count(*)::int from church_onboarding where church_id = tpc_get('cid')::uuid and completed_at is null), 1,
  'alta · onboarding listo para continuar');
select is((select count(*)::int from platform_audit_logs where church_id = tpc_get('cid')::uuid
  and action = 'platform.church_created' and actor_user_id = 'f9000000-0000-0000-0000-000000000003'), 1,
  'alta · auditoría de plataforma con el operador');

-- Reintento y validaciones
select tpc_as('f9000000-0000-0000-0000-000000000003');
select is(tpc_err($$ select * from public.assisted_provision_church('Iglesia Consola', 'iglesia-consola-pc', 'es-ES',
  'Europe/Madrid', 'EUR', 'España', 'owner.consola@example.test') $$), 'P0001',
  'reintento · el mismo identificador no duplica la iglesia');
select is(tpc_err($$ select * from public.assisted_provision_church('Otra', 'otra-pc', 'es-ES', 'Europe/Madrid', 'EUR',
  'España', 'o@b.es', array['pastoral']) $$), '22023', 'módulos · un módulo «próximamente» se rechaza');
select is(tpc_err($$ select * from public.assisted_provision_church('Otra', 'otra-pc', 'es-ES', 'Europe/Madrid', 'EUR',
  'España', 'no-es-correo') $$), '22023', 'validación · correo inválido rechazado');
select tpc_reset();
select is((select count(*)::int from churches where slug = 'iglesia-consola-pc'), 1, 'reintento · sigue habiendo una sola iglesia');
select is((select count(*)::int from churches where slug = 'otra-pc'), 0, 'validación · nada a medias tras un rechazo');

-- ============================================================
-- 3. Listado y resumen
-- ============================================================
select tpc_as('f9000000-0000-0000-0000-000000000002');
select is(tpc_int($$ select count(*)::int from app.platform_churches(p_search => 'iglesia-consola-pc') $$), 1,
  'listado · busca por identificador');
select is((select access_mode from app.platform_churches(p_search => 'iglesia-consola-pc')), 'full',
  'listado · devuelve el modo de acceso');
select is((select owner_invitation_pending from app.platform_churches(p_search => 'iglesia-consola-pc')), true,
  'listado · marca la invitación de propietario pendiente');
select is(tpc_int($$ select count(*)::int from app.platform_churches(p_search => 'owner.consola') $$), 0,
  'listado · sin owners.manage no se busca por correo');
select is(tpc_int($$ select count(*)::int from app.platform_churches(p_search => 'iglesia-consola-pc', p_access_mode => 'suspended') $$), 0,
  'listado · el filtro por modo excluye lo que no coincide');
select ok((select (app.platform_console_summary() ->> 'altas_mes')::int >= 1), 'resumen · cuenta las altas del mes');
select tpc_reset();

-- ============================================================
-- 4. Invitaciones: listado y reenvío
-- ============================================================
select tpc_set('inv', (select id::text from invitations where church_id = tpc_get('cid')::uuid and status = 'pending'));
select tpc_as('f9000000-0000-0000-0000-000000000004');
select is(tpc_int($$ select count(*)::int from app.platform_churches(p_search => 'owner.consola') $$), 1,
  'listado · con owners.manage se busca por correo');
select is(tpc_int($$ select count(*)::int from app.platform_invitations('pendientes') where church_name = 'Iglesia Consola' $$), 1,
  'invitaciones · aparece la invitación pendiente');
select tpc_set('reenvio', (select row_to_json(r)::text from app.platform_resend_invitation(
  tpc_get('inv')::uuid) r));
select tpc_reset();
select is((select count(*)::int from invitations where church_id = tpc_get('cid')::uuid and status = 'pending'), 1,
  'reenvío · queda una sola invitación pendiente (la anterior revocada)');
select is((select invited_name from invitations where church_id = tpc_get('cid')::uuid and status = 'pending'), 'Ana Propietaria',
  'reenvío · conserva correo, rol y nombre');

-- ============================================================
-- 5. Soporte no concede datos de negocio
-- ============================================================
select tpc_as('f9000000-0000-0000-0000-000000000005');
select is(tpc_int($$ select count(*)::int from church_people where church_id = '$$ || tpc_get('cid') || $$' $$), 0,
  'soporte · la consola no lee personas de la iglesia');
select tpc_reset();

select * from finish();
rollback;
