-- Fase 4 · Ampliación compatible de `activities`, series recurrentes y notas
-- administrativas. Ver docs/adr/0004 y docs/adr/0017.
--
-- Principios:
-- * `activities` sigue siendo la raíz transversal; no se crea entidad paralela.
-- * Conversión conservadora: ningún dato existente gana visibilidad.
-- * Las reglas nuevas que podrían no cumplir filas heredadas se añaden como
--   NOT VALID: se aplican a toda inserción/modificación futura sin romper la
--   migración si existiera algún dato previo inconsistente.

-- ---------------------------------------------------------------------------
-- 1. Visibilidad: text ('public'|'internal') -> enum de audiencias
-- ---------------------------------------------------------------------------
-- Mapeo conservador (documentado en docs/adr/0017):
--   internal -> members  (hasta ahora cualquier miembro de la iglesia la leía)
--   public   -> members  (nunca hubo acceso anónimo; no se promociona a
--                         public_future para no exponerla cuando exista web
--                         pública en fases posteriores)
-- Además, el nuevo modelo de lectura oculta a los miembros las actividades en
-- draft/planned, así que el acceso efectivo a datos existentes solo se reduce.

-- Los rellenos de datos de esta migración no deben pisar updated_at.
alter table activities disable trigger activities_set_updated_at;

create type activity_visibility as enum ('private', 'leaders', 'members', 'public_future');

comment on type activity_visibility is
  'Audiencia de una actividad publicada. No sustituye permisos: quien gestiona la actividad la ve siempre. public_future no concede acceso anónimo en Fase 4.';

alter table activities drop constraint if exists activities_visibility_check;
alter table activities alter column visibility drop default;
alter table activities
  alter column visibility type activity_visibility
  using ('members')::activity_visibility;
alter table activities alter column visibility set default 'members';

-- ---------------------------------------------------------------------------
-- 2. Tipo de horario: con hora (timed) o sin hora fija (flexible)
-- ---------------------------------------------------------------------------
create type activity_schedule_kind as enum ('timed', 'flexible');

comment on type activity_schedule_kind is
  'timed: starts_at y ends_at obligatorios con ends_at > starts_at. flexible: tarea sin hora fija; starts_at/ends_at opcionales como ventana (p. ej. "antes del viernes"). Ver docs/adr/0017.';

alter table activities add column schedule_kind activity_schedule_kind;

update activities
set schedule_kind = case
  when starts_at is not null and ends_at is not null and ends_at > starts_at then 'timed'::activity_schedule_kind
  else 'flexible'::activity_schedule_kind
end;

alter table activities alter column schedule_kind set not null;
alter table activities alter column schedule_kind set default 'timed';

alter table activities add constraint activities_timed_range_check
  check (
    schedule_kind <> 'timed'
    or (starts_at is not null and ends_at is not null and ends_at > starts_at
        and ends_at - starts_at <= interval '62 days')
  ) not valid;

alter table activities add constraint activities_flexible_window_check
  check (
    schedule_kind <> 'flexible'
    or starts_at is null or ends_at is null or ends_at > starts_at
  ) not valid;

-- Solo las tareas pueden no tener hora fija: un culto, ensayo o turno sin
-- horario no es programable. Es una regla de validación, no de seguridad.
alter table activities add constraint activities_flexible_only_tasks_check
  check (schedule_kind <> 'flexible' or type = 'task') not valid;

alter table activities add constraint activities_title_check
  check (btrim(title) <> '' and char_length(title) <= 200) not valid;

-- ---------------------------------------------------------------------------
-- 3. Zona horaria: sin default impuesto
-- ---------------------------------------------------------------------------
-- El default 'Europe/Madrid' se retira: la zona se resuelve al insertar desde
-- la sede, y si no la tiene, desde la iglesia (trigger en la migración de
-- funciones). Las filas existentes conservan su valor.
alter table activities alter column timezone drop default;

comment on column activities.timezone is
  'Zona IANA de la actividad. Se resuelve desde campus.timezone y, si no existe, desde churches.timezone. starts_at/ends_at son instantes (UTC); la zona es contexto para mostrar y para recurrencias.';

-- ---------------------------------------------------------------------------
-- 4. Columnas nuevas de ciclo de vida, trazabilidad y organización
-- ---------------------------------------------------------------------------
alter table activities
  add column location_text text,
  add column template_id uuid,
  add column series_id uuid,
  add column occurrence_date date,
  add column series_modified boolean not null default false,
  add column series_structure_modified boolean not null default false,
  add column duplicated_from_activity_id uuid,
  add column creation_request_id uuid,
  add column published_at timestamptz,
  add column published_by uuid,
  add column completed_at timestamptz,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid,
  add column cancellation_reason text,
  add column status_before_archive activity_status;

alter table activities add constraint activities_location_text_check
  check (location_text is null or char_length(location_text) <= 200);
alter table activities add constraint activities_cancellation_reason_check
  check (cancellation_reason is null or char_length(cancellation_reason) <= 500);

comment on column activities.series_id is
  'Serie recurrente a la que pertenece la ocurrencia. Null para actividades puntuales.';
comment on column activities.occurrence_date is
  'Fecha local original de la ocurrencia dentro de la serie. Identidad estable: (series_id, occurrence_date) es única y hace idempotente la expansión.';
comment on column activities.series_modified is
  'Excepción: la ocurrencia se editó individualmente y las ediciones de "futuras" o "toda la serie" no la sobrescriben.';
comment on column activities.series_structure_modified is
  'Excepción de estructura: sus áreas, puestos, requisitos o plan se editaron individualmente; "aplicar estructura a la serie" no la sobrescribe.';
comment on column activities.status_before_archive is
  'Estado previo al archivado, para poder desarchivar sin perder el ciclo de vida.';
comment on column activities.cancellation_reason is
  'Motivo opcional visible para quien pueda ver la actividad. No incluir datos sensibles.';

-- Consistencia estado/archivado y estado/cancelación. Se normalizan los datos
-- existentes antes de crear las constraints (validadas).
update activities
set status = 'archived'
where archived_at is not null and status <> 'archived';

update activities
set archived_at = coalesce(archived_at, updated_at)
where status = 'archived' and archived_at is null;

update activities
set cancelled_at = coalesce(cancelled_at, updated_at)
where status = 'cancelled' and cancelled_at is null;

alter table activities enable trigger activities_set_updated_at;

alter table activities add constraint activities_archived_consistency_check
  check ((status = 'archived') = (archived_at is not null));

alter table activities add constraint activities_cancelled_consistency_check
  check (status <> 'cancelled' or cancelled_at is not null);

alter table activities add constraint activities_series_occurrence_check
  check ((series_id is null) = (occurrence_date is null));

-- Idempotencia de altas desde formularios con reintento.
create unique index activities_creation_request_unique
  on activities (church_id, creation_request_id)
  where creation_request_id is not null;

-- Organizador: debe pertenecer a la iglesia de la actividad. `people` es
-- global (sin church_id); la pertenencia vive en church_people, que ya tiene
-- unique (church_id, person_id). NOT VALID para no bloquear datos heredados.
alter table activities add constraint activities_organizer_membership_fkey
  foreign key (church_id, organizer_person_id)
  references church_people (church_id, person_id)
  on delete set null (organizer_person_id)
  not valid;

alter table activities add constraint activities_duplicated_from_fkey
  foreign key (duplicated_from_activity_id, church_id)
  references activities (id, church_id)
  on delete set null (duplicated_from_activity_id);

-- ---------------------------------------------------------------------------
-- 5. Series recurrentes
-- ---------------------------------------------------------------------------
create type activity_recurrence_frequency as enum ('weekly', 'monthly');
create type activity_monthly_mode as enum ('day_of_month', 'nth_weekday');

create table activity_series (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  type activity_type not null,
  title text not null check (btrim(title) <> '' and char_length(title) <= 200),
  frequency activity_recurrence_frequency not null,
  interval_count smallint not null default 1 check (interval_count between 1 and 52),
  -- weekly: días ISO (1 = lunes ... 7 = domingo)
  weekdays smallint[],
  -- monthly
  monthly_mode activity_monthly_mode,
  month_day smallint check (month_day between 1 and 31),
  week_of_month smallint check (week_of_month in (1, 2, 3, 4, 5, -1)),
  month_weekday smallint check (month_weekday between 1 and 7),
  month_day_fallback text not null default 'skip'
    check (month_day_fallback in ('skip', 'last_day')),
  starts_on date not null,
  local_start_time time not null,
  duration_minutes integer not null check (duration_minutes between 1 and 89280),
  timezone text not null,
  until_date date,
  occurrence_count smallint check (occurrence_count between 1 and 200),
  rrule text,
  split_from_series_id uuid,
  creation_request_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check ((until_date is null) <> (occurrence_count is null)),
  check (until_date is null or (until_date >= starts_on and until_date <= starts_on + 731)),
  check (
    (frequency = 'weekly'
      and weekdays is not null
      and cardinality(weekdays) between 1 and 7
      and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
      and interval_count <= 52)
    or (frequency = 'monthly'
      and interval_count <= 12
      and (
        (monthly_mode = 'day_of_month' and month_day is not null)
        or (monthly_mode = 'nth_weekday' and week_of_month is not null and month_weekday is not null)
      ))
  )
);

comment on table activity_series is
  'Regla de recurrencia acotada (semanal/cada N semanas/mensual, hasta fecha o nº de ocurrencias, máx. 200 y 2 años). Las ocurrencias son filas de activities vinculadas por series_id + occurrence_date. Ver docs/adr/0017.';
comment on column activity_series.local_start_time is
  'Hora local de inicio en `timezone`. Se conserva al cruzar DST: cada ocurrencia se convierte a instante con su propia fecha.';
comment on column activity_series.month_day_fallback is
  'Meses sin ese día (29-31) o sin 5.º día de la semana: skip = no hay ocurrencia ese mes; last_day = se usa el último día válido.';
comment on column activity_series.rrule is
  'Representación RFC 5545 informativa derivada de la regla. La fuente de verdad son las columnas estructuradas.';

alter table activity_series add constraint activity_series_id_unique unique (id, church_id);

alter table activity_series add constraint activity_series_split_from_fkey
  foreign key (split_from_series_id, church_id)
  references activity_series (id, church_id)
  on delete set null (split_from_series_id);

create unique index activity_series_creation_request_unique
  on activity_series (church_id, creation_request_id)
  where creation_request_id is not null;

create index activity_series_church_id_idx on activity_series (church_id);

create trigger activity_series_set_updated_at
  before update on activity_series
  for each row execute function app.set_updated_at();

alter table activities add constraint activities_series_fkey
  foreign key (series_id, church_id)
  references activity_series (id, church_id);

create unique index activities_series_occurrence_unique
  on activities (series_id, occurrence_date)
  where series_id is not null;

-- ---------------------------------------------------------------------------
-- 6. Notas administrativas (separadas del resumen visible)
-- ---------------------------------------------------------------------------
-- En una tabla aparte porque RLS es por fila: una columna en activities
-- quedaría visible para cualquier miembro que pueda leer la actividad.
create table activity_admin_notes (
  activity_id uuid primary key,
  church_id uuid not null references churches (id) on delete cascade,
  notes text not null check (char_length(notes) <= 4000),
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (activity_id, church_id) references activities (id, church_id) on delete cascade
);

comment on table activity_admin_notes is
  'Notas administrativas no sensibles de una actividad. Solo visibles para quien puede gestionarla o tiene activity.read en su ámbito; nunca con el resumen para miembros.';

create index activity_admin_notes_church_id_idx on activity_admin_notes (church_id);

create trigger activity_admin_notes_set_updated_at
  before update on activity_admin_notes
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- 7. Índices de consulta (calendario por rango, estado, sede, tipo)
-- ---------------------------------------------------------------------------
-- activities_church_type_starts_idx (church_id, type, starts_at) ya existe.
-- activities_church_id_idx queda cubierto por el prefijo de los compuestos.
drop index if exists activities_church_id_idx;
drop index if exists activities_campus_id_idx;

create index activities_church_starts_idx on activities (church_id, starts_at);
create index activities_church_status_idx on activities (church_id, status);
create index activities_church_campus_starts_idx on activities (church_id, campus_id, starts_at);

alter table activity_series enable row level security;
alter table activity_series force row level security;
alter table activity_admin_notes enable row level security;
alter table activity_admin_notes force row level security;
