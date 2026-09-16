-- Fase 1 · Suscripción provider-agnostic.
-- Ver docs/06-facturacion.md. No acopla a Stripe ni a ningún proveedor
-- concreto: billing_provider/billing_customer_external_id quedan opcionales
-- para cuando se integre un proveedor real.

create type subscription_status as enum (
  'trial',
  'active',
  'past_due',
  'suspended',
  'cancelled'
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  plan_key text not null default 'trial',
  status subscription_status not null default 'trial',
  trial_ends_at timestamptz,
  started_at timestamptz not null default now(),
  renews_at timestamptz,
  cancel_at timestamptz,
  cancelled_at timestamptz,
  billing_provider text,
  billing_customer_external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (church_id)
);

comment on table subscriptions is
  'Suscripción comercial de la iglesia al tenant. Provider-agnostic por diseño (ver docs/06-facturacion.md §1-2); billing_provider queda null hasta integrar un proveedor real.';
comment on column subscriptions.billing_provider is
  'Ej. "stripe". Null mientras no exista integración de pago real.';

alter table subscriptions add constraint subscriptions_id_unique unique (id, church_id);
create index subscriptions_church_id_idx on subscriptions (church_id);
create index subscriptions_status_idx on subscriptions (status);

create trigger subscriptions_set_updated_at
  before update on subscriptions
  for each row execute function app.set_updated_at();

alter table subscriptions enable row level security;
alter table subscriptions force row level security;

create policy subscriptions_select on subscriptions
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'church.settings.manage'))
  );

create policy subscriptions_manage on subscriptions
  for all to authenticated
  using ( (select app.has_capability(church_id, 'church.settings.manage')) )
  with check ( (select app.has_capability(church_id, 'church.settings.manage')) );

-- Ahora que existe subscriptions, se completa la referencia lógica ya
-- prevista en churches.subscription_id (Fase 0).
alter table churches
  add constraint churches_subscription_id_fk
  foreign key (subscription_id) references subscriptions (id);
