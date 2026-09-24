-- Consola · Los filtros del listado filtran de verdad (CA-2.1).
--
-- La portada enlazaba sus indicadores a ?onboarding=pendiente y
-- ?sinPropietario=1, y el listado ignoraba los dos: salían todas las iglesias.
-- No daba error, que es lo que lo hacía difícil de ver.
--
-- Lo que se comprueba aquí no es que el filtro devuelva filas, sino que deje
-- fuera las que no cumplen. Un filtro roto también «devuelve filas».

begin;
select plan(10);

create or replace function pg_temp.como(p_user text) returns void
language plpgsql as $ayuda$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end
$ayuda$;

insert into auth.users (id, email) values
  ('cb000000-0000-0000-0000-000000000001', 'lista.op@levita.test'),
  ('cb000000-0000-0000-0000-000000000009', 'due@iglesia.test')
on conflict do nothing;

insert into platform_operators (user_id) values ('cb000000-0000-0000-0000-000000000001')
on conflict do nothing;

insert into platform_operator_capabilities (user_id, capability_key) values
  ('cb000000-0000-0000-0000-000000000001', 'platform.churches.read'),
  ('cb000000-0000-0000-0000-000000000001', 'platform.churches.create')
on conflict do nothing;

-- Tres iglesias con situaciones distintas, creadas a mano para controlarlas:
--   completa  → alta terminada y con propietario
--   a_medias  → alta sin terminar, con propietario
--   huerfana  → alta terminada, sin propietario
insert into churches (id, name, slug, status, locale, timezone, currency)
values
  ('cb000000-0000-0000-0000-0000000000c1', 'Completa', 'cb-completa', 'active', 'es-ES', 'Europe/Madrid', 'EUR'),
  ('cb000000-0000-0000-0000-0000000000c2', 'A medias', 'cb-a-medias', 'provisioning', 'es-ES', 'Europe/Madrid', 'EUR'),
  ('cb000000-0000-0000-0000-0000000000c3', 'Huérfana', 'cb-huerfana', 'active', 'es-ES', 'Europe/Madrid', 'EUR');

insert into church_onboarding (church_id, current_step, completed_steps, completed_at) values
  ('cb000000-0000-0000-0000-0000000000c1', 'finish', array['account','church','campus','modules']::church_onboarding_step[], now()),
  ('cb000000-0000-0000-0000-0000000000c2', 'church', array['account']::church_onboarding_step[], null),
  ('cb000000-0000-0000-0000-0000000000c3', 'finish', array['account','church','campus','modules']::church_onboarding_step[], now());

-- Propietarios para la completa y la de a medias; la huérfana se queda sin.
insert into people (id, first_name, last_name, source) values
  ('cb000000-0000-0000-0000-00000000a001', 'Due', 'Uno', 'manual'),
  ('cb000000-0000-0000-0000-00000000a002', 'Due', 'Dos', 'manual');

insert into church_people (id, church_id, person_id, relationship, source) values
  ('cb000000-0000-0000-0000-00000000b001', 'cb000000-0000-0000-0000-0000000000c1', 'cb000000-0000-0000-0000-00000000a001', 'member', 'manual'),
  ('cb000000-0000-0000-0000-00000000b002', 'cb000000-0000-0000-0000-0000000000c2', 'cb000000-0000-0000-0000-00000000a002', 'member', 'manual');

insert into church_people_roles (church_id, church_people_id, role_key, scope_type) values
  ('cb000000-0000-0000-0000-0000000000c1', 'cb000000-0000-0000-0000-00000000b001', 'church_owner', 'church'),
  ('cb000000-0000-0000-0000-0000000000c2', 'cb000000-0000-0000-0000-00000000b002', 'church_owner', 'church');

select pg_temp.como('cb000000-0000-0000-0000-000000000001');

-- 1. Sin filtros salen las tres -----------------------------------------------

select is(
  (select count(*)::int from app.platform_churches('cb-', null, null, null, null, null, null, 100, 0)),
  3,
  'Sin filtros, la búsqueda por nombre devuelve las tres de la prueba'
);

-- 2. Alta sin terminar ----------------------------------------------------------

select is(
  (select count(*)::int from app.platform_churches('cb-', null, null, null, null, true, null, 100, 0)),
  1,
  'El filtro de alta sin terminar deja UNA, no las tres'
);

select is(
  (select slug from app.platform_churches('cb-', null, null, null, null, true, null, 100, 0)),
  'cb-a-medias',
  'Y es la que efectivamente no ha terminado'
);

select ok(
  (select bool_and(not onboarding_completed)
   from app.platform_churches('cb-', null, null, null, null, true, null, 100, 0)),
  'Ninguna de las devueltas tiene el alta completa'
);

-- 3. Sin propietario --------------------------------------------------------------

select is(
  (select count(*)::int from app.platform_churches('cb-', null, null, null, null, null, true, 100, 0)),
  1,
  'El filtro de sin propietario deja UNA'
);

select is(
  (select slug from app.platform_churches('cb-', null, null, null, null, null, true, 100, 0)),
  'cb-huerfana',
  'Y es la que no tiene a nadie que la administre'
);

select ok(
  (select bool_and(not has_owner)
   from app.platform_churches('cb-', null, null, null, null, null, true, 100, 0)),
  'Ninguna de las devueltas tiene propietario'
);

-- 4. El total acompaña al filtro ------------------------------------------------------
-- Si el recuento siguiera siendo el global, la paginación mentiría.

select is(
  (select distinct total_count from app.platform_churches('cb-', null, null, null, null, true, null, 100, 0)),
  1,
  'El total devuelto es el del subconjunto filtrado, no el global'
);

-- 5. Los dos filtros a la vez ------------------------------------------------------------
-- Ninguna cumple las dos cosas: alta sin terminar Y sin propietario.

select is(
  (select count(*)::int from app.platform_churches('cb-', null, null, null, null, true, true, 100, 0)),
  0,
  'Combinar los dos filtros no devuelve nada, porque ninguna cumple ambas'
);

-- 6. Sin la capacidad, nada -----------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '', true);

insert into auth.users (id, email) values ('cb000000-0000-0000-0000-00000000000f', 'fuera@x.test')
on conflict do nothing;

select pg_temp.como('cb000000-0000-0000-0000-00000000000f');

select throws_ok(
  $q$select count(*) from app.platform_churches('cb-', null, null, null, null, null, null, 100, 0)$q$,
  '42501',
  'No tienes permiso para esta operación.',
  'Quien no es operador no ve el listado, con filtro o sin él'
);

reset role;
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
