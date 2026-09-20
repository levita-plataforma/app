-- Fase 10 · Catálogo de recursos y reservas.
--
-- Lo que de verdad hay que demostrar aquí no es que la RPC devuelva un uuid,
-- sino que dos usos no pueden pisarse. La prueba de que eso aguanta con
-- transacciones simultáneas no cabe en pgTAP —una suite corre en una sola
-- sesión— y vive en supabase/tests/concurrencia/reservas.mjs, que se ejecuta
-- aparte. Aquí se cubre todo lo demás.

begin;
select plan(38);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function t_err(p_sql text) returns text as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$ language plpgsql;

create or replace function t_msg(p_sql text) returns text as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end;
$$ language plpgsql;

create table if not exists t_ids (k text primary key, v uuid);
create or replace function t_set(p_k text, p_v uuid) returns uuid as $$
  insert into t_ids values (p_k, p_v) on conflict (k) do update set v = excluded.v returning v;
$$ language sql;
create or replace function t_id(p_k text) returns uuid as $$ select v from t_ids where k = p_k; $$ language sql;

insert into auth.users (id, email) values
  ('f1000000-0000-0000-0000-000000000001', 'owner.f10@example.test'),
  ('f1000000-0000-0000-0000-000000000002', 'lider.f10@example.test'),
  ('f1000000-0000-0000-0000-000000000003', 'miembro.f10@example.test'),
  ('f1000000-0000-0000-0000-000000000004', 'otra.f10@example.test');

select test_set_auth_uid('f1000000-0000-0000-0000-000000000001');
select * from app.provision_church(
  'Iglesia F10', 'iglesia-f10', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'F10', 'owner.f10@example.test', null, 'Sede Centro', null, null, null, null,
  array['people', 'facilities'], null
);

select test_set_auth_uid('f1000000-0000-0000-0000-000000000004');
select * from app.provision_church(
  'Iglesia F10 B', 'iglesia-f10-b', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Otra', 'F10B', 'otra.f10@example.test', null, 'Sede B', null, null, null, null,
  array['people', 'facilities'], null
);

reset role;

select t_set('church', (select id from churches where slug = 'iglesia-f10'));
select t_set('church_b', (select id from churches where slug = 'iglesia-f10-b'));
select t_set('campus', (select id from campuses where church_id = t_id('church') limit 1));

-- Un líder de ministerio (puede reservar, no administra) y un miembro raso.
insert into people (id, first_name, last_name, user_id, source) values
  ('f1000000-0000-0000-0000-0000000e0002', 'Lider', 'Ministerio', 'f1000000-0000-0000-0000-000000000002', 'manual'),
  ('f1000000-0000-0000-0000-0000000e0003', 'Miembro', 'Raso', 'f1000000-0000-0000-0000-000000000003', 'manual');

insert into church_people (church_id, person_id, relationship, source) values
  (t_id('church'), 'f1000000-0000-0000-0000-0000000e0002', 'member', 'manual'),
  (t_id('church'), 'f1000000-0000-0000-0000-0000000e0003', 'member', 'manual');

insert into church_people_roles (church_id, church_people_id, role_key, scope_type)
select t_id('church'), cp.id, 'ministry_leader', 'church'
from church_people cp where cp.person_id = 'f1000000-0000-0000-0000-0000000e0002';

insert into church_people_roles (church_id, church_people_id, role_key, scope_type)
select t_id('church'), cp.id, 'member', 'church'
from church_people cp where cp.person_id = 'f1000000-0000-0000-0000-0000000e0003';

-- ============================================================
-- 1. Catálogo
-- ============================================================
select test_set_auth_uid('f1000000-0000-0000-0000-000000000001');

select t_set('auditorio', app.save_resource(t_id('church'), jsonb_build_object(
  'name', 'Auditorio', 'type', 'room', 'capacity', 300, 'campus_id', t_id('campus')
)));

select ok(t_id('auditorio') is not null, 'Se crea un recurso de tipo sala');

select is(
  (select capacity from resources where id = t_id('auditorio')),
  300,
  'El aforo se guarda'
);

select t_set('proyector', app.save_resource(t_id('church'), jsonb_build_object(
  'name', 'Proyector portátil', 'type', 'equipment'
)));

select is(
  (select campus_id from resources where id = t_id('proyector')),
  null,
  'Un recurso puede no tener sede: el proyector se mueve entre ellas'
);

select is(
  t_err(format($$ select app.save_resource(%L, '{"name":"Sin tipo"}'::jsonb) $$, t_id('church'))),
  '22023',
  'Un recurso sin tipo no se crea'
);

-- Un miembro raso no administra el catálogo.
select test_set_auth_uid('f1000000-0000-0000-0000-000000000003');
select is(
  t_err(format($$ select app.save_resource(%L, '{"name":"Mio","type":"other"}'::jsonb) $$, t_id('church'))),
  '42501',
  'Un miembro sin permiso no crea recursos'
);

-- ============================================================
-- 2. Reservar
-- ============================================================
select test_set_auth_uid('f1000000-0000-0000-0000-000000000002');

select t_set('reserva1', app.create_reservation(t_id('church'), jsonb_build_object(
  'resource_id', t_id('auditorio'),
  'starts_at', '2026-10-04T10:00:00+02',
  'ends_at', '2026-10-04T12:00:00+02',
  'purpose', 'Ensayo de alabanza'
)));

select is(
  (select status::text from resource_reservations where id = t_id('reserva1')),
  'confirmed',
  'Sin aprobación configurada, la reserva nace confirmada'
);

select is(
  (select count(*)::int from resource_occupancy where reservation_id = t_id('reserva1')),
  1,
  'Una reserva confirmada ocupa el recurso'
);

select is(
  (select requested_by from resource_reservations where id = t_id('reserva1')),
  'f1000000-0000-0000-0000-0000000e0002'::uuid,
  'Quien pide la reserva se resuelve del contexto, no del dato enviado'
);

-- El choque.
select is(
  t_err(format($$ select app.create_reservation(%L, jsonb_build_object(
    'resource_id', %L, 'starts_at', '2026-10-04T11:00:00+02',
    'ends_at', '2026-10-04T13:00:00+02', 'purpose', 'Reunión de jóvenes')) $$,
    t_id('church'), t_id('auditorio'))),
  '23P01',
  'Dos reservas solapadas del mismo recurso no pueden coexistir'
);

select matches(
  t_msg(format($$ select app.create_reservation(%L, jsonb_build_object(
    'resource_id', %L, 'starts_at', '2026-10-04T11:00:00+02',
    'ends_at', '2026-10-04T13:00:00+02', 'purpose', 'Reunión de jóvenes')) $$,
    t_id('church'), t_id('auditorio'))),
  'Auditorio ya está ocupado de 04/10/2026 10:00 a 04/10/2026 12:00 por otra reserva',
  'El error dice qué franja choca, en hora local, y no de qué va lo que ocupa'
);

-- Adyacencia: 12:00 justo después de 10:00–12:00.
select t_set('reserva2', app.create_reservation(t_id('church'), jsonb_build_object(
  'resource_id', t_id('auditorio'),
  'starts_at', '2026-10-04T12:00:00+02',
  'ends_at', '2026-10-04T14:00:00+02',
  'purpose', 'Reunión de jóvenes'
)));

select ok(t_id('reserva2') is not null, 'Dos usos consecutivos que se tocan en el minuto no son conflicto');

-- Otro recurso a la misma hora.
select ok(
  app.create_reservation(t_id('church'), jsonb_build_object(
    'resource_id', t_id('proyector'),
    'starts_at', '2026-10-04T10:00:00+02',
    'ends_at', '2026-10-04T12:00:00+02',
    'purpose', 'Mismo ensayo, otro recurso')) is not null,
  'Dos recursos distintos pueden estar ocupados a la vez'
);

select is(
  t_err(format($$ select app.create_reservation(%L, jsonb_build_object(
    'resource_id', %L, 'starts_at', '2026-10-05T10:00:00+02',
    'ends_at', '2026-10-05T10:00:00+02', 'purpose', 'Vacía')) $$,
    t_id('church'), t_id('auditorio'))),
  '22023',
  'Una reserva que empieza y acaba a la vez no se acepta'
);

select is(
  t_err(format($$ select app.create_reservation(%L, jsonb_build_object(
    'resource_id', %L, 'starts_at', '2026-10-05T12:00:00+02',
    'ends_at', '2026-10-05T10:00:00+02', 'purpose', 'Al revés')) $$,
    t_id('church'), t_id('auditorio'))),
  '22023',
  'Una reserva que acaba antes de empezar tampoco'
);

select is(
  t_err(format($$ select app.create_reservation(%L, jsonb_build_object(
    'resource_id', %L, 'starts_at', '2026-10-06T10:00:00+02',
    'ends_at', '2026-10-06T12:00:00+02')) $$,
    t_id('church'), t_id('auditorio'))),
  '22023',
  'Una reserva sin propósito no se crea: nunca es anónima'
);

-- Un miembro raso no reserva.
select test_set_auth_uid('f1000000-0000-0000-0000-000000000003');
select is(
  t_err(format($$ select app.create_reservation(%L, jsonb_build_object(
    'resource_id', %L, 'starts_at', '2026-10-07T10:00:00+02',
    'ends_at', '2026-10-07T12:00:00+02', 'purpose', 'Cumpleaños')) $$,
    t_id('church'), t_id('auditorio'))),
  '42501',
  'Un miembro sin facilities.create_reservation no reserva'
);

select ok(
  app.resource_is_available(t_id('auditorio'), '2026-10-04T10:30:00+02', '2026-10-04T11:00:00+02') = false,
  'La consulta de disponibilidad ve ocupada la franja tomada'
);

select ok(
  app.resource_is_available(t_id('auditorio'), '2026-10-04T15:00:00+02', '2026-10-04T16:00:00+02'),
  'Y libre la que no lo está'
);

-- ============================================================
-- 3. Editar y cancelar
-- ============================================================
select test_set_auth_uid('f1000000-0000-0000-0000-000000000002');

select is(
  t_err(format($$ select app.update_reservation(%L, jsonb_build_object(
    'starts_at', '2026-10-04T12:30:00+02', 'ends_at', '2026-10-04T14:30:00+02')) $$, t_id('reserva1'))),
  '23P01',
  'Mover una reserva encima de otra falla, no se guarda a medias'
);

select is(
  (select starts_at from resource_reservations where id = t_id('reserva1')),
  '2026-10-04T10:00:00+02'::timestamptz,
  'Y la reserva conserva su horario original tras el intento fallido'
);

select is(
  t_err(format($$ select app.update_reservation(%L, jsonb_build_object('resource_id', %L)) $$,
    t_id('reserva1'), t_id('proyector'))),
  '22023',
  'No se cambia de recurso editando: eso es cancelar y reservar otra vez'
);

select lives_ok(
  format($$ select app.update_reservation(%L, jsonb_build_object(
    'starts_at', '2026-10-04T09:00:00+02', 'ends_at', '2026-10-04T11:00:00+02')) $$, t_id('reserva1')),
  'Mover a un hueco libre sí funciona'
);

select is(
  (select lower(during) from resource_occupancy where reservation_id = t_id('reserva1')),
  '2026-10-04T09:00:00+02'::timestamptz,
  'Y la ocupación se mueve con ella'
);

-- Una reserva ajena.
select test_set_auth_uid('f1000000-0000-0000-0000-000000000003');
select is(
  t_err(format($$ select app.cancel_reservation(%L, 'porque sí') $$, t_id('reserva1'))),
  '42501',
  'Nadie cancela la reserva de otra persona sin permiso de gestión'
);

select test_set_auth_uid('f1000000-0000-0000-0000-000000000002');
select lives_ok(
  format($$ select app.cancel_reservation(%L, 'Se suspende el ensayo') $$, t_id('reserva1')),
  'Quien la pidió puede cancelar la suya'
);

select is(
  (select count(*)::int from resource_occupancy where reservation_id = t_id('reserva1')),
  0,
  'Cancelar suelta la franja: el recurso vuelve a estar libre'
);

select ok(
  app.resource_is_available(t_id('auditorio'), '2026-10-04T09:00:00+02', '2026-10-04T11:00:00+02'),
  'Y la franja liberada se puede volver a reservar'
);

-- ============================================================
-- 4. Aprobación
-- ============================================================
select test_set_auth_uid('f1000000-0000-0000-0000-000000000001');

select t_set('sala_aprob', app.save_resource(t_id('church'), jsonb_build_object(
  'name', 'Sala de juntas', 'type', 'room', 'requires_approval', true
)));

select test_set_auth_uid('f1000000-0000-0000-0000-000000000002');

select t_set('pend1', app.create_reservation(t_id('church'), jsonb_build_object(
  'resource_id', t_id('sala_aprob'),
  'starts_at', '2026-10-08T10:00:00+02', 'ends_at', '2026-10-08T12:00:00+02',
  'purpose', 'Reunión de equipo'
)));

select is(
  (select status::text from resource_reservations where id = t_id('pend1')),
  'pending',
  'Un recurso con aprobación hace nacer la reserva pendiente'
);

select is(
  (select count(*)::int from resource_occupancy where reservation_id = t_id('pend1')),
  0,
  'Una reserva pendiente NO ocupa: el hueco sigue libre para quien lo confirme antes'
);

-- Dos pendientes solapadas conviven.
select t_set('pend2', app.create_reservation(t_id('church'), jsonb_build_object(
  'resource_id', t_id('sala_aprob'),
  'starts_at', '2026-10-08T11:00:00+02', 'ends_at', '2026-10-08T13:00:00+02',
  'purpose', 'Otra reunión'
)));

select ok(t_id('pend2') is not null, 'Dos pendientes solapadas pueden coexistir: nadie ha ganado todavía');

select is(
  t_err(format($$ select app.approve_reservation(%L) $$, t_id('pend1'))),
  '42501',
  'Quien no tiene facilities.approve_reservations no aprueba, aunque la reserva sea suya'
);

select test_set_auth_uid('f1000000-0000-0000-0000-000000000001');
select lives_ok(
  format($$ select app.approve_reservation(%L) $$, t_id('pend1')),
  'Quien puede aprobar, aprueba'
);

select is(
  t_err(format($$ select app.approve_reservation(%L) $$, t_id('pend2'))),
  '23P01',
  'Y la segunda pendiente solapada ya no se puede confirmar: el conflicto se decide aquí'
);

select is(
  (select status::text from resource_reservations where id = t_id('pend2')),
  'pending',
  'La que no cupo sigue pendiente, no se queda en un estado a medias'
);

-- ============================================================
-- 5. Archivar
-- ============================================================
select is(
  t_err(format($$ select app.archive_resource(%L) $$, t_id('sala_aprob'))),
  '22023',
  'No se archiva un recurso con reservas futuras: se bloquea, no se avisa y se archiva igual'
);

select is(
  t_err(format($$ select app.delete_resource(%L) $$, t_id('auditorio'))),
  '22023',
  'Ni se borra uno con historial: para eso está el archivado'
);

-- ============================================================
-- 6. Aislamiento entre iglesias
-- ============================================================
select test_set_auth_uid('f1000000-0000-0000-0000-000000000004');

select is(
  t_err(format($$ select app.create_reservation(%L, jsonb_build_object(
    'resource_id', %L, 'starts_at', '2026-11-04T10:00:00+02',
    'ends_at', '2026-11-04T12:00:00+02', 'purpose', 'Intruso')) $$,
    t_id('church_b'), t_id('auditorio'))),
  'P0002',
  'Un recurso de otra iglesia no existe para quien pregunta desde la suya'
);

select is(
  (select count(*)::int from resources where church_id = t_id('church')),
  0,
  'Y el catálogo ajeno no se lee: RLS no devuelve ni una fila'
);

reset role;

select * from finish();
rollback;
