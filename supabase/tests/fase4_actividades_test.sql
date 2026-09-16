-- Fase 4 · Tests de actividades: alta, ciclo de vida, zona horaria, sedes,
-- organizador, estructura de servicio (áreas, puestos, requisitos), planning,
-- plantillas, snapshots, duplicación, auditoría, aislamiento y atomicidad.
-- Ver docs/adr/0017.

begin;
select plan(122);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

-- Almacén de identificadores entre sentencias (GUC local de la transacción).
create or replace function t_set(p_key text, p_value text) returns text as $$
  select set_config('t4a.' || p_key, coalesce(p_value, ''), true);
$$ language sql;

create or replace function t_id(p_key text) returns uuid as $$
  select nullif(current_setting('t4a.' || p_key, true), '')::uuid;
$$ language sql;

insert into auth.users (id, email) values
  ('a4000000-0000-0000-0000-000000000001', 'owner.p4a@example.test'),
  ('a4000000-0000-0000-0000-000000000002', 'owner.p4b@example.test');

-- Church A (Europe/Madrid) y Church B (America/Mexico_City)
select test_set_auth_uid('a4000000-0000-0000-0000-000000000001');
select t_set('church_a', out_church_id::text), t_set('campus_a1', out_campus_id::text)
from app.provision_church(
  'Church A P4', 'church-a-p4act', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'A4', 'owner.p4a@example.test', null, 'Sede A4', null, null, null, null,
  array['people', 'serving'], null
);

select test_set_auth_uid('a4000000-0000-0000-0000-000000000002');
select t_set('church_b', out_church_id::text), t_set('campus_b', out_campus_id::text)
from app.provision_church(
  'Church B P4', 'church-b-p4act', 'es-MX', 'America/Mexico_City', 'MXN', 'México',
  'Owner', 'B4', 'owner.p4b@example.test', null, 'Sede B4', null, null, null, null,
  array['people', 'serving'], null
);

reset role;

-- ============================================================
-- Setup de catálogo (superusuario)
-- ============================================================
insert into campuses (id, church_id, name, slug, timezone)
values ('a4000000-0000-0000-0000-0000000c0002', t_id('church_a'), 'Sede Norte', 'norte', 'Atlantic/Canary');

insert into people (id, first_name, last_name, source) values
  ('a4000000-0000-0000-0000-0000000e0001', 'Pedro', 'Activo', 'manual'),
  ('a4000000-0000-0000-0000-0000000e0002', 'Ana', 'Archivada', 'manual'),
  ('a4000000-0000-0000-0000-0000000e0003', 'Berta', 'OtraIglesia', 'manual');

insert into church_people (church_id, person_id, relationship, source, archived_at) values
  (t_id('church_a'), 'a4000000-0000-0000-0000-0000000e0001', 'member', 'manual', null),
  (t_id('church_a'), 'a4000000-0000-0000-0000-0000000e0002', 'member', 'manual', now()),
  (t_id('church_b'), 'a4000000-0000-0000-0000-0000000e0003', 'member', 'manual', null);

insert into service_areas (id, church_id, name, slug, active, campus_id) values
  ('a4000000-0000-0000-0000-0000000a0001', t_id('church_a'), 'Sonido', 'sonido', true, null),
  ('a4000000-0000-0000-0000-0000000a0002', t_id('church_a'), 'Multimedia', 'multimedia', true, null),
  ('a4000000-0000-0000-0000-0000000a0003', t_id('church_a'), 'Inactiva', 'inactiva', false, null),
  ('a4000000-0000-0000-0000-0000000a0004', t_id('church_a'), 'Sonido Norte', 'sonido-norte', true, 'a4000000-0000-0000-0000-0000000c0002'),
  ('a4000000-0000-0000-0000-0000000a0b01', t_id('church_b'), 'Sonido B', 'sonido-b', true, null);

insert into service_positions (id, church_id, service_area_id, campus_id, name, min_people, max_people, sort_order) values
  ('a4000000-0000-0000-0000-0000000b0001', t_id('church_a'), 'a4000000-0000-0000-0000-0000000a0001', null, 'FOH', 1, 2, 1),
  ('a4000000-0000-0000-0000-0000000b0002', t_id('church_a'), 'a4000000-0000-0000-0000-0000000a0001', null, 'Monitores', 1, null, 2),
  ('a4000000-0000-0000-0000-0000000b0004', t_id('church_a'), 'a4000000-0000-0000-0000-0000000a0001', 'a4000000-0000-0000-0000-0000000c0002', 'Cámara Norte', 1, null, 3),
  ('a4000000-0000-0000-0000-0000000b0003', t_id('church_a'), 'a4000000-0000-0000-0000-0000000a0002', null, 'Proyección', 1, 1, 1),
  ('a4000000-0000-0000-0000-0000000b0b01', t_id('church_b'), 'a4000000-0000-0000-0000-0000000a0b01', null, 'FOH B', 1, null, 1);

insert into qualifications (id, church_id, name) values
  ('a4000000-0000-0000-0000-0000000d0001', t_id('church_a'), 'Mesa'),
  ('a4000000-0000-0000-0000-0000000d0002', t_id('church_a'), 'Luces');

insert into position_requirements (church_id, service_position_id, requirement_type, strictness, qualification_id, min_level)
values (t_id('church_a'), 'a4000000-0000-0000-0000-0000000b0001', 'qualification', 'required', 'a4000000-0000-0000-0000-0000000d0001', 'basic');

-- ============================================================
-- 1. Alta de actividades
-- ============================================================
select test_set_auth_uid('a4000000-0000-0000-0000-000000000001');

select lives_ok(
  $$ select t_set('act1', public.create_activity(t_id('church_a'),
       '{"type":"service","title":"Culto","local_start":"2030-05-05T11:00","duration_minutes":90,"request_id":"a4000000-0000-0000-0000-0000000f0001"}'::jsonb) ->> 'activity_id') $$,
  'Crear actividad con horario funciona'
);

select ok(
  (select status = 'draft' and timezone = 'Europe/Madrid' and schedule_kind = 'timed'
      and starts_at = '2030-05-05 09:00+00' and ends_at = '2030-05-05 10:30+00'
   from activities where id = t_id('act1')),
  'La actividad nace en borrador, hereda la zona de la iglesia y convierte la hora local a instante'
);

select is(
  (select (public.create_activity(t_id('church_a'),
     '{"type":"service","title":"Culto","local_start":"2030-05-05T11:00","duration_minutes":90,"request_id":"a4000000-0000-0000-0000-0000000f0001"}'::jsonb) ->> 'activity_id')::uuid),
  t_id('act1'),
  'Reintentar el alta con el mismo request_id devuelve la misma actividad'
);

select lives_ok(
  $$ select t_set('task1', public.create_activity(t_id('church_a'),
       '{"type":"task","title":"Comprar café","schedule_kind":"flexible"}'::jsonb) ->> 'activity_id') $$,
  'Crear tarea flexible sin horario funciona'
);

select ok(
  (select schedule_kind = 'flexible' and starts_at is null and ends_at is null from activities where id = t_id('task1')),
  'La tarea flexible se guarda sin inicio ni fin'
);

select throws_ok(
  $$ select public.create_activity(t_id('church_a'), '{"type":"service","title":"Culto sin hora","schedule_kind":"flexible"}'::jsonb) $$,
  '22023', null,
  'Una actividad flexible que no es tarea se rechaza'
);

select throws_ok(
  $$ select public.create_activity(t_id('church_a'),
       '{"type":"meeting","title":"Mal rango","local_start":"2030-05-05T11:00","local_end":"2030-05-05T10:00"}'::jsonb) $$,
  '22023', null,
  'ends_at <= starts_at se rechaza'
);

-- ============================================================
-- 2. Zona horaria
-- ============================================================
select lives_ok(
  $$ select t_set('act_norte', public.create_activity(t_id('church_a'), jsonb_build_object(
       'type', 'meeting', 'title', 'Reunión Norte', 'campus_id', 'a4000000-0000-0000-0000-0000000c0002',
       'local_start', '2030-05-06T19:00', 'duration_minutes', 60)) ->> 'activity_id') $$,
  'Crear actividad en una sede válida funciona'
);

select ok(
  (select timezone = 'Atlantic/Canary' and campus_id = 'a4000000-0000-0000-0000-0000000c0002'
      and starts_at = '2030-05-06 18:00+00'
   from activities where id = t_id('act_norte')),
  'La actividad de sede hereda la zona de la sede (Atlantic/Canary)'
);

select throws_ok(
  $$ select public.create_activity(t_id('church_a'),
       '{"type":"meeting","title":"Zona mala","timezone":"Mars/Olympus","local_start":"2030-05-06T19:00","duration_minutes":60}'::jsonb) $$,
  '22023', null,
  'Una zona horaria explícita inválida se rechaza'
);

select test_set_auth_uid('a4000000-0000-0000-0000-000000000002');

select lives_ok(
  $$ select t_set('act_b', public.create_activity(t_id('church_b'),
       '{"type":"service","title":"Culto B","local_start":"2030-05-05T11:00","duration_minutes":60}'::jsonb) ->> 'activity_id') $$,
  'Church B crea su actividad'
);

select ok(
  (select timezone = 'America/Mexico_City' and starts_at = '2030-05-05 17:00+00' from activities where id = t_id('act_b')),
  'Sin zona en la sede, la actividad hereda la zona de la iglesia (America/Mexico_City)'
);

-- ============================================================
-- 3. Sedes
-- ============================================================
select test_set_auth_uid('a4000000-0000-0000-0000-000000000001');

select throws_ok(
  $$ select public.create_activity(t_id('church_a'), jsonb_build_object(
       'type', 'meeting', 'title', 'Sede ajena', 'campus_id', t_id('campus_b'),
       'local_start', '2030-05-06T19:00', 'duration_minutes', 60)) $$,
  '22023', null,
  'La sede de otra iglesia se rechaza'
);

select lives_ok(
  $$ select t_set('act_c1', public.create_activity(t_id('church_a'), jsonb_build_object(
       'type', 'service', 'title', 'Culto Sede A1', 'campus_id', t_id('campus_a1'),
       'local_start', '2030-05-12T11:00', 'duration_minutes', 90)) ->> 'activity_id') $$,
  'Crear actividad en la sede principal funciona'
);

select throws_ok(
  $$ select public.add_activity_area(t_id('act_c1'), 'a4000000-0000-0000-0000-0000000a0004') $$,
  '22023', null,
  'Un área de otra sede de la misma iglesia se rechaza en una actividad de sede'
);

select is(
  (select public.add_activity_area(t_id('act_c1'), 'a4000000-0000-0000-0000-0000000a0001') ->> 'positions_skipped')::int,
  1,
  'Al añadir un área global a una actividad de sede se omiten los puestos de otra sede'
);

select throws_ok(
  $$ select public.add_activity_position(
       (select id from activity_service_areas where activity_id = t_id('act_c1')),
       '{"service_position_id":"a4000000-0000-0000-0000-0000000b0004"}'::jsonb) $$,
  '22023', null,
  'Un puesto de catálogo de otra sede se rechaza en una actividad de sede'
);

select lives_ok(
  $$ select public.add_activity_area(t_id('act1'), 'a4000000-0000-0000-0000-0000000a0004') $$,
  'Un área de sede se admite en una actividad global'
);

select throws_ok(
  $$ select public.update_activity(t_id('act1'), jsonb_build_object('campus_id', t_id('campus_a1'))) $$,
  '22023', null,
  'Cambiar la sede de la actividad con estructura incompatible se rechaza'
);

-- ============================================================
-- 4. Organizador
-- ============================================================
select throws_ok(
  $$ select public.create_activity(t_id('church_a'),
       '{"type":"meeting","title":"Org ajeno","local_start":"2030-05-06T19:00","duration_minutes":60,"organizer_person_id":"a4000000-0000-0000-0000-0000000e0003"}'::jsonb) $$,
  '22023', null,
  'Crear con organizador de otra iglesia se rechaza'
);

select throws_ok(
  $$ select public.create_activity(t_id('church_a'),
       '{"type":"meeting","title":"Org archivado","local_start":"2030-05-06T19:00","duration_minutes":60,"organizer_person_id":"a4000000-0000-0000-0000-0000000e0002"}'::jsonb) $$,
  '22023', null,
  'Crear con organizador de pertenencia archivada se rechaza'
);

select throws_ok(
  $$ select public.update_activity(t_id('act1'), '{"organizer_person_id":"a4000000-0000-0000-0000-0000000e0003"}'::jsonb) $$,
  '22023', null,
  'Editar poniendo un organizador de otra iglesia se rechaza'
);

select lives_ok(
  $$ select public.update_activity(t_id('act1'), '{"organizer_person_id":"a4000000-0000-0000-0000-0000000e0001","title":"Culto dominical"}'::jsonb) $$,
  'Editar título y organizador válido funciona'
);

select ok(
  (select title = 'Culto dominical' and organizer_person_id = 'a4000000-0000-0000-0000-0000000e0001' from activities where id = t_id('act1')),
  'La edición queda guardada'
);

-- ============================================================
-- 5. Ciclo de vida
-- ============================================================
select t_set('act_block', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"Bloqueada","local_start":"2030-05-19T11:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select public.add_activity_area(t_id('act_block'), 'a4000000-0000-0000-0000-0000000a0002', 'required', null, false);

select ok(
  exists (select 1 from public.activity_structure_issues(t_id('act_block'))
          where code = 'required_area_without_positions' and severity = 'blocking'),
  'Un área obligatoria sin puestos es una incidencia bloqueante'
);

select throws_ok(
  $$ select public.transition_activity_status(t_id('act_block'), 'published') $$,
  '22023', null,
  'Publicar con un área obligatoria sin puestos se bloquea'
);

select t_set('act2', public.create_activity(t_id('church_a'),
  '{"type":"meeting","title":"Reunión líderes","local_start":"2030-06-01T19:00","duration_minutes":60}'::jsonb) ->> 'activity_id');

select throws_ok(
  $$ select public.transition_activity_status(t_id('act2'), 'completed') $$,
  '22023', null,
  'Transición no permitida draft -> completed se rechaza'
);

select lives_ok(
  $$ select public.transition_activity_status(t_id('act2'), 'published') $$,
  'Publicar una actividad sin bloqueos funciona'
);

select ok(
  (select status = 'published' and published_at is not null and published_by = 'a4000000-0000-0000-0000-000000000001'
   from activities where id = t_id('act2')),
  'La publicación fija published_at y published_by'
);

select throws_ok(
  $$ select public.transition_activity_status(t_id('act2'), 'completed') $$,
  '22023', null,
  'No se puede completar una actividad que todavía no ha empezado'
);

select lives_ok(
  $$ select public.transition_activity_status(t_id('act2'), 'cancelled', 'Lluvia') $$,
  'Cancelar con motivo funciona'
);

select ok(
  (select status = 'cancelled' and cancelled_at is not null and cancellation_reason = 'Lluvia'
      and cancelled_by = 'a4000000-0000-0000-0000-000000000001'
   from activities where id = t_id('act2')),
  'La cancelación guarda fecha, autor y motivo'
);

select throws_ok(
  $$ select public.update_activity(t_id('act2'), '{"title":"Cambio tras cancelar"}'::jsonb) $$,
  '22023', null,
  'Una actividad cancelada no admite cambios de contenido'
);

select throws_ok(
  $$ select public.add_activity_plan_item(t_id('act2'), '{"title":"Bloque"}'::jsonb) $$,
  '22023', null,
  'Una actividad cancelada no admite cambios de estructura ni planning'
);

select lives_ok(
  $$ select public.transition_activity_status(t_id('act2'), 'draft') $$,
  'Reactivar una cancelada (cancelled -> draft) funciona'
);

select ok(
  (select status = 'draft' and cancelled_at is null and cancellation_reason is null and published_at is null
   from activities where id = t_id('act2')),
  'Reactivar limpia los datos de cancelación y publicación'
);

select lives_ok(
  $$ select public.transition_activity_status(t_id('act2'), 'archived') $$,
  'Archivar funciona'
);

select ok(
  (select status = 'archived' and archived_at is not null and status_before_archive = 'draft'
   from activities where id = t_id('act2')),
  'Archivar guarda archived_at y el estado previo'
);

select throws_ok(
  $$ select public.transition_activity_status(t_id('act2'), 'published') $$,
  '22023', null,
  'Desarchivar a un estado distinto del previo se rechaza'
);

select lives_ok(
  $$ select public.transition_activity_status(t_id('act2'), 'draft') $$,
  'Desarchivar al estado previo funciona'
);

select ok(
  (select status = 'draft' and archived_at is null and status_before_archive is null from activities where id = t_id('act2')),
  'Desarchivar limpia archived_at y el estado previo'
);

-- Archivar una cancelada y desarchivarla conserva la cancelación.
select t_set('act3', public.create_activity(t_id('church_a'),
  '{"type":"meeting","title":"Cancelar y archivar","local_start":"2030-06-02T19:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select public.transition_activity_status(t_id('act3'), 'cancelled', 'Motivo original');
select public.transition_activity_status(t_id('act3'), 'archived');

select lives_ok(
  $$ select public.transition_activity_status(t_id('act3'), 'cancelled') $$,
  'Desarchivar una actividad cancelada vuelve a cancelled'
);

select is(
  (select cancellation_reason from activities where id = t_id('act3')),
  'Motivo original',
  'Desarchivar una cancelada conserva el motivo de cancelación'
);

reset role;
select ok(
  exists (select 1 from audit_logs where entity_id = t_id('act3') and action = 'activity.unarchived'
          and metadata ->> 'from' = 'archived' and metadata ->> 'to' = 'cancelled')
  and (select count(*) = 1 from audit_logs where entity_id = t_id('act3') and action = 'activity.cancelled')
  and not exists (select 1 from audit_logs where entity_id = t_id('act3')
                  and action in ('activity.status_changed', 'activity.completed')),
  'Desarchivar (archived -> cancelled) se audita como activity.unarchived, no como cancelación ni cambio de estado'
);
select test_set_auth_uid('a4000000-0000-0000-0000-000000000001');

-- Completar: actividad ya pasada (crear en el pasado está permitido).
select t_set('act_past', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"Culto pasado","local_start":"2020-01-05T11:00","duration_minutes":60}'::jsonb) ->> 'activity_id');
select public.transition_activity_status(t_id('act_past'), 'published');

select lives_ok(
  $$ select public.transition_activity_status(t_id('act_past'), 'completed') $$,
  'Completar una actividad publicada ya empezada funciona'
);

select ok(
  (select status = 'completed' and completed_at is not null from activities where id = t_id('act_past')),
  'Completar fija completed_at'
);

select throws_ok(
  $$ select public.update_activity(t_id('act_past'), '{"description":"cambio"}'::jsonb) $$,
  '22023', null,
  'Una actividad completada no admite cambios de contenido'
);

-- Actividad completada histórica (insertada sin usuario: now() de la
-- transacción no serviría para detectar que se reescribe completed_at).
reset role;
select set_config('request.jwt.claims', '', true);
insert into activities (id, church_id, type, title, starts_at, ends_at, timezone, status, published_at, completed_at)
values ('a4000000-0000-0000-0000-0000000f0c01', t_id('church_a'), 'service', 'Histórica completada',
        '2020-02-02 10:00+00', '2020-02-02 11:00+00', 'Europe/Madrid', 'completed', '2020-01-20 10:00+00', '2020-02-02 12:00+00');
select test_set_auth_uid('a4000000-0000-0000-0000-000000000001');
select public.transition_activity_status('a4000000-0000-0000-0000-0000000f0c01', 'archived');

select lives_ok(
  $$ select public.transition_activity_status('a4000000-0000-0000-0000-0000000f0c01', 'completed') $$,
  'Desarchivar una actividad completada vuelve a completed'
);

select is(
  (select completed_at from activities where id = 'a4000000-0000-0000-0000-0000000f0c01'),
  '2020-02-02 12:00+00'::timestamptz,
  'Desarchivar una completada conserva la fecha de completado original'
);

reset role;

select throws_ok(
  format($$ insert into activities (church_id, type, title, starts_at, ends_at, timezone, status, archived_at)
            values ('%s', 'meeting', 'Inconsistente', '2030-01-01 10:00+00', '2030-01-01 11:00+00', 'Europe/Madrid', 'draft', now()) $$,
         t_id('church_a')),
  '23514', null,
  'archived_at sin estado archived viola la consistencia estado/archivado'
);

-- ============================================================
-- 6. Aislamiento entre iglesias
-- ============================================================
select test_set_auth_uid('a4000000-0000-0000-0000-000000000002');

select throws_ok(
  $$ select public.update_activity(t_id('act1'), '{"title":"Hackeo"}'::jsonb) $$,
  'P0002', null,
  'Otra iglesia no puede editar la actividad (no existe para ella)'
);

select throws_ok(
  $$ select public.transition_activity_status(t_id('act1'), 'cancelled', 'x') $$,
  'P0002', null,
  'Otra iglesia no puede cambiar el estado de la actividad'
);

select throws_ok(
  $$ select public.duplicate_activity(t_id('act1')) $$,
  'P0002', null,
  'Otra iglesia no puede duplicar la actividad'
);

select throws_ok(
  $$ select public.create_activity(t_id('church_a'), '{"type":"meeting","title":"Intrusa","local_start":"2030-05-06T19:00","duration_minutes":60}'::jsonb) $$,
  '42501', null,
  'Otra iglesia no puede crear actividades en Church A'
);

select is(
  (select count(*)::int from activities where church_id = t_id('church_a')),
  0,
  'Otra iglesia no ve ninguna actividad de Church A'
);

select is(
  (select count(*)::int from activity_service_areas where church_id = t_id('church_a')),
  0,
  'Otra iglesia no ve la estructura de Church A'
);

-- ============================================================
-- 7. Áreas y puestos
-- ============================================================
select test_set_auth_uid('a4000000-0000-0000-0000-000000000001');

select t_set('act4', public.create_activity(t_id('church_a'),
  '{"type":"service","title":"Culto estructura","local_start":"2030-06-02T11:00","duration_minutes":120}'::jsonb) ->> 'activity_id');

select is(
  (select t_set('area1', r ->> 'activity_service_area_id') is not null and (r ->> 'positions_added')::int = 3
   from public.add_activity_area(t_id('act4'), 'a4000000-0000-0000-0000-0000000a0001') r),
  true,
  'Añadir un área válida copia sus puestos activos del catálogo'
);

select is(
  (select area_name from activity_service_areas where id = t_id('area1')),
  'Sonido',
  'El área guarda el nombre del catálogo como snapshot'
);

select throws_ok(
  $$ select public.add_activity_area(t_id('act4'), 'a4000000-0000-0000-0000-0000000a0001') $$,
  '23505', null,
  'Añadir dos veces la misma área es un conflicto'
);

select throws_ok(
  $$ select public.add_activity_area(t_id('act4'), 'a4000000-0000-0000-0000-0000000a0b01') $$,
  '22023', null,
  'Un área de otra iglesia se rechaza'
);

select throws_ok(
  $$ select public.add_activity_area(t_id('act4'), 'a4000000-0000-0000-0000-0000000a0003') $$,
  '22023', null,
  'Un área inactiva se rechaza'
);

select t_set('area2', public.add_activity_area(t_id('act4'), 'a4000000-0000-0000-0000-0000000a0002', 'optional', null, false) ->> 'activity_service_area_id');

select lives_ok(
  $$ select t_set('pos_proy', public.add_activity_position(t_id('area2'),
       '{"service_position_id":"a4000000-0000-0000-0000-0000000b0003","min_people":2,"max_people":4}'::jsonb)::text) $$,
  'Copiar un puesto del catálogo con mínimos y máximos propios funciona'
);

select ok(
  (select name = 'Proyección' and min_people = 2 and max_people = 4
      and catalog_snapshot ->> 'min_people' = '1' and catalog_snapshot ->> 'max_people' = '1'
      and snapshot_taken_at is not null
   from activity_positions where id = t_id('pos_proy')),
  'El override de min/max no altera el snapshot del catálogo'
);

select lives_ok(
  $$ select t_set('pos_adhoc', public.add_activity_position(t_id('area2'), '{"name":"Ayudante","min_people":0}'::jsonb)::text) $$,
  'Añadir un puesto ad-hoc funciona'
);

select ok(
  (select service_position_id is null and catalog_snapshot is null and min_people = 0 and max_people is null
      and service_area_id = 'a4000000-0000-0000-0000-0000000a0002'
   from activity_positions where id = t_id('pos_adhoc')),
  'El puesto ad-hoc no tiene origen de catálogo y hereda el área de catálogo del área padre'
);

select throws_ok(
  $$ select public.add_activity_position(t_id('area2'), '{"service_position_id":"a4000000-0000-0000-0000-0000000b0b01"}'::jsonb) $$,
  '22023', null,
  'Un puesto de otra iglesia se rechaza'
);

reset role;
insert into service_positions (id, church_id, service_area_id, name, min_people)
values ('a4000000-0000-0000-0000-0000000b0006', t_id('church_a'), 'a4000000-0000-0000-0000-0000000a0002', 'Streaming', 1);
select test_set_auth_uid('a4000000-0000-0000-0000-000000000001');

select throws_ok(
  $$ select public.add_activity_position(t_id('area1'), '{"service_position_id":"a4000000-0000-0000-0000-0000000b0006"}'::jsonb) $$,
  '22023', null,
  'Un puesto de catálogo de otra área se rechaza'
);

select throws_ok(
  $$ select public.add_activity_position(t_id('area2'), '{"service_position_id":"a4000000-0000-0000-0000-0000000b0003"}'::jsonb) $$,
  '23505', null,
  'Añadir dos veces el mismo puesto de catálogo es un conflicto'
);

select t_set('pos_foh', (select id::text from activity_positions
  where activity_id = t_id('act4') and service_position_id = 'a4000000-0000-0000-0000-0000000b0001'));

reset role;
update service_positions set name = 'FOH Principal', min_people = 3, max_people = 5
where id = 'a4000000-0000-0000-0000-0000000b0001';

select ok(
  (select name = 'FOH' and min_people = 1 and max_people = 2 and catalog_snapshot ->> 'name' = 'FOH'
   from activity_positions where id = t_id('pos_foh')),
  'Renombrar el puesto en el catálogo no cambia el puesto de la actividad ni su snapshot'
);

select throws_ok(
  $$ update activity_positions set catalog_snapshot = '{"name":"otro"}'::jsonb where id = t_id('pos_foh') $$,
  '22023', null,
  'El snapshot de catálogo de un puesto es inmutable incluso sin RPC'
);

select test_set_auth_uid('a4000000-0000-0000-0000-000000000001');

select lives_ok(
  $$ select public.update_activity_position(t_id('pos_foh'), '{"max_people":""}'::jsonb) $$,
  'Quitar el máximo de un puesto funciona'
);

select is(
  (select coverage_status from public.activity_position_coverage(t_id('act4')) where activity_position_id = t_id('pos_adhoc')),
  'covered',
  'Un puesto con mínimo 0 y nadie asignado cuenta como cubierto'
);

select is(
  (select coverage_status from public.activity_position_coverage(t_id('act4')) where activity_position_id = t_id('pos_foh')),
  'uncovered',
  'Un puesto con mínimo 1 y nadie asignado está sin cubrir'
);

select is(
  array[
    app.position_coverage_status(2, 4, 1),
    app.position_coverage_status(1, 2, 3),
    app.position_coverage_status(1, null, 100),
    app.position_coverage_status(0, null, 0),
    app.position_coverage_status(2, 2, 2)
  ],
  array['partially_covered', 'overstaffed', 'covered', 'covered', 'covered'],
  'position_coverage_status: parcial, sobredimensionado, sin máximo nunca sobredimensionado, mínimo 0 cubierto'
);

-- ============================================================
-- 8. Requisitos por puesto
-- ============================================================
select t_set('req_inh', (select id::text from activity_position_requirements where activity_position_id = t_id('pos_foh')));

select ok(
  (select count(*) = 1
      and bool_and(origin = 'inherited' and qualification_id = 'a4000000-0000-0000-0000-0000000d0001'
                   and min_level = 'basic' and catalog_snapshot ->> 'min_level' = 'basic'
                   and catalog_snapshot ->> 'qualification_name' = 'Mesa')
   from activity_position_requirements where activity_position_id = t_id('pos_foh')),
  'El puesto copiado hereda los requisitos del catálogo con snapshot'
);

select lives_ok(
  $$ select public.save_activity_position_requirement(t_id('pos_foh'), t_id('req_inh'), '{"min_level":"advanced"}'::jsonb) $$,
  'Override de nivel mínimo de un requisito heredado funciona'
);

select ok(
  (select min_level = 'advanced' and catalog_snapshot ->> 'min_level' = 'basic' and origin = 'inherited'
   from activity_position_requirements where id = t_id('req_inh')),
  'El override cambia basic -> advanced sin tocar el snapshot'
);

select throws_ok(
  $$ select public.remove_activity_position_requirement(t_id('req_inh')) $$,
  '22023', null,
  'Un requisito heredado no se puede eliminar'
);

select lives_ok(
  $$ select public.save_activity_position_requirement(t_id('pos_foh'), t_id('req_inh'), '{"disabled":true}'::jsonb) $$,
  'Desactivar un requisito heredado funciona'
);

select lives_ok(
  $$ select t_set('req_added', public.save_activity_position_requirement(t_id('pos_foh'), null,
       '{"requirement_type":"qualification","qualification_id":"a4000000-0000-0000-0000-0000000d0002","strictness":"recommended"}'::jsonb)::text) $$,
  'Añadir un requisito propio de la actividad funciona'
);

select is(
  (select array_agg(id) from public.activity_position_effective_requirements(t_id('pos_foh'))),
  array[t_id('req_added')],
  'Los requisitos efectivos excluyen el heredado desactivado e incluyen el añadido'
);

-- ============================================================
-- 9. Planning
-- ============================================================
select t_set('pi_a', public.add_activity_plan_item(t_id('act4'), '{"item_type":"section","title":"Bienvenida","duration_minutes":5,"start_offset_minutes":-5}'::jsonb)::text);
select t_set('pi_b', public.add_activity_plan_item(t_id('act4'), '{"item_type":"song","title":"Canción","duration_minutes":10}'::jsonb)::text);
select t_set('pi_c', public.add_activity_plan_item(t_id('act4'), '{"item_type":"speech","title":"Predicación","duration_minutes":40}'::jsonb)::text);

select is(
  (select string_agg(title || ':' || sort_order, ',' order by sort_order) from activity_plan_items where activity_id = t_id('act4')),
  'Bienvenida:0,Canción:1,Predicación:2',
  'Los bloques se crean con orden contiguo'
);

select lives_ok(
  $$ select t_set('pi_d', public.add_activity_plan_item(t_id('act4'), '{"item_type":"prayer","title":"Oración","position":0}'::jsonb)::text) $$,
  'Insertar un bloque en una posición concreta funciona'
);

select is(
  (select string_agg(title || ':' || sort_order, ',' order by sort_order) from activity_plan_items where activity_id = t_id('act4')),
  'Oración:0,Bienvenida:1,Canción:2,Predicación:3',
  'Insertar en posición desplaza los siguientes'
);

select lives_ok(
  $$ select public.reorder_activity_plan_items(t_id('act4'), array[t_id('pi_c'), t_id('pi_b'), t_id('pi_a'), t_id('pi_d')]) $$,
  'Reordenar el plan funciona'
);

select is(
  (select string_agg(title || ':' || sort_order, ',' order by sort_order) from activity_plan_items where activity_id = t_id('act4')),
  'Predicación:0,Canción:1,Bienvenida:2,Oración:3',
  'Reordenar mantiene sort_order contiguo 0..n-1'
);

select throws_ok(
  $$ select public.reorder_activity_plan_items(t_id('act4'), array[t_id('pi_c'), t_id('pi_b'), t_id('pi_a')]) $$,
  'PT409', null,
  'Reordenar con un conjunto desactualizado falla con PT409 (no 40001: PostgREST reintentaría sin fin)'
);

select lives_ok(
  $$ select public.remove_activity_plan_item(t_id('pi_b')) $$,
  'Eliminar un bloque funciona'
);

select is(
  (select array_agg(sort_order order by sort_order) from activity_plan_items where activity_id = t_id('act4')),
  array[0, 1, 2],
  'Eliminar un bloque compacta el orden'
);

select throws_ok(
  $$ select public.add_activity_plan_item(t_id('act4'), '{"title":"Responsable ajeno","responsible_person_id":"a4000000-0000-0000-0000-0000000e0003"}'::jsonb) $$,
  '22023', null,
  'Un responsable de otra iglesia en el plan se rechaza'
);

select lives_ok(
  $$ select public.update_activity_plan_item(t_id('pi_a'), '{"responsible_person_id":"a4000000-0000-0000-0000-0000000e0001"}'::jsonb) $$,
  'Un responsable activo de la iglesia en el plan funciona'
);

-- ============================================================
-- 10. Plantillas y snapshots
-- ============================================================
select lives_ok(
  $$ select t_set('tpl1', public.save_activity_template(t_id('church_a'), null, '{
       "name":"Culto domingo 11:00","type":"service","default_duration_minutes":120,"visibility":"members",
       "areas":[
         {"service_area_id":"a4000000-0000-0000-0000-0000000a0001","requirement":"required",
          "positions":[{"service_position_id":"a4000000-0000-0000-0000-0000000b0001","min_people":2,"max_people":3},
                       {"name":"Runner","min_people":0}]},
         {"service_area_id":"a4000000-0000-0000-0000-0000000a0002","requirement":"optional"}
       ],
       "plan_items":[{"item_type":"song","title":"Alabanza","duration_minutes":20},{"item_type":"speech","title":"Mensaje","duration_minutes":40}]
     }'::jsonb)::text) $$,
  'Crear plantilla con áreas, puestos y plan funciona'
);

select ok(
  (select count(*) from activity_template_areas where template_id = t_id('tpl1')) = 2
  and (select count(*) from activity_template_positions where template_id = t_id('tpl1')) = 2
  and (select count(*) from activity_template_plan_items where template_id = t_id('tpl1')) = 2,
  'La plantilla guarda 2 áreas, 2 puestos y 2 bloques'
);

select lives_ok(
  $$ select t_set('act_tpl', public.create_activity(t_id('church_a'), jsonb_build_object(
       'template_id', t_id('tpl1'), 'local_start', '2030-07-07T11:00')) ->> 'activity_id') $$,
  'Crear actividad desde plantilla funciona'
);

select ok(
  (select type = 'service' and title = 'Culto domingo 11:00' and template_id = t_id('tpl1')
      and ends_at - starts_at = interval '120 minutes'
   from activities where id = t_id('act_tpl'))
  and (select count(*) from activity_service_areas where activity_id = t_id('act_tpl')) = 2
  and (select count(*) from activity_positions where activity_id = t_id('act_tpl')) = 2
  and (select string_agg(title, ',' order by sort_order) from activity_plan_items where activity_id = t_id('act_tpl')) = 'Alabanza,Mensaje',
  'La actividad copia tipo, duración, áreas, puestos y plan de la plantilla'
);

select ok(
  (select ap.min_people = 2 and ap.max_people = 3 and ap.name = 'FOH Principal'
      and (select count(*) from activity_position_requirements r
           where r.activity_position_id = ap.id and r.origin = 'inherited') = 1
   from activity_positions ap
   where ap.activity_id = t_id('act_tpl') and ap.service_position_id = 'a4000000-0000-0000-0000-0000000b0001'),
  'El puesto de plantilla aplica sus overrides y hereda los requisitos del catálogo'
);

-- Cambios posteriores en plantilla y catálogo no alteran la actividad creada.
select public.save_activity_template(t_id('church_a'), t_id('tpl1'),
  '{"name":"Culto domingo renombrado","type":"service","areas":[],"plan_items":[]}'::jsonb);
select public.set_activity_template_archived(t_id('tpl1'), true);

reset role;
update service_positions set name = 'FOH Cambiado', archived_at = now(), active = false
where id = 'a4000000-0000-0000-0000-0000000b0001';
update position_requirements set min_level = 'expert'
where service_position_id = 'a4000000-0000-0000-0000-0000000b0001';

select ok(
  (select count(*) from activity_service_areas where activity_id = t_id('act_tpl')) = 2
  and (select count(*) from activity_plan_items where activity_id = t_id('act_tpl')) = 2
  and (select ap.name = 'FOH Principal' and ap.catalog_snapshot ->> 'name' = 'FOH Principal'
       from activity_positions ap
       where ap.activity_id = t_id('act_tpl') and ap.service_position_id = 'a4000000-0000-0000-0000-0000000b0001')
  and (select bool_and(r.min_level = 'basic') from activity_position_requirements r
       join activity_positions ap on ap.id = r.activity_position_id
       where ap.activity_id = t_id('act_tpl') and ap.service_position_id = 'a4000000-0000-0000-0000-0000000b0001'),
  'Editar/archivar la plantilla y el catálogo después no cambia la actividad creada'
);

-- Restaurar el catálogo para las pruebas siguientes.
update service_positions set archived_at = null, active = true
where id = 'a4000000-0000-0000-0000-0000000b0001';

select test_set_auth_uid('a4000000-0000-0000-0000-000000000001');

select throws_ok(
  $$ select public.create_activity(t_id('church_a'), jsonb_build_object('template_id', t_id('tpl1'), 'local_start', '2030-07-14T11:00')) $$,
  '22023', null,
  'Una plantilla archivada no se puede usar'
);

select throws_ok(
  $$ select public.save_activity_template(t_id('church_a'), null, jsonb_build_object(
       'name', 'Plantilla sede mal', 'type', 'service', 'campus_id', t_id('campus_a1'),
       'areas', jsonb_build_array(jsonb_build_object('service_area_id', 'a4000000-0000-0000-0000-0000000a0004')))) $$,
  '22023', null,
  'Una plantilla de sede no admite áreas de otra sede'
);

select lives_ok(
  $$ select t_set('tpl_norte', public.save_activity_template(t_id('church_a'), null, jsonb_build_object(
       'name', 'Reunión Norte', 'type', 'meeting', 'campus_id', 'a4000000-0000-0000-0000-0000000c0002',
       'default_duration_minutes', 60,
       'areas', jsonb_build_array(jsonb_build_object('service_area_id', 'a4000000-0000-0000-0000-0000000a0004', 'requirement', 'optional'))))::text) $$,
  'Crear plantilla de sede con área de esa sede funciona'
);

select throws_ok(
  $$ select public.create_activity(t_id('church_a'), jsonb_build_object(
       'template_id', t_id('tpl_norte'), 'campus_id', t_id('campus_a1'), 'local_start', '2030-07-08T19:00')) $$,
  '22023', null,
  'Usar una plantilla de sede en otra sede se rechaza'
);

select t_set('act_norte_tpl', public.create_activity(t_id('church_a'), jsonb_build_object(
  'template_id', t_id('tpl_norte'), 'local_start', '2030-07-08T19:00')) ->> 'activity_id');

select ok(
  (select a.campus_id = 'a4000000-0000-0000-0000-0000000c0002' and a.timezone = 'Atlantic/Canary'
      and (select count(*) from activity_service_areas asa where asa.activity_id = a.id) = 1
   from activities a
   where a.id = t_id('act_norte_tpl')),
  'Sin campus_id explícito, la actividad hereda la sede (y su zona) y la estructura de la plantilla'
);

select test_set_auth_uid('a4000000-0000-0000-0000-000000000002');

select throws_ok(
  $$ select public.create_activity(t_id('church_b'), jsonb_build_object('template_id', t_id('tpl_norte'), 'local_start', '2030-07-08T19:00')) $$,
  '22023', null,
  'Una plantilla de otra iglesia se rechaza'
);

select test_set_auth_uid('a4000000-0000-0000-0000-000000000001');

select lives_ok(
  $$ select t_set('tpl_copy', public.duplicate_activity_template(t_id('tpl_norte'), null)::text) $$,
  'Duplicar plantilla funciona'
);

select ok(
  (select t.id <> t_id('tpl_norte') and t.name = 'Reunión Norte (copia)' and t.campus_id = 'a4000000-0000-0000-0000-0000000c0002'
      and (select count(*) from activity_template_areas ta where ta.template_id = t.id) = 1
   from activity_templates t where t.id = t_id('tpl_copy')),
  'La copia de la plantilla tiene nuevo id, nombre "(copia)" y sus áreas'
);

select lives_ok(
  $$ select public.set_activity_template_archived(t_id('tpl_copy'), true) $$,
  'Archivar plantilla funciona'
);

select ok(
  (select archived_at is not null and not active from activity_templates where id = t_id('tpl_copy')),
  'La plantilla archivada queda inactiva'
);

-- ============================================================
-- 11. Duplicación
-- ============================================================
select public.update_activity(t_id('act4'), '{"admin_notes":"Llaves en conserjería"}'::jsonb);
select public.transition_activity_status(t_id('act4'), 'cancelled', 'Obras');

select lives_ok(
  $$ select t_set('act4_dup', public.duplicate_activity(t_id('act4'), '{"local_start":"2030-06-09T11:00"}'::jsonb) ->> 'activity_id') $$,
  'Duplicar una actividad funciona'
);

select ok(
  (select id <> t_id('act4') and status = 'draft' and series_id is null and occurrence_date is null
      and duplicated_from_activity_id = t_id('act4')
      and cancelled_at is null and cancellation_reason is null and cancelled_by is null
      and published_at is null
      and starts_at = '2030-06-09 09:00+00' and ends_at - starts_at = interval '120 minutes'
   from activities where id = t_id('act4_dup')),
  'La copia es un borrador nuevo, sin serie ni datos de cancelación, con duplicated_from'
);

select ok(
  (select count(*) from activity_service_areas where activity_id = t_id('act4_dup'))
    = (select count(*) from activity_service_areas where activity_id = t_id('act4'))
  and (select count(*) from activity_positions where activity_id = t_id('act4_dup'))
    = (select count(*) from activity_positions where activity_id = t_id('act4'))
  and (select count(*) from activity_position_requirements where activity_id = t_id('act4_dup'))
    = (select count(*) from activity_position_requirements where activity_id = t_id('act4'))
  and (select string_agg(title, ',' order by sort_order) from activity_plan_items where activity_id = t_id('act4_dup'))
    = (select string_agg(title, ',' order by sort_order) from activity_plan_items where activity_id = t_id('act4'))
  and not exists (
    select 1 from activity_positions n join activity_positions o on o.id = n.id
    where n.activity_id = t_id('act4_dup') and o.activity_id = t_id('act4')
  ),
  'La copia replica áreas, puestos, requisitos y plan con nuevos ids'
);

select ok(
  exists (select 1 from activity_position_requirements
          where activity_id = t_id('act4_dup') and origin = 'inherited' and disabled and min_level = 'advanced')
  and exists (select 1 from activity_positions
              where activity_id = t_id('act4_dup') and name = 'Proyección' and min_people = 2 and max_people = 4)
  and (select notes from activity_admin_notes where activity_id = t_id('act4_dup')) = 'Llaves en conserjería',
  'La copia conserva overrides de puestos y requisitos (incluido el desactivado) y las notas'
);

select t_set('dup_first', public.duplicate_activity(t_id('act_tpl'), '{"request_id":"a4000000-0000-0000-0000-0000000f0002"}'::jsonb)::text);

select ok(
  (select (r ->> 'replayed')::boolean
      and (current_setting('t4a.dup_first')::jsonb ->> 'replayed')::boolean = false
      and r ->> 'activity_id' = current_setting('t4a.dup_first')::jsonb ->> 'activity_id'
   from public.duplicate_activity(t_id('act_tpl'), '{"request_id":"a4000000-0000-0000-0000-0000000f0002"}'::jsonb) r),
  'Duplicar con el mismo request_id es idempotente'
);

-- ============================================================
-- 12. Borrado de estructura con requisitos heredados
-- ============================================================
select lives_ok(
  $$ select public.remove_activity_position((select id from activity_positions
       where activity_id = t_id('act4_dup') and service_position_id = 'a4000000-0000-0000-0000-0000000b0001')) $$,
  'Retirar un puesto con requisitos heredados funciona (cascada)'
);

select lives_ok(
  $$ select public.remove_activity_area((select id from activity_service_areas
       where activity_id = t_id('act4_dup') and service_area_id = 'a4000000-0000-0000-0000-0000000a0002')) $$,
  'Retirar un área con sus puestos funciona'
);

-- ============================================================
-- 13. Atomicidad de operaciones compuestas
-- ============================================================
select throws_ok(
  $$ select public.save_activity_template(t_id('church_a'), null, '{
       "name":"Plantilla atómica","type":"service",
       "areas":[{"service_area_id":"a4000000-0000-0000-0000-0000000a0001"},{"service_area_id":"a4000000-0000-0000-0000-0000000a0b01"}]
     }'::jsonb) $$,
  '22023', null,
  'Guardar plantilla con una segunda área de otra iglesia falla'
);

select throws_ok(
  $$ select public.create_activity(t_id('church_a'), jsonb_build_object(
       'template_id', t_id('tpl_norte'), 'title', 'Alta atómica', 'local_start', '2030-07-15T19:00',
       'admin_notes', repeat('x', 4001))) $$,
  '23514', null,
  'Crear desde plantilla con notas demasiado largas falla después de insertar'
);

reset role;

select ok(
  not exists (select 1 from activity_templates where name = 'Plantilla atómica')
  and not exists (select 1 from activities where title = 'Alta atómica'),
  'Las operaciones compuestas fallidas no dejan plantilla ni actividad a medias'
);

-- ============================================================
-- 14. Auditoría
-- ============================================================
select ok(
  array['activity.created', 'activity.updated', 'activity.area_added', 'activity.position_added',
        'activity.position_updated', 'activity.plan_item_added', 'activity.plan_reordered',
        'activity.plan_item_removed', 'activity.cancelled']
  <@ (select array_agg(action) from audit_logs where entity_type = 'activities' and entity_id = t_id('act4')),
  'Se auditan alta, edición, áreas, puestos, requisitos, planning y cancelación'
);

select ok(
  array['activity.published', 'activity.cancelled', 'activity.archived', 'activity.status_changed']
  <@ (select array_agg(action) from audit_logs where entity_type = 'activities' and entity_id = t_id('act2'))
  and exists (select 1 from audit_logs where entity_id = t_id('act_past') and action = 'activity.completed'),
  'Se auditan publicación, cancelación, archivado, reactivación y completado'
);

select ok(
  exists (select 1 from audit_logs where action = 'activity_template.created' and entity_id = t_id('tpl1'))
  and exists (select 1 from audit_logs where action = 'activity_template.archived' and entity_id = t_id('tpl1'))
  and exists (select 1 from audit_logs where action = 'activity_template.updated' and entity_id = t_id('tpl1')),
  'Se auditan alta, edición y archivado de plantillas'
);

select is(
  (select array_agg(action) from audit_logs where entity_type = 'activities' and entity_id = t_id('act4_dup')
     and action not in ('activity.position_removed', 'activity.area_removed')),
  array['activity.duplicated'],
  'La copia solo tiene su propia auditoría (activity.duplicated), no la del original'
);

select ok(
  (select bool_and(actor_user_id = 'a4000000-0000-0000-0000-000000000001' and church_id = t_id('church_a'))
   from audit_logs where entity_type = 'activities' and entity_id = t_id('act4')),
  'La auditoría registra actor e iglesia'
);

select * from finish();
rollback;
