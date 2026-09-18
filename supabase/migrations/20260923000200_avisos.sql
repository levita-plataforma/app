-- Fase 5 (DI-02) · Avisos: outbox de eventos, bandeja por persona, entregas por
-- canal y preferencias.
-- Ver docs/FASE-5-AVISOS-DISPONIBILIDAD.md §4 y docs/CONTRATO-F4-F5.md §6.
--
-- Modelo:
-- * notification_events  -> outbox escrita en la MISMA transacción del dominio
--                           (triggers de 20260923000300). Un rollback no deja
--                           eventos. Deduplicada por idempotency_key.
-- * notifications        -> bandeja persistente: una fila por evento y persona.
-- * notification_deliveries -> una fila por aviso y canal, con su cola.
-- * notification_preferences -> por persona y canal; `inapp` no se desactiva.
--
-- Escritura solo por RPC / motor (service_role): ver 20260923000400 y 0500.
-- El payload es mínimo y nunca contiene motivos de cancelación, notas
-- administrativas ni la nota privada de respuesta de la persona.

-- Enums ----------------------------------------------------------------------

create type notification_channel as enum ('inapp', 'email', 'push');

comment on type notification_channel is
  'Canal de entrega de un aviso. inapp es la bandeja de la aplicación y siempre está activo; email y push quedan en cola mientras el transporte esté desactivado.';

create type notification_delivery_status as enum ('queued', 'sent', 'failed', 'suppressed');

comment on type notification_delivery_status is
  'queued: pendiente de salir. sent: entregada por el transporte. failed: el transporte falló. suppressed: no se intenta (preferencia o canal sin transporte).';

-- Outbox ---------------------------------------------------------------------
-- event_type es texto con check y no enum: el catálogo todavía crece (§6.1 del
-- contrato deja eventos sin punto de emisión) y ampliar un check es trivial
-- dentro de una transacción, mientras que `alter type ... add value` no permite
-- usar el valor nuevo en la misma transacción.

create table notification_events (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  event_type text not null check (event_type in (
    'assignment.proposed',
    'assignment.accepted',
    'assignment.declined',
    'assignment.cancelled',
    'assignment.substituted',
    'assignment.substitution_requested',
    'assignment.substitution_cancelled',
    'assignment.reminder',
    'assignment.coverage_at_risk',
    'activity.rescheduled'
  )),
  entity_type text not null,
  entity_id uuid not null,
  -- Versión de la entidad al producirse el hecho (activity_assignments.version).
  entity_version integer,
  -- <event_type>:<entity_id>:<entity_version>[:<discriminador>] (contrato §6.2).
  idempotency_key text not null unique,
  occurred_at timestamptz not null default now(),
  recipient_person_ids uuid[] not null default '{}',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  check (cardinality(recipient_person_ids) > 0)
);

comment on table notification_events is
  'Outbox de eventos de dominio de avisos (Fase 5, DI-02). Se escribe en la misma transacción que la mutación. Nunca la lee el cliente: solo el motor con service_role.';
comment on column notification_events.idempotency_key is
  'Clave de deduplicación <event_type>:<entity_id>:<entity_version>. Repetir la misma transición no duplica el evento (on conflict do nothing). Los avisos cuya repetición no depende de la versión de la entidad usan una clave estable con 0 en ese hueco: el recordatorio de un plazo se manda una sola vez aunque la actividad se reprograme.';
comment on column notification_events.recipient_person_ids is
  'Personas destinatarias, ya filtradas a pertenencia vigente de la iglesia.';
comment on column notification_events.payload is
  'Datos mínimos para redactar el aviso: identificadores, título de la actividad, nombre del puesto, inicio/fin y zona. Nunca motivos de cancelación, notas administrativas ni la nota privada de respuesta.';

alter table notification_events add constraint notification_events_id_unique unique (id, church_id);

-- Consumo por lotes: los pendientes más antiguos primero.
create index notification_events_unprocessed_idx
  on notification_events (occurred_at, id) where processed_at is null;
create index notification_events_church_idx on notification_events (church_id, occurred_at desc);
create index notification_events_entity_idx on notification_events (entity_type, entity_id);

-- Bandeja --------------------------------------------------------------------

create table notifications (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  event_id uuid not null,
  person_id uuid not null,
  event_type text not null,
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 1000),
  entity_type text not null,
  entity_id uuid not null,
  -- Enlace directo de la bandeja (nulo si el aviso no cuelga de una actividad).
  activity_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (event_id, person_id),
  foreign key (event_id, church_id) references notification_events (id, church_id) on delete cascade,
  foreign key (church_id, person_id) references church_people (church_id, person_id) on delete cascade,
  foreign key (person_id) references people (id) on delete cascade,
  foreign key (activity_id, church_id) references activities (id, church_id) on delete set null (activity_id)
);

comment on table notifications is
  'Bandeja de avisos de una persona dentro de una iglesia. Una fila por evento y destinatario. Solo la lee esa persona.';
comment on column notifications.activity_id is
  'Actividad a la que enlaza la bandeja. Se anula si la actividad se elimina; el aviso permanece.';

alter table notifications add constraint notifications_id_unique unique (id, church_id);

-- Bandeja por persona (orden natural) y contador de no leídos.
create index notifications_inbox_idx on notifications (church_id, person_id, created_at desc);
create index notifications_unread_idx on notifications (church_id, person_id) where read_at is null;
create index notifications_event_idx on notifications (event_id);

-- Entregas -------------------------------------------------------------------

create table notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  notification_id uuid not null,
  person_id uuid not null,
  channel notification_channel not null,
  status notification_delivery_status not null default 'queued',
  -- Momento a partir del cual puede salir (silencio 22:00-08:00, regla 5).
  scheduled_for timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  claimed_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, channel),
  foreign key (notification_id, church_id) references notifications (id, church_id) on delete cascade,
  foreign key (person_id) references people (id) on delete cascade,
  check ((status = 'sent') = (sent_at is not null))
);

comment on table notification_deliveries is
  'Cola de salida de un aviso por canal. Con el transporte desactivado, email y push se quedan en queued y no se contacta con ningún proveedor.';
comment on column notification_deliveries.scheduled_for is
  'No sale antes de este instante. El silencio de 22:00-08:00 (zona de la actividad) lo desplaza; el canal inapp nunca se retrasa.';

create index notification_deliveries_queue_idx
  on notification_deliveries (channel, scheduled_for, id) where status = 'queued';
create index notification_deliveries_church_idx on notification_deliveries (church_id, created_at desc);

create trigger notification_deliveries_set_updated_at
  before update on notification_deliveries
  for each row execute function app.set_updated_at();

-- Preferencias ---------------------------------------------------------------

create table notification_preferences (
  church_id uuid not null references churches (id) on delete cascade,
  person_id uuid not null,
  channel notification_channel not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (church_id, person_id, channel),
  foreign key (church_id, person_id) references church_people (church_id, person_id) on delete cascade,
  foreign key (person_id) references people (id) on delete cascade,
  -- La bandeja de la aplicación no se puede apagar: es el registro del aviso.
  check (channel <> 'inapp' or enabled)
);

comment on table notification_preferences is
  'Preferencia de canal de una persona en una iglesia. Sin fila, el canal se considera activo. inapp no se puede desactivar (lo impide el check).';

create index notification_preferences_person_idx on notification_preferences (person_id);

create trigger notification_preferences_set_updated_at
  before update on notification_preferences
  for each row execute function app.set_updated_at();

-- Índices del motor -----------------------------------------------------------
-- Los dos barridos periódicos (app.enqueue_due_reminders y
-- app.escalate_uncovered_positions, migración 0500) filtran por el estado y la
-- hora de la actividad y por los puestos críticos. Todos los índices anteriores
-- de esas dos tablas empiezan por church_id, así que el motor (que recorre
-- TODAS las iglesias) no podía usar ninguno. Estos son parciales: solo indexan
-- la porción viva, que es una fracción mínima de la tabla.

create index if not exists activities_pending_notifications_idx
  on activities (starts_at)
  where status in ('planned', 'published') and starts_at is not null;

comment on index activities_pending_notifications_idx is
  'Barrido de recordatorios y de escalado: actividades vivas ordenadas por hora de inicio, sin pasar por church_id.';

create index if not exists activity_positions_critical_idx
  on activity_positions (activity_id)
  where critical;

comment on index activity_positions_critical_idx is
  'Escalado de la regla 3: los puestos críticos son pocos y así se llega a ellos sin recorrer todos los puestos.';

alter table notification_events enable row level security;
alter table notification_events force row level security;
alter table notifications enable row level security;
alter table notifications force row level security;
alter table notification_deliveries enable row level security;
alter table notification_deliveries force row level security;
alter table notification_preferences enable row level security;
alter table notification_preferences force row level security;
