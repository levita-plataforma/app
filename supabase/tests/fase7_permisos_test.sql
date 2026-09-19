-- Fase 7 · Tests de permisos: el scope 'group' frente a 'campus' y 'church',
-- la regla del contacto (decisión P-5) por sus cuatro caminos, la comprobación
-- de capacidad al escribir a un grupo, y la superficie de funciones expuestas.
-- Ver docs/CONTRATO-FASE-7.md §5 y §8.

begin;
select plan(39);

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

create or replace function test_err(p_sql text) returns text as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate;
end;
$$ language plpgsql;

-- ============================================================
-- Setup: una iglesia con dos sedes y grupos en cada una
-- ============================================================

insert into auth.users (id, email) values
  ('c7000000-0000-0000-0000-000000000001', 'owner.c7@example.test'),
  ('c7000000-0000-0000-0000-000000000002', 'sede.c7@example.test'),
  ('c7000000-0000-0000-0000-000000000003', 'lider.c7@example.test'),
  ('c7000000-0000-0000-0000-000000000004', 'contacto.c7@example.test'),
  ('c7000000-0000-0000-0000-000000000005', 'suelto.c7@example.test');

select test_set_auth_uid('c7000000-0000-0000-0000-000000000001');
select * from app.provision_church(
  'Church C7', 'church-c7', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'C7', 'owner.c7@example.test', null, 'Sede Centro', null, null, null, null,
  array['people', 'groups', 'discipleship'], null
);

reset role;

select test_remember('church', (select id from churches where slug = 'church-c7'));
select test_remember('campus_centro', (select id from campuses where church_id = test_id('church') limit 1));

insert into campuses (id, church_id, name, slug)
values ('c7000000-0000-0000-0000-0000000c0002', test_id('church'), 'Sede Norte', 'sede-norte-c7');
select test_remember('campus_norte', 'c7000000-0000-0000-0000-0000000c0002');

insert into people (id, user_id, first_name, last_name, email, phone, directory_visible) values
  ('c7000000-0000-0000-0000-0000000e0002', 'c7000000-0000-0000-0000-000000000002', 'Nora', 'Norte', 'sede.c7@example.test', '600000102', false),
  ('c7000000-0000-0000-0000-0000000e0003', 'c7000000-0000-0000-0000-000000000003', 'Luis', 'Líder', 'lider.c7@example.test', '600000103', false),
  ('c7000000-0000-0000-0000-0000000e0004', 'c7000000-0000-0000-0000-000000000004', 'Clara', 'Contacto', 'contacto.c7@example.test', '600000104', false),
  ('c7000000-0000-0000-0000-0000000e0005', 'c7000000-0000-0000-0000-000000000005', 'Sol', 'Suelta', 'suelto.c7@example.test', '600000105', true);

insert into church_people (id, church_id, person_id, relationship, source) values
  ('c7000000-0000-0000-0000-0000000f0002', test_id('church'), 'c7000000-0000-0000-0000-0000000e0002', 'leader', 'manual'),
  ('c7000000-0000-0000-0000-0000000f0003', test_id('church'), 'c7000000-0000-0000-0000-0000000e0003', 'leader', 'manual'),
  ('c7000000-0000-0000-0000-0000000f0004', test_id('church'), 'c7000000-0000-0000-0000-0000000e0004', 'member', 'manual'),
  ('c7000000-0000-0000-0000-0000000f0005', test_id('church'), 'c7000000-0000-0000-0000-0000000e0005', 'member', 'manual');

-- Nora administra solo la Sede Norte.
insert into church_people_roles (church_id, church_people_id, role_key, scope_type, scope_id) values
  (test_id('church'), 'c7000000-0000-0000-0000-0000000f0002', 'campus_admin', 'campus', 'c7000000-0000-0000-0000-0000000c0002'),
  (test_id('church'), 'c7000000-0000-0000-0000-0000000f0004', 'member', 'church', null),
  (test_id('church'), 'c7000000-0000-0000-0000-0000000f0005', 'member', 'church', null);

select test_set_auth_uid('c7000000-0000-0000-0000-000000000001');
select test_remember('grupo_centro', public.create_group(
  test_id('church'),
  jsonb_build_object('name', 'Grupo Centro', 'campus_id', test_id('campus_centro'), 'visibility', 'listed')
));
select test_remember('grupo_norte', public.create_group(
  test_id('church'),
  jsonb_build_object('name', 'Grupo Norte', 'campus_id', test_id('campus_norte'), 'visibility', 'listed')
));

select public.add_group_leader(test_id('grupo_centro'), 'c7000000-0000-0000-0000-0000000e0003', 'leader');
select public.add_group_member(test_id('grupo_centro'), 'c7000000-0000-0000-0000-0000000e0004', '{}'::jsonb);
select public.add_group_member(test_id('grupo_centro'), 'c7000000-0000-0000-0000-0000000e0005', '{}'::jsonb);

-- ============================================================
-- 1. El scope 'group' autoriza solo su grupo
-- ============================================================

select test_set_auth_uid('c7000000-0000-0000-0000-000000000003');

select ok(
  app.group_cap_by_id(test_id('grupo_centro'), 'group.member.manage'),
  'La responsable puede gestionar participantes de su grupo'
);

select ok(
  not app.group_cap_by_id(test_id('grupo_norte'), 'group.member.manage'),
  'La responsable no puede gestionar participantes de otro grupo'
);

select ok(
  not app.group_cap_by_id(test_id('grupo_centro'), 'group.manage'),
  'La responsable no puede editar ni archivar su grupo: eso es de quien administra'
);

select is(
  test_err(format($$ select public.update_group('%s', jsonb_build_object('name', 'Renombrado')) $$,
                  test_id('grupo_centro'))),
  '42501',
  'Intentar editar el grupo sin group.manage se rechaza'
);

select is(
  test_err(format($$ select public.set_group_archived('%s', true) $$, test_id('grupo_centro'))),
  '42501',
  'Intentar archivar el grupo sin group.manage se rechaza'
);

select is(
  test_err(format($$ select public.add_group_member('%s', '%s', '{}'::jsonb) $$,
                  test_id('grupo_norte'), 'c7000000-0000-0000-0000-0000000e0004')),
  '42501',
  'Intentar añadir a alguien a otro grupo se rechaza'
);

-- ============================================================
-- 2. El scope 'campus' alcanza los grupos de su sede y solo esos
-- ============================================================

select test_set_auth_uid('c7000000-0000-0000-0000-000000000002');

select ok(
  app.group_cap_by_id(test_id('grupo_norte'), 'group.manage'),
  'Quien administra una sede gestiona los grupos de esa sede'
);

select ok(
  not app.group_cap_by_id(test_id('grupo_centro'), 'group.manage'),
  'Quien administra una sede NO gestiona los grupos de otra'
);

select lives_ok(
  format($$ select public.update_group('%s', jsonb_build_object('name', 'Grupo Norte renovado')) $$,
         test_id('grupo_norte')),
  'Puede editar el grupo de su sede'
);

select is(
  test_err(format($$ select public.update_group('%s', jsonb_build_object('name', 'No debería')) $$,
                  test_id('grupo_centro'))),
  '42501',
  'No puede editar el grupo de la otra sede'
);

-- ============================================================
-- 3. El scope 'church' alcanza todo
-- ============================================================

select test_set_auth_uid('c7000000-0000-0000-0000-000000000001');

select ok(
  app.group_cap_by_id(test_id('grupo_centro'), 'group.manage')
    and app.group_cap_by_id(test_id('grupo_norte'), 'group.manage'),
  'Quien administra la iglesia alcanza los grupos de todas las sedes'
);

-- ============================================================
-- 4. La regla del contacto (decisión P-5)
-- ============================================================

-- Camino 1: uno mismo siempre ve su contacto.
select test_set_auth_uid('c7000000-0000-0000-0000-000000000004');
select ok(
  app.can_read_person_contact(test_id('church'), 'c7000000-0000-0000-0000-0000000e0004'),
  'Cada persona ve su propio contacto'
);

select ok(
  not app.can_read_person_contact(test_id('church'), 'c7000000-0000-0000-0000-0000000e0003'),
  'Un miembro corriente no ve el contacto de otra persona que no lo ha hecho visible'
);

-- Camino 2: la persona lo ha hecho visible.
select ok(
  app.can_read_person_contact(test_id('church'), 'c7000000-0000-0000-0000-0000000e0005'),
  'Sí se ve el contacto de quien lo ha hecho visible en el directorio'
);

-- Camino 3: la responsable del grupo, sin permiso expreso, no lo ve.
select test_set_auth_uid('c7000000-0000-0000-0000-000000000003');
select ok(
  not app.can_read_person_contact(test_id('church'), 'c7000000-0000-0000-0000-0000000e0004'),
  'Llevar un grupo no da acceso al contacto de sus participantes'
);

select is(
  (select phone from app.group_roster(test_id('grupo_centro'))
   where person_id = 'c7000000-0000-0000-0000-0000000e0004'),
  null,
  'La lista del grupo tampoco lo enseña'
);

select is(
  (select phone from app.group_roster(test_id('grupo_centro'))
   where person_id = 'c7000000-0000-0000-0000-0000000e0005'),
  '600000105',
  'Pero sí enseña el de quien lo ha hecho visible'
);

select ok(
  (select bool_and(display_name is not null)
   from app.group_roster(test_id('grupo_centro'))),
  'El nombre de todos los participantes se ve siempre, haya contacto o no'
);

-- Camino 4: con permiso expreso sí.
reset role;
insert into roles (key, name) values ('test_c7_contacto', 'Solo ver contacto (test)')
on conflict (key) do nothing;
insert into role_capabilities (role_key, capability_key) values ('test_c7_contacto', 'group.contact.read')
on conflict do nothing;

insert into church_people_roles (church_id, church_people_id, role_key, scope_type, scope_id)
values (test_id('church'), 'c7000000-0000-0000-0000-0000000f0003', 'test_c7_contacto', 'group', test_id('grupo_centro'))
on conflict do nothing;

select test_set_auth_uid('c7000000-0000-0000-0000-000000000003');
select ok(
  app.can_read_person_contact(test_id('church'), 'c7000000-0000-0000-0000-0000000e0004', test_id('grupo_centro')),
  'Con permiso expreso de ver contacto en ese grupo, sí se ve'
);

select is(
  (select phone from app.group_roster(test_id('grupo_centro'))
   where person_id = 'c7000000-0000-0000-0000-0000000e0004'),
  '600000104',
  'Y la lista de ESE grupo lo enseña'
);

-- El límite del permiso, que es lo que hace que la decisión P-5 signifique
-- algo: concedido con scope de grupo, no puede convertirse en un permiso de
-- toda la iglesia. (Si se resolviera con app.has_capability_any_scope, que
-- ignora scope_type y scope_id, esta comprobación fallaría.)
select ok(
  not app.can_read_person_contact(test_id('church'), 'c7000000-0000-0000-0000-0000000e0004'),
  'Ese permiso no vale fuera del grupo para el que se concedió'
);

select ok(
  not app.can_read_person_contact(test_id('church'), 'c7000000-0000-0000-0000-0000000e0002', test_id('grupo_norte')),
  'Ni sirve para ver el contacto de gente de otro grupo'
);

-- ============================================================
-- 5. Escribir al grupo exige capacidad desde el primer día
-- ============================================================
-- La función equivalente de la Fase 6 nació sin esta comprobación y hubo que
-- arreglarla en caliente (20260925000400). Aquí se prueba que no se repite.

select test_set_auth_uid('c7000000-0000-0000-0000-000000000004');
select is(
  test_err(format($$ select public.notify_group_members('%s', 'group.meeting.cancelled', '{}'::jsonb, null) $$,
                  test_id('grupo_centro'))),
  '42501',
  'Un participante corriente no puede escribir a todo el grupo'
);

select test_set_auth_uid('c7000000-0000-0000-0000-000000000002');
select is(
  test_err(format($$ select public.notify_group_members('%s', 'group.meeting.cancelled', '{}'::jsonb, null) $$,
                  test_id('grupo_centro'))),
  '42501',
  'Quien administra otra sede tampoco puede escribir a este grupo'
);

select test_set_auth_uid('c7000000-0000-0000-0000-000000000003');
select ok(
  public.notify_group_members(test_id('grupo_centro'), 'group.meeting.cancelled', '{}'::jsonb, 'test') >= 1,
  'La responsable del grupo sí puede escribir a sus participantes'
);

-- El tipo de aviso no puede ser libre: con el check de notification_events como
-- único límite, quien lleva un grupo podría colocar en la bandeja de sus
-- participantes un aviso de cualquier otro dominio, con el texto que quisiera.
select is(
  test_err(format($$ select public.notify_group_members('%s', 'course.enrollment.completed', '{}'::jsonb, null) $$,
                  test_id('grupo_centro'))),
  '22023',
  'No se puede usar el canal del grupo para colar un aviso de otro dominio'
);

select is(
  test_err(format($$ select public.notify_group_members('%s', 'assignment.proposed', '{}'::jsonb, null) $$,
                  test_id('grupo_centro'))),
  '22023',
  'Tampoco uno de asignaciones'
);

-- Y dos mensajes seguidos del mismo tipo tienen que llegar los dos: si la clave
-- de idempotencia no llevara nada propio, el segundo se perdería en silencio.
select ok(
  public.notify_group_members(test_id('grupo_centro'), 'group.meeting.cancelled', '{}'::jsonb, null) >= 1
    and public.notify_group_members(test_id('grupo_centro'), 'group.meeting.cancelled', '{}'::jsonb, null) >= 1,
  'Dos avisos seguidos del mismo tipo no se colapsan en uno'
);

-- Lo que venga del llamante no puede suplantar al grupo que firma el aviso.
-- La outbox está revocada a authenticated (Fase 5), así que se lee sin ese rol.
select test_set_auth_uid('c7000000-0000-0000-0000-000000000003');
select public.notify_group_members(
  test_id('grupo_centro'), 'group.meeting.cancelled',
  jsonb_build_object('group_name', 'Grupo Suplantado'), 'suplantacion'
);

reset role;
select is(
  (select payload ->> 'group_name' from notification_events
   where idempotency_key like '%:suplantacion'),
  'Grupo Centro',
  'El nombre del grupo del aviso lo pone la base, no quien llama'
);

-- ============================================================
-- 6. Superficie de funciones: nada de más para anon ni para PUBLIC
-- ============================================================

reset role;

-- La lista va enumerada a propósito. Un filtro por patrón de nombre parecía
-- cubrirlo todo y dejaba fuera la mitad de las funciones, entre ellas las de
-- Discipulado enteras: una prueba que no cubre lo que dice cubrir es peor que
-- no tenerla.
select is(
  (select count(*)::int
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app'
     and p.proname in (
       'group_cap', 'group_cap_by_id', 'is_group_leader', 'is_group_member',
       'can_read_group', 'can_read_group_roster', 'can_read_person_contact',
       'course_cap', 'cohort_cap', 'require_groups_module', 'require_discipleship_module',
       'load_group', 'assert_group_cap', 'assert_group_writable', 'assert_group_has_room',
       'group_active_member_count', 'group_has_active_leader',
       'save_group_type', 'set_group_type_archived', 'create_group', 'update_group',
       'set_group_status', 'set_group_archived', 'add_group_leader', 'end_group_leadership',
       'add_group_member', 'remove_group_member', 'request_group_join',
       'resolve_group_join_request', 'cancel_group_join_request',
       'schedule_group_meeting', 'reschedule_group_meeting', 'cancel_group_meeting',
       'record_group_attendance', 'group_roster', 'list_group_meetings', 'group_metrics',
       'group_notification_payload', 'group_notification_recipients', 'notify_group_members',
       'person_group_manage_cap', 'cohort_notification_payload', 'cohort_notification_recipients',
       'notification_text_fase7',
       'load_cohort', 'assert_cohort_cap', 'cohort_active_enrollment_count',
       'save_course', 'set_course_archived', 'create_cohort', 'update_cohort',
       'schedule_cohort_session', 'reschedule_cohort_session', 'cancel_cohort_session',
       'enroll_person_in_cohort', 'request_cohort_enrollment', 'resolve_cohort_enrollment',
       'drop_cohort_enrollment', 'complete_cohort_enrollment', 'record_session_attendance',
       'cohort_completion_suggestions', 'cohort_notes',
       'save_learning_path', 'save_path_step', 'set_path_step_archived', 'reorder_path_steps',
       'set_person_path_step', 'person_path_progress_view', 'discipleship_metrics',
       'group_meetings_activity_type_guard', 'course_sessions_activity_type_guard'
     )
     and has_function_privilege('anon', p.oid, 'execute')),
  0,
  'Ninguna de las 70 funciones app.* de la Fase 7 es ejecutable por anon'
);

select cmp_ok(
  (select count(*)::int
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app'
     and p.proname in (
       'group_cap', 'can_read_person_contact', 'save_course', 'create_cohort',
       'enroll_person_in_cohort', 'set_person_path_step', 'person_path_progress_view',
       'reorder_path_steps', 'cohort_notes', 'notify_group_members'
     )),
  '=', 10,
  'La lista de arriba nombra funciones que existen de verdad (muestra de control)'
);

-- Toda función definer que se salta RLS tiene que fijar su search_path, o se
-- puede secuestrar con un esquema puesto por delante.
select is(
  (select count(*)::int
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.prosecdef
     and (p.proconfig is null
          or not exists (select 1 from unnest(p.proconfig) c where c like 'search\_path=%'))),
  0,
  'Ninguna función security definer del esquema app se queda sin search_path fijado'
);

select is(
  (select count(*)::int
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('create_group', 'update_group', 'add_group_member', 'request_group_join',
                       'schedule_group_meeting', 'record_group_attendance', 'group_roster',
                       'save_course', 'enroll_person_in_cohort', 'complete_cohort_enrollment',
                       'set_person_path_step', 'notify_group_members')
     and has_function_privilege('anon', p.oid, 'execute')),
  0,
  'Ninguna RPC pública de la Fase 7 es ejecutable por anon'
);

select is(
  (select count(*)::int
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app'
     and p.proname in ('group_notification_payload', 'cohort_notification_payload',
                       'group_notification_recipients', 'cohort_notification_recipients',
                       'person_group_manage_cap', 'load_group', 'assert_group_cap',
                       'load_cohort', 'assert_cohort_cap')
     and has_function_privilege('authenticated', p.oid, 'execute')),
  0,
  'Las funciones internas que no comprueban lectura están revocadas también de authenticated'
);

select ok(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app' and p.proname = 'group_roster'),
  'app.group_roster es security definer: filtra el contacto ella misma'
);

select ok(
  not (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'group_roster'),
  'El envoltorio public.group_roster es security invoker, como el resto del repositorio'
);

-- ============================================================
-- 7. Módulo apagado: ni con permisos de propietario
-- ============================================================

reset role;
update church_modules set status = 'disabled'
where church_id = test_id('church') and module_key = 'groups';

select test_set_auth_uid('c7000000-0000-0000-0000-000000000001');

select is(
  test_err(format($$ select public.add_group_member('%s', '%s', '{}'::jsonb) $$,
                  test_id('grupo_centro'), 'c7000000-0000-0000-0000-0000000e0002')),
  '42501',
  'Con el módulo apagado, ni quien es propietario puede añadir participantes'
);

select is(
  test_err(format($$ select public.schedule_group_meeting('%s', jsonb_build_object(
      'local_start', to_char(now() + interval '1 day', 'YYYY-MM-DD HH24:MI:SS'),
      'duration_minutes', 60)) $$, test_id('grupo_centro'))),
  '42501',
  'Ni convocar una reunión'
);

reset role;
update church_modules set status = 'enabled'
where church_id = test_id('church') and module_key = 'groups';

select test_set_auth_uid('c7000000-0000-0000-0000-000000000001');
select lives_ok(
  format($$ select public.add_group_member('%s', '%s', '{}'::jsonb) $$,
         test_id('grupo_centro'), 'c7000000-0000-0000-0000-0000000e0002'),
  'Al volver a encender el módulo, todo funciona igual que antes'
);

select * from finish();
rollback;
