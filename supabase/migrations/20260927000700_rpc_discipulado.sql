-- Fase 7 · RPC de Discipulado: cursos, cohortes, sesiones, matrículas,
-- itinerarios y progreso.
-- Ver docs/CONTRATO-FASE-7.md §6.
--
-- Como en Grupos, toda escritura pasa por aquí y las sesiones se construyen
-- sobre activities reutilizando las piezas de la Fase 4, sin exigir la
-- capacidad activity.create.

-- Helpers ---------------------------------------------------------------------

create or replace function app.load_cohort(p_cohort_id uuid)
returns course_cohorts
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cohort course_cohorts%rowtype;
begin
  select * into v_cohort from course_cohorts where id = p_cohort_id;
  if not found or not (v_cohort.church_id = any (app.church_ids_for_user())) then
    raise exception 'La cohorte no existe.' using errcode = 'P0002';
  end if;
  perform app.require_discipleship_module(v_cohort.church_id);
  return v_cohort;
end;
$$;

revoke all on function app.load_cohort(uuid) from public, anon, authenticated;

create or replace function app.assert_cohort_cap(p_cohort_id uuid, p_capability text)
returns course_cohorts
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cohort course_cohorts%rowtype;
begin
  v_cohort := app.load_cohort(p_cohort_id);
  if not app.cohort_cap(p_cohort_id, p_capability) then
    raise exception 'No tienes permiso para esta acción en esta cohorte.' using errcode = '42501';
  end if;
  return v_cohort;
end;
$$;

revoke all on function app.assert_cohort_cap(uuid, text) from public, anon, authenticated;

create or replace function app.cohort_active_enrollment_count(p_cohort_id uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(*)::integer from course_enrollments
  where cohort_id = p_cohort_id and status in ('enrolled', 'completed');
$$;

revoke all on function app.cohort_active_enrollment_count(uuid) from public, anon;
grant execute on function app.cohort_active_enrollment_count(uuid) to authenticated;

-- Cursos ------------------------------------------------------------------------

create or replace function app.save_course(p_church_id uuid, p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := nullif(p_input ->> 'id', '')::uuid;
  v_name text := app.j_text(p_input, 'name');
  v_ratio numeric := nullif(p_input ->> 'completion_attendance_ratio', '')::numeric;
begin
  perform app.assert_church_member(p_church_id);
  perform app.require_discipleship_module(p_church_id);

  if v_id is null then
    if not app.has_capability(p_church_id, 'course.create') then
      raise exception 'No tienes permiso para crear cursos.' using errcode = '42501';
    end if;
    if v_name is null then
      raise exception 'El nombre del curso es obligatorio.' using errcode = '22023';
    end if;
    insert into courses (church_id, name, description, status, session_count,
                         completion_attendance_ratio, created_by)
    values (
      p_church_id, v_name, app.j_text(p_input, 'description'),
      coalesce(nullif(p_input ->> 'status', '')::course_status, 'draft'),
      nullif(p_input ->> 'session_count', '')::smallint,
      coalesce(v_ratio, 0.750),
      app.current_person_id(p_church_id)
    )
    returning id into v_id;
  else
    if not app.has_capability(p_church_id, 'course.manage') then
      raise exception 'No tienes permiso para editar cursos.' using errcode = '42501';
    end if;
    update courses set
      name = coalesce(v_name, name),
      description = case when p_input ? 'description' then app.j_text(p_input, 'description') else description end,
      status = coalesce(nullif(p_input ->> 'status', '')::course_status, status),
      session_count = case when p_input ? 'session_count'
        then nullif(p_input ->> 'session_count', '')::smallint else session_count end,
      completion_attendance_ratio = coalesce(v_ratio, completion_attendance_ratio)
    where id = v_id and church_id = p_church_id;
    if not found then
      raise exception 'El curso no existe.' using errcode = 'P0002';
    end if;
  end if;

  perform app.write_audit_log(p_church_id, 'course.saved', 'courses', v_id,
    jsonb_build_object('name', v_name));
  return v_id;
end;
$$;

revoke all on function app.save_course(uuid, jsonb) from public, anon;
grant execute on function app.save_course(uuid, jsonb) to authenticated;

create or replace function app.set_course_archived(p_course_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church uuid;
begin
  select church_id into v_church from courses where id = p_course_id;
  if v_church is null or not (v_church = any (app.church_ids_for_user())) then
    raise exception 'El curso no existe.' using errcode = 'P0002';
  end if;
  perform app.require_discipleship_module(v_church);
  if not app.has_capability(v_church, 'course.manage') then
    raise exception 'No tienes permiso para archivar cursos.' using errcode = '42501';
  end if;

  update courses set
    archived_at = case when p_archived then now() else null end,
    archived_by = case when p_archived then app.current_person_id(v_church) else null end,
    status = case when p_archived then 'archived'::course_status else 'active'::course_status end
  where id = p_course_id;

  perform app.write_audit_log(v_church,
    case when p_archived then 'course.archived' else 'course.restored' end,
    'courses', p_course_id, '{}'::jsonb);
end;
$$;

revoke all on function app.set_course_archived(uuid, boolean) from public, anon;
grant execute on function app.set_course_archived(uuid, boolean) to authenticated;

-- Cohortes ----------------------------------------------------------------------

create or replace function app.create_cohort(p_course_id uuid, p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church uuid;
  v_campus uuid := nullif(p_input ->> 'campus_id', '')::uuid;
  v_name text := app.j_text(p_input, 'name');
  v_cohort_id uuid;
begin
  select church_id into v_church from courses where id = p_course_id;
  if v_church is null or not (v_church = any (app.church_ids_for_user())) then
    raise exception 'El curso no existe.' using errcode = 'P0002';
  end if;
  perform app.require_discipleship_module(v_church);

  if not app.has_capability(v_church, 'course.create')
     and not (v_campus is not null and app.has_capability(v_church, 'course.create', 'campus', v_campus)) then
    raise exception 'No tienes permiso para crear cohortes.' using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'El nombre de la cohorte es obligatorio.' using errcode = '22023';
  end if;

  if v_campus is not null and not exists (
    select 1 from campuses c where c.id = v_campus and c.church_id = v_church and c.archived_at is null
  ) then
    raise exception 'La sede no pertenece a esta iglesia.' using errcode = '22023';
  end if;

  insert into course_cohorts (church_id, course_id, campus_id, name, status,
                              starts_on, ends_on, capacity, allows_requests, notes, created_by)
  values (
    v_church, p_course_id, v_campus, v_name,
    coalesce(nullif(p_input ->> 'status', '')::course_cohort_status, 'planned'),
    nullif(p_input ->> 'starts_on', '')::date,
    nullif(p_input ->> 'ends_on', '')::date,
    nullif(p_input ->> 'capacity', '')::integer,
    coalesce((p_input ->> 'allows_requests')::boolean, true),
    app.j_text(p_input, 'notes'),
    app.current_person_id(v_church)
  )
  returning id into v_cohort_id;

  perform app.write_audit_log(v_church, 'cohort.created', 'course_cohorts', v_cohort_id,
    jsonb_build_object('course_id', p_course_id, 'name', v_name));
  return v_cohort_id;
end;
$$;

revoke all on function app.create_cohort(uuid, jsonb) from public, anon;
grant execute on function app.create_cohort(uuid, jsonb) to authenticated;

create or replace function app.update_cohort(p_cohort_id uuid, p_input jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cohort course_cohorts%rowtype := app.assert_cohort_cap(p_cohort_id, 'course.manage');
begin
  update course_cohorts set
    name = coalesce(app.j_text(p_input, 'name'), name),
    status = coalesce(nullif(p_input ->> 'status', '')::course_cohort_status, status),
    starts_on = case when p_input ? 'starts_on' then nullif(p_input ->> 'starts_on', '')::date else starts_on end,
    ends_on = case when p_input ? 'ends_on' then nullif(p_input ->> 'ends_on', '')::date else ends_on end,
    capacity = case when p_input ? 'capacity' then nullif(p_input ->> 'capacity', '')::integer else capacity end,
    allows_requests = coalesce((p_input ->> 'allows_requests')::boolean, allows_requests),
    notes = case when p_input ? 'notes' then app.j_text(p_input, 'notes') else notes end
  where id = p_cohort_id;

  perform app.write_audit_log(v_cohort.church_id, 'cohort.updated', 'course_cohorts', p_cohort_id, '{}'::jsonb);
end;
$$;

revoke all on function app.update_cohort(uuid, jsonb) from public, anon;
grant execute on function app.update_cohort(uuid, jsonb) to authenticated;

-- Sesiones ----------------------------------------------------------------------

create or replace function app.schedule_cohort_session(p_cohort_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cohort course_cohorts%rowtype := app.assert_cohort_cap(p_cohort_id, 'course.manage');
  v_person uuid := app.current_person_id(v_cohort.church_id);
  v_course_name text;
  v_timezone text;
  v_starts timestamptz;
  v_ends timestamptz;
  v_number smallint := nullif(p_input ->> 'session_number', '')::smallint;
  v_title text;
  v_activity_id uuid;
  v_session_id uuid;
begin
  select name into v_course_name from courses where id = v_cohort.course_id;

  if v_number is null then
    select coalesce(max(session_number), 0)::smallint + 1 into v_number
    from course_sessions where cohort_id = p_cohort_id;
  end if;

  v_title := coalesce(app.j_text(p_input, 'title'),
                      v_course_name || ' · sesión ' || v_number::text);

  v_timezone := app.resolve_activity_timezone(v_cohort.church_id, v_cohort.campus_id, p_input ->> 'timezone');

  select o_starts_at, o_ends_at into v_starts, v_ends
  from app.resolve_activity_schedule('timed', 'course_session', p_input, v_timezone, 90);

  v_activity_id := app.insert_activity_row(
    v_cohort.church_id, 'course_session', v_title, app.j_text(p_input, 'description'),
    v_cohort.campus_id, 'timed', v_starts, v_ends, v_timezone,
    'private', app.j_text(p_input, 'location_text'),
    v_person, null, null, null, null, null, null
  );

  -- La sesión no recorre la máquina de estados de activities (ADR 0019): la
  -- actividad es el hueco temporal, y convocar o cancelar la sesión no exige a
  -- quien lleva la cohorte permisos sobre el calendario de la iglesia.
  insert into course_sessions (church_id, cohort_id, activity_id, session_number, topic, created_by)
  values (v_cohort.church_id, p_cohort_id, v_activity_id, v_number, app.j_text(p_input, 'topic'), v_person)
  returning id into v_session_id;

  perform app.write_audit_log(v_cohort.church_id, 'cohort.session_scheduled', 'course_sessions', v_session_id,
    jsonb_build_object('cohort_id', p_cohort_id, 'session_number', v_number));

  return jsonb_build_object('course_session_id', v_session_id, 'activity_id', v_activity_id,
                            'session_number', v_number);
end;
$$;

revoke all on function app.schedule_cohort_session(uuid, jsonb) from public, anon;
grant execute on function app.schedule_cohort_session(uuid, jsonb) to authenticated;

create or replace function app.reschedule_cohort_session(p_session_id uuid, p_input jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_session course_sessions%rowtype;
  v_cohort course_cohorts%rowtype;
  v_activity activities%rowtype;
  v_starts timestamptz;
  v_ends timestamptz;
begin
  select * into v_session from course_sessions where id = p_session_id;
  if not found then
    raise exception 'La sesión no existe.' using errcode = 'P0002';
  end if;

  v_cohort := app.assert_cohort_cap(v_session.cohort_id, 'course.manage');
  select * into v_activity from activities where id = v_session.activity_id;

  select o_starts_at, o_ends_at into v_starts, v_ends
  from app.resolve_activity_schedule('timed', 'course_session', p_input, v_activity.timezone,
    (extract(epoch from (v_activity.ends_at - v_activity.starts_at)) / 60)::integer);

  update activities set starts_at = v_starts, ends_at = v_ends,
    location_text = case when p_input ? 'location_text'
      then app.j_text(p_input, 'location_text') else location_text end
  where id = v_session.activity_id;

  perform app.emit_notification_event(
    v_cohort.church_id, 'course.session.rescheduled', 'course_sessions', p_session_id, null,
    app.cohort_notification_recipients(v_session.cohort_id),
    app.cohort_notification_payload(v_session.cohort_id)
      || jsonb_build_object('activity_id', v_session.activity_id,
                            'activity_title', v_activity.title,
                            'starts_at', v_starts, 'timezone', v_activity.timezone),
    null, extract(epoch from v_starts)::bigint::text
  );

  perform app.write_audit_log(v_cohort.church_id, 'cohort.session_rescheduled', 'course_sessions',
    p_session_id, jsonb_build_object('starts_at', v_starts));
end;
$$;

revoke all on function app.reschedule_cohort_session(uuid, jsonb) from public, anon;
grant execute on function app.reschedule_cohort_session(uuid, jsonb) to authenticated;

create or replace function app.cancel_cohort_session(p_session_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_session course_sessions%rowtype;
  v_cohort course_cohorts%rowtype;
  v_activity activities%rowtype;
begin
  select * into v_session from course_sessions where id = p_session_id;
  if not found then
    raise exception 'La sesión no existe.' using errcode = 'P0002';
  end if;

  v_cohort := app.assert_cohort_cap(v_session.cohort_id, 'course.manage');
  select * into v_activity from activities where id = v_session.activity_id;

  if v_session.cancelled_at is not null then
    raise exception 'Esa sesión ya está cancelada.' using errcode = '22023';
  end if;

  -- Se cancela la sesión, no la actividad (ADR 0019).
  update course_sessions set cancelled_at = now(),
    cancelled_by = app.current_person_id(v_cohort.church_id),
    cancellation_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_session_id;

  perform app.emit_notification_event(
    v_cohort.church_id, 'course.session.cancelled', 'course_sessions', p_session_id, null,
    app.cohort_notification_recipients(v_session.cohort_id),
    app.cohort_notification_payload(v_session.cohort_id)
      || jsonb_build_object('activity_id', v_session.activity_id,
                            'activity_title', v_activity.title,
                            'starts_at', v_activity.starts_at, 'timezone', v_activity.timezone),
    null, null
  );

  perform app.write_audit_log(v_cohort.church_id, 'cohort.session_cancelled', 'course_sessions',
    p_session_id, jsonb_build_object('reason', p_reason));
end;
$$;

revoke all on function app.cancel_cohort_session(uuid, text) from public, anon;
grant execute on function app.cancel_cohort_session(uuid, text) to authenticated;

-- Matrículas ---------------------------------------------------------------------
-- Las dos vías acordadas (decisión P-3): alta directa por el responsable y
-- solicitud de plaza resuelta por el responsable.

create or replace function app.enroll_person_in_cohort(p_cohort_id uuid, p_person_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cohort course_cohorts%rowtype := app.assert_cohort_cap(p_cohort_id, 'course.enrollment.manage');
  v_enrollment_id uuid;
begin
  perform app.assert_active_church_person(v_cohort.church_id, p_person_id, 'El matriculado');

  if exists (
    select 1 from course_enrollments
    where cohort_id = p_cohort_id and person_id = p_person_id and status in ('enrolled', 'completed')
  ) then
    raise exception 'Esa persona ya está matriculada en esta cohorte.' using errcode = '23505';
  end if;

  if v_cohort.capacity is not null
     and app.cohort_active_enrollment_count(p_cohort_id) >= v_cohort.capacity then
    raise exception 'La cohorte «%» ha alcanzado su aforo.', v_cohort.name using errcode = '22023';
  end if;

  insert into course_enrollments (church_id, cohort_id, person_id, status, enrolled_at,
                                  decided_by, decided_at, created_by)
  values (v_cohort.church_id, p_cohort_id, p_person_id, 'enrolled', now(),
          app.current_person_id(v_cohort.church_id), now(),
          app.current_person_id(v_cohort.church_id))
  on conflict (cohort_id, person_id) do update set
    status = 'enrolled', enrolled_at = now(), dropped_at = null, drop_reason = null,
    decided_by = excluded.decided_by, decided_at = now()
  returning id into v_enrollment_id;

  perform app.write_audit_log(v_cohort.church_id, 'cohort.enrolled', 'course_enrollments', v_enrollment_id,
    jsonb_build_object('cohort_id', p_cohort_id, 'person_id', p_person_id));
  return v_enrollment_id;
end;
$$;

revoke all on function app.enroll_person_in_cohort(uuid, uuid) from public, anon;
grant execute on function app.enroll_person_in_cohort(uuid, uuid) to authenticated;

create or replace function app.request_cohort_enrollment(p_cohort_id uuid, p_message text default null)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cohort course_cohorts%rowtype := app.load_cohort(p_cohort_id);
  v_person uuid := app.current_person_id(v_cohort.church_id);
  v_enrollment_id uuid;
begin
  if v_person is null then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if not v_cohort.allows_requests then
    raise exception 'Esta cohorte solo admite altas hechas por su responsable.' using errcode = '22023';
  end if;

  if v_cohort.archived_at is not null or v_cohort.status not in ('planned', 'open') then
    raise exception 'Esta cohorte no admite solicitudes ahora mismo.' using errcode = '22023';
  end if;

  if exists (
    select 1 from course_enrollments
    where cohort_id = p_cohort_id and person_id = v_person
      and status in ('requested', 'enrolled', 'completed')
  ) then
    raise exception 'Ya tienes una plaza o una solicitud en esta cohorte.' using errcode = '23505';
  end if;

  insert into course_enrollments (church_id, cohort_id, person_id, status,
                                  request_message, requested_at, created_by)
  values (v_cohort.church_id, p_cohort_id, v_person, 'requested',
          nullif(btrim(coalesce(p_message, '')), ''), now(), v_person)
  on conflict (cohort_id, person_id) do update set
    status = 'requested', request_message = excluded.request_message, requested_at = now(),
    decided_by = null, decided_at = null, decision_note = null
  returning id into v_enrollment_id;

  perform app.write_audit_log(v_cohort.church_id, 'cohort.enrollment_requested', 'course_enrollments',
    v_enrollment_id, jsonb_build_object('cohort_id', p_cohort_id));
  return v_enrollment_id;
end;
$$;

revoke all on function app.request_cohort_enrollment(uuid, text) from public, anon;
grant execute on function app.request_cohort_enrollment(uuid, text) to authenticated;

create or replace function app.resolve_cohort_enrollment(
  p_enrollment_id uuid,
  p_accept boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_enrollment course_enrollments%rowtype;
  v_cohort course_cohorts%rowtype;
begin
  select * into v_enrollment from course_enrollments where id = p_enrollment_id;
  if not found then
    raise exception 'La solicitud no existe.' using errcode = 'P0002';
  end if;

  v_cohort := app.assert_cohort_cap(v_enrollment.cohort_id, 'course.enrollment.manage');

  if v_enrollment.status <> 'requested' then
    raise exception 'Esa solicitud ya está resuelta.' using errcode = '22023';
  end if;

  if p_accept and v_cohort.capacity is not null
     and app.cohort_active_enrollment_count(v_enrollment.cohort_id) >= v_cohort.capacity then
    raise exception 'La cohorte «%» ha alcanzado su aforo.', v_cohort.name using errcode = '22023';
  end if;

  update course_enrollments set
    status = case when p_accept then 'enrolled'::course_enrollment_status
                  else 'rejected'::course_enrollment_status end,
    enrolled_at = case when p_accept then now() else enrolled_at end,
    decided_by = app.current_person_id(v_cohort.church_id),
    decided_at = now(),
    decision_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_enrollment_id;

  perform app.write_audit_log(v_cohort.church_id,
    case when p_accept then 'cohort.enrollment_accepted' else 'cohort.enrollment_rejected' end,
    'course_enrollments', p_enrollment_id,
    jsonb_build_object('person_id', v_enrollment.person_id));
end;
$$;

revoke all on function app.resolve_cohort_enrollment(uuid, boolean, text) from public, anon;
grant execute on function app.resolve_cohort_enrollment(uuid, boolean, text) to authenticated;

create or replace function app.drop_cohort_enrollment(p_enrollment_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_enrollment course_enrollments%rowtype;
  v_cohort course_cohorts%rowtype;
  v_self boolean;
begin
  select * into v_enrollment from course_enrollments where id = p_enrollment_id;
  if not found then
    raise exception 'La matrícula no existe.' using errcode = 'P0002';
  end if;

  v_cohort := app.load_cohort(v_enrollment.cohort_id);
  v_self := v_enrollment.person_id in (select app.current_person_ids());

  if not v_self and not app.cohort_cap(v_enrollment.cohort_id, 'course.enrollment.manage') then
    raise exception 'No tienes permiso para dar de baja matrículas.' using errcode = '42501';
  end if;

  if v_enrollment.status = 'completed' then
    raise exception 'No se puede dar de baja un curso ya terminado.' using errcode = '22023';
  end if;

  update course_enrollments set
    status = 'dropped', dropped_at = now(),
    drop_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_enrollment_id;

  perform app.write_audit_log(v_cohort.church_id, 'cohort.enrollment_dropped', 'course_enrollments',
    p_enrollment_id, jsonb_build_object('self', v_self));
end;
$$;

revoke all on function app.drop_cohort_enrollment(uuid, text) from public, anon;
grant execute on function app.drop_cohort_enrollment(uuid, text) to authenticated;

-- Dar por terminado es un acto explícito del responsable, con autor y fecha
-- (decisión P-4). Además arrastra el progreso de los itinerarios cuyo paso
-- apunta a este curso: terminar el curso cierra ese paso, no hay que marcarlo
-- dos veces.
create or replace function app.complete_cohort_enrollment(p_enrollment_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_enrollment course_enrollments%rowtype;
  v_cohort course_cohorts%rowtype;
  v_actor uuid;
  v_step record;
begin
  select * into v_enrollment from course_enrollments where id = p_enrollment_id;
  if not found then
    raise exception 'La matrícula no existe.' using errcode = 'P0002';
  end if;

  v_cohort := app.assert_cohort_cap(v_enrollment.cohort_id, 'course.enrollment.manage');

  if v_enrollment.status <> 'enrolled' then
    raise exception 'Solo se puede dar por terminada una matrícula en curso.' using errcode = '22023';
  end if;

  v_actor := app.current_person_id(v_cohort.church_id);

  update course_enrollments set
    status = 'completed', completed_at = now(), completed_by = v_actor,
    completion_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_enrollment_id;

  perform app.emit_notification_event(
    v_cohort.church_id, 'course.enrollment.completed', 'course_enrollments', p_enrollment_id, null,
    array[v_enrollment.person_id],
    app.cohort_notification_payload(v_enrollment.cohort_id),
    null, null
  );

  -- Pasos de itinerario que se dan por hechos al terminar este curso.
  for v_step in
    select ps.id, ps.learning_path_id, ps.title, lp.name as path_name
    from path_steps ps
    join learning_paths lp on lp.id = ps.learning_path_id and lp.church_id = ps.church_id
    where ps.church_id = v_cohort.church_id
      and ps.kind = 'course'
      and ps.course_id = v_cohort.course_id
      and ps.archived_at is null
  loop
    insert into person_path_progress (church_id, learning_path_id, path_step_id, person_id,
                                      status, completed_at, completed_by, created_by)
    values (v_cohort.church_id, v_step.learning_path_id, v_step.id, v_enrollment.person_id,
            'completed', now(), v_actor, v_actor)
    on conflict (path_step_id, person_id) do update set
      status = 'completed', completed_at = now(), completed_by = v_actor
    where person_path_progress.status <> 'completed';

    perform app.emit_notification_event(
      v_cohort.church_id, 'path.step.completed', 'path_steps', v_step.id, null,
      array[v_enrollment.person_id],
      jsonb_build_object('step_title', v_step.title, 'path_name', v_step.path_name,
                         'learning_path_id', v_step.learning_path_id),
      v_enrollment.person_id::text, null
    );
  end loop;

  perform app.write_audit_log(v_cohort.church_id, 'cohort.enrollment_completed', 'course_enrollments',
    p_enrollment_id, jsonb_build_object('person_id', v_enrollment.person_id));
end;
$$;

revoke all on function app.complete_cohort_enrollment(uuid, text) from public, anon;
grant execute on function app.complete_cohort_enrollment(uuid, text) to authenticated;

-- Asistencia a sesiones -------------------------------------------------------------

create or replace function app.record_session_attendance(p_session_id uuid, p_entries jsonb)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_session course_sessions%rowtype;
  v_cohort course_cohorts%rowtype;
  v_entry jsonb;
  v_person uuid;
  v_recorder uuid;
  v_count integer := 0;
begin
  select * into v_session from course_sessions where id = p_session_id;
  if not found then
    raise exception 'La sesión no existe.' using errcode = 'P0002';
  end if;

  v_cohort := app.assert_cohort_cap(v_session.cohort_id, 'course.attendance.manage');
  v_recorder := app.current_person_id(v_cohort.church_id);

  if jsonb_typeof(p_entries) <> 'array' then
    raise exception 'La asistencia debe ser una lista.' using errcode = '22023';
  end if;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    v_person := nullif(v_entry ->> 'person_id', '')::uuid;
    if v_person is null then
      raise exception 'Cada línea de asistencia necesita una persona.' using errcode = '22023';
    end if;

    if not exists (
      select 1 from course_enrollments
      where cohort_id = v_session.cohort_id and person_id = v_person
        and status in ('enrolled', 'completed')
    ) then
      raise exception 'Esa persona no está matriculada en la cohorte.' using errcode = '22023';
    end if;

    insert into course_session_attendance (church_id, course_session_id, person_id, status,
                                           notes, recorded_by, recorded_at)
    values (v_cohort.church_id, p_session_id, v_person,
            coalesce(nullif(v_entry ->> 'status', '')::group_attendance_status, 'present'),
            app.j_text(v_entry, 'notes'), v_recorder, now())
    on conflict (course_session_id, person_id) do update set
      status = excluded.status, notes = excluded.notes,
      recorded_by = excluded.recorded_by, recorded_at = now();

    v_count := v_count + 1;
  end loop;

  update course_sessions set attendance_recorded_at = now(), attendance_recorded_by = v_recorder
  where id = p_session_id;

  perform app.write_audit_log(v_cohort.church_id, 'cohort.attendance_recorded', 'course_sessions',
    p_session_id, jsonb_build_object('entries', v_count));
  return v_count;
end;
$$;

revoke all on function app.record_session_attendance(uuid, jsonb) from public, anon;
grant execute on function app.record_session_attendance(uuid, jsonb) to authenticated;

-- app.cohort_completion_suggestions(): a quién SUGIERE la aplicación dar por
-- terminado, por haber alcanzado el umbral de asistencia del curso. Es una
-- sugerencia: quien decide es el responsable (decisión P-4).
create or replace function app.cohort_completion_suggestions(p_cohort_id uuid)
returns table (
  enrollment_id uuid,
  person_id uuid,
  display_name text,
  sessions_total integer,
  sessions_attended integer,
  attendance_ratio numeric,
  suggested boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with cohort as (
    select cc.*, c.completion_attendance_ratio
    from course_cohorts cc
    join courses c on c.id = cc.course_id and c.church_id = cc.church_id
    where cc.id = p_cohort_id
      and (app.cohort_cap(p_cohort_id, 'course.enrollment.manage')
           or app.cohort_cap(p_cohort_id, 'course.manage'))
  ),
  sessions as (
    select count(*)::integer as total
    from course_sessions s
    where s.cohort_id = p_cohort_id and s.cancelled_at is null
  )
  select
    e.id,
    e.person_id,
    coalesce(nullif(p.preferred_name, ''), p.first_name) || coalesce(' ' || p.last_name, ''),
    s.total,
    (select count(*)::integer from course_session_attendance att
      join course_sessions cs on cs.id = att.course_session_id
      where cs.cohort_id = p_cohort_id and att.person_id = e.person_id and att.status = 'present'),
    case when s.total = 0 then 0::numeric else
      round((select count(*)::numeric from course_session_attendance att
             join course_sessions cs on cs.id = att.course_session_id
             where cs.cohort_id = p_cohort_id and att.person_id = e.person_id and att.status = 'present')
            / s.total, 3) end,
    case when s.total = 0 then false else
      (select count(*)::numeric from course_session_attendance att
       join course_sessions cs on cs.id = att.course_session_id
       where cs.cohort_id = p_cohort_id and att.person_id = e.person_id and att.status = 'present')
      / s.total >= cohort.completion_attendance_ratio end
  from cohort
  cross join sessions s
  join course_enrollments e on e.cohort_id = cohort.id and e.status = 'enrolled'
  join people p on p.id = e.person_id
  order by 6 desc, 3;
$$;

revoke all on function app.cohort_completion_suggestions(uuid) from public, anon;
grant execute on function app.cohort_completion_suggestions(uuid) to authenticated;

-- Itinerarios ------------------------------------------------------------------------

create or replace function app.save_learning_path(p_church_id uuid, p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := nullif(p_input ->> 'id', '')::uuid;
  v_name text := app.j_text(p_input, 'name');
begin
  perform app.assert_church_member(p_church_id);
  perform app.require_discipleship_module(p_church_id);
  if not app.has_capability(p_church_id, 'path.manage') then
    raise exception 'No tienes permiso para gestionar itinerarios.' using errcode = '42501';
  end if;

  if v_id is null then
    if v_name is null then
      raise exception 'El nombre del itinerario es obligatorio.' using errcode = '22023';
    end if;
    insert into learning_paths (church_id, name, description, status, created_by)
    values (p_church_id, v_name, app.j_text(p_input, 'description'),
            coalesce(nullif(p_input ->> 'status', '')::learning_path_status, 'draft'),
            app.current_person_id(p_church_id))
    returning id into v_id;
  else
    update learning_paths set
      name = coalesce(v_name, name),
      description = case when p_input ? 'description' then app.j_text(p_input, 'description') else description end,
      status = coalesce(nullif(p_input ->> 'status', '')::learning_path_status, status)
    where id = v_id and church_id = p_church_id;
    if not found then
      raise exception 'El itinerario no existe.' using errcode = 'P0002';
    end if;
  end if;

  perform app.write_audit_log(p_church_id, 'path.saved', 'learning_paths', v_id,
    jsonb_build_object('name', v_name));
  return v_id;
end;
$$;

revoke all on function app.save_learning_path(uuid, jsonb) from public, anon;
grant execute on function app.save_learning_path(uuid, jsonb) to authenticated;

create or replace function app.save_path_step(p_learning_path_id uuid, p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church uuid;
  v_id uuid := nullif(p_input ->> 'id', '')::uuid;
  v_title text := app.j_text(p_input, 'title');
  v_kind path_step_kind := coalesce(nullif(p_input ->> 'kind', '')::path_step_kind, 'manual');
  v_course uuid := nullif(p_input ->> 'course_id', '')::uuid;
  v_position smallint := nullif(p_input ->> 'step_order', '')::smallint;
begin
  select church_id into v_church from learning_paths where id = p_learning_path_id;
  if v_church is null or not (v_church = any (app.church_ids_for_user())) then
    raise exception 'El itinerario no existe.' using errcode = 'P0002';
  end if;
  perform app.require_discipleship_module(v_church);
  if not app.has_capability(v_church, 'path.manage') then
    raise exception 'No tienes permiso para gestionar itinerarios.' using errcode = '42501';
  end if;

  if v_kind = 'course' then
    if v_course is null then
      raise exception 'Un paso de tipo curso necesita un curso.' using errcode = '22023';
    end if;
    if not exists (select 1 from courses where id = v_course and church_id = v_church) then
      raise exception 'El curso no pertenece a esta iglesia.' using errcode = '22023';
    end if;
  else
    v_course := null;
  end if;

  if v_id is null then
    if v_title is null then
      raise exception 'El título del paso es obligatorio.' using errcode = '22023';
    end if;
    if v_position is null then
      select (coalesce(max(step_order), 0) + 1)::smallint into v_position
      from path_steps where learning_path_id = p_learning_path_id and archived_at is null;
    end if;
    insert into path_steps (church_id, learning_path_id, step_order, title, description,
                            kind, course_id, is_required, created_by)
    values (v_church, p_learning_path_id, v_position, v_title, app.j_text(p_input, 'description'),
            v_kind, v_course, coalesce((p_input ->> 'is_required')::boolean, true),
            app.current_person_id(v_church))
    returning id into v_id;
  else
    update path_steps set
      title = coalesce(v_title, title),
      description = case when p_input ? 'description' then app.j_text(p_input, 'description') else description end,
      kind = v_kind,
      course_id = v_course,
      is_required = coalesce((p_input ->> 'is_required')::boolean, is_required),
      step_order = coalesce(v_position, step_order)
    where id = v_id and church_id = v_church;
    if not found then
      raise exception 'El paso no existe.' using errcode = 'P0002';
    end if;
  end if;

  perform app.write_audit_log(v_church, 'path.step_saved', 'path_steps', v_id,
    jsonb_build_object('learning_path_id', p_learning_path_id));
  return v_id;
end;
$$;

revoke all on function app.save_path_step(uuid, jsonb) from public, anon;
grant execute on function app.save_path_step(uuid, jsonb) to authenticated;

-- Archivar un paso conserva el progreso conseguido (decisión P-8): la FK de
-- person_path_progress es on delete restrict precisamente para que nadie pueda
-- borrarlo por error.
create or replace function app.set_path_step_archived(p_path_step_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church uuid;
begin
  select church_id into v_church from path_steps where id = p_path_step_id;
  if v_church is null or not (v_church = any (app.church_ids_for_user())) then
    raise exception 'El paso no existe.' using errcode = 'P0002';
  end if;
  perform app.require_discipleship_module(v_church);
  if not app.has_capability(v_church, 'path.manage') then
    raise exception 'No tienes permiso para gestionar itinerarios.' using errcode = '42501';
  end if;

  update path_steps set
    archived_at = case when p_archived then now() else null end,
    archived_by = case when p_archived then app.current_person_id(v_church) else null end
  where id = p_path_step_id;

  perform app.write_audit_log(v_church,
    case when p_archived then 'path.step_archived' else 'path.step_restored' end,
    'path_steps', p_path_step_id, '{}'::jsonb);
end;
$$;

revoke all on function app.set_path_step_archived(uuid, boolean) from public, anon;
grant execute on function app.set_path_step_archived(uuid, boolean) to authenticated;

create or replace function app.reorder_path_steps(p_learning_path_id uuid, p_step_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church uuid;
  v_id uuid;
  v_pos smallint := 0;
  v_count integer := 0;
begin
  select church_id into v_church from learning_paths where id = p_learning_path_id;
  if v_church is null or not (v_church = any (app.church_ids_for_user())) then
    raise exception 'El itinerario no existe.' using errcode = 'P0002';
  end if;
  perform app.require_discipleship_module(v_church);
  if not app.has_capability(v_church, 'path.manage') then
    raise exception 'No tienes permiso para gestionar itinerarios.' using errcode = '42501';
  end if;

  -- Se aparta el orden actual para que el índice único parcial no choque a
  -- mitad de la reordenación.
  update path_steps set step_order = (step_order + 1000)::smallint
  where learning_path_id = p_learning_path_id and archived_at is null;

  foreach v_id in array p_step_ids
  loop
    v_pos := (v_pos + 1)::smallint;
    update path_steps set step_order = v_pos
    where id = v_id and learning_path_id = p_learning_path_id and church_id = v_church;
    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  -- Los pasos no mencionados quedan detrás, en su orden relativo.
  for v_id in
    select id from path_steps
    where learning_path_id = p_learning_path_id and archived_at is null and step_order > 1000
    order by step_order
  loop
    v_pos := (v_pos + 1)::smallint;
    update path_steps set step_order = v_pos where id = v_id;
  end loop;

  perform app.write_audit_log(v_church, 'path.steps_reordered', 'learning_paths', p_learning_path_id,
    jsonb_build_object('steps', v_count));
  return v_count;
end;
$$;

revoke all on function app.reorder_path_steps(uuid, uuid[]) from public, anon;
grant execute on function app.reorder_path_steps(uuid, uuid[]) to authenticated;

create or replace function app.set_person_path_step(
  p_path_step_id uuid,
  p_person_id uuid,
  p_status path_progress_status,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_step path_steps%rowtype;
  v_path_name text;
  v_actor uuid;
  v_progress_id uuid;
  v_was_completed boolean;
begin
  select * into v_step from path_steps where id = p_path_step_id;
  if not found or not (v_step.church_id = any (app.church_ids_for_user())) then
    raise exception 'El paso no existe.' using errcode = 'P0002';
  end if;
  perform app.require_discipleship_module(v_step.church_id);

  if not app.has_capability(v_step.church_id, 'path.progress.manage')
     and not app.has_capability(v_step.church_id, 'path.manage') then
    raise exception 'No tienes permiso para marcar el progreso de un itinerario.' using errcode = '42501';
  end if;

  perform app.assert_active_church_person(v_step.church_id, p_person_id, 'La persona del itinerario');

  select name into v_path_name from learning_paths where id = v_step.learning_path_id;
  v_actor := app.current_person_id(v_step.church_id);

  select status = 'completed' into v_was_completed
  from person_path_progress where path_step_id = p_path_step_id and person_id = p_person_id;

  insert into person_path_progress (church_id, learning_path_id, path_step_id, person_id, status,
                                    started_at, completed_at, completed_by, note, created_by)
  values (
    v_step.church_id, v_step.learning_path_id, p_path_step_id, p_person_id, p_status,
    case when p_status = 'in_progress' then now() end,
    case when p_status in ('completed', 'skipped') then now() end,
    case when p_status in ('completed', 'skipped') then v_actor end,
    nullif(btrim(coalesce(p_note, '')), ''), v_actor
  )
  on conflict (path_step_id, person_id) do update set
    status = excluded.status,
    started_at = coalesce(person_path_progress.started_at, excluded.started_at),
    completed_at = excluded.completed_at,
    completed_by = excluded.completed_by,
    note = coalesce(excluded.note, person_path_progress.note)
  returning id into v_progress_id;

  -- Solo se avisa al cruzar a «completado», no en cada corrección.
  if p_status = 'completed' and not coalesce(v_was_completed, false) then
    perform app.emit_notification_event(
      v_step.church_id, 'path.step.completed', 'path_steps', p_path_step_id, null,
      array[p_person_id],
      jsonb_build_object('step_title', v_step.title, 'path_name', v_path_name,
                         'learning_path_id', v_step.learning_path_id),
      p_person_id::text, null
    );
  end if;

  perform app.write_audit_log(v_step.church_id, 'path.progress_set', 'person_path_progress',
    v_progress_id, jsonb_build_object('person_id', p_person_id, 'status', p_status));
  return v_progress_id;
end;
$$;

revoke all on function app.set_person_path_step(uuid, uuid, path_progress_status, text) from public, anon;
grant execute on function app.set_person_path_step(uuid, uuid, path_progress_status, text) to authenticated;

-- app.person_path_progress_view(): el itinerario de una persona, paso a paso.
-- Los pasos archivados aparecen solo si esa persona tiene progreso en ellos,
-- que es lo que hace legible el historial cuando el itinerario cambia (P-8).
create or replace function app.person_path_progress_view(p_learning_path_id uuid, p_person_id uuid)
returns table (
  path_step_id uuid,
  step_order smallint,
  title text,
  kind path_step_kind,
  is_required boolean,
  archived boolean,
  status path_progress_status,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    ps.id, ps.step_order, ps.title, ps.kind, ps.is_required,
    ps.archived_at is not null,
    coalesce(pp.status, 'pending'::path_progress_status),
    pp.completed_at
  from path_steps ps
  left join person_path_progress pp
    on pp.path_step_id = ps.id and pp.person_id = p_person_id
  where ps.learning_path_id = p_learning_path_id
    and (ps.archived_at is null or pp.id is not null)
    and (
      p_person_id in (select app.current_person_ids())
      or app.has_capability(ps.church_id, 'path.progress.manage')
      or app.has_capability(ps.church_id, 'path.manage')
    )
  order by ps.step_order;
$$;

revoke all on function app.person_path_progress_view(uuid, uuid) from public, anon;
grant execute on function app.person_path_progress_view(uuid, uuid) to authenticated;

create or replace function app.discipleship_metrics(p_church_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'active_courses', (
      select count(*) from courses c
      where c.church_id = p_church_id and c.archived_at is null and c.status = 'active'
        and app.course_cap(p_church_id, 'course.read')
    ),
    'running_cohorts', (
      select count(*) from course_cohorts cc
      where cc.church_id = p_church_id and cc.archived_at is null
        and cc.status in ('open', 'running') and app.cohort_cap(cc.id, 'course.read')
    ),
    'enrolled_people', (
      select count(distinct e.person_id) from course_enrollments e
      where e.church_id = p_church_id and e.status = 'enrolled'
        and app.cohort_cap(e.cohort_id, 'course.enrollment.manage')
    ),
    'pending_enrollment_requests', (
      select count(*) from course_enrollments e
      where e.church_id = p_church_id and e.status = 'requested'
        and app.cohort_cap(e.cohort_id, 'course.enrollment.manage')
    ),
    'completions_last_90_days', (
      select count(*) from course_enrollments e
      where e.church_id = p_church_id and e.status = 'completed'
        and e.completed_at >= now() - interval '90 days'
        and app.cohort_cap(e.cohort_id, 'course.enrollment.manage')
    ),
    'active_paths', (
      select count(*) from learning_paths lp
      where lp.church_id = p_church_id and lp.archived_at is null and lp.status = 'active'
        and app.course_cap(p_church_id, 'path.read')
    ),
    'people_in_paths', (
      select count(distinct pp.person_id) from person_path_progress pp
      where pp.church_id = p_church_id and pp.status in ('in_progress', 'completed')
        and (app.course_cap(p_church_id, 'path.progress.manage')
             or app.course_cap(p_church_id, 'path.manage'))
    )
  );
$$;

revoke all on function app.discipleship_metrics(uuid) from public, anon;
grant execute on function app.discipleship_metrics(uuid) to authenticated;

-- Envoltorios públicos ---------------------------------------------------------------

create or replace function public.save_course(p_church_id uuid, p_input jsonb)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.save_course(p_church_id, p_input); $$;

create or replace function public.set_course_archived(p_course_id uuid, p_archived boolean)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.set_course_archived(p_course_id, p_archived); $$;

create or replace function public.create_cohort(p_course_id uuid, p_input jsonb)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.create_cohort(p_course_id, p_input); $$;

create or replace function public.update_cohort(p_cohort_id uuid, p_input jsonb)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.update_cohort(p_cohort_id, p_input); $$;

create or replace function public.schedule_cohort_session(p_cohort_id uuid, p_input jsonb)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.schedule_cohort_session(p_cohort_id, p_input); $$;

create or replace function public.reschedule_cohort_session(p_session_id uuid, p_input jsonb)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.reschedule_cohort_session(p_session_id, p_input); $$;

create or replace function public.cancel_cohort_session(p_session_id uuid, p_reason text default null)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.cancel_cohort_session(p_session_id, p_reason); $$;

create or replace function public.enroll_person_in_cohort(p_cohort_id uuid, p_person_id uuid)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.enroll_person_in_cohort(p_cohort_id, p_person_id); $$;

create or replace function public.request_cohort_enrollment(p_cohort_id uuid, p_message text default null)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.request_cohort_enrollment(p_cohort_id, p_message); $$;

create or replace function public.resolve_cohort_enrollment(p_enrollment_id uuid, p_accept boolean, p_note text default null)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.resolve_cohort_enrollment(p_enrollment_id, p_accept, p_note); $$;

create or replace function public.drop_cohort_enrollment(p_enrollment_id uuid, p_reason text default null)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.drop_cohort_enrollment(p_enrollment_id, p_reason); $$;

create or replace function public.complete_cohort_enrollment(p_enrollment_id uuid, p_note text default null)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.complete_cohort_enrollment(p_enrollment_id, p_note); $$;

create or replace function public.record_session_attendance(p_session_id uuid, p_entries jsonb)
returns integer language sql security invoker set search_path = pg_catalog, public
as $$ select app.record_session_attendance(p_session_id, p_entries); $$;

create or replace function public.cohort_completion_suggestions(p_cohort_id uuid)
returns table (
  enrollment_id uuid, person_id uuid, display_name text, sessions_total integer,
  sessions_attended integer, attendance_ratio numeric, suggested boolean
)
language sql stable security invoker set search_path = pg_catalog, public
as $$ select * from app.cohort_completion_suggestions(p_cohort_id); $$;

create or replace function public.save_learning_path(p_church_id uuid, p_input jsonb)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.save_learning_path(p_church_id, p_input); $$;

create or replace function public.save_path_step(p_learning_path_id uuid, p_input jsonb)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.save_path_step(p_learning_path_id, p_input); $$;

create or replace function public.set_path_step_archived(p_path_step_id uuid, p_archived boolean)
returns void language sql security invoker set search_path = pg_catalog, public
as $$ select app.set_path_step_archived(p_path_step_id, p_archived); $$;

create or replace function public.reorder_path_steps(p_learning_path_id uuid, p_step_ids uuid[])
returns integer language sql security invoker set search_path = pg_catalog, public
as $$ select app.reorder_path_steps(p_learning_path_id, p_step_ids); $$;

create or replace function public.set_person_path_step(
  p_path_step_id uuid, p_person_id uuid, p_status path_progress_status, p_note text default null
)
returns uuid language sql security invoker set search_path = pg_catalog, public
as $$ select app.set_person_path_step(p_path_step_id, p_person_id, p_status, p_note); $$;

create or replace function public.person_path_progress_view(p_learning_path_id uuid, p_person_id uuid)
returns table (
  path_step_id uuid, step_order smallint, title text, kind path_step_kind,
  is_required boolean, archived boolean, status path_progress_status, completed_at timestamptz
)
language sql stable security invoker set search_path = pg_catalog, public
as $$ select * from app.person_path_progress_view(p_learning_path_id, p_person_id); $$;

create or replace function public.discipleship_metrics(p_church_id uuid)
returns jsonb language sql stable security invoker set search_path = pg_catalog, public
as $$ select app.discipleship_metrics(p_church_id); $$;

do $grants$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.save_course(uuid, jsonb)',
    'public.set_course_archived(uuid, boolean)',
    'public.create_cohort(uuid, jsonb)',
    'public.update_cohort(uuid, jsonb)',
    'public.schedule_cohort_session(uuid, jsonb)',
    'public.reschedule_cohort_session(uuid, jsonb)',
    'public.cancel_cohort_session(uuid, text)',
    'public.enroll_person_in_cohort(uuid, uuid)',
    'public.request_cohort_enrollment(uuid, text)',
    'public.resolve_cohort_enrollment(uuid, boolean, text)',
    'public.drop_cohort_enrollment(uuid, text)',
    'public.complete_cohort_enrollment(uuid, text)',
    'public.record_session_attendance(uuid, jsonb)',
    'public.cohort_completion_suggestions(uuid)',
    'public.save_learning_path(uuid, jsonb)',
    'public.save_path_step(uuid, jsonb)',
    'public.set_path_step_archived(uuid, boolean)',
    'public.reorder_path_steps(uuid, uuid[])',
    'public.set_person_path_step(uuid, uuid, path_progress_status, text)',
    'public.person_path_progress_view(uuid, uuid)',
    'public.discipleship_metrics(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
end;
$grants$;
