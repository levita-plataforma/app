-- Fase 7 · Tests de Discipulado: cursos, cohortes, sesiones sobre activities,
-- las dos vías de matrícula, asistencia, sugerencia de finalización, itinerarios
-- y conservación del progreso al cambiar los pasos.
-- Ver docs/CONTRATO-FASE-7.md §4.2, §6 y §9.

begin;
select plan(59);

create or replace function test_set_auth_uid(p_uid uuid) returns void as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$ language plpgsql;

create or replace function test_clear_auth() returns void as $$
begin
  perform set_config('request.jwt.claims', '', true);
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
-- Setup
-- ============================================================

insert into auth.users (id, email) values
  ('d7000000-0000-0000-0000-000000000001', 'owner.d7a@example.test'),
  ('d7000000-0000-0000-0000-000000000002', 'owner.d7b@example.test'),
  ('d7000000-0000-0000-0000-000000000003', 'alumno.d7a@example.test'),
  ('d7000000-0000-0000-0000-000000000004', 'alumna.d7a@example.test');

select test_set_auth_uid('d7000000-0000-0000-0000-000000000001');
select * from app.provision_church(
  'Church A D7', 'church-a-d7', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'AD7', 'owner.d7a@example.test', null, 'Sede AD7', null, null, null, null,
  array['people', 'groups', 'discipleship'], null
);

select test_set_auth_uid('d7000000-0000-0000-0000-000000000002');
select * from app.provision_church(
  'Church B D7', 'church-b-d7', 'es-ES', 'Europe/Madrid', 'EUR', 'España',
  'Owner', 'BD7', 'owner.d7b@example.test', null, 'Sede BD7', null, null, null, null,
  array['people', 'groups', 'discipleship'], null
);

reset role;

select test_remember('church_a', (select id from churches where slug = 'church-a-d7'));
select test_remember('church_b', (select id from churches where slug = 'church-b-d7'));

insert into people (id, user_id, first_name, last_name, email) values
  ('d7000000-0000-0000-0000-0000000e0003', 'd7000000-0000-0000-0000-000000000003', 'Pedro', 'Alumno', 'alumno.d7a@example.test'),
  ('d7000000-0000-0000-0000-0000000e0004', 'd7000000-0000-0000-0000-000000000004', 'Sara', 'Alumna', 'alumna.d7a@example.test');

insert into church_people (id, church_id, person_id, relationship, source) values
  ('d7000000-0000-0000-0000-0000000f0003', test_id('church_a'), 'd7000000-0000-0000-0000-0000000e0003', 'member', 'manual'),
  ('d7000000-0000-0000-0000-0000000f0004', test_id('church_a'), 'd7000000-0000-0000-0000-0000000e0004', 'member', 'manual');

insert into church_people_roles (church_id, church_people_id, role_key, scope_type, scope_id) values
  (test_id('church_a'), 'd7000000-0000-0000-0000-0000000f0003', 'member', 'church', null),
  (test_id('church_a'), 'd7000000-0000-0000-0000-0000000f0004', 'member', 'church', null);

-- ============================================================
-- 1. Esquema y privilegios
-- ============================================================

select ok(
  (select bool_and(c.relrowsecurity and c.relforcerowsecurity)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('courses', 'course_cohorts', 'course_sessions', 'course_enrollments',
                       'course_session_attendance', 'learning_paths', 'path_steps',
                       'person_path_progress')),
  'Las ocho tablas de Discipulado tienen RLS ENABLE + FORCE'
);

select ok(
  not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('courses', 'course_cohorts', 'course_sessions', 'course_enrollments',
                         'course_session_attendance', 'learning_paths', 'path_steps',
                         'person_path_progress')
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ),
  'anon y authenticated no escriben directamente en las tablas de Discipulado'
);

select ok(
  (select count(*) from capabilities where module_key = 'discipleship') = 8,
  'Se han dado de alta las ocho capacidades del módulo discipleship'
);

-- ============================================================
-- 2. Cursos y cohortes
-- ============================================================

select test_set_auth_uid('d7000000-0000-0000-0000-000000000001');

select test_remember('curso_base', public.save_course(
  test_id('church_a'),
  jsonb_build_object('name', 'Fundamentos de la fe', 'status', 'active',
                     'session_count', 4, 'completion_attendance_ratio', 0.5)
));

select ok(test_id('curso_base') is not null, 'Crear un curso funciona');

select is(
  (select completion_attendance_ratio from courses where id = test_id('curso_base')),
  0.500::numeric(4,3),
  'El umbral de asistencia sugerido queda guardado'
);

select is(
  test_err(format($$ select public.save_course('%s', jsonb_build_object('name', '   ')) $$,
                  test_id('church_a'))),
  '22023',
  'Un curso sin nombre real se rechaza'
);

select test_remember('cohorte_1', public.create_cohort(
  test_id('curso_base'),
  jsonb_build_object('name', 'Otoño 2026', 'status', 'open', 'capacity', 2, 'allows_requests', true)
));

select ok(test_id('cohorte_1') is not null, 'Crear una cohorte funciona');

select is(
  (select course_id from course_cohorts where id = test_id('cohorte_1')),
  test_id('curso_base'),
  'La cohorte cuelga de su curso'
);

-- ============================================================
-- 3. Sesiones sobre activities (ADR 0018 y 0019)
-- ============================================================

select test_remember('sesion_1', (public.schedule_cohort_session(
  test_id('cohorte_1'),
  jsonb_build_object(
    'local_start', to_char(now() + interval '2 days', 'YYYY-MM-DD HH24:MI:SS'),
    'duration_minutes', 120, 'topic', 'Quién es Jesús'
  )
) ->> 'course_session_id')::uuid);

select ok(test_id('sesion_1') is not null, 'Programar una sesión funciona');

reset role;
select is(
  (select a.type::text from activities a
   join course_sessions s on s.activity_id = a.id where s.id = test_id('sesion_1')),
  'course_session',
  'La sesión se apoya en una activity de tipo course_session'
);

select is(
  (select session_number from course_sessions where id = test_id('sesion_1')),
  1::smallint,
  'La primera sesión se numera sola'
);

select test_set_auth_uid('d7000000-0000-0000-0000-000000000001');
select test_remember('sesion_2', (public.schedule_cohort_session(
  test_id('cohorte_1'),
  jsonb_build_object('local_start', to_char(now() + interval '9 days', 'YYYY-MM-DD HH24:MI:SS'),
                     'duration_minutes', 120)
) ->> 'course_session_id')::uuid);

reset role;
select is(
  (select session_number from course_sessions where id = test_id('sesion_2')),
  2::smallint,
  'La siguiente sesión sigue la numeración'
);

select test_set_auth_uid('d7000000-0000-0000-0000-000000000001');
select test_remember('act_meeting_d7', (app.create_activity(
  test_id('church_a'),
  jsonb_build_object(
    'type', 'meeting', 'title', 'Reunión suelta', 'schedule_kind', 'timed',
    'local_start', to_char(now() + interval '6 days', 'YYYY-MM-DD HH24:MI:SS'),
    'local_end', to_char(now() + interval '6 days 1 hour', 'YYYY-MM-DD HH24:MI:SS'),
    'timezone', 'Europe/Madrid'
  )
) ->> 'activity_id')::uuid);

set role service_role;
select is(
  test_err(format(
    $$ insert into course_sessions (church_id, cohort_id, activity_id, session_number)
       values ('%s', '%s', '%s', 9) $$,
    test_id('church_a'), test_id('cohorte_1'), test_id('act_meeting_d7'))),
  '22023',
  'El trigger guard rechaza colgar una sesión de una activity que no es course_session'
);
reset role;

-- ============================================================
-- 4. Las dos vías de matrícula (decisión P-3)
-- ============================================================

-- Vía 1: alta directa por el responsable.
select test_set_auth_uid('d7000000-0000-0000-0000-000000000001');
select test_remember('matricula_pedro', public.enroll_person_in_cohort(
  test_id('cohorte_1'), 'd7000000-0000-0000-0000-0000000e0003'
));

select ok(test_id('matricula_pedro') is not null, 'El responsable puede matricular directamente');

select is(
  test_err(format($$ select public.enroll_person_in_cohort('%s', '%s') $$,
                  test_id('cohorte_1'), 'd7000000-0000-0000-0000-0000000e0003')),
  '23505',
  'No se puede matricular dos veces a la misma persona'
);

-- Vía 2: la persona solicita plaza y el responsable resuelve.
select test_set_auth_uid('d7000000-0000-0000-0000-000000000004');
select test_remember('solicitud_sara', public.request_cohort_enrollment(
  test_id('cohorte_1'), 'Quiero hacerlo'
));

reset role;
select is(
  (select status::text from course_enrollments where id = test_id('solicitud_sara')),
  'requested',
  'La solicitud de plaza queda pendiente de resolver'
);

select test_set_auth_uid('d7000000-0000-0000-0000-000000000001');
select lives_ok(
  format($$ select public.resolve_cohort_enrollment('%s', true, null) $$, test_id('solicitud_sara')),
  'El responsable puede aceptar la solicitud de plaza'
);

reset role;
select is(
  (select status::text from course_enrollments where id = test_id('solicitud_sara')),
  'enrolled',
  'Aceptar la solicitud matricula a la persona'
);

select is(
  app.cohort_active_enrollment_count(test_id('cohorte_1')),
  2,
  'La cohorte tiene sus dos plazas ocupadas'
);

-- El aforo de la cohorte se respeta.
reset role;
insert into people (id, first_name, last_name) values
  ('d7000000-0000-0000-0000-0000000e0005', 'Tercero', 'EnDiscordia');
insert into church_people (id, church_id, person_id, relationship, source) values
  ('d7000000-0000-0000-0000-0000000f0005', test_id('church_a'), 'd7000000-0000-0000-0000-0000000e0005', 'member', 'manual');

select test_set_auth_uid('d7000000-0000-0000-0000-000000000001');
select is(
  test_err(format($$ select public.enroll_person_in_cohort('%s', '%s') $$,
                  test_id('cohorte_1'), 'd7000000-0000-0000-0000-0000000e0005')),
  '22023',
  'Superar el aforo de la cohorte se rechaza'
);

-- ============================================================
-- 5. Asistencia y sugerencia de finalización (decisión P-4)
-- ============================================================

select is(
  public.record_session_attendance(
    test_id('sesion_1'),
    jsonb_build_array(
      jsonb_build_object('person_id', 'd7000000-0000-0000-0000-0000000e0003', 'status', 'present'),
      jsonb_build_object('person_id', 'd7000000-0000-0000-0000-0000000e0004', 'status', 'absent')
    )
  ),
  2,
  'Registrar la asistencia de una sesión funciona'
);

select is(
  test_err(format(
    $$ select public.record_session_attendance('%s', jsonb_build_array(
         jsonb_build_object('person_id', '%s', 'status', 'present'))) $$,
    test_id('sesion_1'), 'd7000000-0000-0000-0000-0000000e0005')),
  '22023',
  'No se registra asistencia de quien no está matriculado'
);

select is(
  public.record_session_attendance(
    test_id('sesion_2'),
    jsonb_build_array(
      jsonb_build_object('person_id', 'd7000000-0000-0000-0000-0000000e0003', 'status', 'present')
    )
  ),
  1,
  'La segunda sesión también admite asistencia'
);

-- Pedro ha asistido a 2 de 2 sesiones; Sara, a 0. El umbral es 0,5.
select is(
  (select sessions_total from public.cohort_completion_suggestions(test_id('cohorte_1')) limit 1),
  2,
  'La sugerencia cuenta las dos sesiones vivas'
);

select ok(
  (select suggested from public.cohort_completion_suggestions(test_id('cohorte_1'))
   where person_id = 'd7000000-0000-0000-0000-0000000e0003'),
  'Se sugiere dar por terminado a quien supera el umbral de asistencia'
);

select ok(
  (select not suggested from public.cohort_completion_suggestions(test_id('cohorte_1'))
   where person_id = 'd7000000-0000-0000-0000-0000000e0004'),
  'No se sugiere a quien no lo alcanza'
);

reset role;
select is(
  (select count(*)::int from course_enrollments
   where cohort_id = test_id('cohorte_1') and status = 'completed'),
  0,
  'La sugerencia NO termina el curso por su cuenta: sigue decidiendo el responsable'
);

-- ============================================================
-- 6. Finalizar deja autor y fecha
-- ============================================================

select test_set_auth_uid('d7000000-0000-0000-0000-000000000001');
select lives_ok(
  format($$ select public.complete_cohort_enrollment('%s', 'Muy buen trabajo') $$,
         test_id('matricula_pedro')),
  'El responsable puede dar por terminado a un matriculado'
);

reset role;
select ok(
  (select completed_at is not null and completed_by is not null
   from course_enrollments where id = test_id('matricula_pedro')),
  'Terminar un curso deja siempre fecha y autor (decisión P-4)'
);

select ok(
  exists (
    select 1 from notification_events
    where event_type = 'course.enrollment.completed'
      and 'd7000000-0000-0000-0000-0000000e0003' = any (recipient_person_ids)
  ),
  'Terminar el curso avisa a la persona'
);

select is(
  (select (app.notification_text(e.*) ->> 'title')
   from notification_events e where e.event_type = 'course.enrollment.completed' limit 1),
  'Has terminado un curso',
  'El aviso de curso terminado tiene título propio'
);

select test_set_auth_uid('d7000000-0000-0000-0000-000000000001');
select is(
  test_err(format($$ select public.complete_cohort_enrollment('%s', null) $$,
                  test_id('matricula_pedro'))),
  '22023',
  'No se puede terminar dos veces la misma matrícula'
);

select is(
  test_err(format($$ select public.drop_cohort_enrollment('%s', null) $$,
                  test_id('matricula_pedro'))),
  '22023',
  'No se puede dar de baja un curso ya terminado'
);

-- ============================================================
-- 7. Itinerarios y progreso
-- ============================================================

select test_remember('itinerario', public.save_learning_path(
  test_id('church_a'),
  jsonb_build_object('name', 'Primeros pasos', 'status', 'active')
));

select ok(test_id('itinerario') is not null, 'Crear un itinerario funciona');

select test_remember('paso_1', public.save_path_step(
  test_id('itinerario'),
  jsonb_build_object('title', 'Bienvenida', 'kind', 'manual')
));

select test_remember('paso_2', public.save_path_step(
  test_id('itinerario'),
  jsonb_build_object('title', 'Fundamentos', 'kind', 'course', 'course_id', test_id('curso_base'))
));

reset role;
select is(
  (select step_order from path_steps where id = test_id('paso_2')),
  2::smallint,
  'Los pasos se ordenan solos al crearse'
);

select test_set_auth_uid('d7000000-0000-0000-0000-000000000001');
select is(
  test_err(format($$ select public.save_path_step('%s', jsonb_build_object('title', 'Malo', 'kind', 'course')) $$,
                  test_id('itinerario'))),
  '22023',
  'Un paso de tipo curso sin curso se rechaza'
);

-- Marcar progreso manualmente.
select test_remember('progreso_sara', public.set_person_path_step(
  test_id('paso_1'), 'd7000000-0000-0000-0000-0000000e0004', 'completed', 'Vino a la bienvenida'
));

reset role;
select ok(
  (select completed_at is not null and completed_by is not null
   from person_path_progress where id = test_id('progreso_sara')),
  'Completar un paso deja fecha y autor'
);

select ok(
  exists (
    select 1 from notification_events
    where event_type = 'path.step.completed'
      and 'd7000000-0000-0000-0000-0000000e0004' = any (recipient_person_ids)
  ),
  'Completar un paso avisa a la persona'
);

select is(
  (select (app.notification_text(e.*) ->> 'title')
   from notification_events e where e.event_type = 'path.step.completed' limit 1),
  'Has avanzado en tu itinerario',
  'El aviso de paso completado tiene título propio'
);

-- ============================================================
-- 8. Terminar el curso cierra el paso que apunta a ese curso
-- ============================================================

select test_set_auth_uid('d7000000-0000-0000-0000-000000000001');
select lives_ok(
  format($$ select public.complete_cohort_enrollment('%s', null) $$, test_id('solicitud_sara')),
  'Se puede terminar también la segunda matrícula'
);

reset role;
select is(
  (select status::text from person_path_progress
   where path_step_id = test_id('paso_2') and person_id = 'd7000000-0000-0000-0000-0000000e0004'),
  'completed',
  'Terminar el curso cierra solo el paso del itinerario que apunta a ese curso'
);

-- ============================================================
-- 9. Modificar el itinerario conserva lo conseguido (decisión P-8)
-- ============================================================

select test_set_auth_uid('d7000000-0000-0000-0000-000000000001');
select lives_ok(
  format($$ select public.set_path_step_archived('%s', true) $$, test_id('paso_1')),
  'Un paso del itinerario se puede archivar'
);

reset role;
select is(
  (select status::text from person_path_progress
   where path_step_id = test_id('paso_1') and person_id = 'd7000000-0000-0000-0000-0000000e0004'),
  'completed',
  'Archivar el paso conserva el progreso ya conseguido'
);

set role service_role;
select is(
  test_err(format($$ delete from path_steps where id = '%s' $$, test_id('paso_1'))),
  '23503',
  'Un paso con progreso no se puede borrar: la FK es on delete restrict'
);
reset role;

-- El progreso archivado sigue siendo legible para la persona.
select test_set_auth_uid('d7000000-0000-0000-0000-000000000004');
select ok(
  exists (
    select 1 from app.person_path_progress_view(test_id('itinerario'), 'd7000000-0000-0000-0000-0000000e0004')
    where path_step_id = test_id('paso_1') and archived
  ),
  'La persona sigue viendo el paso archivado en el que ya avanzó'
);

-- Reordenar no pierde nada.
select test_set_auth_uid('d7000000-0000-0000-0000-000000000001');
select test_remember('paso_3', public.save_path_step(
  test_id('itinerario'), jsonb_build_object('title', 'Bautismo', 'kind', 'manual')
));

select is(
  public.reorder_path_steps(test_id('itinerario'),
    array[test_id('paso_3'), test_id('paso_2')]::uuid[]),
  2,
  'Reordenar los pasos vivos funciona'
);

reset role;
select is(
  (select step_order from path_steps where id = test_id('paso_3')),
  1::smallint,
  'El paso movido queda el primero'
);

select is(
  (select count(*)::int from person_path_progress where learning_path_id = test_id('itinerario')),
  2,
  'Reordenar no toca el progreso de nadie'
);

-- ============================================================
-- 10. Permisos y aislamiento
-- ============================================================

-- Un miembro corriente ve el catálogo pero no gestiona.
select test_set_auth_uid('d7000000-0000-0000-0000-000000000003');

select ok(
  exists (select 1 from courses where id = test_id('curso_base')),
  'Un miembro ve los cursos activos de su iglesia'
);

select is(
  test_err(format($$ select public.save_course('%s', jsonb_build_object('name', 'Mío')) $$,
                  test_id('church_a'))),
  '42501',
  'Un miembro no puede crear cursos'
);

select is(
  test_err(format($$ select public.enroll_person_in_cohort('%s', '%s') $$,
                  test_id('cohorte_1'), 'd7000000-0000-0000-0000-0000000e0005')),
  '42501',
  'Un miembro no puede matricular a otras personas'
);

select is(
  test_err(format($$ select public.set_person_path_step('%s', '%s', 'completed', null) $$,
                  test_id('paso_3'), 'd7000000-0000-0000-0000-0000000e0003')),
  '42501',
  'Un miembro no puede marcarse sus propios pasos del itinerario'
);

-- Su propia matrícula sí la ve; la de otra persona, no.
select ok(
  exists (select 1 from course_enrollments where person_id = 'd7000000-0000-0000-0000-0000000e0003'),
  'Cada persona ve su propia matrícula'
);

select ok(
  not exists (select 1 from course_enrollments where person_id = 'd7000000-0000-0000-0000-0000000e0004'),
  'Una persona no ve la matrícula de otra'
);

-- Aislamiento entre iglesias.
select test_set_auth_uid('d7000000-0000-0000-0000-000000000002');

select is(
  (select count(*)::int from courses),
  0,
  'La iglesia B no ve los cursos de la iglesia A'
);

select is(
  (select count(*)::int from course_enrollments),
  0,
  'La iglesia B no ve las matrículas de la iglesia A'
);

select is(
  (select count(*)::int from person_path_progress),
  0,
  'La iglesia B no ve el progreso de nadie de la iglesia A'
);

select is(
  test_err(format($$ select public.create_cohort('%s', jsonb_build_object('name', 'Robada')) $$,
                  test_id('curso_base'))),
  'P0002',
  'La iglesia B no puede crear cohortes en un curso de la iglesia A'
);

-- ============================================================
-- 11. Gating de módulo
-- ============================================================

reset role;
update church_modules set status = 'disabled'
where church_id = test_id('church_a') and module_key = 'discipleship';

select test_set_auth_uid('d7000000-0000-0000-0000-000000000001');
select is(
  test_err(format($$ select public.save_course('%s', jsonb_build_object('name', 'Apagado')) $$,
                  test_id('church_a'))),
  '42501',
  'Con el módulo de Discipulado apagado no se puede crear ningún curso'
);

reset role;
update church_modules set status = 'enabled'
where church_id = test_id('church_a') and module_key = 'discipleship';

select * from finish();
rollback;
