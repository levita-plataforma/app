-- Fase 0 · People, pertenencia a la iglesia y households.
-- Ver docs/adr/0002-people-separado-de-auth.md.

create table people (
  id uuid primary key default gen_random_uuid(),
  -- nullable a propósito: una persona puede existir sin cuenta digital.
  user_id uuid references auth.users (id) on delete set null,
  first_name text not null,
  last_name text,
  preferred_name text,
  avatar_file_id uuid,
  email text,
  phone text,
  birth_date date,
  locale text,
  directory_visible boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid
);

comment on table people is
  'Identidad humana central del dominio. No equivale a auth.users. Ver docs/adr/0002.';
comment on column people.user_id is
  'Nullable: una persona puede existir sin cuenta digital (menor, invitado externo, persona importada).';
comment on column people.notes is
  'Notas generales no sensibles. Datos pastorales, financieros o de menores NO se guardan aquí (ver docs/15-nucleo-plataforma.md §3).';

alter table people add constraint people_id_unique unique (id);

create index people_user_id_idx on people (user_id) where user_id is not null;
create index people_email_idx on people (lower(email)) where email is not null;

create trigger people_set_updated_at
  before update on people
  for each row execute function app.set_updated_at();

-- church_people: pertenencia de una persona a una iglesia --------------------

create type church_people_relationship as enum (
  'visitor',
  'connected',
  'member',
  'server',
  'leader',
  'external',
  'inactive'
);

create table church_people (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  person_id uuid not null,
  relationship church_people_relationship not null default 'visitor',
  primary_campus_id uuid,
  directory_visible boolean not null default false,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid,
  unique (church_id, person_id),
  foreign key (person_id) references people (id) on delete cascade,
  foreign key (primary_campus_id, church_id) references campuses (id, church_id)
);

comment on table church_people is
  'Pertenencia tenant-aware de una persona a una iglesia. No implica cuenta autenticada ni membresía formal. Ver docs/adr/0002.';
comment on column church_people.relationship is
  'Estado de relación operativo, no un rol de autorización. Ver docs/15-nucleo-plataforma.md §4.';

alter table church_people add constraint church_people_id_unique unique (id, church_id);

create index church_people_church_id_idx on church_people (church_id);
create index church_people_person_id_idx on church_people (person_id);

create trigger church_people_set_updated_at
  before update on church_people
  for each row execute function app.set_updated_at();

-- households -----------------------------------------------------------------

create table households (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  name text not null,
  primary_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid
);

comment on table households is
  'Hogar/familia. Compartir household NO concede automáticamente autorización de recogida de menores. Ver docs/15-nucleo-plataforma.md §5.';

alter table households add constraint households_id_unique unique (id, church_id);

create index households_church_id_idx on households (church_id);

create trigger households_set_updated_at
  before update on households
  for each row execute function app.set_updated_at();

create table household_members (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  household_id uuid not null,
  person_id uuid not null,
  relationship_type text not null,
  is_primary_contact boolean not null default false,
  created_at timestamptz not null default now(),
  unique (household_id, person_id),
  foreign key (household_id, church_id) references households (id, church_id) on delete cascade,
  foreign key (person_id) references people (id) on delete cascade
);

comment on column household_members.relationship_type is
  'Tipo de relación configurable (padre, madre, tutor, hijo, cónyuge, otro responsable). No infiere autorización legal.';

create index household_members_church_id_idx on household_members (church_id);
create index household_members_household_id_idx on household_members (household_id);
create index household_members_person_id_idx on household_members (person_id);

-- RLS: activado aquí, políticas concretas en la migración de autorización
-- una vez existan app.church_ids_for_user() y app.current_person_id().

alter table people enable row level security;
alter table people force row level security;

alter table church_people enable row level security;
alter table church_people force row level security;

alter table households enable row level security;
alter table households force row level security;

alter table household_members enable row level security;
alter table household_members force row level security;
