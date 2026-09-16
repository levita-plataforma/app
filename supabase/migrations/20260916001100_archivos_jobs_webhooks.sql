-- Fase 0 · Archivos, jobs (import/export) y webhooks.
-- Ver docs/adr/0008-archivos.md y docs/adr/0010-jobs-import-export.md.

create type file_classification as enum ('public', 'internal', 'personal', 'restricted');

create table files (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  bucket text not null,
  object_path text not null,
  owner_person_id uuid,
  entity_type text,
  entity_id uuid,
  classification file_classification not null default 'internal',
  mime_type text,
  size_bytes bigint,
  checksum text,
  retention_until date,
  status text not null default 'active' check (status in ('active', 'archived', 'deleted')),
  created_at timestamptz not null default now(),
  unique (bucket, object_path)
);

comment on table files is
  'Metadatos de archivos. Los buckets son privados por defecto; el acceso a clasificación distinta de public requiere URL firmada generada por backend. Ver docs/adr/0008.';

alter table files add constraint files_id_unique unique (id, church_id);
create index files_church_id_idx on files (church_id);
create index files_entity_idx on files (entity_type, entity_id);

alter table files enable row level security;
alter table files force row level security;

create policy files_select_internal_or_own on files
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      classification in ('public', 'internal')
      or owner_person_id in (select app.current_person_ids())
      or (select app.has_capability(church_id, 'people.manage'))
    )
  );

create policy files_manage_own_or_capability on files
  for all to authenticated
  using (
    owner_person_id in (select app.current_person_ids())
    or (select app.has_capability(church_id, 'people.manage'))
  )
  with check (
    owner_person_id in (select app.current_person_ids())
    or (select app.has_capability(church_id, 'people.manage'))
  );

-- Ahora que existe `files`, se completa la referencia de avatar en people.
alter table people
  add constraint people_avatar_file_fk
  foreign key (avatar_file_id) references files (id);

-- jobs -------------------------------------------------------------------

create type job_status as enum ('queued', 'processing', 'succeeded', 'failed');

create table import_jobs (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  entity_type text not null,
  actor_person_id uuid,
  status job_status not null default 'queued',
  idempotency_key text,
  correlation_id uuid,
  source_file_id uuid,
  mapping jsonb not null default '{}'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  attempts smallint not null default 0,
  last_error text,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (church_id, idempotency_key)
);

comment on table import_jobs is
  'Job de importación tenant-aware. Ver docs/adr/0010. No implementa aún ningún importador real (llega en Fase 2).';

alter table import_jobs add constraint import_jobs_id_unique unique (id, church_id);
create index import_jobs_church_id_idx on import_jobs (church_id);

create table export_jobs (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  entity_type text not null,
  actor_person_id uuid,
  status job_status not null default 'queued',
  idempotency_key text,
  correlation_id uuid,
  result_file_id uuid,
  filters jsonb not null default '{}'::jsonb,
  attempts smallint not null default 0,
  last_error text,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (church_id, idempotency_key)
);

comment on table export_jobs is
  'Job de exportación tenant-aware, con expiración del fichero resultante. Ver docs/adr/0010.';

alter table export_jobs add constraint export_jobs_id_unique unique (id, church_id);
create index export_jobs_church_id_idx on export_jobs (church_id);

alter table import_jobs enable row level security;
alter table import_jobs force row level security;
create policy import_jobs_select on import_jobs
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );
create policy import_jobs_manage on import_jobs
  for all to authenticated
  using ( (select app.has_capability(church_id, 'people.import')) )
  with check ( (select app.has_capability(church_id, 'people.import')) );

alter table export_jobs enable row level security;
alter table export_jobs force row level security;
create policy export_jobs_select on export_jobs
  for select to authenticated
  using ( church_id = any((select app.church_ids_for_user())::uuid[]) );
create policy export_jobs_manage on export_jobs
  for all to authenticated
  using ( (select app.has_capability(church_id, 'people.export')) )
  with check ( (select app.has_capability(church_id, 'people.export')) );

-- webhooks -----------------------------------------------------------------

create table webhook_events_inbound (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  church_id uuid references churches (id) on delete cascade,
  payload jsonb not null,
  signature_verified boolean not null default false,
  status job_status not null default 'queued',
  attempts smallint not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);

comment on table webhook_events_inbound is
  'Eventos entrantes de proveedores externos, con idempotencia por (provider, provider_event_id) y protección de replay. Ver docs/19-integraciones-y-datos.md §2.';

create index webhook_events_inbound_church_id_idx on webhook_events_inbound (church_id) where church_id is not null;
create index webhook_events_inbound_status_idx on webhook_events_inbound (status) where status != 'succeeded';

-- Los webhooks entrantes se procesan exclusivamente por el backend con
-- service_role (verificación de firma incluida); no se exponen a
-- authenticated ni anon.
alter table webhook_events_inbound enable row level security;
alter table webhook_events_inbound force row level security;

create table webhook_endpoints_outbound (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  url text not null,
  secret_ref text not null, -- referencia a secret manager, nunca el secreto en claro
  events text[] not null default '{}',
  is_active boolean not null default true,
  consecutive_failures smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table webhook_endpoints_outbound is
  'Configuración de webhooks salientes por tenant (futuro/API pública). secret_ref nunca contiene el secreto en claro. Ver docs/19-integraciones-y-datos.md §3.';

alter table webhook_endpoints_outbound add constraint webhook_endpoints_outbound_id_unique unique (id, church_id);
create index webhook_endpoints_outbound_church_id_idx on webhook_endpoints_outbound (church_id);

create trigger webhook_endpoints_outbound_set_updated_at
  before update on webhook_endpoints_outbound
  for each row execute function app.set_updated_at();

alter table webhook_endpoints_outbound enable row level security;
alter table webhook_endpoints_outbound force row level security;
create policy webhook_endpoints_outbound_manage on webhook_endpoints_outbound
  for all to authenticated
  using ( (select app.has_capability(church_id, 'church.settings.manage')) )
  with check ( (select app.has_capability(church_id, 'church.settings.manage')) );
