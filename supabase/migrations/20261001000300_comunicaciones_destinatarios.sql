-- Fase 9 (Diogo) · Destinatarios materializados de una comunicación.
--
-- Se materializan UNA SOLA VEZ (communications.materialized_at como guarda,
-- ver app.materialize_communication en 20261001000600) para que un segmento
-- cambiante no altere retroactivamente una comunicación ya enviada. Sin
-- proveedor real de email/push (A14): 'queued' significa "resuelto y
-- pendiente de transporte", nunca se finge 'sent' para esos canales.

create type communication_recipient_status as enum (
  'pending', 'queued', 'sent', 'failed', 'suppressed', 'excluded'
);

comment on type communication_recipient_status is
  'pending: materializado, aún no procesado por el job de envío. queued: resuelto para email/push sin transporte real todavía (nunca se convierte en sent sin un proveedor). sent: entregado (inapp siempre; email/push solo si en el futuro hay transporte real). failed: intento de entrega fallido. suppressed: destinatario correcto pero canal desactivado por preferencia (opt-out). excluded: no cumple requisitos del canal (ej. sin email) o quedó fuera por otra regla — ver excluded_reason.';

create table communication_recipients (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  communication_id uuid not null,
  person_id uuid not null,
  channel notification_channel not null,
  status communication_recipient_status not null default 'pending',
  excluded_reason text check (excluded_reason is null or char_length(excluded_reason) <= 200),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  sent_at timestamptz,
  failed_at timestamptz,
  failure_code text check (failure_code is null or char_length(failure_code) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (communication_id, person_id, channel),
  foreign key (communication_id, church_id) references communications (id, church_id) on delete cascade,
  foreign key (church_id, person_id) references church_people (church_id, person_id) on delete cascade,
  check ((status = 'sent') = (sent_at is not null)),
  check ((status = 'failed') = (failed_at is not null)),
  check (status <> 'excluded' or excluded_reason is not null)
);

comment on table communication_recipients is
  'Destinatario materializado de una comunicación, por persona y canal. Fuente de verdad de entrega de Fase 9 — independiente de notification_deliveries (Fase 5): ver docs/adr/0019-comunicaciones-vs-avisos.md. Nunca se recalcula tras materializar.';
comment on column communication_recipients.excluded_reason is
  'Motivo legible cuando status=excluded: sin_email, canal_no_disponible, sin_pertenencia. Para status=suppressed (opt-out) el motivo va implícito en el status, no aquí.';

alter table communication_recipients add constraint communication_recipients_id_unique unique (id, church_id);

create index communication_recipients_communication_status_idx
  on communication_recipients (communication_id, status);
create index communication_recipients_church_created_idx
  on communication_recipients (church_id, created_at desc);
-- Consumo del job de envío: pendientes/en cola de un canal.
create index communication_recipients_pending_idx
  on communication_recipients (channel, status)
  where status in ('pending', 'queued');

create trigger communication_recipients_set_updated_at
  before update on communication_recipients
  for each row execute function app.set_updated_at();

alter table communication_recipients enable row level security;
alter table communication_recipients force row level security;
