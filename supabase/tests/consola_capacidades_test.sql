-- Consola · La pertenencia al equipo no sustituye a la capacidad (CA-0.2).
--
-- La Fase 14 separó las capacidades de plataforma, pero el alta asistida seguía
-- usando una función de la Fase 1 que solo comprobaba si eras del equipo. Un
-- operador con CERO capacidades creaba iglesias y generaba invitaciones de
-- propietario: la separación existía en el papel y no en la práctica.
--
-- Esta suite fija las dos mitades del invariante: sin la capacidad no se puede,
-- y con ella sí. Sin la segunda mitad, «arreglarlo» rompiendo la función
-- también pasaría.

begin;
select plan(8);

insert into auth.users (id, email) values
  ('ca000000-0000-0000-0000-00000000000a', 'sin.cap@levita.test'),
  ('ca000000-0000-0000-0000-00000000000b', 'con.cap@levita.test')
on conflict do nothing;

insert into platform_operators (user_id) values
  ('ca000000-0000-0000-0000-00000000000a'),
  ('ca000000-0000-0000-0000-00000000000b')
on conflict do nothing;

-- Al de la b se le da la capacidad; al de la a, ninguna.
insert into platform_operator_capabilities (user_id, capability_key) values
  ('ca000000-0000-0000-0000-00000000000b', 'platform.churches.create')
on conflict do nothing;

delete from platform_operator_capabilities where user_id = 'ca000000-0000-0000-0000-00000000000a';

-- 1. El montaje es el que se cree ------------------------------------------------

select is(
  (select count(*)::int from platform_operator_capabilities
   where user_id = 'ca000000-0000-0000-0000-00000000000a'),
  0,
  'El primer operador no tiene ninguna capacidad'
);

select ok(
  (select exists (select 1 from platform_operators where user_id = 'ca000000-0000-0000-0000-00000000000a')),
  'Pero sí pertenece al equipo de plataforma'
);

-- 2. Sin capacidad, ninguna de las dos vías funciona --------------------------------

select set_config('request.jwt.claims',
  json_build_object('sub', 'ca000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
set local role authenticated;

select throws_ok(
  $q$select app.platform_create_church('Iglesia X', 'ca0-x', 'es-ES', 'Europe/Madrid', 'EUR', 'España', 'x@x.test', array['people'])$q$,
  '42501',
  'No tienes permiso para esta operación.',
  'Sin la capacidad no se puede crear una iglesia por la vía de la Fase 14'
);

select throws_ok(
  $q$select app.assisted_provision_church('Iglesia Y', 'ca0-y', 'es-ES', 'Europe/Madrid', 'EUR', 'España', 'y@x.test', array['people'])$q$,
  '42501',
  'No tienes permiso para esta operación.',
  'Ni por la del alta asistida, que es la que usa el panel'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from churches where slug in ('ca0-x', 'ca0-y')),
  0,
  'Y no ha quedado ninguna iglesia a medio crear'
);

-- 3. Con la capacidad, sí -------------------------------------------------------------
-- La mitad que impide que «arreglarlo» sea simplemente romper la función.

select set_config('request.jwt.claims',
  json_build_object('sub', 'ca000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  $q$select app.assisted_provision_church('Iglesia Z', 'ca0-z', 'es-ES', 'Europe/Madrid', 'EUR', 'España', 'z@x.test', array['people'])$q$,
  'Con la capacidad, el alta asistida sigue funcionando'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from churches where slug = 'ca0-z'),
  1,
  'Y la iglesia se crea de verdad'
);

select is(
  (select count(*)::int from invitations i join churches c on c.id = i.church_id
   where c.slug = 'ca0-z' and i.role_key = 'church_owner'),
  1,
  'Con su invitación de propietario, que es lo que hace útil esta vía'
);

select * from finish();
rollback;
