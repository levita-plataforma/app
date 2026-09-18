-- Fase 8 (Diogo) · Kids: check-in/out e incidencias. Ver prompt Fase 8
-- §19-23.

create type kid_checkin_status as enum ('checked_in', 'checked_out', 'cancelled');

create table kid_checkins (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  session_id uuid not null,
  kid_person_id uuid not null,
  room_id uuid not null,
  status kid_checkin_status not null default 'checked_in',
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid,
  pickup_token_hash text not null,
  checked_out_at timestamptz,
  checked_out_by uuid,
  authorized_pickup_id uuid,
  pickup_person_snapshot text,
  incident_flag boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_id, church_id) references kids_sessions (id, church_id) on delete cascade,
  foreign key (kid_person_id) references people (id) on delete cascade,
  foreign key (church_id, kid_person_id) references church_people (church_id, person_id) on delete cascade,
  foreign key (room_id, church_id) references kids_rooms (id, church_id),
  foreign key (authorized_pickup_id, church_id) references kid_pickup_authorizations (id, church_id),
  check ((status = 'checked_out') = (checked_out_at is not null))
);

comment on table kid_checkins is
  'Check-in de un menor en una sesión Kids concreta. pickup_token_hash es el hash del código/token entregado a la familia: nunca se guarda en claro, y el token en sí no lleva PII (nombre, fecha de nacimiento, datos médicos). Ver prompt Fase 8 §18-19.';
comment on column kid_checkins.pickup_person_snapshot is
  'Nombre de quien recogió al menor, registrado en el checkout. Snapshot administrativo, no un dato de contacto reutilizable.';

alter table kid_checkins add constraint kid_checkins_id_unique unique (id, church_id);
create index kid_checkins_session_status_idx on kid_checkins (session_id, status);
create index kid_checkins_kid_status_idx on kid_checkins (kid_person_id, status);
create index kid_checkins_pickup_token_idx on kid_checkins (pickup_token_hash);

-- Un menor no puede tener dos check-ins activos (checked_in) en la misma
-- sesión: la concurrencia se resuelve con este índice único + FOR UPDATE en
-- la RPC de check-in (§43).
create unique index kid_checkins_active_unique
  on kid_checkins (session_id, kid_person_id) where status = 'checked_in';

create trigger kid_checkins_set_updated_at
  before update on kid_checkins
  for each row execute function app.set_updated_at();

-- kids_incidents ---------------------------------------------------------
-- Clasificación restricted por diseño: solo capabilities kids.incident.*
-- pueden leer el contenido. Ver prompt Fase 8 §23-24.

create type kids_incident_type as enum ('minor', 'medical', 'behavioral', 'security', 'pickup', 'other');
create type kids_incident_severity as enum ('low', 'medium', 'high');
create type kids_incident_status as enum ('open', 'resolved');

create table kids_incidents (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  session_id uuid,
  kid_person_id uuid not null,
  incident_type kids_incident_type not null default 'other',
  severity kids_incident_severity not null default 'low',
  status kids_incident_status not null default 'open',
  occurred_at timestamptz not null default now(),
  reported_by uuid,
  description text not null check (btrim(description) <> '' and char_length(description) <= 2000),
  actions_taken text check (actions_taken is null or char_length(actions_taken) <= 2000),
  guardian_notified_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (session_id, church_id) references kids_sessions (id, church_id) on delete set null,
  foreign key (kid_person_id) references people (id) on delete cascade,
  foreign key (church_id, kid_person_id) references church_people (church_id, person_id) on delete cascade,
  check ((status = 'resolved') = (resolved_at is not null))
);

comment on table kids_incidents is
  'Incidencia Kids. Contenido SIEMPRE restricted: nunca aparece en dashboards generales, People común, logs técnicos ni notificaciones genéricas (solo un contador). Ver prompt Fase 8 §23-24.';

alter table kids_incidents add constraint kids_incidents_id_unique unique (id, church_id);
create index kids_incidents_church_status_idx on kids_incidents (church_id, status);
create index kids_incidents_kid_idx on kids_incidents (kid_person_id);
create index kids_incidents_session_idx on kids_incidents (session_id);

create trigger kids_incidents_set_updated_at
  before update on kids_incidents
  for each row execute function app.set_updated_at();

-- Override excepcional de recogida (§22): capability fuerte, motivo
-- obligatorio, siempre auditado. Se registra como fila en
-- kid_pickup_overrides, separada de kid_checkins para no mezclar el
-- registro excepcional con el flujo normal.
create table kid_pickup_overrides (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  checkin_id uuid not null,
  operator_person_id uuid,
  pickup_person_name text not null check (btrim(pickup_person_name) <> ''),
  reason text not null check (btrim(reason) <> '' and char_length(reason) <= 1000),
  created_at timestamptz not null default now(),
  foreign key (checkin_id, church_id) references kid_checkins (id, church_id) on delete cascade
);

comment on table kid_pickup_overrides is
  'Registro de un override excepcional de recogida (kids.pickup.override): siempre exige motivo, nunca es silencioso. Ver prompt Fase 8 §22.';

alter table kid_pickup_overrides add constraint kid_pickup_overrides_id_unique unique (id, church_id);
create index kid_pickup_overrides_checkin_idx on kid_pickup_overrides (checkin_id);

alter table kid_checkins enable row level security;
alter table kid_checkins force row level security;
alter table kids_incidents enable row level security;
alter table kids_incidents force row level security;
alter table kid_pickup_overrides enable row level security;
alter table kid_pickup_overrides force row level security;
