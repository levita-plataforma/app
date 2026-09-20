-- Fase 12 (Diogo) · Giving: fondos y campañas.
--
-- Giving representa donaciones/aportaciones que recibe la iglesia. NO es
-- billing de LEVITA (cuota SaaS, suscripción, facturación de plataforma) —
-- ver docs/06-facturacion.md §9 ("Giving no es billing") y A17/D10 en
-- docs/07-decisiones.md.

create type giving_entity_status as enum ('active', 'archived');

-- ============================================================================
-- Funds (fondos)
-- ============================================================================

create table giving_funds (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 200),
  description text check (description is null or char_length(description) <= 2000),
  status giving_entity_status not null default 'active',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((status = 'archived') = (archived_at is not null))
);

comment on table giving_funds is
  'Fondo de destino de una aportación (Fondo general, Misiones, Construcción...). Pertenece al tenant; no existe fondo global compartido. Ver docs/FASE-12-GIVING.md.';

alter table giving_funds add constraint giving_funds_id_unique unique (id, church_id);

create index giving_funds_church_status_idx on giving_funds (church_id, status);

-- Un solo fondo default ACTIVO por iglesia, garantizado por índice único
-- parcial (no solo en frontend, ver encargo §6).
create unique index giving_funds_one_default_per_church_idx
  on giving_funds (church_id)
  where is_default and status = 'active';

create trigger giving_funds_set_updated_at
  before update on giving_funds
  for each row execute function app.set_updated_at();

alter table giving_funds enable row level security;
alter table giving_funds force row level security;

-- ============================================================================
-- Campaigns (campañas)
-- ============================================================================

create type giving_campaign_status as enum ('draft', 'active', 'closed', 'archived');

create table giving_campaigns (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  fund_id uuid not null,
  name text not null check (btrim(name) <> '' and char_length(name) <= 200),
  description text check (description is null or char_length(description) <= 2000),
  starts_at timestamptz,
  ends_at timestamptz,
  -- Meta opcional (encargo §8): nunca se usa como autorización ni límite,
  -- solo informativa para mostrar progreso.
  target_amount_minor bigint check (target_amount_minor is null or target_amount_minor > 0),
  currency text not null,
  status giving_campaign_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((status = 'archived') = (archived_at is not null)),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  -- FK tenant-safe: la campaña y su fondo deben pertenecer a la misma
  -- iglesia (ADR 0014).
  foreign key (fund_id, church_id) references giving_funds (id, church_id)
);

comment on table giving_campaigns is
  'Campaña de donación asociada a un fondo. Estados simples: draft/active/closed/archived, sin workflow contable. Ver docs/FASE-12-GIVING.md.';
comment on column giving_campaigns.target_amount_minor is
  'Meta opcional, en unidades menores de moneda (céntimos). Nunca se usa como autorización ni límite de aportación.';

alter table giving_campaigns add constraint giving_campaigns_id_unique unique (id, church_id);

create index giving_campaigns_church_status_idx on giving_campaigns (church_id, status);
create index giving_campaigns_fund_idx on giving_campaigns (fund_id);

create trigger giving_campaigns_set_updated_at
  before update on giving_campaigns
  for each row execute function app.set_updated_at();

alter table giving_campaigns enable row level security;
alter table giving_campaigns force row level security;
