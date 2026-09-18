-- Fase 7 · RLS y privilegios de Grupos y Discipulado.
-- Ver docs/CONTRATO-FASE-7.md §6.7.
--
-- Mismo modelo que la Fase 4 (20260920000600_rls_actividades.sql): toda
-- escritura pasa por RPC security definer, así que insert/update/delete quedan
-- revocados a anon y authenticated y NO se crean políticas de escritura. Las
-- políticas que hay aquí son solo de lectura.
--
-- La Fase 7 no tiene superficie pública: anon no lee ninguna de estas tablas
-- (decisión P-1). Los privilegios por defecto de PostgreSQL conceden EXECUTE a
-- PUBLIC, de ahí los revoke explícitos de las migraciones de funciones.

-- Habilitar y forzar RLS ------------------------------------------------------

alter table group_types enable row level security;
alter table group_types force row level security;
alter table groups enable row level security;
alter table groups force row level security;
alter table group_leaders enable row level security;
alter table group_leaders force row level security;
alter table group_members enable row level security;
alter table group_members force row level security;
alter table group_join_requests enable row level security;
alter table group_join_requests force row level security;
alter table group_meetings enable row level security;
alter table group_meetings force row level security;
alter table group_attendance enable row level security;
alter table group_attendance force row level security;
alter table courses enable row level security;
alter table courses force row level security;
alter table course_cohorts enable row level security;
alter table course_cohorts force row level security;
alter table course_sessions enable row level security;
alter table course_sessions force row level security;
alter table course_enrollments enable row level security;
alter table course_enrollments force row level security;
alter table course_session_attendance enable row level security;
alter table course_session_attendance force row level security;
alter table learning_paths enable row level security;
alter table learning_paths force row level security;
alter table path_steps enable row level security;
alter table path_steps force row level security;
alter table person_path_progress enable row level security;
alter table person_path_progress force row level security;

-- Privilegios -----------------------------------------------------------------

do $privs$
declare
  v_table text;
begin
  foreach v_table in array array[
    'group_types', 'groups', 'group_leaders', 'group_members',
    'group_join_requests', 'group_meetings', 'group_attendance',
    'courses', 'course_cohorts', 'course_sessions', 'course_enrollments',
    'course_session_attendance', 'learning_paths', 'path_steps',
    'person_path_progress'
  ]
  loop
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
    execute format('grant select on table public.%I to authenticated', v_table);
  end loop;
end;
$privs$;

-- Las funciones de trigger no se pueden invocar con un select —PostgreSQL lo
-- impide—, pero los privilegios por defecto les conceden EXECUTE a PUBLIC igual
-- que a cualquier otra. Se revocan para que la superficie expuesta sea
-- exactamente la que se ha decidido exponer, sin excepciones que haya que
-- explicar luego.
revoke all on function app.group_meetings_activity_type_guard() from public, anon, authenticated;
revoke all on function app.course_sessions_activity_type_guard() from public, anon, authenticated;

-- Políticas de lectura · Grupos ------------------------------------------------

-- El catálogo de tipos lo ve cualquier miembro de la iglesia: es lo que permite
-- filtrar el directorio interno.
create policy group_types_select on group_types
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy groups_select on groups
  for select to authenticated
  using ( app.can_read_group(id) );

-- Quién está dentro del grupo solo lo ven responsables, participantes y quien
-- puede gestionarlo: en el directorio interno se ve el grupo, no su lista.
create policy group_leaders_select on group_leaders
  for select to authenticated
  using ( app.can_read_group_roster(group_id) );

create policy group_members_select on group_members
  for select to authenticated
  using (
    person_id in (select app.current_person_ids())
    or app.can_read_group_roster(group_id)
  );

-- Una solicitud la ve quien la hizo y quien puede resolverla.
create policy group_join_requests_select on group_join_requests
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      person_id in (select app.current_person_ids())
      or app.group_cap_by_id(group_id, 'group.request.manage')
      or app.is_group_leader(group_id)
    )
  );

-- Una reunión la ven responsables y participantes del grupo, no todo el
-- directorio interno. La actividad subyacente se crea con visibility='private'
-- precisamente para que el calendario general de la iglesia no muestre el
-- nombre ni el lugar de la reunión de un grupo privado (decisión P-1); por eso
-- esta política NO se apoya en app.can_read_activity, que dejaría ver como
-- 'members' cualquier actividad publicada. La fecha y la hora llegan al
-- participante por public.list_group_meetings, que comprueba lo mismo.
create policy group_meetings_select on group_meetings
  for select to authenticated
  using ( app.can_read_group_roster(group_id) );

create policy group_attendance_select on group_attendance
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      person_id in (select app.current_person_ids())
      or exists (
        select 1 from group_meetings m
        where m.id = group_meeting_id
          and (
            app.group_cap_by_id(m.group_id, 'group.attendance.manage')
            or app.is_group_leader(m.group_id)
          )
      )
    )
  );

-- Políticas de lectura · Discipulado -------------------------------------------

create policy courses_select on courses
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      (status = 'active' and archived_at is null and app.course_cap(church_id, 'course.read'))
      or app.course_cap(church_id, 'course.manage')
    )
  );

create policy course_cohorts_select on course_cohorts
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      app.cohort_cap(id, 'course.read')
      or exists (
        select 1 from course_enrollments e
        where e.cohort_id = course_cohorts.id
          and e.person_id in (select app.current_person_ids())
      )
    )
  );

-- Igual que las reuniones de grupo: la sesión la ven quienes gestionan la
-- formación y los matriculados, sin depender de la visibilidad general de la
-- actividad (que se crea privada).
create policy course_sessions_select on course_sessions
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      app.cohort_cap(cohort_id, 'course.read')
      or exists (
        select 1 from course_enrollments e
        where e.cohort_id = course_sessions.cohort_id
          and e.person_id in (select app.current_person_ids())
          and e.status in ('enrolled', 'completed')
      )
    )
  );

-- Una matrícula la ve la persona matriculada y quien gestiona la formación.
create policy course_enrollments_select on course_enrollments
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      person_id in (select app.current_person_ids())
      or app.cohort_cap(cohort_id, 'course.enrollment.manage')
      or app.cohort_cap(cohort_id, 'course.manage')
    )
  );

create policy course_session_attendance_select on course_session_attendance
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      person_id in (select app.current_person_ids())
      or exists (
        select 1 from course_sessions s
        where s.id = course_session_id
          and (
            app.cohort_cap(s.cohort_id, 'course.attendance.manage')
            or app.cohort_cap(s.cohort_id, 'course.manage')
          )
      )
    )
  );

create policy learning_paths_select on learning_paths
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      (status = 'active' and archived_at is null and app.course_cap(church_id, 'path.read'))
      or app.course_cap(church_id, 'path.manage')
    )
  );

-- Un paso archivado sigue siendo legible para quien gestiona el itinerario y
-- para quien tiene progreso en él: así el progreso conseguido no se queda
-- huérfano de contexto cuando el itinerario cambia (decisión P-8).
create policy path_steps_select on path_steps
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      app.course_cap(church_id, 'path.manage')
      or (archived_at is null and app.course_cap(church_id, 'path.read'))
      or exists (
        select 1 from person_path_progress pp
        where pp.path_step_id = path_steps.id
          and pp.person_id in (select app.current_person_ids())
      )
    )
  );

create policy person_path_progress_select on person_path_progress
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      person_id in (select app.current_person_ids())
      or app.course_cap(church_id, 'path.progress.manage')
      or app.course_cap(church_id, 'path.manage')
    )
  );
