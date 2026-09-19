-- Hotfix · Pruebas del enlace de cancelación con caducidad y de los textos de
-- aviso que le faltaban a la Fase 6.
-- Ver 20260930000100_hotfix_enlace_cancelacion.sql y 20260930000200_hotfix_textos_avisos_fase6.sql

begin;
select plan(22);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create temporary table test_ids (name text primary key, id uuid);
grant all on test_ids to public;

create or replace function test_remember(p_name text, p_id uuid) returns uuid as $$
begin
  insert into test_ids (name, id) values (p_name, p_id)
  on conflict (name) do update set id = excluded.id;
  return p_id;
end;
$$ language plpgsql;

create or replace function test_id(p_name text) returns uuid as $$
  select id from test_ids where name = p_name;
$$ language sql stable;

create temporary table test_vals (name text primary key, val text);
grant all on test_vals to public;

create or replace function test_put(p_name text, p_val text) returns text as $$
begin
  insert into test_vals (name, val) values (p_name, p_val)
  on conflict (name) do update set val = excluded.val;
  return p_val;
end;
$$ language plpgsql;

create or replace function test_get(p_name text) returns text as $$
  select val from test_vals where name = p_name;
$$ language sql stable;

create or replace function test_err(p_sql text) returns text as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate;
end;
$$ language plpgsql;

-- ============================================================
-- Setup: una iglesia con un evento abierto a inscripción
-- ============================================================

insert into auth.users (id, email) values
  ('f0000000-0000-0000-0000-000000000001', 'owner.hc@example.test');

select test_set_auth_uid('f0000000-0000-0000-0000-000000000001');
select * from app.provision_church(
  'Church HC', 'church-hc', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'HC', 'owner.hc@example.test', null, 'Sede HC', null, null, null, null,
  array['people', 'events'], null
);

reset role;
select test_remember('church', (select id from churches where slug = 'church-hc'));

select test_set_auth_uid('f0000000-0000-0000-0000-000000000001');
select test_remember('actividad', (app.create_activity(
  test_id('church'),
  jsonb_build_object(
    'type', 'event', 'title', 'Jornada de puertas abiertas', 'schedule_kind', 'timed',
    'local_start', to_char(now() + interval '10 days', 'YYYY-MM-DD HH24:MI:SS'),
    'local_end', to_char(now() + interval '10 days 3 hours', 'YYYY-MM-DD HH24:MI:SS'),
    'timezone', 'Europe/Madrid', 'visibility', 'public_future'
  )
) ->> 'activity_id')::uuid);

select app.transition_activity_status(test_id('actividad'), 'planned');
select app.transition_activity_status(test_id('actividad'), 'published');

reset role;
insert into events (id, church_id, activity_id, public_slug, visibility, registration_enabled, capacity)
values ('f0000000-0000-0000-0000-0000000e0001', test_id('church'), test_id('actividad'),
        'jornada-hc', 'public', true, 50);
select test_remember('evento', 'f0000000-0000-0000-0000-0000000e0001');

-- ============================================================
-- 1. El token deja de guardarse en claro
-- ============================================================

select test_set_auth_uid('f0000000-0000-0000-0000-000000000001');

select test_put('token', (
  select cancel_token from app.register_for_event(
    test_id('evento'), 'individual', 'Marta Invitada', 'marta.hc@example.test',
    null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-marta'
  )
));

select isnt(test_get('token'), null, 'Al inscribirse se devuelve el token de cancelación');

select cmp_ok(length(test_get('token')), '>=', 32,
  'El token tiene longitud suficiente para no ser adivinable');

reset role;
select is(
  (select cancel_token from registrations where primary_email = 'marta.hc@example.test'),
  null,
  'El token NO se guarda en claro en la tabla: un volcado no entrega las cancelaciones de nadie'
);

select isnt(
  (select cancel_token_hash from registrations where primary_email = 'marta.hc@example.test'),
  null,
  'Se guarda solo su huella'
);

select isnt(
  (select cancel_token_expires_at from registrations where primary_email = 'marta.hc@example.test'),
  null,
  'Y una fecha de caducidad, que antes no existía'
);

-- La caducidad es el fin del evento (decisión de producto).
select ok(
  (select r.cancel_token_expires_at::date
   from registrations r where r.primary_email = 'marta.hc@example.test')
  = (select a.ends_at::date from activities a where a.id = test_id('actividad')),
  'El enlace vale hasta que termina el evento'
);

-- ============================================================
-- 2. La huella no viaja al cliente
-- ============================================================

select test_set_auth_uid('f0000000-0000-0000-0000-000000000001');

select is(
  test_err('select cancel_token_hash from registrations limit 1'),
  '42501',
  'La huella del token no es legible ni para quien gestiona el evento'
);

select is(
  test_err('select registration_code, primary_name, status from registrations limit 1'),
  null,
  'El resto de la inscripción sí se lee con normalidad'
);

-- ============================================================
-- 3. Cancelar con el token bueno funciona, y el enlace se gasta
-- ============================================================

select lives_ok(
  format($$ select * from app.cancel_registration_by_token(%L, 'No puedo ir') $$, test_get('token')),
  'Con el token correcto se cancela'
);

reset role;
select is(
  (select status::text from registrations where primary_email = 'marta.hc@example.test'),
  'cancelled',
  'La inscripción queda cancelada'
);

select is(
  (select cancel_token_hash from registrations where primary_email = 'marta.hc@example.test'),
  null,
  'El enlace se gasta al usarlo: la huella desaparece'
);

select test_set_auth_uid('f0000000-0000-0000-0000-000000000001');
select is(
  test_err(format($$ select * from app.cancel_registration_by_token(%L, null) $$, test_get('token'))),
  'P0002',
  'Reutilizar el mismo enlace ya no encuentra nada'
);

-- ============================================================
-- 4. Un token inventado o caducado no cancela
-- ============================================================

select is(
  test_err($$ select * from app.cancel_registration_by_token('token-inventado-que-no-existe-0000', null) $$),
  'P0002',
  'Un token inventado no cancela nada'
);

select is(
  test_err($$ select * from app.cancel_registration_by_token('corto', null) $$),
  'P0002',
  'Un token demasiado corto se rechaza sin consultar siquiera'
);

-- Segunda inscripción, con el enlace caducado a mano.
select test_put('token2', (
  select cancel_token from app.register_for_event(
    test_id('evento'), 'individual', 'Luis Tardío', 'luis.hc@example.test',
    null, null, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'idem-luis'
  )
));

reset role;
update registrations set cancel_token_expires_at = now() - interval '1 day'
where primary_email = 'luis.hc@example.test';

select test_set_auth_uid('f0000000-0000-0000-0000-000000000001');
select is(
  test_err(format($$ select * from app.cancel_registration_by_token(%L, null) $$, test_get('token2'))),
  '22023',
  'Un enlace caducado se rechaza, y con un error distinto del de «no existe»'
);

reset role;
select is(
  (select status::text from registrations where primary_email = 'luis.hc@example.test'),
  'confirmed',
  'Y la inscripción sigue en pie: el enlace caducado no la toca'
);

-- ============================================================
-- 5. Los avisos de la Fase 6 ya tienen texto propio
-- ============================================================
-- Se insertan eventos de verdad en la outbox: así se comprueba a la vez que el
-- check de tipos los acepta y que el despachador les da su texto.

reset role;

insert into notification_events (church_id, event_type, entity_type, entity_id, idempotency_key, recipient_person_ids, payload) values
  (test_id('church'), 'registration.confirmed', 'registrations', test_id('evento'), 'hc-1', array[(select person_id from church_people where church_id = test_id('church') limit 1)]::uuid[],
   jsonb_build_object('event_title', 'Jornada de puertas abiertas')),
  (test_id('church'), 'registration.waitlisted', 'registrations', test_id('evento'), 'hc-2', array[(select person_id from church_people where church_id = test_id('church') limit 1)]::uuid[],
   jsonb_build_object('event_title', 'Jornada de puertas abiertas')),
  (test_id('church'), 'event.cancelled', 'events', test_id('evento'), 'hc-3', array[(select person_id from church_people where church_id = test_id('church') limit 1)]::uuid[],
   jsonb_build_object('event_title', 'Jornada de puertas abiertas')),
  (test_id('church'), 'assignment.proposed', 'activity_assignments', test_id('actividad'), 'hc-4', array[(select person_id from church_people where church_id = test_id('church') limit 1)]::uuid[],
   jsonb_build_object('position_name', 'Sonido', 'activity_title', 'Culto')),
  (test_id('church'), 'group.member.added', 'group_members', test_id('church'), 'hc-5', array[(select person_id from church_people where church_id = test_id('church') limit 1)]::uuid[],
   jsonb_build_object('group_name', 'Célula Norte'));

select is(
  (select app.notification_text(e.*) ->> 'title' from notification_events e where e.idempotency_key = 'hc-1'),
  'Inscripción confirmada',
  'Una inscripción confirmada ya no llega como «Aviso»'
);

select is(
  (select app.notification_text(e.*) ->> 'title' from notification_events e where e.idempotency_key = 'hc-2'),
  'Estás en lista de espera',
  'La lista de espera tiene su propio texto'
);

select is(
  (select app.notification_text(e.*) ->> 'title' from notification_events e where e.idempotency_key = 'hc-3'),
  'Evento cancelado',
  'La cancelación de un evento también'
);

select ok(
  (select app.notification_text(e.*) ->> 'body' from notification_events e where e.idempotency_key = 'hc-1')
    like '%Jornada de puertas abiertas%',
  'Y el cuerpo dice de qué evento se trata, no «una actividad»'
);

-- Y no se ha roto lo de las demás fases.
select is(
  (select app.notification_text(e.*) ->> 'title' from notification_events e where e.idempotency_key = 'hc-4'),
  'Turno por confirmar',
  'Los textos de la Fase 5 siguen igual'
);

select is(
  (select app.notification_text(e.*) ->> 'title' from notification_events e where e.idempotency_key = 'hc-5'),
  'Te han incorporado a un grupo',
  'Y los de la Fase 7 también'
);

select * from finish();
rollback;
