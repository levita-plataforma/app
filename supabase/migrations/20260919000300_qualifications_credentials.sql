-- Fase 3 · Cualificaciones, credenciales y requisitos por puesto.
-- Ver prompt de Fase 3 §10-13.

create type qualification_level as enum ('basic', 'intermediate', 'advanced', 'expert');

create table qualifications (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  name text not null,
  description text,
  category text,
  active boolean not null default true,
  expiry_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (church_id, name)
);

comment on table qualifications is
  'Catálogo tenant-aware de cualificaciones/capacidades (Mesa de sonido, OBS, Primeros auxilios...). Ver prompt Fase 3 §11.';

alter table qualifications add constraint qualifications_id_unique unique (id, church_id);
create index qualifications_church_id_idx on qualifications (church_id);

create trigger qualifications_set_updated_at
  before update on qualifications
  for each row execute function app.set_updated_at();

create table person_qualifications (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  person_id uuid not null,
  qualification_id uuid not null,
  level qualification_level not null default 'basic',
  verified boolean not null default false,
  verified_by uuid,
  verified_at timestamptz,
  expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (person_id, qualification_id),
  foreign key (person_id) references people (id) on delete cascade,
  foreign key (qualification_id, church_id) references qualifications (id, church_id) on delete cascade
);

comment on table person_qualifications is
  'Cualificación asignada a una persona, con nivel y verificación. Ver prompt Fase 3 §11-12.';

alter table person_qualifications add constraint person_qualifications_id_unique unique (id, church_id);
create index person_qualifications_church_person_idx on person_qualifications (church_id, person_id);
create index person_qualifications_church_qualification_idx on person_qualifications (church_id, qualification_id);

create trigger person_qualifications_set_updated_at
  before update on person_qualifications
  for each row execute function app.set_updated_at();

-- credential_types / person_credentials --------------------------------------

create type credential_status as enum ('pending', 'valid', 'expired', 'rejected', 'revoked');

create table credential_types (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  name text not null,
  description text,
  requires_expiry boolean not null default true,
  sensitive boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (church_id, name)
);

comment on table credential_types is
  'Tipo de credencial/acreditación tenant-aware (certificado delitos sexuales, primeros auxilios...). Ver prompt Fase 3 §13.';
comment on column credential_types.sensitive is
  'Marca tipos como LOPIVI (protección de menores): su estado solo es visible a roles autorizados (credential.sensitive.read). Ver prompt Fase 3 §14.';

alter table credential_types add constraint credential_types_id_unique unique (id, church_id);
create index credential_types_church_id_idx on credential_types (church_id);

create trigger credential_types_set_updated_at
  before update on credential_types
  for each row execute function app.set_updated_at();

create table person_credentials (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  person_id uuid not null,
  credential_type_id uuid not null,
  status credential_status not null default 'pending',
  issued_at timestamptz,
  expires_at timestamptz,
  verified_by uuid,
  verified_at timestamptz,
  reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (person_id) references people (id) on delete cascade,
  foreign key (credential_type_id, church_id) references credential_types (id, church_id) on delete cascade
);

comment on table person_credentials is
  'Credencial/acreditación de una persona, con vigencia y estado. Nunca almacena el documento/PDF: solo estado y referencia. Ver prompt Fase 3 §13-14.';
comment on column person_credentials.reference is
  'Referencia administrativa opcional (nº de expediente, entidad emisora). Nunca el documento en sí.';

alter table person_credentials add constraint person_credentials_id_unique unique (id, church_id);
create index person_credentials_church_person_idx on person_credentials (church_id, person_id);
create index person_credentials_church_status_idx on person_credentials (church_id, status);
create index person_credentials_expires_at_idx on person_credentials (expires_at);

create trigger person_credentials_set_updated_at
  before update on person_credentials
  for each row execute function app.set_updated_at();

-- position_requirements -------------------------------------------------------

create type position_requirement_type as enum ('qualification', 'credential', 'minimum_level');
create type position_requirement_strictness as enum ('required', 'recommended');

create table position_requirements (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  service_position_id uuid not null,
  requirement_type position_requirement_type not null,
  strictness position_requirement_strictness not null default 'required',
  qualification_id uuid,
  credential_type_id uuid,
  min_level qualification_level,
  min_operational_level service_operational_level,
  requires_current_validity boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (service_position_id, church_id) references service_positions (id, church_id) on delete cascade,
  foreign key (qualification_id, church_id) references qualifications (id, church_id) on delete cascade,
  foreign key (credential_type_id, church_id) references credential_types (id, church_id) on delete cascade,
  check (
    (requirement_type = 'qualification' and qualification_id is not null and credential_type_id is null)
    or (requirement_type = 'credential' and credential_type_id is not null and qualification_id is null)
    or (requirement_type = 'minimum_level' and qualification_id is null and credential_type_id is null and min_operational_level is not null)
  )
);

comment on table position_requirements is
  'Requisito explícito de un puesto: cualificación, credencial o nivel operativo mínimo. Ver prompt Fase 3 §10.';
comment on column position_requirements.requires_current_validity is
  'Para requisitos de credential: exige que esté en estado valid y no vencida, no solo que exista el registro.';

create index position_requirements_church_position_idx on position_requirements (church_id, service_position_id);

alter table qualifications enable row level security;
alter table qualifications force row level security;
alter table person_qualifications enable row level security;
alter table person_qualifications force row level security;
alter table credential_types enable row level security;
alter table credential_types force row level security;
alter table person_credentials enable row level security;
alter table person_credentials force row level security;
alter table position_requirements enable row level security;
alter table position_requirements force row level security;
