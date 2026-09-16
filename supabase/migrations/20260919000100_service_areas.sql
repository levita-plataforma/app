-- Fase 3 · Áreas de servicio, líderes y miembros.
-- Ver prompt de Fase 3 §2, §3, §5, §6, §7.

create table service_areas (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  icon text,
  accent_color text,
  active boolean not null default true,
  sort_order smallint not null default 0,
  campus_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid,
  unique (church_id, slug),
  foreign key (campus_id, church_id) references campuses (id, church_id)
);

comment on table service_areas is
  'Área de servicio operativa de la iglesia (Sonido, Multimedia, Niños...). No confundir con un rol global. Ver prompt Fase 3 §2.';
comment on column service_areas.campus_id is
  'Scope de sede opcional: null significa que el área aplica a toda la iglesia.';

alter table service_areas add constraint service_areas_id_unique unique (id, church_id);
create index service_areas_church_id_active_idx on service_areas (church_id, active);
create index service_areas_church_id_campus_idx on service_areas (church_id, campus_id);

create trigger service_areas_set_updated_at
  before update on service_areas
  for each row execute function app.set_updated_at();

-- Plantillas del sistema (no tenant-aware): catálogo de referencia que la
-- iglesia puede usar como punto de partida al crear sus propias áreas. No
-- son obligatorias ni se instancian automáticamente (ver prompt Fase 3 §3).
create table service_area_templates (
  key text primary key,
  name text not null,
  description text,
  icon text,
  sort_order smallint not null default 0
);

comment on table service_area_templates is
  'Catálogo global de plantillas de áreas de servicio sugeridas. Referencia, no obligatoria. Ver prompt Fase 3 §3.';

insert into service_area_templates (key, name, description, icon, sort_order) values
  ('sonido', 'Sonido', 'Mesa de sonido, monitores y refuerzo en directo.', 'audio', 1),
  ('multimedia', 'Multimedia', 'Proyección, cámara y realización.', 'video', 2),
  ('bienvenida', 'Bienvenida', 'Recepción, puerta e información.', 'door', 3),
  ('ninos', 'Niños', 'Atención y cuidado de niños durante el culto.', 'child', 4),
  ('direccion_culto', 'Dirección del culto', 'Coordinación general del desarrollo del culto.', 'baton', 5),
  ('alabanza', 'Alabanza', 'Equipo musical y de adoración.', 'music', 6),
  ('intercesion', 'Intercesión', 'Oración previa y durante el culto.', 'pray', 7),
  ('hospitalidad', 'Hospitalidad', 'Atención, cafetería y cuidado de visitantes.', 'coffee', 8),
  ('limpieza', 'Limpieza', 'Mantenimiento y limpieza de instalaciones.', 'broom', 9),
  ('traduccion', 'Traducción', 'Interpretación y traducción en directo.', 'globe', 10),
  ('seguridad', 'Seguridad y emergencias', 'Seguridad, primeros auxilios y evacuación.', 'shield', 11),
  ('parking', 'Parking y logística', 'Aparcamiento y logística de accesos.', 'car', 12),
  ('conexion', 'Conexión y seguimiento de nuevos', 'Acompañamiento de nuevos asistentes.', 'link', 13),
  ('eventos', 'Eventos / protocolo / producción', 'Producción y protocolo de eventos especiales.', 'calendar', 14);

alter table service_area_templates enable row level security;
create policy service_area_templates_select_all on service_area_templates
  for select to authenticated using (true);

-- service_area_leaders -----------------------------------------------------

create table service_area_leaders (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  service_area_id uuid not null,
  person_id uuid not null,
  is_primary boolean not null default false,
  campus_id uuid,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (service_area_id, church_id) references service_areas (id, church_id) on delete cascade,
  foreign key (person_id) references people (id) on delete cascade,
  foreign key (campus_id, church_id) references campuses (id, church_id)
);

comment on table service_area_leaders is
  'Liderazgo explícito de un área de servicio, no un rol global de iglesia. Ver prompt Fase 3 §5.';

create index service_area_leaders_church_area_idx on service_area_leaders (church_id, service_area_id);
create index service_area_leaders_church_person_idx on service_area_leaders (church_id, person_id);
create unique index service_area_leaders_active_unique
  on service_area_leaders (service_area_id, person_id) where ends_at is null;

-- service_area_members ------------------------------------------------------

create type service_area_member_status as enum ('active', 'training', 'inactive', 'suspended');
create type service_operational_level as enum ('trainee', 'assisted', 'autonomous', 'leader');

create table service_area_members (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  service_area_id uuid not null,
  person_id uuid not null,
  status service_area_member_status not null default 'active',
  level service_operational_level not null default 'trainee',
  notes text,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_area_id, person_id),
  foreign key (service_area_id, church_id) references service_areas (id, church_id) on delete cascade,
  foreign key (person_id) references people (id) on delete cascade
);

comment on table service_area_members is
  'Pertenencia de una persona a un área de servicio, con nivel operativo específico del área. Ver prompt Fase 3 §6-7.';
comment on column service_area_members.level is
  'Nivel operativo específico de esta área: una persona puede ser autonomous en Sonido y trainee en Multimedia.';
comment on column service_area_members.notes is
  'Notas administrativas no sensibles. Nunca datos pastorales o de menores (ver docs/15-nucleo-plataforma.md §3).';

alter table service_area_members add constraint service_area_members_id_unique unique (id, church_id);
create index service_area_members_church_area_idx on service_area_members (church_id, service_area_id);
create index service_area_members_church_person_idx on service_area_members (church_id, person_id);

create trigger service_area_members_set_updated_at
  before update on service_area_members
  for each row execute function app.set_updated_at();

alter table service_areas enable row level security;
alter table service_areas force row level security;
alter table service_area_leaders enable row level security;
alter table service_area_leaders force row level security;
alter table service_area_members enable row level security;
alter table service_area_members force row level security;
