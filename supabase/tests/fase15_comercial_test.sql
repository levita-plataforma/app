-- Fase 15 · Planes, suscripciones, excepciones y separación de permisos.
--
-- Lo que más importa aquí no es que un cambio de plan funcione, sino que NO
-- funcione desde donde no debe: un operador de soporte no cambia precios, un
-- operador comercial no bloquea iglesias, y una excepción caducada deja de
-- aplicar sola.

begin;
select plan(32);

-- Dos ayudantes, porque la distinción importa y la primera versión de esta
-- suite falló ocho veces por no tenerla: actuando como operador, RLS le oculta
-- las tablas de la iglesia, así que una comprobación que lea directamente
-- recibe NULL y parece que la operación falló cuando sí había funcionado.
--
-- Las acciones van como operador. Las comprobaciones, sin sesión.

create or replace function pg_temp.como(p_user text) returns void
language plpgsql as $ayuda$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end
$ayuda$;

create or replace function pg_temp.sin_sesion() returns void
language plpgsql as $ayuda$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end
$ayuda$;

-- Montaje ---------------------------------------------------------------------

insert into auth.users (id, email) values
  ('f1500000-0000-0000-0000-000000000001', 'comercial@levita.test'),
  ('f1500000-0000-0000-0000-000000000002', 'soporte@levita.test'),
  ('f1500000-0000-0000-0000-000000000009', 'owner@iglesia.test')
on conflict do nothing;

insert into platform_operators (user_id) values
  ('f1500000-0000-0000-0000-000000000001'),
  ('f1500000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into platform_operator_capabilities (user_id, capability_key) values
  ('f1500000-0000-0000-0000-000000000001', 'platform.commercial.read'),
  ('f1500000-0000-0000-0000-000000000001', 'platform.commercial.manage'),
  ('f1500000-0000-0000-0000-000000000002', 'platform.support.manage'),
  ('f1500000-0000-0000-0000-000000000002', 'platform.operations.read')
on conflict do nothing;

-- Catálogo de prueba. No son los planes reales: el catálogo nace vacío a
-- propósito y estos solo existen dentro de esta transacción.
insert into plans (key, name, available_for_signup) values
  ('test_basico', 'Básico de prueba', true),
  ('test_avanzado', 'Avanzado de prueba', true);

insert into plan_versions (id, plan_key, version, price_cents, currency, billing_period) values
  ('f1500000-0000-0000-0000-00000000aa01', 'test_basico', 1, 1000, 'EUR', 'monthly'),
  ('f1500000-0000-0000-0000-00000000aa02', 'test_basico', 2, 1500, 'EUR', 'monthly'),
  ('f1500000-0000-0000-0000-00000000aa03', 'test_avanzado', 1, 3000, 'EUR', 'monthly');

insert into plan_version_entitlements (plan_version_id, capability, limit_value) values
  ('f1500000-0000-0000-0000-00000000aa01', 'people.max', 100),
  ('f1500000-0000-0000-0000-00000000aa01', 'campuses.max', 1),
  ('f1500000-0000-0000-0000-00000000aa02', 'people.max', 10),
  ('f1500000-0000-0000-0000-00000000aa03', 'people.max', null),
  ('f1500000-0000-0000-0000-00000000aa03', 'campuses.max', 5);

-- Una iglesia, por el camino normal.
select pg_temp.como('f1500000-0000-0000-0000-000000000009');

create temporary table t_iglesia as
select out_church_id as church_id
from app.provision_church(
  'Iglesia F15', 'iglesia-f15', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'F15', 'owner@iglesia.test', null, 'Sede', null, null, null, null,
  array['people'], null);

select pg_temp.sin_sesion();

update subscriptions
set plan_version_id = 'f1500000-0000-0000-0000-00000000aa01',
    plan_key = 'test_basico'
where church_id = (select church_id from t_iglesia);

-- 1. Los derechos salen de la versión contratada ---------------------------------

select is(
  (select limit_value from app.church_entitlements((select church_id from t_iglesia))
   where capability = 'people.max'),
  100,
  'Los derechos vienen de la versión de plan contratada'
);

select is(
  (select source from app.church_entitlements((select church_id from t_iglesia))
   where capability = 'people.max'),
  'plan',
  'Y se identifica de dónde sale cada uno'
);

-- 2. Editar el catálogo NO cambia lo contratado -----------------------------------
-- Es la razón de ser del versionado: la versión 2 del mismo plan baja el límite
-- a 10, y la iglesia que contrató la 1 se queda en 100.

select is(
  (select limit_value from app.church_entitlements((select church_id from t_iglesia))
   where capability = 'people.max'),
  100,
  'Publicar una versión nueva del plan no toca lo que la iglesia ya tenía contratado'
);

-- 3. Separación de permisos --------------------------------------------------------

select pg_temp.como('f1500000-0000-0000-0000-000000000002');

select throws_ok(
  format($q$select app.platform_change_plan(%L::uuid, 'f1500000-0000-0000-0000-00000000aa03'::uuid, 'porque sí', null)$q$,
         (select church_id from t_iglesia)),
  '42501',
  'No tienes permiso para esta operación.',
  'Un operador de soporte NO puede cambiar el plan'
);

select throws_ok(
  format($q$select app.platform_grant_override(%L::uuid, 'people.max', 999, 'un favor', null, null)$q$,
         (select church_id from t_iglesia)),
  '42501',
  'No tienes permiso para esta operación.',
  'Un operador de soporte NO puede conceder excepciones comerciales'
);

select throws_ok(
  format($q$select app.platform_cancel_subscription(%L::uuid, 'porque sí', true)$q$,
         (select church_id from t_iglesia)),
  '42501',
  'No tienes permiso para esta operación.',
  'Un operador de soporte NO puede cancelar una suscripción'
);

select pg_temp.sin_sesion();

-- Y al revés: quien lleva lo comercial no bloquea iglesias por seguridad.
select pg_temp.como('f1500000-0000-0000-0000-000000000001');

select throws_ok(
  format($q$select app.platform_set_security_block(%L::uuid, 'sospecha')$q$,
         (select church_id from t_iglesia)),
  '42501',
  'No tienes permiso para esta operación.',
  'Un operador comercial NO puede bloquear una iglesia por seguridad'
);

-- 4. Vista previa antes de confirmar -------------------------------------------------

select ok(
  (select (app.preview_plan_change((select church_id from t_iglesia),
     'f1500000-0000-0000-0000-00000000aa03'::uuid) -> 'nueva' ->> 'price_cents')::int = 3000),
  'La vista previa dice el precio del plan nuevo'
);

select is(
  (select app.preview_plan_change((select church_id from t_iglesia),
     'f1500000-0000-0000-0000-00000000aa03'::uuid) ->> 'cobro'),
  'sin_proveedor_configurado',
  'Y declara que no hay proveedor, en vez de dar a entender que se cobrará'
);

select is(
  (select app.preview_plan_change((select church_id from t_iglesia),
     'f1500000-0000-0000-0000-00000000aa03'::uuid) ->> 'prorrateo'),
  'sin_politica_acordada',
  'Y que no hay política de prorrateo acordada'
);

-- Bajar de plan: lo que se pierde tiene que verse antes.
select ok(
  (select jsonb_array_length(
     app.preview_plan_change((select church_id from t_iglesia),
       'f1500000-0000-0000-0000-00000000aa02'::uuid) -> 'pierde') > 0),
  'Al bajar de plan, la vista previa enumera los derechos que se pierden'
);

select ok(
  (select (app.preview_plan_change((select church_id from t_iglesia),
     'f1500000-0000-0000-0000-00000000aa02'::uuid) -> 'uso_actual' ->> 'personas_activas')::int >= 1),
  'Y el consumo real de la iglesia, para compararlo con el límite nuevo'
);

select pg_temp.sin_sesion();

select is(
  (select plan_version_id from subscriptions where church_id = (select church_id from t_iglesia)),
  'f1500000-0000-0000-0000-00000000aa01'::uuid,
  'Consultar la vista previa no ha cambiado la suscripción'
);

-- 5. Cambiar de plan de verdad ---------------------------------------------------------

select pg_temp.como('f1500000-0000-0000-0000-000000000001');

select lives_ok(
  format($q$select app.platform_change_plan(%L::uuid, 'f1500000-0000-0000-0000-00000000aa03'::uuid, 'sube de plan', null)$q$,
         (select church_id from t_iglesia)),
  'El operador comercial sí puede cambiar el plan'
);

select pg_temp.sin_sesion();

select is(
  (select plan_version_id from subscriptions where church_id = (select church_id from t_iglesia)),
  'f1500000-0000-0000-0000-00000000aa03'::uuid,
  'La suscripción apunta a la versión nueva'
);

select is(
  (select plan_key from subscriptions where church_id = (select church_id from t_iglesia)),
  'test_avanzado',
  'Y plan_key queda coherente con la versión, sin quedarse atrás'
);

select is(
  (select count(*)::int from subscription_history
   where church_id = (select church_id from t_iglesia) and event = 'plan.changed'),
  1,
  'El cambio queda en el historial comercial'
);

select is(
  (select count(*)::int from platform_audit_logs
   where church_id = (select church_id from t_iglesia) and action = 'subscription.plan_changed'),
  1,
  'Y en la auditoría de plataforma'
);

select pg_temp.como('f1500000-0000-0000-0000-000000000001');

select throws_ok(
  format($q$select app.platform_change_plan(%L::uuid, 'f1500000-0000-0000-0000-00000000aa03'::uuid, 'otra vez', null)$q$,
         (select church_id from t_iglesia)),
  '22023',
  'La iglesia ya está en esa versión de plan.',
  'Repetir el mismo cambio se rechaza en vez de duplicar historial'
);

select throws_ok(
  format($q$select app.platform_change_plan(%L::uuid, 'f1500000-0000-0000-0000-00000000aa01'::uuid, '   ', null)$q$,
         (select church_id from t_iglesia)),
  '22023',
  'Hace falta un motivo para cambiar el plan.',
  'Un cambio de plan sin motivo se rechaza'
);

-- 6. Cambio programado -------------------------------------------------------------------

select lives_ok(
  format($q$select app.platform_change_plan(%L::uuid, 'f1500000-0000-0000-0000-00000000aa01'::uuid, 'baja programada', now() + interval '30 days')$q$,
         (select church_id from t_iglesia)),
  'Se puede programar un cambio de plan para más adelante'
);

select pg_temp.sin_sesion();

select is(
  (select plan_version_id from subscriptions where church_id = (select church_id from t_iglesia)),
  'f1500000-0000-0000-0000-00000000aa03'::uuid,
  'Un cambio programado NO altera todavía el plan vigente'
);

select isnt(
  (select scheduled_change_at from subscriptions where church_id = (select church_id from t_iglesia)),
  null,
  'Pero queda registrado cuándo va a ocurrir'
);

-- 7. Excepciones ----------------------------------------------------------------------------

select pg_temp.como('f1500000-0000-0000-0000-000000000001');

select lives_ok(
  format($q$select app.platform_grant_override(%L::uuid, 'campuses.max', 50, 'convenio con la denominación', now() + interval '1 year', null)$q$,
         (select church_id from t_iglesia)),
  'El operador comercial concede una excepción con motivo y caducidad'
);

select throws_ok(
  format($q$select app.platform_grant_override(%L::uuid, 'people.max', 1, 'mal puesta', now() - interval '1 day', null)$q$,
         (select church_id from t_iglesia)),
  '22023',
  'La excepción caducaría antes de empezar.',
  'Una excepción que caduca antes de empezar se rechaza'
);

select pg_temp.sin_sesion();

select is(
  (select limit_value from app.church_entitlements((select church_id from t_iglesia))
   where capability = 'campuses.max'),
  50,
  'La excepción pisa el límite del plan'
);

select is(
  (select source from app.church_entitlements((select church_id from t_iglesia))
   where capability = 'campuses.max'),
  'override',
  'Y se ve que viene de una excepción, no del plan'
);

-- Una excepción caducada deja de aplicar sola, sin que nadie la borre.
update church_entitlement_overrides
set starts_at = now() - interval '10 days', expires_at = now() - interval '1 day'
where church_id = (select church_id from t_iglesia) and capability = 'campuses.max';

select is(
  (select limit_value from app.church_entitlements((select church_id from t_iglesia))
   where capability = 'campuses.max'),
  5,
  'Una excepción caducada deja de aplicar sola y vuelve a regir el plan'
);

-- 8. Cancelar no borra ------------------------------------------------------------------------

select pg_temp.como('f1500000-0000-0000-0000-000000000001');

select is(
  (select app.platform_cancel_subscription((select church_id from t_iglesia), 'fin de contrato', true) ->> 'datos'),
  'se_conservan',
  'Cancelar declara explícitamente que los datos se conservan'
);

select pg_temp.sin_sesion();

select is(
  (select count(*)::int from church_people where church_id = (select church_id from t_iglesia)),
  1,
  'Y de hecho no ha borrado a nadie'
);

select is(
  (select status::text from subscriptions where church_id = (select church_id from t_iglesia)),
  'trial',
  'Cancelar al final del periodo no cambia todavía el estado comercial'
);

select ok(
  (select cancel_at_period_end from subscriptions where church_id = (select church_id from t_iglesia)),
  'Pero queda marcado que se cancelará al terminar'
);

select * from finish();
rollback;
