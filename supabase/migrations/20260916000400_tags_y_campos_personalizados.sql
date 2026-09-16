-- Fase 0 · Tags y campos personalizados.
-- Ver docs/15-nucleo-plataforma.md §6.

create table tags (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (church_id, name)
);

alter table tags add constraint tags_id_unique unique (id, church_id);
create index tags_church_id_idx on tags (church_id);

create table person_tags (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  person_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  unique (person_id, tag_id),
  foreign key (person_id) references people (id) on delete cascade,
  foreign key (tag_id, church_id) references tags (id, church_id) on delete cascade
);

create index person_tags_church_id_idx on person_tags (church_id);
create index person_tags_person_id_idx on person_tags (person_id);

-- custom fields ---------------------------------------------------------------

create type custom_field_type as enum (
  'text', 'number', 'date', 'boolean', 'select', 'multi_select'
);

create table custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  entity_type text not null, -- 'person', 'household', 'activity', etc.
  name text not null,
  field_type custom_field_type not null,
  options jsonb, -- para select/multi_select
  is_sensitive boolean not null default false,
  min_visibility text not null default 'internal'
    check (min_visibility in ('public', 'internal', 'personal', 'restricted')),
  sort_order smallint not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (church_id, entity_type, name)
);

comment on table custom_field_definitions is
  'Campos personalizados por tenant. Nunca deben usarse como bypass de seguridad de módulos sensibles (Kids, Pastoral, Giving). Ver docs/15-nucleo-plataforma.md §6.';

alter table custom_field_definitions add constraint custom_field_definitions_id_unique unique (id, church_id);
create index custom_field_definitions_church_id_idx on custom_field_definitions (church_id);

create table custom_field_values (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  field_definition_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (field_definition_id, entity_id),
  foreign key (field_definition_id, church_id)
    references custom_field_definitions (id, church_id) on delete cascade
);

create index custom_field_values_church_id_idx on custom_field_values (church_id);
create index custom_field_values_entity_idx on custom_field_values (entity_type, entity_id);

create trigger custom_field_values_set_updated_at
  before update on custom_field_values
  for each row execute function app.set_updated_at();

alter table tags enable row level security;
alter table tags force row level security;
alter table person_tags enable row level security;
alter table person_tags force row level security;
alter table custom_field_definitions enable row level security;
alter table custom_field_definitions force row level security;
alter table custom_field_values enable row level security;
alter table custom_field_values force row level security;
