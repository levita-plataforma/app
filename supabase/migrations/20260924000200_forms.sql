-- Fase 6 · Formularios reutilizables, versionados. Ver prompt Fase 6 §11-14.
--
-- Un formulario no está limitado a un evento: es un catálogo tenant-aware
-- reutilizable. El versionado es estructural (snapshot por submission), no
-- histórico de filas: form_fields siempre representa la versión VIGENTE;
-- form_submissions congela su propio esquema en form_version + un snapshot
-- serializado, así que una respuesta histórica se interpreta igual aunque el
-- formulario cambie después (§13).

create type form_field_type as enum (
  'text', 'textarea', 'email', 'phone', 'number', 'date',
  'select', 'multi_select', 'checkbox', 'boolean', 'address'
);

create type form_field_classification as enum ('normal', 'personal', 'sensitive', 'restricted');

comment on type form_field_classification is
  'normal/personal: cualquiera con form.manage. sensitive/restricted: requieren form.sensitive.manage además, tanto para crear el campo como para leer sus respuestas. Ver prompt Fase 6 §12.';

create table forms (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  name text not null check (btrim(name) <> '' and char_length(name) <= 150),
  description text check (description is null or char_length(description) <= 1000),
  purpose text not null check (btrim(purpose) <> '' and char_length(purpose) <= 500),
  active boolean not null default true,
  current_version integer not null default 1 check (current_version >= 1),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table forms is
  'Catálogo tenant-aware de formularios reutilizables (inscripción a evento, nuevo visitante, voluntariado...). Ver prompt Fase 6 §11 y §34.';
comment on column forms.purpose is
  'Finalidad explícita obligatoria (RGPD, minimización): para qué se usa este formulario. Ver prompt Fase 6 §46.';
comment on column forms.current_version is
  'Versión estructural vigente. Se incrementa al cambiar form_fields de forma que afecte al significado de una respuesta (añadir/quitar/requerir un campo); ver app.bump_form_version.';

alter table forms add constraint forms_id_unique unique (id, church_id);
create index forms_church_active_idx on forms (church_id, active);

create trigger forms_set_updated_at
  before update on forms
  for each row execute function app.set_updated_at();

create table form_fields (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  form_id uuid not null,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,63}$'),
  label text not null check (btrim(label) <> '' and char_length(label) <= 200),
  type form_field_type not null,
  required boolean not null default false,
  help_text text check (help_text is null or char_length(help_text) <= 500),
  options jsonb, -- para select/multi_select: array de {value, label}
  sort_order smallint not null default 0,
  classification form_field_classification not null default 'normal',
  validation jsonb not null default '{}'::jsonb, -- {min, max, minLength, maxLength, pattern} según el tipo
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (form_id, key),
  foreign key (form_id, church_id) references forms (id, church_id) on delete cascade,
  check (type not in ('select', 'multi_select') or (options is not null and jsonb_typeof(options) = 'array'))
);

comment on table form_fields is
  'Campos de un formulario, siempre en su versión VIGENTE (forms.current_version). Ver prompt Fase 6 §11-13.';
comment on column form_fields.classification is
  'sensitive/restricted exigen form.sensitive.manage para crear/editar el campo y para leer sus respuestas (§12).';

alter table form_fields add constraint form_fields_id_unique unique (id, church_id);
create index form_fields_church_form_idx on form_fields (church_id, form_id);

create trigger form_fields_set_updated_at
  before update on form_fields
  for each row execute function app.set_updated_at();

-- app.bump_form_version(): sube la versión vigente de un formulario. Se
-- invoca desde las RPC de gestión de campos que alteran el significado de
-- una respuesta (crear, archivar o cambiar `required`/`type`/`options` de un
-- campo). Cambios puramente cosméticos (label, help_text) no suben versión.
create or replace function app.bump_form_version(p_form_id uuid, p_church_id uuid)
returns integer
language sql
security definer
set search_path = pg_catalog, public
as $$
  update forms set current_version = current_version + 1
  where id = p_form_id and church_id = p_church_id
  returning current_version;
$$;

revoke all on function app.bump_form_version(uuid, uuid) from public, anon;
grant execute on function app.bump_form_version(uuid, uuid) to authenticated;

alter table forms enable row level security;
alter table forms force row level security;
alter table form_fields enable row level security;
alter table form_fields force row level security;
