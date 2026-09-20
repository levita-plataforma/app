-- Fase 9 (Diogo) · Segmentos reutilizables y plantillas.
-- rules es JSON estructurado y validado server-side (app.validate_segment_rules,
-- ver 20261001000600): nunca SQL libre desde el cliente. group_id/grupos
-- quedan como campo reservado en la allowlist (Fase 7 no existe todavía).

create table communication_segments (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 150),
  description text check (description is null or char_length(description) <= 500),
  rules jsonb not null,
  created_by_person_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (church_id, name)
);

comment on table communication_segments is
  'Reglas de audiencia reutilizables (Fase 9). rules se valida con app.validate_segment_rules antes de guardar (trigger). Allowlist positiva de campos: campus_id, tags, relationship, service_area_id, channel_available. "group" es un campo reservado, rechazado en tiempo de ejecución hasta que exista Fase 7.';

alter table communication_segments add constraint communication_segments_id_unique unique (id, church_id);
create index communication_segments_church_idx on communication_segments (church_id) where archived_at is null;

create trigger communication_segments_set_updated_at
  before update on communication_segments
  for each row execute function app.set_updated_at();

alter table communication_segments enable row level security;
alter table communication_segments force row level security;

-- FK ahora que communication_segments existe (definida tras communications
-- en 20261001000100 sin FK porque la tabla referenciada no existía aún).
alter table communications
  add constraint communications_segment_id_fkey
  foreign key (segment_id, church_id) references communication_segments (id, church_id) on delete set null (segment_id);

create table communication_templates (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 150),
  subject text check (subject is null or char_length(subject) <= 200),
  body text not null check (btrim(body) <> '' and char_length(body) <= 5000),
  -- Allowlist de placeholders permitidos en subject/body para ESTA plantilla.
  -- Nunca puede exceder el catálogo global validado por
  -- app.validate_template_placeholders (first_name, church_name).
  placeholders_allowed text[] not null default array['first_name', 'church_name'],
  category text check (category is null or char_length(category) <= 80),
  created_by_person_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (church_id, name)
);

comment on table communication_templates is
  'Plantillas de comunicación (Fase 9). body/subject solo admiten placeholders de placeholders_allowed, validado por trigger contra el catálogo global {{first_name}}, {{church_name}} — nunca datos pastorales, financieros, de menores ni secretos.';

alter table communication_templates add constraint communication_templates_id_unique unique (id, church_id);
create index communication_templates_church_idx on communication_templates (church_id) where archived_at is null;

create trigger communication_templates_set_updated_at
  before update on communication_templates
  for each row execute function app.set_updated_at();

alter table communication_templates enable row level security;
alter table communication_templates force row level security;

alter table communications
  add constraint communications_template_id_fkey
  foreign key (template_id, church_id) references communication_templates (id, church_id) on delete set null (template_id);
