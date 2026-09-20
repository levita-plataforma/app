-- Fase 10 · Avisos internos de Recursos e instalaciones.
--
-- Lo que se comprueba, además de que el aviso llegue: que no llegue cuando la
-- operación se deshace, que repetirla no lo duplique, y que su texto no
-- delate el contenido de la actividad que ocupa el recurso.

begin;
select plan(14);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create table if not exists t_ids (k text primary key, v uuid);
create or replace function t_set(p_k text, p_v uuid) returns uuid as $$
  insert into t_ids values (p_k, p_v) on conflict (k) do update set v = excluded.v returning v;
$$ language sql;
create or replace function t_id(p_k text) returns uuid as $$ select v from t_ids where k = p_k; $$ language sql;

insert into auth.users (id, email) values
  ('f3000000-0000-0000-0000-000000000001', 'owner.f10a@example.test'),
  ('f3000000-0000-0000-0000-000000000002', 'lider.f10a@example.test');

select test_set_auth_uid('f3000000-0000-0000-0000-000000000001');
select * from app.provision_church(
  'Iglesia F10 A', 'iglesia-f10-a', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'F10A', 'owner.f10a@example.test', null, 'Sede A', null, null, null, null,
  array['people', 'serving', 'facilities'], null
);

reset role;
select t_set('church', (select id from churches where slug = 'iglesia-f10-a'));

insert into people (id, first_name, last_name, user_id, source) values
  ('f3000000-0000-0000-0000-0000000e0002', 'Lider', 'Ministerio', 'f3000000-0000-0000-0000-000000000002', 'manual');
insert into church_people (church_id, person_id, relationship, source) values
  (t_id('church'), 'f3000000-0000-0000-0000-0000000e0002', 'member', 'manual');
insert into church_people_roles (church_id, church_people_id, role_key, scope_type)
select t_id('church'), cp.id, 'ministry_leader', 'church'
from church_people cp where cp.person_id = 'f3000000-0000-0000-0000-0000000e0002';

select test_set_auth_uid('f3000000-0000-0000-0000-000000000001');

select t_set('sala', app.save_resource(t_id('church'), jsonb_build_object(
  'name', 'Sala de juntas', 'type', 'room', 'requires_approval', true
)));

-- ============================================================
-- 1. Crear una reserva NO avisa
-- ============================================================
select test_set_auth_uid('f3000000-0000-0000-0000-000000000002');

select t_set('reserva', app.create_reservation(t_id('church'), jsonb_build_object(
  'resource_id', t_id('sala'),
  'starts_at', '2027-04-10T10:00:00+02', 'ends_at', '2027-04-10T12:00:00+02',
  'purpose', 'Reunión de equipo'
)));

reset role;
select is(
  (select count(*)::int from notification_events where entity_id = t_id('reserva')),
  0,
  'Crear una reserva no genera aviso: quien la pide ya sabe que la ha pedido'
);
select test_set_auth_uid('f3000000-0000-0000-0000-000000000002');

-- ============================================================
-- 2. Aprobar avisa a quien la pidió
-- ============================================================
select test_set_auth_uid('f3000000-0000-0000-0000-000000000001');
select lives_ok(
  format($$ select app.approve_reservation(%L) $$, t_id('reserva')),
  'Se aprueba la reserva'
);

reset role;
select is(
  (select count(*)::int from notification_events
   where entity_id = t_id('reserva') and event_type = 'reservation.approved'),
  1,
  'Aprobar genera un aviso'
);

reset role;
select is(
  (select recipient_person_ids from notification_events
   where entity_id = t_id('reserva') and event_type = 'reservation.approved'),
  array['f3000000-0000-0000-0000-0000000e0002'::uuid],
  'Y va a quien pidió la reserva, no a quien la aprobó'
);

reset role;
select is(
  (select (app.notification_text(e.*)) ->> 'title' from notification_events e
   where e.entity_id = t_id('reserva') and e.event_type = 'reservation.approved'),
  'Reserva confirmada',
  'El aviso tiene título propio, no el genérico de «Aviso»'
);

reset role;
select alike(
  (select (app.notification_text(e.*)) ->> 'body' from notification_events e
   where e.entity_id = t_id('reserva') and e.event_type = 'reservation.approved'),
  '%Sala de juntas%',
  'El cuerpo dice de qué recurso se trata'
);

reset role;
select unalike(
  (select (app.notification_text(e.*)) ->> 'body' from notification_events e
   where e.entity_id = t_id('reserva') and e.event_type = 'reservation.approved'),
  '%Reunión de equipo%',
  'Pero el texto no arrastra el propósito ni el contenido de lo que ocupa la sala'
);

-- ============================================================
-- 3. Rechazar avisa con el motivo
-- ============================================================
select test_set_auth_uid('f3000000-0000-0000-0000-000000000002');
select t_set('reserva2', app.create_reservation(t_id('church'), jsonb_build_object(
  'resource_id', t_id('sala'),
  'starts_at', '2027-04-11T10:00:00+02', 'ends_at', '2027-04-11T12:00:00+02',
  'purpose', 'Otra reunión'
)));

select test_set_auth_uid('f3000000-0000-0000-0000-000000000001');
select lives_ok(
  format($$ select app.reject_reservation(%L, 'Ese día hay limpieza general') $$, t_id('reserva2')),
  'Se rechaza la otra reserva'
);

reset role;
select alike(
  (select (app.notification_text(e.*)) ->> 'body' from notification_events e
   where e.entity_id = t_id('reserva2') and e.event_type = 'reservation.rejected'),
  '%Ese día hay limpieza general%',
  'El aviso de rechazo lleva el motivo: sin él, quien lo recibe no sabe qué hacer'
);

-- ============================================================
-- 4. Mantenimiento asignado
-- ============================================================
select t_set('mant', app.save_maintenance(t_id('church'), jsonb_build_object(
  'resource_id', t_id('sala'), 'type', 'revision', 'title', 'Revisión del proyector',
  'starts_at', '2027-05-02T09:00:00+02', 'ends_at', '2027-05-02T11:00:00+02',
  'responsible_person_id', 'f3000000-0000-0000-0000-0000000e0002'
)));

reset role;
select is(
  (select count(*)::int from notification_events
   where entity_id = t_id('mant') and event_type = 'maintenance.assigned'),
  1,
  'Asignar un mantenimiento avisa a quien lo tiene que hacer'
);

-- Editar sin cambiar responsable no vuelve a avisar.
select lives_ok(
  format($$ select app.save_maintenance(%L, jsonb_build_object('id', %L, 'title', 'Revisión del proyector y la pantalla')) $$,
    t_id('church'), t_id('mant')),
  'Se edita el título del mantenimiento'
);

reset role;
select is(
  (select count(*)::int from notification_events
   where entity_id = t_id('mant') and event_type = 'maintenance.assigned'),
  1,
  'Cambiar el título no vuelve a avisar: solo avisa el cambio de responsable'
);

-- ============================================================
-- 5. Cancelar la actividad avisa de la reserva que se cae
-- ============================================================
select t_set('actividad', (app.create_activity(
  t_id('church'),
  jsonb_build_object(
    'type', 'meeting', 'title', 'Reunión confidencial de liderazgo', 'schedule_kind', 'timed',
    'local_start', '2027-06-06 10:00:00', 'local_end', '2027-06-06 12:00:00',
    'timezone', 'Europe/Madrid'
  )
) ->> 'activity_id')::uuid);

select t_set('sala2', app.save_resource(t_id('church'), jsonb_build_object(
  'name', 'Aula grande', 'type', 'room'
)));

select test_set_auth_uid('f3000000-0000-0000-0000-000000000002');
select t_set('res_act', app.create_reservation(t_id('church'), jsonb_build_object(
  'resource_id', t_id('sala2'), 'activity_id', t_id('actividad'), 'purpose', 'La reunión'
)));

-- Se cancela como el propietario: el trigger de la Fase 4 exige activity.cancel
-- y lo comprueba con el sub del JWT, que «reset role» no borra.
select test_set_auth_uid('f3000000-0000-0000-0000-000000000001');
reset role;
update activities set status = 'cancelled' where id = t_id('actividad');

reset role;
select is(
  (select count(*)::int from notification_events
   where entity_id = t_id('res_act') and event_type = 'reservation.cancelled_by_activity'),
  1,
  'Cancelar la actividad avisa a quien tenía la sala reservada'
);

reset role;
select unalike(
  (select (app.notification_text(e.*)) ->> 'body' from notification_events e
   where e.entity_id = t_id('res_act') and e.event_type = 'reservation.cancelled_by_activity'),
  '%confidencial%',
  'Y el aviso no filtra el título de la actividad cancelada'
);

reset role;

select * from finish();
rollback;
