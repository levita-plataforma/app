-- Fase 9 (Diogo) · Comunicación segmentada: entidad principal.
-- Ver docs/07-decisiones.md A14 (resuelta: finalidad institutional/operational,
-- sin marketing funcional, sin proveedor real de email/push, opt-out vía
-- notification_preferences ya existente de Fase 5).

create type communication_status as enum (
  'draft', 'scheduled', 'processing', 'sent', 'partially_sent', 'failed', 'cancelled'
);

comment on type communication_status is
  'draft: en edición. scheduled: con scheduled_at pendiente. processing: materializando/enviando. sent: todos los destinatarios resueltos. partially_sent: mezcla de sent/queued con failed/excluded. failed: ningún destinatario se procesó con éxito. cancelled: cancelada antes de procesar.';

-- Deliberadamente sin 'marketing': A14 limita esta fase a comunicación
-- institucional. Ampliar este enum es una decisión de producto futura, no
-- un detalle de implementación.
create type communication_purpose as enum ('institutional', 'operational');

comment on type communication_purpose is
  'Finalidad de la comunicación (A14). institutional: comunicados generales de la iglesia. operational: avisos de funcionamiento no cubiertos por el motor de Fase 5. Nunca "marketing": no implementado en esta fase.';

create table communications (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  title text not null check (btrim(title) <> '' and char_length(title) <= 200),
  purpose communication_purpose not null default 'institutional',
  status communication_status not null default 'draft',
  -- Cuerpo con placeholders {{first_name}}/{{church_name}}, validados en la
  -- plantilla de origen si aplica (ver 20260929000200). Se guarda ya
  -- resuelto a nivel de plantilla permitida, nunca HTML arbitrario.
  subject text check (subject is null or char_length(subject) <= 200),
  body_template text not null check (btrim(body_template) <> '' and char_length(body_template) <= 5000),
  template_id uuid,
  -- Copia inmutable de las reglas del segmento en el momento de materializar:
  -- editar o borrar el segmento guardado después nunca altera una
  -- comunicación ya materializada o enviada.
  segment_id uuid,
  segment_rules_snapshot jsonb,
  channels notification_channel[] not null check (
    channels <@ array['inapp', 'email', 'push']::notification_channel[]
    and cardinality(channels) > 0
  ),
  scheduled_at timestamptz,
  materialized_at timestamptz,
  sent_at timestamptz,
  created_by_person_id uuid,
  updated_by_person_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  -- Solo exige scheduled_at al entrar en 'scheduled'; una vez que avanza a
  -- processing/sent/etc. conserva scheduled_at como registro histórico de
  -- cuándo se programó, sin que el check se lo impida.
  check (status <> 'scheduled' or scheduled_at is not null),
  check (status <> 'sent' or sent_at is not null),
  check (status not in ('processing', 'sent', 'partially_sent', 'failed') or materialized_at is not null)
);

comment on table communications is
  'Comunicación institucional segmentada (Fase 9). No es marketing masivo genérico: reutiliza people/church_people/tags/service_areas para segmentar, y el motor de preferencias de Fase 5 para opt-out. Ver docs/adr/0019-comunicaciones-vs-avisos.md.';
comment on column communications.segment_rules_snapshot is
  'Copia de communication_segments.rules (o de las reglas ad-hoc del wizard) en el momento de crear/actualizar en borrador. Se congela definitivamente al materializar (materialized_at). Nunca se recalcula tras ese punto.';

alter table communications add constraint communications_id_unique unique (id, church_id);

create index communications_church_status_idx on communications (church_id, status);
create index communications_church_created_idx on communications (church_id, created_at desc);
-- Consumo por el job: comunicaciones programadas cuya hora ya llegó.
create index communications_scheduled_due_idx
  on communications (scheduled_at)
  where status = 'scheduled' and materialized_at is null;

create trigger communications_set_updated_at
  before update on communications
  for each row execute function app.set_updated_at();

alter table communications enable row level security;
alter table communications force row level security;
