-- Consola · La invitación del panel se puede entregar (CA-2.4).
--
-- Antes devolvía solo el id y descartaba el token. Con el correo desactivado,
-- eso dejaba la invitación en un callejón sin salida: constaba como pendiente,
-- caducaba a los 14 días y nadie podía hacerle llegar el enlace a la persona,
-- porque el enlace no existía en ninguna parte.
--
-- Aquí se comprueba que el enlace sale, que sale UNA vez, y que cuando se
-- reutiliza una invitación anterior se dice en lugar de devolver un hueco.

begin;
select plan(12);

create or replace function pg_temp.como(p_user text) returns void
language plpgsql as $ayuda$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end
$ayuda$;

insert into auth.users (id, email) values
  ('cd000000-0000-0000-0000-000000000001', 'inv.op@levita.test'),
  ('cd000000-0000-0000-0000-000000000002', 'inv.mirona@levita.test')
on conflict do nothing;

insert into platform_operators (user_id) values
  ('cd000000-0000-0000-0000-000000000001'),
  ('cd000000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into platform_operator_capabilities (user_id, capability_key) values
  ('cd000000-0000-0000-0000-000000000001', 'platform.owners.manage'),
  ('cd000000-0000-0000-0000-000000000002', 'platform.churches.read')
on conflict do nothing;

insert into churches (id, name, slug, status, locale, timezone, currency)
values ('cd000000-0000-0000-0000-0000000000c1', 'Iglesia Inv', 'cd-inv', 'active', 'es-ES', 'Europe/Madrid', 'EUR');

select pg_temp.como('cd000000-0000-0000-0000-000000000001');

-- 1. La primera invitación devuelve enlace -------------------------------------

create temporary table t_inv1 as
select * from app.platform_invite_admin('cd000000-0000-0000-0000-0000000000c1', 'nuevo@iglesia.test', 'church_admin');

select isnt(
  (select out_token from t_inv1),
  null,
  'La invitación devuelve un token con el que construir el enlace'
);

select ok(
  (select length(out_token) >= 32 from t_inv1),
  'Y es lo bastante largo como para no adivinarse'
);

select is(
  (select out_reutilizada from t_inv1),
  false,
  'Y consta como nueva, no como reutilizada'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- 2. Solo se guarda la huella -------------------------------------------------------

select is(
  (select count(*)::int from invitations where token_hash = (select out_token from t_inv1)),
  0,
  'El token no se guarda en claro: en la tabla solo está su huella'
);

select is(
  (select count(*)::int from invitations
   where id = (select out_invitation_id from t_inv1)
     and token_hash = encode(extensions.digest((select out_token from t_inv1), 'sha256'), 'hex')),
  1,
  'Y la huella guardada corresponde al token devuelto'
);

select is(
  (select status::text from invitations where id = (select out_invitation_id from t_inv1)),
  'pending',
  'La invitación queda pendiente'
);

-- 3. Repetir no duplica, y lo dice ----------------------------------------------------

select pg_temp.como('cd000000-0000-0000-0000-000000000001');

create temporary table t_inv2 as
select * from app.platform_invite_admin('cd000000-0000-0000-0000-0000000000c1', 'nuevo@iglesia.test', 'church_admin');

select is(
  (select out_invitation_id from t_inv2),
  (select out_invitation_id from t_inv1),
  'Invitar dos veces al mismo correo y papel devuelve la MISMA invitación'
);

select is(
  (select out_reutilizada from t_inv2),
  true,
  'Y avisa de que se ha reutilizado'
);

select is(
  (select out_token from t_inv2),
  null,
  'Sin token: el de la anterior no se puede recuperar, y no se inventa otro'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from invitations
   where church_id = 'cd000000-0000-0000-0000-0000000000c1' and lower(email) = 'nuevo@iglesia.test'),
  1,
  'Sigue habiendo una sola invitación, no dos con enlaces distintos'
);

-- 4. Permisos -----------------------------------------------------------------------------

select pg_temp.como('cd000000-0000-0000-0000-000000000002');

select throws_ok(
  $q$select * from app.platform_invite_admin('cd000000-0000-0000-0000-0000000000c1', 'otro@iglesia.test', 'church_admin')$q$,
  '42501',
  'No tienes permiso para esta operación.',
  'Un operador que solo puede leer no invita responsables'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from invitations
   where church_id = 'cd000000-0000-0000-0000-0000000000c1' and lower(email) = 'otro@iglesia.test'),
  0,
  'Y su intento no ha dejado ninguna invitación a medias'
);

select * from finish();
rollback;
