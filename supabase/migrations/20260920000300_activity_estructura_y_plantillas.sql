-- Fase 4 · Estructura de servicio por actividad (áreas, puestos, requisitos),
-- planning/orden del servicio y plantillas de actividad.
-- Ver docs/adr/0017.
--
-- Reutiliza el catálogo de Serving (service_areas, service_positions,
-- position_requirements). No crea un catálogo paralelo: las filas por
-- actividad son copias (snapshots) que referencian el catálogo mientras
-- exista, de modo que cambiar o archivar el catálogo no altera actividades
-- ya preparadas ni históricas.

create type activity_area_requirement as enum ('required', 'optional');
create type activity_requirement_origin as enum ('inherited', 'added');
create type activity_plan_item_type as enum (
  'section', 'song', 'speech', 'prayer', 'announcement', 'media', 'transition', 'custom'
);

comment on type activity_plan_item_type is
  'Tipo de bloque del orden del servicio. song es un bloque del plan, no un catálogo musical (Alabanza llega en fases posteriores).';

-- ---------------------------------------------------------------------------
-- activity_service_areas
-- ---------------------------------------------------------------------------
create table activity_service_areas (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  activity_id uuid not null,
  service_area_id uuid,
  area_name text not null,
  area_campus_id uuid,
  requirement activity_area_requirement not null default 'required',
  notes text check (notes is null or char_length(notes) <= 1000),
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (activity_id, church_id) references activities (id, church_id) on delete cascade,
  foreign key (service_area_id, church_id) references service_areas (id, church_id)
    on delete set null (service_area_id),
  foreign key (area_campus_id, church_id) references campuses (id, church_id)
    on delete set null (area_campus_id)
);

comment on table activity_service_areas is
  'Área de servicio necesaria en una actividad concreta. area_name/area_campus_id son snapshot del catálogo en el momento de añadirla.';

alter table activity_service_areas add constraint activity_service_areas_id_unique unique (id, church_id);
create unique index activity_service_areas_activity_area_unique
  on activity_service_areas (activity_id, service_area_id)
  where service_area_id is not null;
create index activity_service_areas_church_activity_idx on activity_service_areas (church_id, activity_id);
create index activity_service_areas_church_area_idx on activity_service_areas (church_id, service_area_id);

create trigger activity_service_areas_set_updated_at
  before update on activity_service_areas
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- activity_positions
-- ---------------------------------------------------------------------------
create table activity_positions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  activity_id uuid not null,
  activity_service_area_id uuid not null,
  -- Copia desnormalizada del área de catálogo del área de actividad padre:
  -- permite comprobar scopes service_area sin joins adicionales. La mantiene
  -- un trigger; no la fija el cliente.
  service_area_id uuid,
  -- null = puesto ad-hoc de esta actividad (no existe en el catálogo)
  service_position_id uuid,
  name text not null check (btrim(name) <> '' and char_length(name) <= 120),
  description text check (description is null or char_length(description) <= 1000),
  critical boolean not null default false,
  min_people smallint not null default 1 check (min_people between 0 and 500),
  max_people smallint check (max_people is null or (max_people between 1 and 500 and max_people >= min_people)),
  requires_autonomous_person boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 1000),
  sort_order integer not null default 0,
  catalog_snapshot jsonb,
  snapshot_taken_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (activity_id, church_id) references activities (id, church_id) on delete cascade,
  foreign key (activity_service_area_id, church_id) references activity_service_areas (id, church_id) on delete cascade,
  foreign key (service_position_id, church_id) references service_positions (id, church_id)
    on delete set null (service_position_id),
  check ((catalog_snapshot is null) = (snapshot_taken_at is null))
);

comment on table activity_positions is
  'Puesto necesario en una actividad. Valores efectivos (min/max/critical...) propios de la actividad; catalog_snapshot guarda los valores del catálogo al copiarlo y no se modifica. service_position_id null = puesto ad-hoc.';
comment on column activity_positions.max_people is
  'Null = sin máximo: el puesto nunca se considera sobredimensionado.';

alter table activity_positions add constraint activity_positions_id_unique unique (id, church_id);
create unique index activity_positions_activity_catalog_unique
  on activity_positions (activity_id, service_position_id)
  where service_position_id is not null;
create index activity_positions_church_activity_idx on activity_positions (church_id, activity_id);
create index activity_positions_church_position_idx on activity_positions (church_id, service_position_id);
create index activity_positions_area_idx on activity_positions (activity_service_area_id);

create trigger activity_positions_set_updated_at
  before update on activity_positions
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- activity_position_requirements (herencia + overrides)
-- ---------------------------------------------------------------------------
create table activity_position_requirements (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  -- Desnormalizado desde el puesto por trigger, para RLS e índices.
  activity_id uuid not null,
  activity_position_id uuid not null,
  origin activity_requirement_origin not null,
  source_requirement_id uuid,
  requirement_type position_requirement_type not null,
  strictness position_requirement_strictness not null default 'required',
  qualification_id uuid,
  credential_type_id uuid,
  min_level qualification_level,
  min_operational_level service_operational_level,
  requires_current_validity boolean not null default true,
  -- Override que desactiva un requisito heredado solo para esta actividad.
  disabled boolean not null default false,
  catalog_snapshot jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (activity_id, church_id) references activities (id, church_id) on delete cascade,
  foreign key (activity_position_id, church_id) references activity_positions (id, church_id) on delete cascade,
  foreign key (source_requirement_id) references position_requirements (id) on delete set null,
  foreign key (qualification_id, church_id) references qualifications (id, church_id),
  foreign key (credential_type_id, church_id) references credential_types (id, church_id),
  check (
    (requirement_type = 'qualification' and qualification_id is not null and credential_type_id is null)
    or (requirement_type = 'credential' and credential_type_id is not null and qualification_id is null)
    or (requirement_type = 'minimum_level' and qualification_id is null and credential_type_id is null and min_operational_level is not null)
  ),
  check ((origin = 'inherited') = (catalog_snapshot is not null)),
  check (origin = 'inherited' or not disabled)
);

comment on table activity_position_requirements is
  'Requisitos efectivos de un puesto en una actividad. inherited: copiado de position_requirements (catalog_snapshot inmutable; editar sus valores es un override; disabled lo anula). added: requisito extra solo para esta actividad. Contrato para Fase 5: app.activity_position_effective_requirements().';

alter table activity_position_requirements add constraint activity_position_requirements_id_unique unique (id, church_id);
create index activity_position_requirements_church_position_idx
  on activity_position_requirements (church_id, activity_position_id);

create trigger activity_position_requirements_set_updated_at
  before update on activity_position_requirements
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- activity_plan_items (orden del servicio)
-- ---------------------------------------------------------------------------
create table activity_plan_items (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  activity_id uuid not null,
  item_type activity_plan_item_type not null default 'custom',
  title text not null check (btrim(title) <> '' and char_length(title) <= 200),
  -- Unidades explícitas: minutos.
  duration_minutes integer check (duration_minutes is null or duration_minutes between 0 and 1440),
  -- Minutos respecto a starts_at de la actividad. Negativo = antes del inicio
  -- (p. ej. -5 para una bienvenida a las 10:55 en un culto de 11:00). Null =
  -- empieza cuando termina el bloque anterior.
  start_offset_minutes integer check (start_offset_minutes is null or start_offset_minutes between -1440 and 4320),
  responsible_text text check (responsible_text is null or char_length(responsible_text) <= 200),
  responsible_person_id uuid,
  notes text check (notes is null or char_length(notes) <= 2000),
  sort_order integer not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (activity_id, church_id) references activities (id, church_id) on delete cascade,
  foreign key (church_id, responsible_person_id) references church_people (church_id, person_id)
    on delete set null (responsible_person_id),
  constraint activity_plan_items_order_unique unique (activity_id, sort_order) deferrable initially immediate
);

comment on table activity_plan_items is
  'Bloque del orden del servicio. sort_order es único por actividad (constraint diferible para reordenar de forma atómica). Duraciones y offsets en minutos.';

alter table activity_plan_items add constraint activity_plan_items_id_unique unique (id, church_id);
create index activity_plan_items_church_activity_order_idx
  on activity_plan_items (church_id, activity_id, sort_order);

create trigger activity_plan_items_set_updated_at
  before update on activity_plan_items
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Plantillas
-- ---------------------------------------------------------------------------
create table activity_templates (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 120),
  type activity_type not null,
  campus_id uuid,
  default_title text check (default_title is null or char_length(default_title) <= 200),
  schedule_kind activity_schedule_kind not null default 'timed',
  default_local_start_time time,
  default_duration_minutes integer check (default_duration_minutes is null or default_duration_minutes between 1 and 89280),
  description text check (description is null or char_length(description) <= 2000),
  visibility activity_visibility not null default 'members',
  location_text text check (location_text is null or char_length(location_text) <= 200),
  notes text check (notes is null or char_length(notes) <= 4000),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid,
  foreign key (campus_id, church_id) references campuses (id, church_id),
  check (schedule_kind <> 'flexible' or type = 'task')
);

comment on table activity_templates is
  'Plantilla de actividad (p. ej. "Culto domingo 11:00"). Al usarla se COPIA su estructura; cambios posteriores en la plantilla no alteran actividades ya creadas.';

alter table activity_templates add constraint activity_templates_id_unique unique (id, church_id);
create unique index activity_templates_name_unique
  on activity_templates (church_id, lower(name))
  where archived_at is null;
create index activity_templates_church_idx on activity_templates (church_id, active, sort_order);

create trigger activity_templates_set_updated_at
  before update on activity_templates
  for each row execute function app.set_updated_at();

alter table activities add constraint activities_template_fkey
  foreign key (template_id, church_id)
  references activity_templates (id, church_id)
  on delete set null (template_id);

create table activity_template_areas (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  template_id uuid not null,
  service_area_id uuid not null,
  requirement activity_area_requirement not null default 'required',
  notes text check (notes is null or char_length(notes) <= 1000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (template_id, service_area_id),
  foreign key (template_id, church_id) references activity_templates (id, church_id) on delete cascade,
  foreign key (service_area_id, church_id) references service_areas (id, church_id) on delete cascade
);

alter table activity_template_areas add constraint activity_template_areas_id_unique unique (id, church_id);
create index activity_template_areas_church_template_idx on activity_template_areas (church_id, template_id);

create table activity_template_positions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  template_id uuid not null,
  template_area_id uuid not null,
  service_position_id uuid,
  name text not null check (btrim(name) <> '' and char_length(name) <= 120),
  description text check (description is null or char_length(description) <= 1000),
  critical boolean not null default false,
  min_people smallint not null default 1 check (min_people between 0 and 500),
  max_people smallint check (max_people is null or (max_people between 1 and 500 and max_people >= min_people)),
  requires_autonomous_person boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (template_id, church_id) references activity_templates (id, church_id) on delete cascade,
  foreign key (template_area_id, church_id) references activity_template_areas (id, church_id) on delete cascade,
  foreign key (service_position_id, church_id) references service_positions (id, church_id)
    on delete set null (service_position_id)
);

create index activity_template_positions_church_template_idx on activity_template_positions (church_id, template_id);

create table activity_template_plan_items (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  template_id uuid not null,
  item_type activity_plan_item_type not null default 'custom',
  title text not null check (btrim(title) <> '' and char_length(title) <= 200),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 0 and 1440),
  start_offset_minutes integer check (start_offset_minutes is null or start_offset_minutes between -1440 and 4320),
  responsible_text text check (responsible_text is null or char_length(responsible_text) <= 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  sort_order integer not null,
  created_at timestamptz not null default now(),
  unique (template_id, sort_order),
  foreign key (template_id, church_id) references activity_templates (id, church_id) on delete cascade
);

create index activity_template_plan_items_church_template_idx on activity_template_plan_items (church_id, template_id, sort_order);

-- RLS -------------------------------------------------------------------------
alter table activity_service_areas enable row level security;
alter table activity_service_areas force row level security;
alter table activity_positions enable row level security;
alter table activity_positions force row level security;
alter table activity_position_requirements enable row level security;
alter table activity_position_requirements force row level security;
alter table activity_plan_items enable row level security;
alter table activity_plan_items force row level security;
alter table activity_templates enable row level security;
alter table activity_templates force row level security;
alter table activity_template_areas enable row level security;
alter table activity_template_areas force row level security;
alter table activity_template_positions enable row level security;
alter table activity_template_positions force row level security;
alter table activity_template_plan_items enable row level security;
alter table activity_template_plan_items force row level security;
