-- Fase 6 · Inscripciones, asistentes, respuestas de formulario y
-- consentimientos. Ver prompt Fase 6 §14-24.

create type registration_status as enum ('pending', 'confirmed', 'waitlisted', 'cancelled', 'declined');

comment on type registration_status is
  'Estados propios de inscripción a evento, NO reutiliza los estados de Serving (activity_assignment_status). Ver prompt Fase 6 §15.';

create type registration_source as enum ('public', 'authenticated', 'admin');

create type attendee_type as enum ('adult', 'minor');

comment on type attendee_type is
  'Únicamente para calcular aforo/composición del grupo inscrito. No es Kids: no implica check-in/out de menores ni autorizaciones de recogida (fuera de alcance, ver prompt Fase 6 §56).';

create type attendance_status as enum ('registered', 'checked_in', 'attended', 'no_show', 'cancelled');

comment on type attendance_status is
  'Separado del estado de la registration (§29). checked_in_at es un hecho puntual; attended/no_show se fijan tras el evento y no se infieren solo de checked_in_at.';

-- form_submissions -------------------------------------------------------

create table form_submissions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  form_id uuid not null,
  form_version integer not null check (form_version >= 1),
  fields_snapshot jsonb not null,
  event_id uuid,
  registration_id uuid,
  submitted_by_user uuid,
  person_id uuid,
  status text not null default 'submitted' check (status in ('submitted', 'invalid')),
  submitted_at timestamptz not null default now(),
  foreign key (form_id, church_id) references forms (id, church_id),
  foreign key (event_id, church_id) references events (id, church_id) on delete set null,
  foreign key (person_id) references people (id) on delete set null
);

comment on table form_submissions is
  'Envío de un formulario, con snapshot estructural (fields_snapshot) para que una respuesta histórica se interprete igual aunque el formulario cambie después. Ver prompt Fase 6 §13-14.';
comment on column form_submissions.fields_snapshot is
  'Copia de los form_fields vigentes en el momento del envío (id, key, label, type, required, options, classification), para poder mostrar/exportar la respuesta aunque el formulario evolucione. La respuesta en sí vive en form_submission_answers.';
comment on column form_submissions.submitted_by_user is
  'auth.uid() de quien envió, si estaba autenticado. Null para envíos públicos sin cuenta.';

alter table form_submissions add constraint form_submissions_id_unique unique (id, church_id);
create index form_submissions_church_form_idx on form_submissions (church_id, form_id);
create index form_submissions_church_event_idx on form_submissions (church_id, event_id);

create table form_submission_answers (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  submission_id uuid not null,
  field_key text not null,
  field_type form_field_type not null,
  classification form_field_classification not null,
  value jsonb not null,
  unique (submission_id, field_key),
  foreign key (submission_id, church_id) references form_submissions (id, church_id) on delete cascade
);

comment on table form_submission_answers is
  'Respuesta individual de una submission. classification se copia del campo en el momento del envío (coherente con fields_snapshot) para poder aplicar RLS sin volver a form_fields, que pudo cambiar. Ver prompt Fase 6 §14.';

create index form_submission_answers_church_submission_idx on form_submission_answers (church_id, submission_id);

-- registrations ------------------------------------------------------------

create table registrations (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  event_id uuid not null,
  registration_code text not null,
  registration_type event_registration_type not null default 'individual',
  primary_person_id uuid,
  primary_name text not null check (btrim(primary_name) <> '' and char_length(primary_name) <= 200),
  primary_email text not null,
  primary_phone text,
  status registration_status not null default 'pending',
  attendees_count integer not null default 1 check (attendees_count >= 1),
  waitlist_position integer,
  source registration_source not null default 'public',
  form_submission_id uuid,
  idempotency_key text,
  cancel_token text,
  registered_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  created_by uuid,
  updated_at timestamptz not null default now(),
  unique (event_id, idempotency_key),
  unique (church_id, registration_code),
  foreign key (event_id, church_id) references events (id, church_id) on delete cascade,
  foreign key (primary_person_id) references people (id) on delete set null,
  foreign key (form_submission_id, church_id) references form_submissions (id, church_id) on delete set null,
  check ((status = 'cancelled') = (cancelled_at is not null)),
  check (status <> 'waitlisted' or waitlist_position is not null)
);

comment on table registrations is
  'Inscripción principal a un evento. No reutiliza los estados de Serving. Ver prompt Fase 6 §15.';
comment on column registrations.primary_name is
  'Snapshot del nombre en el momento de inscribirse: no cambia si la persona edita después su ficha.';
comment on column registrations.cancel_token is
  'Token opaco no predecible para cancelar sin cuenta (§26). Null si la inscripción fue creada autenticada y se cancela desde la sesión.';
comment on column registrations.idempotency_key is
  'Clave provista por el cliente (o generada) para que un doble clic/reintento de red no duplique la inscripción. Ver prompt Fase 6 §43.';

alter table registrations add constraint registrations_id_unique unique (id, church_id);
create index registrations_church_event_status_idx on registrations (church_id, event_id, status);
create index registrations_event_registered_idx on registrations (event_id, registered_at);
create index registrations_code_idx on registrations (church_id, registration_code);
create index registrations_email_idx on registrations (church_id, lower(primary_email));
create unique index registrations_waitlist_position_unique
  on registrations (event_id, waitlist_position) where status = 'waitlisted';

create trigger registrations_set_updated_at
  before update on registrations
  for each row execute function app.set_updated_at();

-- registration_attendees ---------------------------------------------------

create table registration_attendees (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  registration_id uuid not null,
  event_id uuid not null,
  person_id uuid,
  full_name text not null check (btrim(full_name) <> '' and char_length(full_name) <= 200),
  attendee_type attendee_type not null default 'adult',
  attendance_status attendance_status not null default 'registered',
  checked_in_at timestamptz,
  checked_in_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (registration_id, church_id) references registrations (id, church_id) on delete cascade,
  foreign key (event_id, church_id) references events (id, church_id) on delete cascade,
  foreign key (person_id) references people (id) on delete set null,
  check (
    (attendance_status in ('checked_in', 'attended')) = (checked_in_at is not null)
  )
);

comment on table registration_attendees is
  'Una o varias personas incluidas en una inscripción. attendee_type es solo para aforo/composición, nunca Kids. Ver prompt Fase 6 §16.';

alter table registration_attendees add constraint registration_attendees_id_unique unique (id, church_id);
create index registration_attendees_church_registration_idx on registration_attendees (church_id, registration_id);
create index registration_attendees_event_status_idx on registration_attendees (event_id, attendance_status);

create trigger registration_attendees_set_updated_at
  before update on registration_attendees
  for each row execute function app.set_updated_at();

-- consentimientos ------------------------------------------------------------

create table consent_definitions (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,63}$'),
  purpose_type text not null check (purpose_type in ('operational', 'marketing')),
  title text not null check (btrim(title) <> '' and char_length(title) <= 200),
  body text not null check (btrim(body) <> '' and char_length(body) <= 4000),
  version integer not null default 1 check (version >= 1),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (church_id, key)
);

comment on table consent_definitions is
  'Texto de consentimiento versionado. purpose_type distingue explícitamente consentimiento operativo necesario de marketing: nunca se mezclan (§21).';

alter table consent_definitions add constraint consent_definitions_id_unique unique (id, church_id);
create index consent_definitions_church_idx on consent_definitions (church_id);

create table consent_records (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  consent_definition_id uuid not null,
  consent_version integer not null,
  registration_id uuid,
  person_id uuid,
  given boolean not null default true,
  recorded_at timestamptz not null default now(),
  origin text not null check (origin in ('public_registration', 'authenticated_registration', 'admin')),
  foreign key (consent_definition_id, church_id) references consent_definitions (id, church_id),
  foreign key (registration_id, church_id) references registrations (id, church_id) on delete cascade,
  foreign key (person_id) references people (id) on delete set null
);

comment on table consent_records is
  'Registro trazable de qué se aceptó, versión, cuándo, para qué y desde dónde. Nunca un checkbox genérico sin trazabilidad. Ver prompt Fase 6 §21.';

alter table consent_records add constraint consent_records_id_unique unique (id, church_id);
create index consent_records_church_registration_idx on consent_records (church_id, registration_id);

alter table form_submissions enable row level security;
alter table form_submissions force row level security;
alter table form_submission_answers enable row level security;
alter table form_submission_answers force row level security;
alter table registrations enable row level security;
alter table registrations force row level security;
alter table registration_attendees enable row level security;
alter table registration_attendees force row level security;
alter table consent_definitions enable row level security;
alter table consent_definitions force row level security;
alter table consent_records enable row level security;
alter table consent_records force row level security;
