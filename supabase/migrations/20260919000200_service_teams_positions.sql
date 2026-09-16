-- Fase 3 · Equipos permanentes y puestos operativos.
-- Ver prompt de Fase 3 §8, §9, §10.

create table service_teams (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  service_area_id uuid not null,
  campus_id uuid,
  name text not null,
  description text,
  active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid,
  foreign key (service_area_id, church_id) references service_areas (id, church_id) on delete cascade,
  foreign key (campus_id, church_id) references campuses (id, church_id)
);

comment on table service_teams is
  'Equipo permanente dentro de un área (ej. "Equipo A de Alabanza"). No implementa scheduling ni rotación. Ver prompt Fase 3 §8.';

alter table service_teams add constraint service_teams_id_unique unique (id, church_id);
create index service_teams_church_area_idx on service_teams (church_id, service_area_id);

create trigger service_teams_set_updated_at
  before update on service_teams
  for each row execute function app.set_updated_at();

create table service_team_members (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  service_team_id uuid not null,
  person_id uuid not null,
  is_leader boolean not null default false,
  status service_area_member_status not null default 'active',
  sort_order smallint not null default 0,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  unique (service_team_id, person_id),
  foreign key (service_team_id, church_id) references service_teams (id, church_id) on delete cascade,
  foreign key (person_id) references people (id) on delete cascade
);

comment on table service_team_members is
  'Miembro de un equipo permanente, con indicador de liderazgo del equipo. Ver prompt Fase 3 §8.';

create index service_team_members_church_team_idx on service_team_members (church_id, service_team_id);
create index service_team_members_church_person_idx on service_team_members (church_id, person_id);

-- service_positions ----------------------------------------------------------

create table service_positions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  service_area_id uuid not null,
  campus_id uuid,
  name text not null,
  description text,
  active boolean not null default true,
  critical boolean not null default false,
  min_people smallint not null default 1,
  max_people smallint,
  requires_autonomous_person boolean not null default false,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid,
  foreign key (service_area_id, church_id) references service_areas (id, church_id) on delete cascade,
  foreign key (campus_id, church_id) references campuses (id, church_id),
  check (max_people is null or max_people >= min_people)
);

comment on table service_positions is
  'Puesto/rol operativo dentro de un área (ej. FOH, Proyección). Ver prompt Fase 3 §9.';
comment on column service_positions.critical is
  'Puesto crítico: sin cubrir compromete el servicio. Señal para elegibilidad/futuro scheduling, no un bloqueo por sí mismo.';
comment on column service_positions.requires_autonomous_person is
  'Si es true, la elegibilidad exige nivel operativo autonomous o superior en el área. Ver prompt Fase 3 §15.';

alter table service_positions add constraint service_positions_id_unique unique (id, church_id);
create index service_positions_church_area_idx on service_positions (church_id, service_area_id);

create trigger service_positions_set_updated_at
  before update on service_positions
  for each row execute function app.set_updated_at();

alter table service_teams enable row level security;
alter table service_teams force row level security;
alter table service_team_members enable row level security;
alter table service_team_members force row level security;
alter table service_positions enable row level security;
alter table service_positions force row level security;
