-- Fase 1 · Estado persistente y reanudable de onboarding.
-- Ver docs/13-plan-por-fases.md Fase 1 y el encargo de Fase 1 §12.

create type church_onboarding_step as enum (
  'account',
  'church',
  'campus',
  'profile',
  'branding',
  'modules',
  'finish'
);

create table church_onboarding (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  current_step church_onboarding_step not null default 'account',
  completed_steps church_onboarding_step[] not null default '{}',
  version smallint not null default 1,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  dismissed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (church_id)
);

comment on table church_onboarding is
  'Estado de onboarding por iglesia, reanudable. metadata guarda datos no sensibles del progreso (p. ej. borrador de branding), nunca secretos.';

alter table church_onboarding add constraint church_onboarding_id_unique unique (id, church_id);
create index church_onboarding_church_id_idx on church_onboarding (church_id);

create trigger church_onboarding_set_updated_at
  before update on church_onboarding
  for each row execute function app.set_updated_at();

alter table church_onboarding enable row level security;
alter table church_onboarding force row level security;

create policy church_onboarding_select on church_onboarding
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );

create policy church_onboarding_manage on church_onboarding
  for all to authenticated
  using ( (select app.has_capability(church_id, 'church.settings.manage')) )
  with check ( (select app.has_capability(church_id, 'church.settings.manage')) );
