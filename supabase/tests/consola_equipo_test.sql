-- Consola · Equipo de plataforma (CA-3.1).
--
-- Lo que se comprueba aquí es sobre todo que no se pueda dejar la plataforma
-- sin gobierno: ni por permisos, ni retirando capacidades, ni retirando al
-- operador entero, que era la vía que se saltaba la protección sin tocarla.
--
-- La carrera entre dos retiradas simultáneas no se puede escribir en pgTAP
-- —hace falta más de una sesión—, y va en scratchpad/pg/carrera-ca3.mjs.

begin;
select plan(19);

create or replace function pg_temp.como(p_user text) returns void
language plpgsql as $ayuda$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end
$ayuda$;

-- Partimos de un estado conocido: si el seed dejó gestores, los conteos de
-- «último gestor» medirían otra cosa.
delete from platform_operator_capabilities where capability_key = 'platform.operators.manage';

insert into auth.users (id, email) values
  ('ce000000-0000-0000-0000-000000000001', 'eq.jefa@levita.test'),
  ('ce000000-0000-0000-0000-000000000002', 'eq.otro@levita.test'),
  ('ce000000-0000-0000-0000-000000000003', 'eq.mirona@levita.test'),
  ('ce000000-0000-0000-0000-000000000004', 'eq.fuera@levita.test')
on conflict do nothing;

insert into platform_operators (user_id) values
  ('ce000000-0000-0000-0000-000000000001'),
  ('ce000000-0000-0000-0000-000000000002'),
  ('ce000000-0000-0000-0000-000000000003')
on conflict do nothing;

-- La jefa gestiona el equipo. La mirona solo lee iglesias. El otro, nada.
insert into platform_operator_capabilities (user_id, capability_key) values
  ('ce000000-0000-0000-0000-000000000001', 'platform.operators.manage'),
  ('ce000000-0000-0000-0000-000000000003', 'platform.churches.read')
on conflict do nothing;

-- 1. Ver el equipo exige la capacidad -----------------------------------------

select pg_temp.como('ce000000-0000-0000-0000-000000000003');

select throws_ok(
  $q$select * from app.platform_team()$q$,
  '42501',
  'No tienes permiso para esta operación.',
  'Un operador que solo lee iglesias no ve el equipo'
);

select throws_ok(
  $q$select * from app.platform_capability_catalog()$q$,
  '42501',
  'No tienes permiso para esta operación.',
  'Ni el catálogo de capacidades'
);

reset role;
select set_config('request.jwt.claims', '', true);

select pg_temp.como('ce000000-0000-0000-0000-000000000001');

-- Contados por su correo: el seed y otras pruebas pueden haber dejado más
-- operadores, y afirmar un total convertiría esto en una aserción frágil que
-- mide el estado de la base en vez de lo que hace la función.
select is(
  (select count(*)::int from app.platform_team() where email like 'eq.%@levita.test'),
  3,
  'Quien gestiona el equipo ve a los tres operadores, no solo a sí mismo'
);

select is(
  (select capabilities from app.platform_team() where email = 'eq.otro@levita.test'),
  array[]::text[],
  'Y a quien no tiene capacidades se le ve con la lista vacía, no ausente'
);

select ok(
  (select es_uno_mismo from app.platform_team() where email = 'eq.jefa@levita.test'),
  'Su propia fila viene marcada, para que la pantalla no ofrezca retirarse sin avisar'
);

select ok(
  (select count(*) from app.platform_capability_catalog()) >= 5,
  'El catálogo sale de la base, no de una lista escrita en la pantalla'
);

-- 2. Alta -----------------------------------------------------------------------

select throws_ok(
  $q$select app.platform_add_operator('nadie@desconocido.test')$q$,
  'P0002',
  'No hay ninguna cuenta de LEVITA con ese correo. Esa persona tiene que registrarse antes de poder entrar al equipo.',
  'No se da de alta a quien no tiene cuenta: la fila apuntaría a nadie'
);

select throws_ok(
  $q$select app.platform_add_operator('eq.otro@levita.test')$q$,
  '23505',
  'Esa cuenta ya está en el equipo.',
  'Ni se duplica a quien ya está'
);

select lives_ok(
  $q$select app.platform_add_operator('EQ.Fuera@levita.test')$q$,
  'Se da de alta por correo, sin distinguir mayúsculas'
);

select is(
  (select capabilities from app.platform_team() where email = 'eq.fuera@levita.test'),
  array[]::text[],
  'Y entra SIN capacidades: estar en el equipo no es poder hacer cosas'
);

-- 3. Autoescalada ----------------------------------------------------------------

select throws_ok(
  $q$select app.grant_platform_capability('ce000000-0000-0000-0000-000000000001', 'platform.commercial.manage')$q$,
  '42501',
  'No puedes concederte capacidades a ti mismo.',
  'Nadie se amplía sus propios permisos'
);

select throws_ok(
  $q$select app.grant_platform_capability('ce000000-0000-0000-0000-000000000002', 'platform.inventada')$q$,
  '22023',
  'Esa capacidad no existe.',
  'Ni se concede una capacidad que no está en el catálogo'
);

-- 4. Que nunca quede la plataforma sin gobierno ---------------------------------

select throws_ok(
  $q$select app.revoke_platform_capability('ce000000-0000-0000-0000-000000000001', 'platform.operators.manage')$q$,
  '22023',
  'Es la última cuenta que puede gestionar operadores: concede la capacidad a otra persona antes de retirarla.',
  'No se retira la capacidad de la última cuenta gestora'
);

-- Esta era la puerta de atrás: borrar al operador arrastra sus capacidades por
-- la clave ajena, sin pasar por la comprobación de arriba.
select throws_ok(
  $q$select app.platform_remove_operator('ce000000-0000-0000-0000-000000000001')$q$,
  '22023',
  'Es la última cuenta que puede gestionar operadores: da la capacidad a otra persona antes de retirarla.',
  'Ni se retira al operador entero para saltarse esa protección'
);

-- Con dos gestores, soltar la propia capacidad sí vale: reducirse el acceso no
-- es una escalada.
select lives_ok(
  $q$select app.grant_platform_capability('ce000000-0000-0000-0000-000000000002', 'platform.operators.manage')$q$,
  'Se puede pasar la gestión a otra persona'
);

select lives_ok(
  $q$select app.revoke_platform_capability('ce000000-0000-0000-0000-000000000001', 'platform.operators.manage')$q$,
  'Y entonces sí se puede soltar la propia'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- 5. Retirar a alguien del equipo ------------------------------------------------

select pg_temp.como('ce000000-0000-0000-0000-000000000002');

select lives_ok(
  $q$select app.platform_remove_operator('ce000000-0000-0000-0000-000000000003')$q$,
  'Quien gestiona el equipo retira a un operador'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from platform_operator_capabilities
   where user_id = 'ce000000-0000-0000-0000-000000000003'),
  0,
  'Y al retirarlo no le quedan capacidades sueltas apuntando a nadie'
);

select pg_temp.como('ce000000-0000-0000-0000-000000000004');

select throws_ok(
  $q$select app.platform_remove_operator('ce000000-0000-0000-0000-000000000002')$q$,
  '42501',
  'No tienes permiso para esta operación.',
  'Un operador sin capacidad no retira a quien sí la tiene'
);

reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
