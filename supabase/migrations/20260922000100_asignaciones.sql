-- Fase 5 (Carlos, CA-04/CA-05) · Asignaciones de personas a puestos de actividad.
-- Ver docs/CONTRATO-F4-F5.md y docs/FASE-5-ASIGNACIONES.md.
--
-- Decisiones de Carlos (17 de septiembre de 2026):
-- * Estados: proposed (borrador no comunicado) -> pending (enviada) ->
--   accepted | declined; cancelled (retirada) y substituted (reemplazada).
-- * Cobertura: confirmados = accepted; previstos = proposed+pending+accepted.
-- * Sustitución: solicitud -> candidato (asignación vinculada) -> al aceptar el
--   candidato, la original pasa a substituted.
--
-- No depende de tablas de Diogo (disponibilidad/avisos): la consulta de
-- disponibilidad se hace solo si su función acordada existe (ver 0200).

create type activity_assignment_status as enum (
  'proposed', 'pending', 'accepted', 'declined', 'cancelled', 'substituted'
);

comment on type activity_assignment_status is
  'proposed: preparada, no comunicada (la persona no la ve). pending: comunicada, esperando respuesta. accepted/declined: respuesta. cancelled: retirada. substituted: reemplazada por otra asignación aceptada.';

create type activity_assignment_response_source as enum ('self', 'representative');

create table activity_assignments (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  activity_id uuid not null,
  -- Nulo solo si el puesto se eliminó después (se conserva la historia).
  activity_position_id uuid,
  person_id uuid not null,
  status activity_assignment_status not null default 'proposed',
  -- Versión monotónica: cambia en cada mutación. Protege respuestas frente a
  -- cambios concurrentes y servirá como versión de entidad para eventos.
  version integer not null default 1 check (version >= 1),
  -- Snapshot del puesto para historia.
  position_name text not null,
  service_area_id uuid,
  -- Sustitución: esta asignación reemplaza a otra.
  substitutes_assignment_id uuid,
  -- Elegibilidad al crear (solo códigos, sin datos sensibles).
  eligibility_blocking text[] not null default '{}',
  eligibility_warnings text[] not null default '{}',
  acknowledged_warnings text[] not null default '{}',
  eligibility_checked_at timestamptz not null default now(),
  -- Trazabilidad.
  created_by uuid,
  created_at timestamptz not null default now(),
  sent_by uuid,
  sent_at timestamptz,
  responded_at timestamptz,
  responded_by uuid,
  response_source activity_assignment_response_source,
  -- Horario confirmado al aceptar; si la actividad cambia de hora, se pide reconfirmar.
  confirmed_starts_at timestamptz,
  confirmed_ends_at timestamptz,
  reconfirmation_requested_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_cause text check (cancel_cause is null or cancel_cause in (
    'coordinator', 'activity_cancelled', 'activity_archived', 'occurrence_removed', 'substitution_withdrawn'
  )),
  substituted_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (activity_id, church_id) references activities (id, church_id) on delete cascade,
  foreign key (activity_position_id, church_id) references activity_positions (id, church_id)
    on delete set null (activity_position_id),
  foreign key (church_id, person_id) references church_people (church_id, person_id),
  -- FK directa a people (además de la de pertenencia) para que la API pueda
  -- embeber el nombre de la persona.
  foreign key (person_id) references people (id),
  check ((status = 'cancelled') = (cancelled_at is not null)),
  check ((status = 'substituted') = (substituted_at is not null)),
  check (status = 'proposed' or sent_at is not null or response_source = 'representative'),
  check (status not in ('accepted', 'declined') or responded_at is not null),
  check (substitutes_assignment_id is null or substitutes_assignment_id <> id)
);

comment on table activity_assignments is
  'Asignación de una persona de la iglesia a un puesto de actividad (Fase 5). Escritura solo por RPC. Historia conservada: no se borran filas.';
comment on column activity_assignments.version is
  'Versión monotónica de la asignación. Las respuestas pueden exigir la versión vista para evitar carreras con cancelaciones o reprogramaciones.';

alter table activity_assignments add constraint activity_assignments_id_unique unique (id, church_id);

alter table activity_assignments add constraint activity_assignments_substitutes_fkey
  foreign key (substitutes_assignment_id, church_id) references activity_assignments (id, church_id);

-- Una asignación vigente por puesto y persona (duplicados y reintentos
-- concurrentes se resuelven aquí).
create unique index activity_assignments_vigente_unique
  on activity_assignments (activity_position_id, person_id)
  where status in ('proposed', 'pending', 'accepted');

-- Un único candidato vigente por asignación original.
create unique index activity_assignments_one_candidate
  on activity_assignments (substitutes_assignment_id)
  where substitutes_assignment_id is not null and status in ('proposed', 'pending', 'accepted');

create index activity_assignments_church_activity_idx on activity_assignments (church_id, activity_id);
create index activity_assignments_church_position_idx on activity_assignments (church_id, activity_position_id);
create index activity_assignments_church_person_status_idx on activity_assignments (church_id, person_id, status);

create trigger activity_assignments_set_updated_at
  before update on activity_assignments
  for each row execute function app.set_updated_at();

-- Nota privada de la respuesta: solo la lee la propia persona. Tabla aparte
-- porque RLS es por fila. Nunca se incluye en eventos ni avisos.
create table activity_assignment_notes (
  assignment_id uuid primary key,
  church_id uuid not null references churches (id) on delete cascade,
  person_id uuid not null,
  note text not null check (char_length(note) between 1 and 1000),
  updated_at timestamptz not null default now(),
  foreign key (assignment_id, church_id) references activity_assignments (id, church_id) on delete cascade
);

comment on table activity_assignment_notes is
  'Nota privada de la persona al responder. Solo visible para esa persona; no la ven coordinadores ni se envía por ningún canal.';

create index activity_assignment_notes_church_idx on activity_assignment_notes (church_id);

-- Solicitudes de sustitución.
create type activity_substitution_status as enum ('open', 'completed', 'cancelled');

create table activity_substitution_requests (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  activity_id uuid not null,
  original_assignment_id uuid not null,
  status activity_substitution_status not null default 'open',
  candidate_assignment_id uuid,
  requested_by uuid,
  requested_by_self boolean not null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid,
  updated_at timestamptz not null default now(),
  foreign key (activity_id, church_id) references activities (id, church_id) on delete cascade,
  -- Nombres explícitos: la API los usa para desambiguar embebidos.
  constraint activity_substitution_requests_original_fkey
    foreign key (original_assignment_id, church_id) references activity_assignments (id, church_id),
  constraint activity_substitution_requests_candidate_fkey
    foreign key (candidate_assignment_id, church_id) references activity_assignments (id, church_id),
  check ((status = 'completed') = (completed_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null))
);

comment on table activity_substitution_requests is
  'Solicitud de sustitución de una asignación. La original sigue vigente hasta que el candidato acepta.';

alter table activity_substitution_requests add constraint activity_substitution_requests_id_unique unique (id, church_id);
create unique index activity_substitution_requests_one_open
  on activity_substitution_requests (original_assignment_id) where status = 'open';
create index activity_substitution_requests_church_activity_idx on activity_substitution_requests (church_id, activity_id);

create trigger activity_substitution_requests_set_updated_at
  before update on activity_substitution_requests
  for each row execute function app.set_updated_at();

-- Capability -------------------------------------------------------------------
insert into capabilities (key, description, module_key) values
  ('assignment.manage', 'Gestionar asignaciones de personas a puestos de actividad dentro de su ámbito', 'serving');

insert into role_capabilities (role_key, capability_key)
select r, 'assignment.manage'
from unnest(array['church_owner', 'church_admin', 'campus_admin', 'ministry_leader']) r;

alter table activity_assignments enable row level security;
alter table activity_assignments force row level security;
alter table activity_assignment_notes enable row level security;
alter table activity_assignment_notes force row level security;
alter table activity_substitution_requests enable row level security;
alter table activity_substitution_requests force row level security;
