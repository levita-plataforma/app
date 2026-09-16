-- Fase 0 · RBAC: capabilities, roles y asignación con scope.
-- Ver docs/adr/0005-rbac-capabilities-scopes.md.

-- Catálogo global de capabilities (acciones atómicas) -------------------------

create table capabilities (
  key text primary key,
  description text not null,
  module_key text references modules (key)
);

comment on table capabilities is
  'Catálogo global de acciones atómicas de autorización. Ver docs/adr/0005.';

insert into capabilities (key, description, module_key) values
  ('church.settings.manage', 'Gestionar configuración general de la iglesia', null),
  ('people.read', 'Ver personas', 'people'),
  ('people.manage', 'Crear, editar y archivar personas', 'people'),
  ('people.export', 'Exportar personas', 'people'),
  ('people.import', 'Importar personas', 'people'),
  ('modules.manage', 'Habilitar/deshabilitar módulos del tenant', null),
  ('roles.manage', 'Gestionar roles y capacidades de otras personas', null),
  ('audit.read', 'Leer el registro de auditoría', null),
  ('support.manage', 'Gestionar sesiones de soporte', null);

-- Catálogo global de roles como paquetes de capabilities -----------------------

create table roles (
  key text primary key,
  name text not null,
  description text,
  is_system boolean not null default true
);

comment on table roles is
  'Roles de referencia: paquetes nombrados de capabilities, no la fuente última de autorización. Ver docs/adr/0005.';

insert into roles (key, name) values
  ('church_owner', 'Propietario de la iglesia'),
  ('church_admin', 'Administrador de la iglesia'),
  ('campus_admin', 'Administrador de sede'),
  ('ministry_leader', 'Líder de área'),
  ('group_leader', 'Líder de grupo'),
  ('kids_coordinator', 'Coordinador de niños'),
  ('finance_manager', 'Responsable financiero'),
  ('pastoral_worker', 'Equipo pastoral'),
  ('member', 'Miembro');

create table role_capabilities (
  role_key text not null references roles (key) on delete cascade,
  capability_key text not null references capabilities (key) on delete cascade,
  primary key (role_key, capability_key)
);

-- Fase 0: church_owner y church_admin reciben las capabilities base del
-- núcleo. El resto de roles se completa cuando sus módulos se implementen.
insert into role_capabilities (role_key, capability_key)
select 'church_owner', key from capabilities
union all
select 'church_admin', key from capabilities where key != 'church.settings.manage';

-- Asignación de rol a persona, con scope -----------------------------------

create table church_people_roles (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches (id) on delete cascade,
  church_people_id uuid not null,
  role_key text not null references roles (key),
  -- Scope de la asignación. scope_type = 'church' cuando el rol aplica a
  -- toda la iglesia; en otro caso scope_id referencia la entidad del scope
  -- (campus, área de servicio, grupo, etc.) y se valida en aplicación según
  -- scope_type, no mediante FK genérica.
  scope_type text not null default 'church'
    check (scope_type in ('church', 'campus', 'module', 'service_area', 'group', 'activity', 'resource', 'pastoral_case')),
  scope_id uuid,
  granted_by uuid,
  created_at timestamptz not null default now(),
  unique (church_id, church_people_id, role_key, scope_type, scope_id),
  foreign key (church_people_id, church_id) references church_people (id, church_id) on delete cascade
);

comment on table church_people_roles is
  'Asignación de un rol a una persona dentro de un tenant, con scope explícito. La autorización real es la intersección de tenant + módulo + pertenencia + capability + scope. Ver docs/adr/0005.';

create index church_people_roles_church_id_idx on church_people_roles (church_id);
create index church_people_roles_church_people_id_idx on church_people_roles (church_people_id);

alter table capabilities enable row level security;
create policy capabilities_select_all on capabilities for select to authenticated using (true);

alter table roles enable row level security;
create policy roles_select_all on roles for select to authenticated using (true);

alter table role_capabilities enable row level security;
create policy role_capabilities_select_all on role_capabilities for select to authenticated using (true);

alter table church_people_roles enable row level security;
alter table church_people_roles force row level security;
