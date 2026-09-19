-- Fase 7 · Esquema de Grupos.
-- Ver docs/CONTRATO-FASE-7.md §4.1 y docs/modulos/02-grupos-discipulado.md.
--
-- Un grupo no es un área de servicio (docs/01-modelo-dominio.md §13): tiene
-- responsables, participantes, reuniones y asistencia, y no hereda el modelo
-- de puestos de Serving.
--
-- Las reuniones son actividades (ADR 0004 y 0018): group_meetings es una
-- extensión 1:0..1 de `activities` de tipo 'group_meeting', valor que ya
-- existe en el enum activity_type desde la Fase 0. Aquí no se duplica fecha,
-- hora, zona horaria, sede, estado, visibilidad ni recurrencia.
--
-- Claves tenant-safe según ADR 0014: toda hija duplica church_id y referencia
-- a su padre por (id, church_id).

-- group_types ----------------------------------------------------------------

create table group_types (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  sort_order smallint not null default 0,
  created_by uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references people (id) on delete set null,
  unique (church_id, key),
  constraint group_types_key_format_check check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint group_types_name_not_blank_check check (btrim(name) <> '')
);

comment on table group_types is
  'Catálogo de tipos de grupo por iglesia (célula, grupo de estudio, ministerio de vida...). Ver docs/CONTRATO-FASE-7.md §4.1.';

alter table group_types add constraint group_types_id_unique unique (id, church_id);
create index group_types_church_idx on group_types (church_id, sort_order, name);

-- groups ---------------------------------------------------------------------

create type group_visibility as enum ('listed', 'private');
create type group_status as enum ('active', 'paused', 'closed');
create type group_join_policy as enum ('open_request', 'invite_only');

comment on type group_visibility is
  'listed: aparece en el directorio interno de la iglesia (solo con sesión). private: solo responsables y participantes. No existe visibilidad pública en Fase 7 (decisión P-1).';

create table groups (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  campus_id uuid,
  group_type_id uuid,
  name text not null,
  description text,
  visibility group_visibility not null default 'listed',
  status group_status not null default 'active',
  join_policy group_join_policy not null default 'open_request',
  capacity integer,
  age_segment text,
  meeting_location_text text,
  meeting_schedule_text text,
  created_by uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references people (id) on delete set null,
  constraint groups_name_not_blank_check check (btrim(name) <> ''),
  constraint groups_capacity_check check (capacity is null or capacity > 0),
  foreign key (campus_id, church_id) references campuses (id, church_id) on delete set null,
  foreign key (group_type_id, church_id) references group_types (id, church_id) on delete set null
);

comment on table groups is
  'Grupo, célula o pequeño grupo de una iglesia. Ver docs/CONTRATO-FASE-7.md §4.1.';
comment on column groups.capacity is
  'Aforo en participantes. Los responsables NO ocupan plaza (decisión P-2).';
comment on column groups.meeting_location_text is
  'Lugar de reunión. En un grupo privado solo lo ven responsables y participantes aceptados (decisión P-5).';
comment on column groups.join_policy is
  'open_request: cualquiera del directorio interno puede solicitar plaza. invite_only: solo alta por responsable.';

alter table groups add constraint groups_id_unique unique (id, church_id);
create index groups_church_status_idx on groups (church_id, status) where archived_at is null;
create index groups_church_campus_idx on groups (church_id, campus_id);
create index groups_church_type_idx on groups (church_id, group_type_id);

-- group_leaders --------------------------------------------------------------
-- Vigencia con ends_at, igual que service_area_leaders (Fase 3). Retirar al
-- último responsable está permitido: el grupo queda marcado como «sin
-- responsable» en las consultas, no se bloquea la operación (decisión P-2).

create type group_leader_role as enum ('leader', 'coleader');

create table group_leaders (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  group_id uuid not null,
  person_id uuid not null,
  role group_leader_role not null default 'leader',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_leaders_period_check check (ends_at is null or ends_at >= starts_at),
  foreign key (group_id, church_id) references groups (id, church_id) on delete cascade,
  foreign key (person_id) references people (id) on delete cascade,
  foreign key (church_id, person_id) references church_people (church_id, person_id) on delete cascade
);

comment on table group_leaders is
  'Responsables de un grupo, con vigencia. Pertenecer aquí no es la fuente de autorización: la capacidad efectiva se resuelve en app.group_cap sobre church_people_roles con scope group.';

alter table group_leaders add constraint group_leaders_id_unique unique (id, church_id);
create unique index group_leaders_active_unique
  on group_leaders (group_id, person_id) where ends_at is null;
create index group_leaders_church_group_idx on group_leaders (church_id, group_id);
create index group_leaders_church_person_idx on group_leaders (church_id, person_id);

-- group_members --------------------------------------------------------------

create type group_member_status as enum ('active', 'left', 'removed');

create table group_members (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  group_id uuid not null,
  person_id uuid not null,
  status group_member_status not null default 'active',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  left_reason text,
  created_by uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, person_id),
  constraint group_members_left_at_check check (
    (status = 'active' and left_at is null) or (status <> 'active' and left_at is not null)
  ),
  foreign key (group_id, church_id) references groups (id, church_id) on delete cascade,
  foreign key (person_id) references people (id) on delete cascade,
  foreign key (church_id, person_id) references church_people (church_id, person_id) on delete cascade
);

comment on table group_members is
  'Participación de una persona en un grupo. Una sola fila por grupo y persona: volver a entrar reactiva la fila y conserva el historial (D12).
   No lleva notas sobre la persona: la política de lectura deja ver la fila a todos los participantes del grupo, así que cualquier anotación del responsable sería visible para el grupo entero. Si hicieran falta, tendrían que ir en una tabla aparte con su propia regla de lectura.';

alter table group_members add constraint group_members_id_unique unique (id, church_id);
create index group_members_church_group_idx on group_members (church_id, group_id, status);
create index group_members_church_person_idx on group_members (church_id, person_id, status);

-- group_join_requests --------------------------------------------------------

create type group_join_request_status as enum ('pending', 'accepted', 'rejected', 'cancelled');

create table group_join_requests (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  group_id uuid not null,
  person_id uuid not null,
  status group_join_request_status not null default 'pending',
  message text,
  decided_by uuid references people (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint group_join_requests_decision_check check (
    (status = 'pending' and decided_at is null) or (status <> 'pending')
  ),
  foreign key (group_id, church_id) references groups (id, church_id) on delete cascade,
  foreign key (person_id) references people (id) on delete cascade,
  foreign key (church_id, person_id) references church_people (church_id, person_id) on delete cascade
);

comment on table group_join_requests is
  'Solicitud de ingreso a un grupo. El ingreso siempre requiere aprobación manual (decisión P-7).';

alter table group_join_requests add constraint group_join_requests_id_unique unique (id, church_id);
create unique index group_join_requests_pending_unique
  on group_join_requests (group_id, person_id) where status = 'pending';
create index group_join_requests_church_group_idx
  on group_join_requests (church_id, group_id, status);
create index group_join_requests_church_person_idx
  on group_join_requests (church_id, person_id, status);

-- group_meetings -------------------------------------------------------------
-- Extensión 1:0..1 de activities, plantilla del ADR 0018 (la misma que usó
-- `events` en la Fase 6). La actividad es la única fuente de cuándo, dónde y
-- en qué estado está la reunión.

create table group_meetings (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  group_id uuid not null,
  activity_id uuid not null,
  attendance_recorded_at timestamptz,
  attendance_recorded_by uuid references people (id) on delete set null,
  cancelled_at timestamptz,
  cancelled_by uuid references people (id) on delete set null,
  cancellation_reason text,
  created_by uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_id),
  foreign key (group_id, church_id) references groups (id, church_id) on delete cascade,
  foreign key (activity_id, church_id) references activities (id, church_id) on delete cascade
);

comment on table group_meetings is
  'Reunión de un grupo: extensión de una activity de tipo group_meeting (ADR 0018). La actividad es la única fuente de cuándo, dónde, en qué zona horaria y con qué recurrencia; aquí no se duplica ninguna de esas columnas.';
comment on column group_meetings.cancelled_at is
  'Una reunión de grupo se convoca y, como mucho, se cancela: no recorre la máquina de estados de activities (borrador, planificada, publicada...). Ver ADR 0019. Cancelar aquí evita que quien lleva un grupo necesite permisos sobre el calendario general de la iglesia.';

alter table group_meetings add constraint group_meetings_id_unique unique (id, church_id);
create index group_meetings_church_group_idx on group_meetings (church_id, group_id);

-- Guard de tipo de actividad, copiando app.events_activity_type_guard
-- (20260924000100_events.sql:77-96).
create or replace function app.group_meetings_activity_type_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_type activity_type;
begin
  select type into v_type
  from activities
  where id = new.activity_id and church_id = new.church_id;

  if v_type is null then
    raise exception 'La actividad indicada no existe en esta iglesia.'
      using errcode = '22023';
  end if;

  if v_type is distinct from 'group_meeting' then
    raise exception 'Solo una activity de tipo group_meeting puede tener una fila group_meetings asociada.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger group_meetings_activity_type_guard
  before insert or update of activity_id on group_meetings
  for each row execute function app.group_meetings_activity_type_guard();

-- group_attendance -----------------------------------------------------------

create type group_attendance_status as enum ('present', 'absent', 'excused');

create table group_attendance (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  group_meeting_id uuid not null,
  person_id uuid not null,
  status group_attendance_status not null,
  is_guest boolean not null default false,
  notes text,
  recorded_by uuid references people (id) on delete set null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_meeting_id, person_id),
  foreign key (group_meeting_id, church_id) references group_meetings (id, church_id) on delete cascade,
  foreign key (person_id) references people (id) on delete cascade,
  foreign key (church_id, person_id) references church_people (church_id, person_id) on delete cascade
);

comment on table group_attendance is
  'Asistencia a una reunión de grupo. is_guest marca a quien asistió sin ser participante del grupo (invitado), que no cuenta para el aforo.';

alter table group_attendance add constraint group_attendance_id_unique unique (id, church_id);
create index group_attendance_church_meeting_idx on group_attendance (church_id, group_meeting_id);
create index group_attendance_church_person_idx on group_attendance (church_id, person_id);

-- updated_at -----------------------------------------------------------------

create trigger group_types_set_updated_at before update on group_types
  for each row execute function app.set_updated_at();
create trigger groups_set_updated_at before update on groups
  for each row execute function app.set_updated_at();
create trigger group_leaders_set_updated_at before update on group_leaders
  for each row execute function app.set_updated_at();
create trigger group_members_set_updated_at before update on group_members
  for each row execute function app.set_updated_at();
create trigger group_join_requests_set_updated_at before update on group_join_requests
  for each row execute function app.set_updated_at();
create trigger group_meetings_set_updated_at before update on group_meetings
  for each row execute function app.set_updated_at();
create trigger group_attendance_set_updated_at before update on group_attendance
  for each row execute function app.set_updated_at();
