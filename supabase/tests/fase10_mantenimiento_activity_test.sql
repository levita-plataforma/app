-- Fase 10 · Mantenimiento y reconciliación con Activity.
--
-- Las dos cosas que esta suite tiene que demostrar y que no demuestra ninguna
-- otra: que un mantenimiento que bloquea compite por la franja igual que una
-- reserva —no en un carril separado donde puedan cruzarse—, y que una actividad
-- no puede moverse dejando su sala atrás.

begin;
select plan(22);

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

create table if not exists t_ids (k text primary key, v uuid);
create or replace function t_set(p_k text, p_v uuid) returns uuid as $$
  insert into t_ids values (p_k, p_v) on conflict (k) do update set v = excluded.v returning v;
$$ language sql;
create or replace function t_id(p_k text) returns uuid as $$ select v from t_ids where k = p_k; $$ language sql;

insert into auth.users (id, email) values
  ('f2000000-0000-0000-0000-000000000001', 'owner.f10m@example.test');

select test_set_auth_uid('f2000000-0000-0000-0000-000000000001');
select * from app.provision_church(
  'Iglesia F10 M', 'iglesia-f10-m', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'F10M', 'owner.f10m@example.test', null, 'Sede M', null, null, null, null,
  array['people', 'serving', 'facilities'], null
);

reset role;
select t_set('church', (select id from churches where slug = 'iglesia-f10-m'));

select test_set_auth_uid('f2000000-0000-0000-0000-000000000001');

select t_set('sala', app.save_resource(t_id('church'), jsonb_build_object(
  'name', 'Sala polivalente', 'type', 'room'
)));

-- ============================================================
-- 1. Un mantenimiento que bloquea ocupa el recurso
-- ============================================================
select t_set('mant1', app.save_maintenance(t_id('church'), jsonb_build_object(
  'resource_id', t_id('sala'), 'type', 'revision', 'title', 'Revisión del aire acondicionado',
  'starts_at', '2026-11-02T08:00:00+01', 'ends_at', '2026-11-02T14:00:00+01'
)));

select is(
  (select count(*)::int from resource_occupancy where maintenance_id = t_id('mant1')),
  1,
  'Un mantenimiento que bloquea ocupa el recurso'
);

select is(
  (select source::text from resource_occupancy where maintenance_id = t_id('mant1')),
  'maintenance',
  'Y su ocupación queda marcada como de mantenimiento, no como reserva'
);

-- El cruce que dos restricciones separadas no habrían visto.
select is(
  t_err(format($$ select app.create_reservation(%L, jsonb_build_object(
    'resource_id', %L, 'starts_at', '2026-11-02T10:00:00+01',
    'ends_at', '2026-11-02T12:00:00+01', 'purpose', 'Reunión')) $$,
    t_id('church'), t_id('sala'))),
  '23P01',
  'No se puede reservar una sala durante su mantenimiento: reservas y mantenimientos comparten capa de ocupación'
);

select is(
  (select count(*)::int from resource_reservations where resource_id = t_id('sala')),
  0,
  'Y esa reserva no llega a existir: no queda una fila huérfana sin ocupación'
);

-- Al revés: primero la reserva, luego el mantenimiento encima.
select t_set('reserva_tarde', app.create_reservation(t_id('church'), jsonb_build_object(
  'resource_id', t_id('sala'), 'starts_at', '2026-11-03T17:00:00+01',
  'ends_at', '2026-11-03T19:00:00+01', 'purpose', 'Ensayo'
)));

select is(
  t_err(format($$ select app.save_maintenance(%L, jsonb_build_object(
    'resource_id', %L, 'type', 'limpieza', 'title', 'Limpieza a fondo',
    'starts_at', '2026-11-03T18:00:00+01', 'ends_at', '2026-11-03T20:00:00+01')) $$,
    t_id('church'), t_id('sala'))),
  '23P01',
  'Ni programar un mantenimiento encima de una reserva confirmada'
);

-- Un mantenimiento informativo no molesta a nadie.
select t_set('mant_info', app.save_maintenance(t_id('church'), jsonb_build_object(
  'resource_id', t_id('sala'), 'type', 'aviso', 'title', 'Pendiente de cambiar bombillas',
  'starts_at', '2026-11-03T17:30:00+01', 'ends_at', '2026-11-03T18:30:00+01',
  'blocks_availability', false
)));

select is(
  (select count(*)::int from resource_occupancy where maintenance_id = t_id('mant_info')),
  0,
  'Un mantenimiento que no bloquea no ocupa, aunque caiga sobre una reserva existente'
);

-- Cerrar el mantenimiento libera la sala.
select lives_ok(
  format($$ select app.complete_maintenance(%L, 'Filtros cambiados') $$, t_id('mant1')),
  'Se cierra el mantenimiento'
);

select is(
  (select count(*)::int from resource_occupancy where maintenance_id = t_id('mant1')),
  0,
  'Cerrarlo libera la franja: la intervención ya se hizo'
);

select is(
  (select status::text from resource_maintenance where id = t_id('mant1')),
  'completed',
  'Pero la fila sigue ahí: es el historial, no se borra'
);

select lives_ok(
  format($$ select app.create_reservation(%L, jsonb_build_object(
    'resource_id', %L, 'starts_at', '2026-11-02T10:00:00+01',
    'ends_at', '2026-11-02T12:00:00+01', 'purpose', 'Ahora sí')) $$,
    t_id('church'), t_id('sala')),
  'Y la franja liberada se puede reservar'
);

-- Dejar de bloquear libera; volver a bloquear vuelve a ocupar.
select t_set('mant2', app.save_maintenance(t_id('church'), jsonb_build_object(
  'resource_id', t_id('sala'), 'type', 'revision', 'title', 'Revisión eléctrica',
  'starts_at', '2026-11-10T09:00:00+01', 'ends_at', '2026-11-10T11:00:00+01'
)));

select lives_ok(
  format($$ select app.save_maintenance(%L, jsonb_build_object(
    'id', %L, 'blocks_availability', false)) $$, t_id('church'), t_id('mant2')),
  'Se puede pasar un mantenimiento a informativo'
);

select is(
  (select count(*)::int from resource_occupancy where maintenance_id = t_id('mant2')),
  0,
  'Y al dejar de bloquear, suelta la franja'
);

select lives_ok(
  format($$ select app.save_maintenance(%L, jsonb_build_object(
    'id', %L, 'blocks_availability', true)) $$, t_id('church'), t_id('mant2')),
  'Y volver a ponerlo bloqueante'
);

select is(
  (select count(*)::int from resource_occupancy where maintenance_id = t_id('mant2')),
  1,
  'Que vuelve a ocupar'
);

-- ============================================================
-- 2. Reconciliación con Activity
-- ============================================================
select t_set('actividad', (app.create_activity(
  t_id('church'),
  jsonb_build_object(
    'type', 'meeting', 'title', 'Reunión de liderazgo', 'schedule_kind', 'timed',
    'local_start', '2026-12-05 10:00:00', 'local_end', '2026-12-05 12:00:00',
    'timezone', 'Europe/Madrid'
  )
) ->> 'activity_id')::uuid);

select t_set('sala2', app.save_resource(t_id('church'), jsonb_build_object(
  'name', 'Aula 2', 'type', 'room'
)));

select t_set('res_act', app.create_reservation(t_id('church'), jsonb_build_object(
  'resource_id', t_id('sala2'), 'activity_id', t_id('actividad'), 'purpose', 'Reunión'
)));

select is(
  (select starts_at from resource_reservations where id = t_id('res_act')),
  (select starts_at from activities where id = t_id('actividad')),
  'La reserva vinculada toma su horario de la actividad, no de lo que envíe el cliente'
);

select is(
  t_err(format($$ select app.update_reservation(%L, jsonb_build_object(
    'starts_at', '2026-12-05T15:00:00+01', 'ends_at', '2026-12-05T17:00:00+01')) $$, t_id('res_act'))),
  '22023',
  'Y no se le puede cambiar la hora por su cuenta: mandaría dos horarios distintos a la vez'
);

-- Mover la actividad arrastra la reserva. Se escribe sin el rol authenticated
-- porque la escritura directa sobre activities está revocada; lo que se prueba
-- aquí es el trigger, no el permiso.
reset role;
update activities
set starts_at = '2026-12-05T16:00:00+01', ends_at = '2026-12-05T18:00:00+01'
where id = t_id('actividad');
select test_set_auth_uid('f2000000-0000-0000-0000-000000000001');

select is(
  (select starts_at from resource_reservations where id = t_id('res_act')),
  '2026-12-05T16:00:00+01'::timestamptz,
  'Mover la actividad mueve su reserva'
);

select is(
  (select lower(during) from resource_occupancy where reservation_id = t_id('res_act')),
  '2026-12-05T16:00:00+01'::timestamptz,
  'Y con ella la ocupación de la sala'
);

-- Y si el horario nuevo choca, no se mueve nada.
select t_set('res_bloqueo', app.create_reservation(t_id('church'), jsonb_build_object(
  'resource_id', t_id('sala2'), 'starts_at', '2026-12-05T20:00:00+01',
  'ends_at', '2026-12-05T22:00:00+01', 'purpose', 'Otra cosa en la misma sala'
)));

reset role;
select is(
  t_err(format($$ update activities set starts_at = '2026-12-05T20:30:00+01',
                  ends_at = '2026-12-05T21:30:00+01' where id = %L $$, t_id('actividad'))),
  '23P01',
  'Mover una actividad a una hora en la que su sala está ocupada falla: no se mueve dejando la sala atrás'
);

select is(
  (select starts_at from activities where id = t_id('actividad')),
  '2026-12-05T16:00:00+01'::timestamptz,
  'Y la actividad conserva su horario: el cambio entero se deshace, no a medias'
);

-- Cancelar la actividad cancela su reserva.
update activities set status = 'cancelled' where id = t_id('actividad');
select test_set_auth_uid('f2000000-0000-0000-0000-000000000001');

select is(
  (select status::text from resource_reservations where id = t_id('res_act')),
  'cancelled',
  'Cancelar la actividad cancela su reserva'
);

select is(
  (select count(*)::int from resource_occupancy where reservation_id = t_id('res_act')),
  0,
  'Y libera la sala en la misma transacción: nadie se queda con una sala bloqueada por algo que no va a pasar'
);

reset role;

select * from finish();
rollback;
