-- Fase 0 · Núcleo: churches (tenant) y campuses.
-- Ver docs/adr/0001-estrategia-multi-tenant.md y docs/adr/0003-multi-campus.md.

create type church_status as enum (
  'provisioning',
  'trial',
  'active',
  'past_due',
  'suspended',
  'cancelling',
  'archived'
);

create table churches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status church_status not null default 'provisioning',
  locale text not null default 'es-ES',
  timezone text not null default 'Europe/Madrid',
  currency text not null default 'EUR',
  branding jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  -- referencia lógica a la suscripción/billing; el detalle de facturación
  -- se implementa en la fase correspondiente (docs/06-facturacion.md).
  subscription_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid
);

comment on table churches is
  'Tenant contractual y de seguridad. Cada iglesia es un tenant aislado. Ver docs/adr/0001.';
comment on column churches.slug is
  'Identificador de acceso (ej. /i/[slug]). Nunca se usa como credencial de autorización.';

create index churches_status_idx on churches (status) where archived_at is null;
create index churches_slug_idx on churches (slug);

create trigger churches_set_updated_at
  before update on churches
  for each row execute function app.set_updated_at();

-- campuses ---------------------------------------------------------------

create table campuses (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  name text not null,
  slug text not null,
  address text,
  timezone text,
  public_email text,
  public_phone text,
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived')),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid,
  unique (church_id, slug)
);

comment on table campuses is
  'Sede dentro de una iglesia. No es un tenant independiente. Ver docs/adr/0003.';

alter table campuses add constraint campuses_id_unique unique (id, church_id);

create index campuses_church_id_idx on campuses (church_id);
create unique index campuses_one_primary_per_church
  on campuses (church_id) where is_primary and archived_at is null;

create trigger campuses_set_updated_at
  before update on campuses
  for each row execute function app.set_updated_at();

-- RLS ----------------------------------------------------------------------
-- churches y campuses se protegen con funciones de contexto definidas en la
-- siguiente migración (depende de church_people). Se activa RLS aquí y se
-- añaden las políticas cuando exista app.church_ids_for_user().

alter table churches enable row level security;
alter table churches force row level security;

alter table campuses enable row level security;
alter table campuses force row level security;
