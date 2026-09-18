-- Fase 6 · Events: extensión 1:1 de `activities` con comportamiento de evento
-- (publicación, inscripción, aforo, waitlist). Ver prompt Fase 6 §1-4 y ADR
-- 0018 (docs/adr/0018-events-extiende-activities.md).
--
-- `activities` sigue siendo la única fuente de fecha/hora/timezone/campus/
-- recurrencia/estado temporal. `events` añade solo lo específico de evento.
-- No se crea ningún calendario ni motor de recurrencia paralelo.

create type event_registration_type as enum ('individual', 'household', 'group');

create type event_registration_status as enum ('disabled', 'scheduled', 'open', 'full', 'closed');

comment on type event_registration_status is
  'Estado de la INSCRIPCIÓN, separado del estado temporal de la activity. Se calcula (no se deriva solo del recuento): disabled = sin inscripción; scheduled = aún no abre; open = admite inscripciones; full = aforo cubierto; closed = cerrada manualmente o por fecha. Ver app.event_registration_status().';

create table events (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  activity_id uuid not null,
  public_slug text not null,
  visibility text not null default 'internal'
    check (visibility in ('internal', 'members', 'public')),
  registration_enabled boolean not null default false,
  registration_status_override text
    check (registration_status_override is null or registration_status_override in ('open', 'closed')),
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  capacity integer check (capacity is null or capacity > 0),
  waitlist_enabled boolean not null default false,
  max_waitlist integer check (max_waitlist is null or max_waitlist > 0),
  registration_type event_registration_type not null default 'individual',
  cover_file_id uuid,
  cover_image_url text,
  short_description text check (short_description is null or char_length(short_description) <= 240),
  public_description text check (public_description is null or char_length(public_description) <= 4000),
  contact_email text,
  contact_phone text,
  confirmation_message text check (confirmation_message is null or char_length(confirmation_message) <= 1000),
  cancellation_policy text check (cancellation_policy is null or char_length(cancellation_policy) <= 2000),
  form_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid,
  unique (activity_id),
  unique (church_id, public_slug),
  foreign key (activity_id, church_id) references activities (id, church_id) on delete cascade,
  check (registration_opens_at is null or registration_closes_at is null or registration_closes_at > registration_opens_at),
  check (not (registration_enabled and registration_type = 'household') or true) -- household validado en RPC (requiere Households de People)
);

comment on table events is
  'Extensión 1:1 tenant-aware de una activity con comportamiento de evento público/con inscripción. Ver prompt Fase 6 §2 y ADR 0018.';
comment on column events.public_slug is
  'Slug único por iglesia (no global): la URL pública incluye el slug de la iglesia, ver §10. URL-safe, editable con control, protegido de palabras reservadas en la capa de aplicación.';
comment on column events.visibility is
  'internal: solo miembros con capability. members: cualquier miembro autenticado de la iglesia. public: página pública accesible sin autenticación cuando el evento está publicado y no archivado/cancelado (ver §3).';
comment on column events.registration_status_override is
  'Cierre/apertura manual del administrador, que prevalece sobre las fechas automáticas salvo por aforo. Null = sin override, se calcula por fechas y aforo.';
comment on column events.cover_file_id is
  'Referencia opcional a `files` (clasificación public) para la portada. Ver prompt Fase 6 §45.';
comment on column events.cover_image_url is
  'Alternativa a cover_file_id mientras no exista upload de storage real: URL externa validada en la capa de aplicación (https, longitud). Decisión documentada en ADR 0018 §5.';

alter table events add constraint events_id_unique unique (id, church_id);
create index events_church_activity_idx on events (church_id, activity_id);
create index events_church_slug_idx on events (church_id, public_slug);
create index events_registration_status_idx on events (church_id, registration_enabled);

create trigger events_set_updated_at
  before update on events
  for each row execute function app.set_updated_at();

-- Solo activities de tipo 'event' pueden tener fila en events. Se valida con
-- trigger (no check directo: requiere consultar otra tabla).
create or replace function app.events_activity_type_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_type activity_type;
begin
  select type into v_type from activities where id = new.activity_id and church_id = new.church_id;
  if v_type is distinct from 'event' then
    raise exception 'Solo una activity de tipo event puede tener una fila events asociada.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger events_activity_type_guard
  before insert or update of activity_id on events
  for each row execute function app.events_activity_type_guard();

alter table events enable row level security;
alter table events force row level security;
