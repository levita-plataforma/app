-- Fase 12 (Diogo) · Giving: aportaciones (contributions).
--
-- Dinero: NUNCA float/double/JS floating point como representación
-- autoritativa (encargo §9, regla crítica). amount_minor bigint (céntimos:
-- 1000 = 10,00 EUR), mismo criterio que cualquier sistema financiero real.

create type giving_contribution_method as enum ('cash', 'bank_transfer', 'card', 'direct_debit', 'other');

create type giving_contribution_status as enum ('pending', 'succeeded', 'failed', 'refunded', 'cancelled');

create type giving_reconciliation_status as enum ('unreconciled', 'reconciled', 'exception');

create table giving_contributions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  fund_id uuid not null,
  campaign_id uuid,
  -- Nullable a propósito (encargo §11): una iglesia puede recibir una
  -- donación sin persona registrada. anonymous distingue "sin persona
  -- identificada" de "persona identificada pero oculta al público" — para
  -- F12, anonymous=true implica person_id NULL (encargo §46): no existe
  -- "perfil Anónimo" falso ni ocultación solo de cara al público todavía.
  person_id uuid,
  anonymous boolean not null default false,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  method giving_contribution_method not null,
  status giving_contribution_status not null default 'pending',
  reconciliation_status giving_reconciliation_status not null default 'unreconciled',
  contributed_at timestamptz not null default now(),
  reference text check (reference is null or char_length(reference) <= 200),
  -- Notas restringidas: nunca en listados generales, notificaciones ni logs
  -- (encargo §56). Clasificación de privacidad se aplica en la capa de
  -- lectura (RPC/servicio), no solo aquí.
  notes text check (notes is null or char_length(notes) <= 2000),
  -- Referencias de proveedor externo, preparadas sin asumir ningún proveedor
  -- concreto (encargo §16/§18): nunca el ID del proveedor como PK interna.
  provider text,
  provider_payment_ref text,
  provider_customer_ref text,
  created_by_person_id uuid,
  updated_by_person_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (anonymous = false or person_id is null),
  check (status <> 'refunded' or reconciliation_status <> 'exception'),
  foreign key (fund_id, church_id) references giving_funds (id, church_id),
  foreign key (campaign_id, church_id) references giving_campaigns (id, church_id),
  foreign key (church_id, person_id) references church_people (church_id, person_id)
);

comment on table giving_contributions is
  'Aportación/donación recibida por la iglesia. No hard delete: una aportación mal registrada se cancela o revierte, nunca se borra (D12, encargo §40). Ver docs/FASE-12-GIVING.md.';
comment on column giving_contributions.amount_minor is
  'Importe en unidades menores de la moneda (céntimos). Nunca float/double. 1000 = 10,00 EUR.';
comment on column giving_contributions.person_id is
  'Nullable: una donación puede no tener persona identificada. anonymous=true siempre implica person_id NULL en esta fase.';
comment on column giving_contributions.notes is
  'Texto restringido: nunca en listados generales, notificaciones push/email ni logs. Solo visible con capability de detalle financiero.';

alter table giving_contributions add constraint giving_contributions_id_unique unique (id, church_id);

create index giving_contributions_church_status_idx on giving_contributions (church_id, status);
create index giving_contributions_church_contributed_idx on giving_contributions (church_id, contributed_at desc);
create index giving_contributions_fund_idx on giving_contributions (fund_id);
create index giving_contributions_campaign_idx on giving_contributions (campaign_id) where campaign_id is not null;
create index giving_contributions_person_idx on giving_contributions (person_id) where person_id is not null;
create index giving_contributions_reconciliation_idx on giving_contributions (church_id, reconciliation_status);
-- Idempotencia de proveedor (encargo §16/§18/§23): un mismo evento de
-- proveedor no puede crear dos aportaciones.
create unique index giving_contributions_provider_ref_idx
  on giving_contributions (provider, provider_payment_ref)
  where provider is not null and provider_payment_ref is not null;

create trigger giving_contributions_set_updated_at
  before update on giving_contributions
  for each row execute function app.set_updated_at();

alter table giving_contributions enable row level security;
alter table giving_contributions force row level security;

-- ============================================================================
-- Refunds
-- ============================================================================

create type giving_refund_status as enum ('pending', 'succeeded', 'failed');

create table giving_refunds (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  contribution_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0),
  reason text check (reason is null or char_length(reason) <= 500),
  provider_ref text,
  status giving_refund_status not null default 'pending',
  created_by_person_id uuid,
  created_at timestamptz not null default now(),
  foreign key (contribution_id, church_id) references giving_contributions (id, church_id)
);

comment on table giving_refunds is
  'Devolución de una aportación succeeded, registrada aparte para preservar el histórico (encargo §24: nunca se pone el importe original a cero). La suma de refunds succeeded de una contribution nunca supera su amount_minor original (app.create_giving_refund la valida).';

alter table giving_refunds add constraint giving_refunds_id_unique unique (id, church_id);

create index giving_refunds_contribution_idx on giving_refunds (contribution_id);
create index giving_refunds_church_idx on giving_refunds (church_id);

alter table giving_refunds enable row level security;
alter table giving_refunds force row level security;
