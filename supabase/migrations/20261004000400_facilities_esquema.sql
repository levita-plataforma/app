-- Fase 10 · Esquema de Recursos, instalaciones y mantenimiento.
-- Ver docs/CONTRATO-FASE-10.md §5, §8, §10 y §17.
--
-- Tres entidades de dominio distintas (P-1), nunca fusionadas:
--   resources             el activo: sala, equipo, vehículo u otro.
--   resource_reservations un uso temporal de ese activo.
--   resource_maintenance  una intervención sobre él, con histórico propio.
--
-- Y una cuarta tabla que NO es de dominio: resource_occupancy. Registra toda
-- ocupación real de un recurso —venga de una reserva confirmada o de un
-- mantenimiento que bloquea— y lleva ella sola la restricción que impide el
-- solape. Es infraestructura interna: no tiene RPC propia ni la escribe nadie
-- desde fuera, solo las funciones de esta fase (§10 y riesgo 2 del contrato).
--
-- Por qué una tabla aparte y no una exclusion constraint sobre cada tabla:
-- dos constraints separadas no pueden verse entre sí, así que una reserva y un
-- mantenimiento podrían cruzarse sobre el mismo recurso sin que ninguna de las
-- dos lo notara. Con una sola tabla de ocupación, ese cruce es el mismo
-- conflicto que cualquier otro.
--
-- Claves tenant-safe según ADR 0014: toda hija duplica church_id y referencia a
-- su padre por (id, church_id).

create extension if not exists btree_gist schema extensions;

-- resources ------------------------------------------------------------------

create type resource_type as enum ('room', 'equipment', 'vehicle', 'other');
create type resource_status as enum ('active', 'unavailable', 'maintenance', 'archived');

comment on type resource_type is
  'Tipo de recurso. Enum cerrado a propósito (decisión P-2): «other» cubre lo que no encaje. Los tipos configurables por iglesia quedan fuera de la Fase 10.';
comment on type resource_status is
  'Estado general del recurso, no su ocupación. Una sala reservada de 10 a 12 sigue «active» a las 9 y a las 13 (decisión P-4). «maintenance» es informativo y no se deriva solo de una fila de resource_maintenance.';

create table resources (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  campus_id uuid,
  type resource_type not null,
  name text not null,
  description text,
  status resource_status not null default 'active',
  capacity integer,
  location_details text,
  responsible_person_id uuid,
  reservable boolean not null default true,
  requires_approval boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references people (id) on delete set null,
  constraint resources_name_not_blank_check check (btrim(name) <> ''),
  constraint resources_capacity_check check (capacity is null or capacity > 0),
  constraint resources_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  -- Mismo criterio de consistencia que activities (ADR 0017): el estado
  -- archivado y la marca de archivado dicen lo mismo o no dicen nada.
  constraint resources_archived_consistency_check check (
    (status = 'archived' and archived_at is not null)
    or (status <> 'archived' and archived_at is null)
  ),
  foreign key (campus_id, church_id) references campuses (id, church_id) on delete set null,
  foreign key (responsible_person_id) references people (id) on delete set null,
  foreign key (church_id, responsible_person_id) references church_people (church_id, person_id) on delete set null
);

comment on table resources is
  'Catálogo de recursos reservables de una iglesia: salas, equipos, vehículos. Ver docs/CONTRATO-FASE-10.md §5.';
comment on column resources.campus_id is
  'Opcional (decisión P-3): una sala suele tener sede, un proyector portátil o un vehículo puede no tenerla.';
comment on column resources.capacity is
  'Aforo en personas. Solo tiene sentido en salas, y no es la cantidad de unidades reservables: cada unidad física es un recurso propio (decisión P-10).';
comment on column resources.reservable is
  'Un recurso puede existir en el catálogo sin aceptar reservas.';
comment on column resources.requires_approval is
  'Si es cierto, las reservas nacen pendientes y alguien con facilities.approve_reservations las confirma o rechaza (decisión P-14).';
comment on column resources.metadata is
  'Atributos variables por tipo (matrícula, modelo). Nunca datos que haya que validar, buscar o clasificar como personales: eso son columnas (§5.2 del contrato).';

alter table resources add constraint resources_id_unique unique (id, church_id);
create index resources_church_status_idx on resources (church_id, status) where archived_at is null;
create index resources_church_type_idx on resources (church_id, type);
create index resources_church_campus_idx on resources (church_id, campus_id);
create index resources_responsible_idx on resources (church_id, responsible_person_id);

-- resource_reservations --------------------------------------------------------

create type reservation_status as enum ('pending', 'confirmed', 'cancelled', 'rejected');

comment on type reservation_status is
  'pending y rejected solo aparecen en recursos con requires_approval (decisión P-6). Solo «confirmed» ocupa el recurso: una pendiente no bloquea a nadie, el conflicto se decide al confirmar (decisión P-14).';

create table resource_reservations (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  resource_id uuid not null,
  activity_id uuid,
  requested_by uuid not null,
  responsible_person_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status reservation_status not null default 'confirmed',
  purpose text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references people (id) on delete set null,
  cancelled_reason text,
  rejected_at timestamptz,
  rejected_by uuid references people (id) on delete set null,
  constraint resource_reservations_range_check check (ends_at > starts_at),
  constraint resource_reservations_purpose_not_blank_check check (btrim(purpose) <> ''),
  constraint resource_reservations_cancelled_consistency_check check (
    (status = 'cancelled') = (cancelled_at is not null)
  ),
  constraint resource_reservations_rejected_consistency_check check (
    (status = 'rejected') = (rejected_at is not null)
  ),
  foreign key (resource_id, church_id) references resources (id, church_id) on delete restrict,
  foreign key (activity_id, church_id) references activities (id, church_id) on delete cascade,
  foreign key (requested_by) references people (id) on delete restrict,
  foreign key (church_id, requested_by) references church_people (church_id, person_id) on delete restrict,
  foreign key (responsible_person_id) references people (id) on delete set null,
  foreign key (church_id, responsible_person_id) references church_people (church_id, person_id) on delete set null
);

comment on table resource_reservations is
  'Uso temporal de un recurso, con o sin actividad detrás. Ver docs/CONTRATO-FASE-10.md §8.';
comment on column resource_reservations.activity_id is
  'Opcional (decisión P-5): hay usos reales sin actividad —prestar un proyector, mover la furgoneta— y forzarlos a inventar un culto sería peor.';
comment on column resource_reservations.requested_by is
  'Quién pidió la reserva. Se resuelve del contexto autenticado, nunca llega como dato del cliente.';
comment on column resource_reservations.responsible_person_id is
  'Quién responde del recurso durante el uso. Si es nulo, responde quien la pidió.';
comment on column resource_reservations.notes is
  'Notas operativas. Nunca datos pastorales, médicos ni financieros.';
comment on column resource_reservations.cancelled_reason is
  'Por qué se canceló. Lo rellena también la cancelación automática al cancelarse la actividad (decisión P-16).';

alter table resource_reservations add constraint resource_reservations_id_unique unique (id, church_id);
create index resource_reservations_resource_idx on resource_reservations (church_id, resource_id, starts_at);
create index resource_reservations_activity_idx on resource_reservations (church_id, activity_id) where activity_id is not null;
create index resource_reservations_status_idx on resource_reservations (church_id, status, starts_at);
create index resource_reservations_person_idx on resource_reservations (church_id, requested_by, starts_at);

-- resource_maintenance ---------------------------------------------------------

create type maintenance_status as enum ('scheduled', 'in_progress', 'completed', 'cancelled');

comment on type maintenance_status is
  'Estado de una intervención. Solo «scheduled» e «in_progress» ocupan el recurso, y solo si blocks_availability es cierto (decisión P-11).';

create table resource_maintenance (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  resource_id uuid not null,
  type text not null,
  title text not null,
  description text,
  status maintenance_status not null default 'scheduled',
  blocks_availability boolean not null default true,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  responsible_person_id uuid,
  performed_at timestamptz,
  performed_by uuid references people (id) on delete set null,
  result_notes text,
  cost_note text,
  created_by uuid references people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references people (id) on delete set null,
  constraint resource_maintenance_range_check check (ends_at > starts_at),
  constraint resource_maintenance_type_not_blank_check check (btrim(type) <> ''),
  constraint resource_maintenance_title_not_blank_check check (btrim(title) <> ''),
  constraint resource_maintenance_completed_consistency_check check (
    (status = 'completed') = (performed_at is not null)
  ),
  constraint resource_maintenance_cancelled_consistency_check check (
    (status = 'cancelled') = (cancelled_at is not null)
  ),
  foreign key (resource_id, church_id) references resources (id, church_id) on delete restrict,
  foreign key (responsible_person_id) references people (id) on delete set null,
  foreign key (church_id, responsible_person_id) references church_people (church_id, person_id) on delete set null
);

comment on table resource_maintenance is
  'Intervención sobre un recurso: revisión, reparación, limpieza profunda. Ver docs/CONTRATO-FASE-10.md §17.';
comment on column resource_maintenance.type is
  'Clasificación libre (decisión P-21). Ninguna regla depende del valor, así que un enum cerrado sería precisión sin uso.';
comment on column resource_maintenance.blocks_availability is
  'Si es cierto, la ventana ocupa el recurso y nadie puede reservarlo mientras tanto. Si es falso, es solo una anotación en la agenda.';
comment on column resource_maintenance.cost_note is
  'Anotación libre del coste. No es contabilidad: la Fase 10 no lleva activos ni amortizaciones.';

alter table resource_maintenance add constraint resource_maintenance_id_unique unique (id, church_id);
create index resource_maintenance_resource_idx on resource_maintenance (church_id, resource_id, starts_at);
create index resource_maintenance_status_idx on resource_maintenance (church_id, status, starts_at);
create index resource_maintenance_responsible_idx on resource_maintenance (church_id, responsible_person_id);

-- resource_occupancy -----------------------------------------------------------
--
-- La pieza que impide de verdad la doble reserva. Una fila por cada ocupación
-- real, venga de donde venga, y una restricción de exclusión que rechaza dos
-- filas del mismo recurso con rangos que se tocan.
--
-- El rango es semiabierto: de 10 a 12 y de 12 a 14 no se solapan (decisión
-- P-8), igual que ya hace app.activity_time_range.
--
-- Comprobado contra PostgreSQL antes de escribir esto: dos transacciones
-- abiertas a la vez sobre la misma franja no pasan las dos. La segunda se queda
-- esperando a que la primera termine y entonces recibe 23P01. Un select previo
-- seguido de insert no da esa garantía, y es justo lo que el encargo pide.

create type occupancy_source as enum ('reservation', 'maintenance');

create table resource_occupancy (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  resource_id uuid not null,
  source occupancy_source not null,
  reservation_id uuid,
  maintenance_id uuid,
  during tstzrange not null,
  created_at timestamptz not null default now(),
  -- Cada fila viene de una cosa y solo una: o de una reserva, o de un
  -- mantenimiento. Sin esto, una fila huérfana ocuparía el recurso para
  -- siempre sin que nadie supiera por qué.
  constraint resource_occupancy_source_check check (
    (source = 'reservation' and reservation_id is not null and maintenance_id is null)
    or (source = 'maintenance' and maintenance_id is not null and reservation_id is null)
  ),
  constraint resource_occupancy_range_check check (not isempty(during) and lower(during) is not null and upper(during) is not null),
  foreign key (resource_id, church_id) references resources (id, church_id) on delete cascade,
  foreign key (reservation_id, church_id) references resource_reservations (id, church_id) on delete cascade,
  foreign key (maintenance_id, church_id) references resource_maintenance (id, church_id) on delete cascade,
  -- Una reserva o un mantenimiento ocupan como mucho una vez.
  constraint resource_occupancy_reservation_unique unique (reservation_id),
  constraint resource_occupancy_maintenance_unique unique (maintenance_id),
  constraint resource_occupancy_no_overlap exclude using gist (
    resource_id with =,
    during with &&
  )
);

comment on table resource_occupancy is
  'Ocupación real de un recurso, sea por reserva confirmada o por mantenimiento que bloquea. Tabla técnica: no es una entidad de producto, no tiene RPC propia y solo la escriben las funciones de esta fase. Es lo que impide la doble reserva. Ver docs/CONTRATO-FASE-10.md §10.';
comment on column resource_occupancy.during is
  'Rango semiabierto [inicio, fin): dos usos consecutivos que se tocan en el minuto exacto no son un conflicto.';
comment on constraint resource_occupancy_no_overlap on resource_occupancy is
  'La garantía de la fase. Rechaza con 23P01 cualquier intento de ocupar un recurso ya ocupado, incluso desde transacciones simultáneas.';

create index resource_occupancy_resource_idx on resource_occupancy (church_id, resource_id);
create index resource_occupancy_during_idx on resource_occupancy using gist (during);

-- updated_at -------------------------------------------------------------------

create trigger resources_set_updated_at
  before update on resources
  for each row execute function app.set_updated_at();

create trigger resource_reservations_set_updated_at
  before update on resource_reservations
  for each row execute function app.set_updated_at();

create trigger resource_maintenance_set_updated_at
  before update on resource_maintenance
  for each row execute function app.set_updated_at();
