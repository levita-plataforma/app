-- Fase 8 (Diogo) · Kids: salas/clases, sesiones (reutilizando Activities) y
-- staff (reutilizando Serving/Credentials). Ver prompt Fase 8 §9-13, §33.

create table kids_rooms (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  campus_id uuid,
  name text not null check (btrim(name) <> '' and char_length(name) <= 150),
  description text check (description is null or char_length(description) <= 1000),
  age_min_months integer check (age_min_months is null or age_min_months >= 0),
  age_max_months integer check (age_max_months is null or age_max_months >= 0),
  capacity integer not null check (capacity > 0),
  min_adults integer not null default 1 check (min_adults >= 1),
  ratio_children_per_adult integer not null default 6 check (ratio_children_per_adult > 0),
  location_text text check (location_text is null or char_length(location_text) <= 200),
  active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  foreign key (campus_id, church_id) references campuses (id, church_id),
  check (age_max_months is null or age_min_months is null or age_max_months >= age_min_months)
);

comment on table kids_rooms is
  'Sala/clase Kids con capacidad, franja de edad y política de ratio propia (no hardcodeada). Ver prompt Fase 8 §9.';
comment on column kids_rooms.ratio_children_per_adult is
  'Máximo de niños por adulto además de min_adults. Ver app.kids_room_ratio_status. Configurable por sala, no global (§15).';

alter table kids_rooms add constraint kids_rooms_id_unique unique (id, church_id);
create index kids_rooms_church_campus_active_idx on kids_rooms (church_id, campus_id, active);

create trigger kids_rooms_set_updated_at
  before update on kids_rooms
  for each row execute function app.set_updated_at();

-- kids_sessions --------------------------------------------------------------
-- Une una activity ya existente (culto, evento...) con una sala Kids. No
-- crea un calendario nuevo ni un activity_type nuevo: reutiliza `activities`
-- tal cual, tenant-safe vía FK compuesta. Ver prompt Fase 8 §10.

create type kids_session_status as enum ('scheduled', 'open', 'closed', 'cancelled');

create table kids_sessions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  activity_id uuid not null,
  room_id uuid not null,
  campus_id uuid,
  status kids_session_status not null default 'scheduled',
  opened_at timestamptz,
  opened_by uuid,
  closed_at timestamptz,
  closed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_id, room_id),
  foreign key (activity_id, church_id) references activities (id, church_id) on delete cascade,
  foreign key (room_id, church_id) references kids_rooms (id, church_id) on delete cascade,
  foreign key (campus_id, church_id) references campuses (id, church_id),
  check ((status = 'closed') = (closed_at is not null))
);

comment on table kids_sessions is
  'Sesión Kids de una sala para una activity concreta (culto, evento...). Varias sesiones (una por sala) pueden compartir la misma activity. Ver prompt Fase 8 §10, §31.';

alter table kids_sessions add constraint kids_sessions_id_unique unique (id, church_id);
create index kids_sessions_activity_idx on kids_sessions (activity_id);
create index kids_sessions_room_idx on kids_sessions (room_id);
create index kids_sessions_church_status_idx on kids_sessions (church_id, status);

create trigger kids_sessions_set_updated_at
  before update on kids_sessions
  for each row execute function app.set_updated_at();

-- kids_session_staff ---------------------------------------------------------
-- Reutiliza church_people (pertenencia) y person_credentials (Fase 3), sin
-- duplicar service_area_members. Ver prompt Fase 8 §11-13, §33.

create type kids_staff_role as enum ('lead', 'assistant', 'support');

create table kids_session_staff (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  session_id uuid not null,
  person_id uuid not null,
  role kids_staff_role not null default 'support',
  checked_in_at timestamptz,
  checked_in_by uuid,
  checked_out_at timestamptz,
  eligible_at_assignment boolean not null default true,
  eligibility_reasons text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, person_id),
  foreign key (session_id, church_id) references kids_sessions (id, church_id) on delete cascade,
  foreign key (person_id) references people (id) on delete cascade,
  foreign key (church_id, person_id) references church_people (church_id, person_id) on delete cascade,
  check (checked_out_at is null or checked_in_at is not null)
);

comment on table kids_session_staff is
  'Staff asignado a una sesión Kids. eligible_at_assignment/eligibility_reasons son un snapshot de app.kids_staff_eligibility en el momento de asignar, no una garantía permanente (una credencial puede caducar después). Ver prompt Fase 8 §11-12, §32.';

alter table kids_session_staff add constraint kids_session_staff_id_unique unique (id, church_id);
create index kids_session_staff_session_idx on kids_session_staff (session_id);
create index kids_session_staff_person_idx on kids_session_staff (person_id);

create trigger kids_session_staff_set_updated_at
  before update on kids_session_staff
  for each row execute function app.set_updated_at();

alter table kids_rooms enable row level security;
alter table kids_rooms force row level security;
alter table kids_sessions enable row level security;
alter table kids_sessions force row level security;
alter table kids_session_staff enable row level security;
alter table kids_session_staff force row level security;
