-- Fase 0 · Modules, church_modules, entitlements y feature flags.
-- Ver docs/adr/0006-modules-entitlements-feature-flags.md.

-- Catálogo global de módulos (no tenant-aware) --------------------------------

create table modules (
  key text primary key,
  name text not null,
  description text,
  sort_order smallint not null default 0,
  is_active boolean not null default true
);

comment on table modules is
  'Catálogo global de módulos del producto. No es tenant-aware. Ver docs/18-modulos-funcionales.md.';

insert into modules (key, name, sort_order) values
  ('people', 'Personas', 1),
  ('serving', 'Servicios', 2),
  ('worship', 'Alabanza', 3),
  ('groups', 'Grupos', 4),
  ('discipleship', 'Discipulado', 5),
  ('events', 'Eventos', 6),
  ('kids', 'Niños', 7),
  ('communications', 'Comunicación', 8),
  ('pastoral', 'Acompañamiento pastoral', 9),
  ('giving', 'Ofrendas', 10),
  ('facilities', 'Instalaciones', 11),
  ('analytics', 'Informes', 12),
  ('integrations', 'Integraciones', 13);

-- church_modules: qué módulos están habilitados por tenant -------------------

create type church_module_status as enum (
  'enabled', 'disabled', 'trial', 'suspended'
);

create table church_modules (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  module_key text not null references modules (key),
  status church_module_status not null default 'disabled',
  enabled_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (church_id, module_key)
);

comment on table church_modules is
  'Módulo habilitado/contratado por tenant. Distinto del permiso del usuario (ver capabilities) y del catálogo global (modules). Ver docs/adr/0006.';

alter table church_modules add constraint church_modules_id_unique unique (id, church_id);
create index church_modules_church_id_idx on church_modules (church_id);

create trigger church_modules_set_updated_at
  before update on church_modules
  for each row execute function app.set_updated_at();

-- entitlements -----------------------------------------------------------------

create table plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null,
  capability text not null,
  limit_value integer, -- null = ilimitado / booleano implícito por presencia de fila
  created_at timestamptz not null default now(),
  unique (plan_key, capability)
);

comment on table plan_entitlements is
  'Capacidades/límites derivados del plan comercial. No es tenant-aware: define el catálogo por plan. Ver docs/adr/0006.';

create table church_entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  capability text not null,
  limit_value integer,
  reason text not null,
  granted_by uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (church_id, capability)
);

comment on table church_entitlement_overrides is
  'Override comercial excepcional por tenant. Siempre auditado (reason obligatorio) y opcionalmente temporal. Ver docs/06-facturacion.md §8.';

alter table church_entitlement_overrides add constraint church_entitlement_overrides_id_unique unique (id, church_id);
create index church_entitlement_overrides_church_id_idx on church_entitlement_overrides (church_id);

-- feature flags ------------------------------------------------------------

create table feature_flags (
  key text primary key,
  description text not null,
  owner text,
  default_enabled boolean not null default false,
  retirement_planned_at date,
  created_at timestamptz not null default now()
);

comment on table feature_flags is
  'Rollout operativo, independiente de lo comercial (entitlements). Nunca se usa como control de seguridad. Ver docs/adr/0006.';

create table church_feature_flags (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  flag_key text not null references feature_flags (key),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  unique (church_id, flag_key)
);

alter table church_feature_flags add constraint church_feature_flags_id_unique unique (id, church_id);
create index church_feature_flags_church_id_idx on church_feature_flags (church_id);

-- RLS ------------------------------------------------------------------------
-- modules, plan_entitlements y feature_flags son catálogos globales: solo
-- lectura para authenticated, sin PII, sin church_id. church_modules,
-- church_entitlement_overrides y church_feature_flags son tenant-aware.

alter table modules enable row level security;
create policy modules_select_all on modules
  for select to authenticated using (true);

alter table plan_entitlements enable row level security;
create policy plan_entitlements_select_all on plan_entitlements
  for select to authenticated using (true);

alter table feature_flags enable row level security;
create policy feature_flags_select_all on feature_flags
  for select to authenticated using (true);

alter table church_modules enable row level security;
alter table church_modules force row level security;

alter table church_entitlement_overrides enable row level security;
alter table church_entitlement_overrides force row level security;

alter table church_feature_flags enable row level security;
alter table church_feature_flags force row level security;
