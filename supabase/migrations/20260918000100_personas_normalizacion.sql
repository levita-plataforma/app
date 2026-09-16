-- Fase 2 · Normalización de identidad y búsqueda de personas.
-- Ver encargo de Fase 2 §2, §4, §8, §29.

create extension if not exists pg_trgm;

-- app.normalize_email(text): minúsculas y trim. La detección de duplicados
-- fuertes (encargo §21) usa este valor, no el email en crudo.
create or replace function app.normalize_email(p_email text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select nullif(lower(trim(p_email)), '');
$$;

-- app.normalize_phone(text): formato internacional simplificado. Conserva
-- '+' inicial si existe y elimina cualquier carácter que no sea dígito.
-- No asume España como único país (encargo §8); no valida longitud por
-- país porque el conjunto de países no está cerrado.
create or replace function app.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select nullif(
    case when p_phone ~ '^\+' then '+' else '' end
    || regexp_replace(p_phone, '[^0-9]', '', 'g'),
    ''
  );
$$;

alter table people add column email_normalized text
  generated always as (app.normalize_email(email)) stored;
alter table people add column phone_normalized text
  generated always as (app.normalize_phone(phone)) stored;

comment on column people.email_normalized is
  'Email normalizado (minúsculas, sin espacios) usado para detección de duplicados fuertes. Ver encargo de Fase 2 §21.';
comment on column people.phone_normalized is
  'Teléfono normalizado (solo dígitos, + inicial si existía) usado para detección de duplicados fuertes.';

-- Sustituye el índice simple de Fase 0 (ver 20260916000300) por uno sobre
-- la columna normalizada, más útil para duplicados exactos.
drop index if exists people_email_idx;
create index people_email_normalized_idx on people (email_normalized) where email_normalized is not null;
create index people_phone_normalized_idx on people (phone_normalized) where phone_normalized is not null;

-- Búsqueda por nombre con trigramas: parcial, insensible a mayúsculas y
-- razonablemente tolerante a acentos al usar similitud en vez de LIKE.
create index people_search_name_trgm_idx on people
  using gin ((coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(preferred_name, '')) gin_trgm_ops);

-- Procedencia de la persona (encargo §24). No es un dato sensible; sirve
-- para trazabilidad y para decidir el trato de duplicados en importación.
create type person_source as enum ('manual', 'import', 'registration', 'invitation', 'integration');

alter table people add column source person_source not null default 'manual';
alter table church_people add column source person_source not null default 'manual';

comment on column people.source is
  'Origen de creación de la persona: manual, import, registration (auto-provisioning), invitation, integration. Ver encargo de Fase 2 §24.';

-- Índices de rendimiento pedidos en el encargo (§29) que todavía no
-- existían sobre church_people.
create index church_people_church_status_idx on church_people (church_id, relationship) where archived_at is null;
create index church_people_campus_idx on church_people (primary_campus_id) where primary_campus_id is not null;
create index church_people_archived_idx on church_people (church_id) where archived_at is not null;

-- household_members: unique(id, church_id) por consistencia con el patrón
-- tenant-safe del resto del esquema (Fase 0 lo omitió en esta tabla).
alter table household_members add constraint household_members_id_unique unique (id, church_id);
