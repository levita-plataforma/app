-- Fase 12 (Diogo) · Giving: planes recurrentes y conciliación.
--
-- Recurrencia MODELADA, sin inventar débito bancario ni cobro automático
-- (encargo §20/§22): un plan activo es un compromiso/planificación; una
-- aportación solo existe cuando hay un evento financiero real registrado
-- (manual o de proveedor). No se generan contributions "succeeded"
-- fantasma desde un plan recurrente.

create type giving_recurrence_frequency as enum ('weekly', 'monthly', 'yearly');

create type giving_recurring_plan_status as enum ('active', 'paused', 'ended');

create table giving_recurring_plans (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  person_id uuid,
  fund_id uuid not null,
  campaign_id uuid,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  frequency giving_recurrence_frequency not null,
  status giving_recurring_plan_status not null default 'active',
  -- Preparado sin asumir proveedor (encargo §16/§20): nulos hasta que exista
  -- integración real que agende el cobro.
  provider text,
  provider_subscription_ref text,
  starts_at timestamptz not null default now(),
  next_due_at timestamptz,
  ended_at timestamptz,
  created_by_person_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'ended') = (ended_at is not null)),
  foreign key (fund_id, church_id) references giving_funds (id, church_id),
  foreign key (campaign_id, church_id) references giving_campaigns (id, church_id),
  foreign key (church_id, person_id) references church_people (church_id, person_id)
);

comment on table giving_recurring_plans is
  'Compromiso de aportación recurrente. NO genera contributions automáticamente: cada aportación real (manual o de proveedor) es una fila propia en giving_contributions. Ver docs/FASE-12-GIVING.md.';
comment on column giving_recurring_plans.next_due_at is
  'Próximo vencimiento estimado, informativo. Nulo si no hay proveedor que agende el cobro (planificación manual sin fecha exacta).';

alter table giving_recurring_plans add constraint giving_recurring_plans_id_unique unique (id, church_id);

create index giving_recurring_plans_church_status_idx on giving_recurring_plans (church_id, status);
create index giving_recurring_plans_person_idx on giving_recurring_plans (person_id) where person_id is not null;
create unique index giving_recurring_plans_provider_ref_idx
  on giving_recurring_plans (provider, provider_subscription_ref)
  where provider is not null and provider_subscription_ref is not null;

create trigger giving_recurring_plans_set_updated_at
  before update on giving_recurring_plans
  for each row execute function app.set_updated_at();

alter table giving_recurring_plans enable row level security;
alter table giving_recurring_plans force row level security;

-- Relación opcional: una contribución puede provenir de un plan recurrente
-- (trazabilidad), sin que el plan la genere automáticamente.
alter table giving_contributions add column recurring_plan_id uuid;
alter table giving_contributions
  add constraint giving_contributions_recurring_plan_fkey
  foreign key (recurring_plan_id, church_id) references giving_recurring_plans (id, church_id);
create index giving_contributions_recurring_plan_idx on giving_contributions (recurring_plan_id) where recurring_plan_id is not null;

-- ============================================================================
-- Conciliación (encargo §26/§27): modelo simple, nunca contabilidad de doble
-- entrada. reconciliation_status ya vive en giving_contributions (migración
-- anterior); esta tabla guarda el detalle de CADA conciliación (referencia
-- externa, quién y cuándo), separado para no perder histórico si se marca y
-- desmarca.
-- ============================================================================

create table giving_reconciliations (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  contribution_id uuid not null,
  external_reference text check (external_reference is null or char_length(external_reference) <= 200),
  status giving_reconciliation_status not null default 'reconciled',
  notes text check (notes is null or char_length(notes) <= 1000),
  reconciled_by_person_id uuid,
  reconciled_at timestamptz not null default now(),
  foreign key (contribution_id, church_id) references giving_contributions (id, church_id)
);

comment on table giving_reconciliations is
  'Detalle de conciliación de una aportación con un movimiento/referencia externa. No es contabilidad de doble entrada. Ver docs/FASE-12-GIVING.md.';

alter table giving_reconciliations add constraint giving_reconciliations_id_unique unique (id, church_id);

create index giving_reconciliations_contribution_idx on giving_reconciliations (contribution_id);
create index giving_reconciliations_church_idx on giving_reconciliations (church_id);

alter table giving_reconciliations enable row level security;
alter table giving_reconciliations force row level security;
