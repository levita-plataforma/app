-- Fase 0 · Activity: raíz genérica temporal/operativa.
-- Ver docs/adr/0004-activity-raiz-generica.md.

create type activity_type as enum (
  'service', 'meeting', 'event', 'course_session',
  'group_meeting', 'rehearsal', 'task', 'shift'
);

create type activity_status as enum (
  'draft', 'published', 'cancelled', 'completed', 'archived'
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  campus_id uuid,
  type activity_type not null,
  title text not null,
  description text,
  -- nullable: una tarea sin hora fija (p. ej. "comprar el café antes del
  -- viernes") tiene starts_at/ends_at como rango válido, no como horario fijo.
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'Europe/Madrid',
  status activity_status not null default 'draft',
  visibility text not null default 'internal'
    check (visibility in ('public', 'internal')),
  organizer_person_id uuid,
  recurrence_rule text, -- RRULE o equivalente; se completa en fases posteriores
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid,
  foreign key (campus_id, church_id) references campuses (id, church_id),
  foreign key (organizer_person_id) references people (id)
);

comment on table activities is
  'Raíz genérica de actividad: culto, ensayo, reunión, curso, tarea o turno sin evento asociado. Ver docs/adr/0004.';
comment on column activities.starts_at is
  'Nullable para tareas/turnos sin hora fija. No confundir con "sin programar".';

alter table activities add constraint activities_id_unique unique (id, church_id);

create index activities_church_id_idx on activities (church_id);
create index activities_church_type_starts_idx on activities (church_id, type, starts_at);
create index activities_campus_id_idx on activities (campus_id) where campus_id is not null;

create trigger activities_set_updated_at
  before update on activities
  for each row execute function app.set_updated_at();

alter table activities enable row level security;
alter table activities force row level security;
