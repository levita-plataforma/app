-- Fase 7 · Esquema de Discipulado: cursos, cohortes, sesiones, matrículas,
-- itinerarios y progreso.
-- Ver docs/CONTRATO-FASE-7.md §4.2.
--
-- Las sesiones son actividades de tipo 'course_session' (ADR 0004 y 0018),
-- valor que ya existe en el enum activity_type desde la Fase 0. Aquí no se
-- duplica fecha, hora, zona horaria, sede, estado ni recurrencia: una cohorte
-- semanal se apoya en activity_series igual que cualquier otra serie.
--
-- Esto NO es un LMS: no hay contenidos, materiales, calificaciones ni
-- certificados (fuera de alcance del encargo).

-- courses --------------------------------------------------------------------

create type course_status as enum ('draft', 'active', 'archived');

create table courses (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  name text not null,
  description text,
  status course_status not null default 'draft',
  session_count smallint,
  completion_attendance_ratio numeric(4, 3) not null default 0.750,
  created_by uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references people (id) on delete set null,
  constraint courses_name_not_blank_check check (btrim(name) <> ''),
  constraint courses_session_count_check check (session_count is null or session_count > 0),
  constraint courses_ratio_check check (completion_attendance_ratio >= 0 and completion_attendance_ratio <= 1)
);

comment on table courses is
  'Curso de formación de una iglesia. Ver docs/CONTRATO-FASE-7.md §4.2.';
comment on column courses.completion_attendance_ratio is
  'Proporción de asistencia a partir de la cual la aplicación SUGIERE dar por terminado a un matriculado. Nunca lo decide sola: la finalización es un acto explícito del responsable (decisión P-4).';

alter table courses add constraint courses_id_unique unique (id, church_id);
create index courses_church_status_idx on courses (church_id, status) where archived_at is null;

-- course_cohorts -------------------------------------------------------------

create type course_cohort_status as enum ('planned', 'open', 'running', 'finished', 'cancelled');

create table course_cohorts (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  course_id uuid not null,
  campus_id uuid,
  name text not null,
  status course_cohort_status not null default 'planned',
  starts_on date,
  ends_on date,
  capacity integer,
  allows_requests boolean not null default true,
  notes text,
  created_by uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references people (id) on delete set null,
  constraint course_cohorts_name_not_blank_check check (btrim(name) <> ''),
  constraint course_cohorts_capacity_check check (capacity is null or capacity > 0),
  constraint course_cohorts_dates_check check (ends_on is null or starts_on is null or ends_on >= starts_on),
  foreign key (course_id, church_id) references courses (id, church_id) on delete cascade,
  foreign key (campus_id, church_id) references campuses (id, church_id) on delete set null
);

comment on table course_cohorts is
  'Edición concreta de un curso: fechas, sede, aforo y si admite solicitudes de plaza.';
comment on column course_cohorts.allows_requests is
  'true: la persona puede solicitar plaza y el responsable resuelve. El alta directa por el responsable está siempre disponible (decisión P-3).';

alter table course_cohorts add constraint course_cohorts_id_unique unique (id, church_id);
create index course_cohorts_church_course_idx on course_cohorts (church_id, course_id, status);
create index course_cohorts_church_campus_idx on course_cohorts (church_id, campus_id);

-- course_sessions ------------------------------------------------------------

create table course_sessions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  cohort_id uuid not null,
  activity_id uuid not null,
  session_number smallint not null,
  topic text,
  attendance_recorded_at timestamptz,
  attendance_recorded_by uuid references people (id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references people (id) on delete set null,
  cancellation_reason text,
  created_by uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_id),
  unique (cohort_id, session_number),
  constraint course_sessions_number_check check (session_number > 0),
  foreign key (cohort_id, church_id) references course_cohorts (id, church_id) on delete cascade,
  foreign key (activity_id, church_id) references activities (id, church_id) on delete cascade
);

comment on table course_sessions is
  'Sesión de una cohorte: extensión de una activity de tipo course_session (ADR 0018).';
comment on column course_sessions.cancelled_at is
  'Como las reuniones de grupo, una sesión se convoca y se cancela sin recorrer la máquina de estados de activities. Ver ADR 0019.';

alter table course_sessions add constraint course_sessions_id_unique unique (id, church_id);
create index course_sessions_church_cohort_idx on course_sessions (church_id, cohort_id, session_number);

create or replace function app.course_sessions_activity_type_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_type activity_type;
begin
  select type into v_type
  from activities
  where id = new.activity_id and church_id = new.church_id;

  if v_type is null then
    raise exception 'La actividad indicada no existe en esta iglesia.'
      using errcode = '22023';
  end if;

  if v_type is distinct from 'course_session' then
    raise exception 'Solo una activity de tipo course_session puede tener una fila course_sessions asociada.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger course_sessions_activity_type_guard
  before insert or update of activity_id on course_sessions
  for each row execute function app.course_sessions_activity_type_guard();

-- course_enrollments ---------------------------------------------------------

create type course_enrollment_status as enum
  ('requested', 'enrolled', 'completed', 'dropped', 'rejected');

create table course_enrollments (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  cohort_id uuid not null,
  person_id uuid not null,
  status course_enrollment_status not null default 'enrolled',
  request_message text,
  requested_at timestamptz,
  decided_by uuid references people (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  enrolled_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references people (id) on delete set null,
  completion_note text,
  dropped_at timestamptz,
  drop_reason text,
  created_by uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cohort_id, person_id),
  constraint course_enrollments_completed_check check (
    (status = 'completed') = (completed_at is not null)
  ),
  constraint course_enrollments_completed_by_check check (
    completed_at is null or completed_by is not null
  ),
  foreign key (cohort_id, church_id) references course_cohorts (id, church_id) on delete cascade,
  foreign key (person_id) references people (id) on delete cascade,
  foreign key (church_id, person_id) references church_people (church_id, person_id) on delete cascade
);

comment on table course_enrollments is
  'Matrícula de una persona en una cohorte. Una sola fila por cohorte y persona: el historial se conserva cambiando de estado, no borrando (D12).';
comment on constraint course_enrollments_completed_by_check on course_enrollments is
  'Dar por terminado un curso deja siempre autor y fecha (decisión P-4).';

alter table course_enrollments add constraint course_enrollments_id_unique unique (id, church_id);
create index course_enrollments_church_cohort_idx on course_enrollments (church_id, cohort_id, status);
create index course_enrollments_church_person_idx on course_enrollments (church_id, person_id, status);

-- course_session_attendance --------------------------------------------------

create table course_session_attendance (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  course_session_id uuid not null,
  person_id uuid not null,
  status group_attendance_status not null,
  notes text,
  recorded_by uuid references people (id) on delete set null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_session_id, person_id),
  foreign key (course_session_id, church_id) references course_sessions (id, church_id) on delete cascade,
  foreign key (person_id) references people (id) on delete cascade,
  foreign key (church_id, person_id) references church_people (church_id, person_id) on delete cascade
);

comment on table course_session_attendance is
  'Asistencia a una sesión de cohorte. Alimenta la sugerencia de finalización (decisión P-4); reutiliza el enum group_attendance_status.';

alter table course_session_attendance add constraint course_session_attendance_id_unique unique (id, church_id);
create index course_session_attendance_church_session_idx
  on course_session_attendance (church_id, course_session_id);
create index course_session_attendance_church_person_idx
  on course_session_attendance (church_id, person_id);

-- learning_paths -------------------------------------------------------------

create type learning_path_status as enum ('draft', 'active', 'archived');

create table learning_paths (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  name text not null,
  description text,
  status learning_path_status not null default 'draft',
  created_by uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references people (id) on delete set null,
  constraint learning_paths_name_not_blank_check check (btrim(name) <> '')
);

comment on table learning_paths is
  'Itinerario de acompañamiento (nuevos creyentes, bautismo, membresía, liderazgo...).';

alter table learning_paths add constraint learning_paths_id_unique unique (id, church_id);
create index learning_paths_church_status_idx on learning_paths (church_id, status) where archived_at is null;

-- path_steps -----------------------------------------------------------------
-- Los pasos se ARCHIVAN, nunca se borran: el progreso conseguido se conserva y
-- sigue siendo legible aunque el itinerario cambie (decisión P-8). Por eso
-- person_path_progress referencia el paso con on delete restrict.

create type path_step_kind as enum ('course', 'manual');

create table path_steps (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  learning_path_id uuid not null,
  step_order smallint not null,
  title text not null,
  description text,
  kind path_step_kind not null default 'manual',
  course_id uuid,
  is_required boolean not null default true,
  created_by uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references people (id) on delete set null,
  constraint path_steps_title_not_blank_check check (btrim(title) <> ''),
  constraint path_steps_position_check check (step_order > 0),
  constraint path_steps_course_kind_check check (
    (kind = 'course' and course_id is not null) or (kind = 'manual' and course_id is null)
  ),
  foreign key (learning_path_id, church_id) references learning_paths (id, church_id) on delete cascade,
  foreign key (course_id, church_id) references courses (id, church_id) on delete restrict
);

comment on table path_steps is
  'Paso de un itinerario. Se archiva, no se borra, para conservar el progreso ya conseguido (decisión P-8).';
comment on column path_steps.kind is
  'course: el paso se da por hecho al terminar el curso indicado. manual: lo marca el responsable.';

alter table path_steps add constraint path_steps_id_unique unique (id, church_id);
create unique index path_steps_active_position_unique
  on path_steps (learning_path_id, step_order) where archived_at is null;
create index path_steps_church_path_idx on path_steps (church_id, learning_path_id, step_order);
create index path_steps_church_course_idx on path_steps (church_id, course_id) where course_id is not null;

-- person_path_progress -------------------------------------------------------

create type path_progress_status as enum ('pending', 'in_progress', 'completed', 'skipped');

create table person_path_progress (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  learning_path_id uuid not null,
  path_step_id uuid not null,
  person_id uuid not null,
  status path_progress_status not null default 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references people (id) on delete set null,
  note text,
  created_by uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (path_step_id, person_id),
  constraint person_path_progress_completed_check check (
    (status in ('completed', 'skipped')) = (completed_at is not null)
  ),
  foreign key (learning_path_id, church_id) references learning_paths (id, church_id) on delete cascade,
  foreign key (path_step_id, church_id) references path_steps (id, church_id) on delete restrict,
  foreign key (person_id) references people (id) on delete cascade,
  foreign key (church_id, person_id) references church_people (church_id, person_id) on delete cascade
);

comment on table person_path_progress is
  'Progreso de una persona en un paso concreto de un itinerario. La FK al paso es on delete restrict: archivar un paso conserva el progreso (decisión P-8).';

alter table person_path_progress add constraint person_path_progress_id_unique unique (id, church_id);
create index person_path_progress_church_path_person_idx
  on person_path_progress (church_id, learning_path_id, person_id);
create index person_path_progress_church_person_idx
  on person_path_progress (church_id, person_id, status);

-- updated_at -----------------------------------------------------------------

create trigger courses_set_updated_at before update on courses
  for each row execute function app.set_updated_at();
create trigger course_cohorts_set_updated_at before update on course_cohorts
  for each row execute function app.set_updated_at();
create trigger course_sessions_set_updated_at before update on course_sessions
  for each row execute function app.set_updated_at();
create trigger course_enrollments_set_updated_at before update on course_enrollments
  for each row execute function app.set_updated_at();
create trigger course_session_attendance_set_updated_at before update on course_session_attendance
  for each row execute function app.set_updated_at();
create trigger learning_paths_set_updated_at before update on learning_paths
  for each row execute function app.set_updated_at();
create trigger path_steps_set_updated_at before update on path_steps
  for each row execute function app.set_updated_at();
create trigger person_path_progress_set_updated_at before update on person_path_progress
  for each row execute function app.set_updated_at();
