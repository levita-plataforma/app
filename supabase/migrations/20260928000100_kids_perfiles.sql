-- Fase 8 (Diogo) · Kids: perfil, guardianes y autorizaciones de recogida.
-- Ver prompt Fase 8 §2-8.
--
-- Regla arquitectural principal: no se crea una segunda entidad de
-- persona. Menores y adultos siguen en `people`; este módulo añade
-- únicamente lo específico de Kids en tablas propias. `household
-- membership != pickup authorization`: la relación familiar nunca
-- autoriza recogida por sí sola (§3).

create type kids_profile_status as enum ('active', 'inactive', 'archived');

create table kids_profiles (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  person_id uuid not null,
  status kids_profile_status not null default 'active',
  preferred_name text check (preferred_name is null or char_length(preferred_name) <= 100),
  medical_alert_flag boolean not null default false,
  accessibility_notes text check (accessibility_notes is null or char_length(accessibility_notes) <= 1000),
  emergency_notes text check (emergency_notes is null or char_length(emergency_notes) <= 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (church_id, person_id),
  foreign key (person_id) references people (id) on delete cascade,
  foreign key (church_id, person_id) references church_people (church_id, person_id) on delete cascade
);

comment on table kids_profiles is
  'Perfil Kids de una persona ya existente en people. No duplica birth_date (ya vive en people.birth_date): la edad se calcula desde ahí. Ver prompt Fase 8 §4.';
comment on column kids_profiles.medical_alert_flag is
  'Indicador booleano visible en listados generales (ej. icono de alerta). El detalle real vive en accessibility_notes/emergency_notes, ambas restringidas por RLS a quien tenga kids.sensitive.read.';
comment on column kids_profiles.accessibility_notes is
  'Información operativa mínima de accesibilidad (ej. necesidad de silla, apoyo auditivo). Nunca un historial médico completo. Ver prompt Fase 8 §25.';
comment on column kids_profiles.emergency_notes is
  'Información operativa mínima de emergencia (ej. alergia relevante, medicación puntual). Clasificación restricted vía RLS.';

alter table kids_profiles add constraint kids_profiles_id_unique unique (id, church_id);
create index kids_profiles_church_person_idx on kids_profiles (church_id, person_id);
create index kids_profiles_church_active_idx on kids_profiles (church_id, active);

create trigger kids_profiles_set_updated_at
  before update on kids_profiles
  for each row execute function app.set_updated_at();

-- kid_guardians -----------------------------------------------------------
-- Relación explícita menor↔responsable. Puede sugerirse desde household,
-- pero NUNCA se deriva automáticamente en autorización (§3, §5).

create table kid_guardians (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  kid_person_id uuid not null,
  guardian_person_id uuid not null,
  relationship_type text not null check (btrim(relationship_type) <> '' and char_length(relationship_type) <= 100),
  legal_guardian boolean not null default false,
  emergency_contact boolean not null default false,
  can_view boolean not null default true,
  active boolean not null default true,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (church_id, kid_person_id, guardian_person_id),
  foreign key (kid_person_id) references people (id) on delete cascade,
  foreign key (guardian_person_id) references people (id) on delete cascade,
  foreign key (church_id, kid_person_id) references church_people (church_id, person_id) on delete cascade,
  foreign key (church_id, guardian_person_id) references church_people (church_id, person_id) on delete cascade,
  check (kid_person_id <> guardian_person_id),
  check (valid_until is null or valid_until > valid_from)
);

comment on table kid_guardians is
  'Relación explícita y auditable entre un menor y su responsable. NUNCA implica autorización de recogida por sí sola: ver kid_pickup_authorizations. Ver prompt Fase 8 §5.';

alter table kid_guardians add constraint kid_guardians_id_unique unique (id, church_id);
create index kid_guardians_kid_idx on kid_guardians (kid_person_id);
create index kid_guardians_guardian_idx on kid_guardians (guardian_person_id);

create trigger kid_guardians_set_updated_at
  before update on kid_guardians
  for each row execute function app.set_updated_at();

-- kid_pickup_authorizations -------------------------------------------------

create type pickup_authorization_type as enum ('permanent', 'date_range', 'one_time');
create type pickup_authorization_status as enum ('active', 'expired', 'revoked', 'used', 'pending');

create table kid_pickup_authorizations (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  kid_person_id uuid not null,
  authorized_person_id uuid,
  authorized_name_snapshot text not null check (btrim(authorized_name_snapshot) <> '' and char_length(authorized_name_snapshot) <= 200),
  relation_text text check (relation_text is null or char_length(relation_text) <= 200),
  authorization_type pickup_authorization_type not null default 'permanent',
  status pickup_authorization_status not null default 'active',
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  one_time boolean not null default false,
  used_at timestamptz,
  used_checkin_id uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (kid_person_id) references people (id) on delete cascade,
  foreign key (authorized_person_id) references people (id) on delete set null,
  foreign key (church_id, kid_person_id) references church_people (church_id, person_id) on delete cascade,
  foreign key (church_id, authorized_person_id) references church_people (church_id, person_id),
  check (authorization_type <> 'one_time' or one_time),
  check (authorization_type <> 'date_range' or valid_until is not null),
  check ((status = 'revoked') = (revoked_at is not null)),
  check (not one_time or status <> 'used' or used_at is not null)
);

comment on table kid_pickup_authorizations is
  'Autorización EXPLÍCITA de recogida. Puede referenciar una persona ya registrada (authorized_person_id) o una persona externa (solo authorized_name_snapshot, sin crear people automáticamente). Ver prompt Fase 8 §6-7.';
comment on column kid_pickup_authorizations.authorized_name_snapshot is
  'Nombre de la persona autorizada, siempre presente (incluso si authorized_person_id existe, para no depender de que people no cambie el nombre después).';
comment on column kid_pickup_authorizations.one_time is
  'Si es true, la autorización se marca status=used tras el primer checkout que la consuma (ver app.kids_checkout) y no vuelve a ser válida.';

alter table kid_pickup_authorizations add constraint kid_pickup_authorizations_id_unique unique (id, church_id);
create index kid_pickup_authorizations_kid_status_idx on kid_pickup_authorizations (kid_person_id, status);
create index kid_pickup_authorizations_authorized_person_idx on kid_pickup_authorizations (authorized_person_id);
create index kid_pickup_authorizations_valid_until_idx on kid_pickup_authorizations (valid_until);

create trigger kid_pickup_authorizations_set_updated_at
  before update on kid_pickup_authorizations
  for each row execute function app.set_updated_at();

alter table kids_profiles enable row level security;
alter table kids_profiles force row level security;
alter table kid_guardians enable row level security;
alter table kid_guardians force row level security;
alter table kid_pickup_authorizations enable row level security;
alter table kid_pickup_authorizations force row level security;
