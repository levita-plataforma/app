-- Fase 14 · Capacidades de plataforma para el panel de operación de LEVITA.
--
-- Hasta ahora ser operador era binario: `platform_operators` tiene una fila por
-- cuenta y `app.is_platform_operator()` responde sí o no. Eso bastaba para la
-- única pantalla que existía (el alta asistida), pero el panel de esta fase
-- necesita distinguir quién puede mirar de quién puede dar de alta, tocar
-- responsables o encender módulos de una iglesia ajena.
--
-- Se añaden capacidades por operador sin romper lo que ya funciona:
-- `app.is_platform_operator()` se conserva con su significado —pertenecer al
-- equipo de operación— y las capacidades se consultan aparte.
--
-- Nada de esto se infiere del correo, del dominio ni del rol que alguien tenga
-- dentro de su iglesia. Ser administrador de una iglesia no da acceso al panel,
-- y el panel no da acceso a los datos de las iglesias.

-- 1. Catálogo de capacidades de plataforma -----------------------------------

create table platform_capabilities (
  key text primary key,
  description text not null,
  created_at timestamptz not null default now()
);

comment on table platform_capabilities is
  'Catálogo de capacidades del panel de operación de LEVITA. No se mezclan con las capacidades de iglesia (tabla capabilities): son dos sistemas de permisos distintos a propósito, porque responden a preguntas distintas.';

insert into platform_capabilities (key, description) values
  ('platform.churches.read', 'Ver el listado de iglesias y su ficha administrativa'),
  ('platform.churches.create', 'Dar de alta iglesias y reanudar altas incompletas'),
  ('platform.owners.manage', 'Gestionar responsables e invitaciones de una iglesia'),
  ('platform.modules.manage', 'Habilitar y deshabilitar módulos de una iglesia'),
  ('platform.operators.manage', 'Dar de alta y retirar operadores de plataforma');

-- 2. Qué capacidades tiene cada operador --------------------------------------

create table platform_operator_capabilities (
  user_id uuid not null references platform_operators (user_id) on delete cascade,
  capability_key text not null references platform_capabilities (key),
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, capability_key)
);

comment on table platform_operator_capabilities is
  'Capacidades concretas de cada operador. Quien no tenga ninguna fila aquí puede entrar al panel pero no hacer nada: la pertenencia al equipo y el permiso para actuar son cosas distintas.';
comment on column platform_operator_capabilities.granted_by is
  'Quién la concedió. Nunca puede ser la propia persona: ver app.grant_platform_capability.';

alter table platform_operator_capabilities enable row level security;
alter table platform_operator_capabilities force row level security;

revoke all on table platform_operator_capabilities from public, anon, authenticated;
grant select on table platform_operator_capabilities to authenticated;

-- Cada operador ve las suyas. Quien gestiona operadores las ve todas.
create policy platform_operator_capabilities_select on platform_operator_capabilities
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from platform_operator_capabilities c
      where c.user_id = auth.uid() and c.capability_key = 'platform.operators.manage'
    )
  );

create index platform_operator_capabilities_cap_idx
  on platform_operator_capabilities (capability_key);

-- 3. La comprobación -----------------------------------------------------------

create or replace function app.has_platform_capability(p_capability text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from platform_operator_capabilities c
    join platform_operators o on o.user_id = c.user_id
    where c.user_id = auth.uid()
      and c.capability_key = p_capability
  );
$$;

comment on function app.has_platform_capability(text) is
  'Si quien pregunta es operador de plataforma Y tiene esa capacidad concreta. El join con platform_operators no es redundante: retirar a alguien del equipo le quita el acceso aunque queden filas de capacidades sueltas.';

revoke all on function app.has_platform_capability(text) from public, anon;
grant execute on function app.has_platform_capability(text) to authenticated;

create or replace function app.assert_platform_capability(p_capability text)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not app.has_platform_capability(p_capability) then
    -- El mensaje no dice qué capacidad falta ni si quien pregunta es operador:
    -- a alguien que no debería estar aquí no se le explica el mapa.
    raise exception 'No tienes permiso para esta operación.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function app.assert_platform_capability(text) from public, anon, authenticated;

-- 4. Conceder y retirar capacidades --------------------------------------------
--
-- La regla que hace esto seguro: nadie se concede capacidades a sí mismo. Sin
-- ella, bastaría con ser operador de cualquier tipo para acabar siéndolo de
-- todos, y la separación de capacidades sería decorativa.

create or replace function app.grant_platform_capability(p_user_id uuid, p_capability text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform app.assert_platform_capability('platform.operators.manage');

  if p_user_id = auth.uid() then
    raise exception 'No puedes concederte capacidades a ti mismo.' using errcode = '42501';
  end if;

  if not exists (select 1 from platform_operators where user_id = p_user_id) then
    raise exception 'Esa cuenta no es operador de plataforma.' using errcode = 'P0002';
  end if;

  if not exists (select 1 from platform_capabilities where key = p_capability) then
    raise exception 'Esa capacidad no existe.' using errcode = '22023';
  end if;

  insert into platform_operator_capabilities (user_id, capability_key, granted_by)
  values (p_user_id, p_capability, auth.uid())
  on conflict (user_id, capability_key) do nothing;

  perform app.write_platform_audit('platform.capability_granted', null,
    jsonb_build_object('target_user', p_user_id, 'capability', p_capability));
end;
$$;

revoke all on function app.grant_platform_capability(uuid, text) from public, anon;
grant execute on function app.grant_platform_capability(uuid, text) to authenticated;

create or replace function app.revoke_platform_capability(p_user_id uuid, p_capability text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform app.assert_platform_capability('platform.operators.manage');

  -- Quitársela a uno mismo sí se permite: reducir el propio acceso nunca es una
  -- escalada. Lo que se impide es quedarse sin nadie que pueda gestionar
  -- operadores, que dejaría la plataforma sin salida.
  if p_capability = 'platform.operators.manage'
     and (select count(*) from platform_operator_capabilities
          where capability_key = 'platform.operators.manage') <= 1 then
    raise exception 'Es la última cuenta que puede gestionar operadores: concede la capacidad a otra persona antes de retirarla.'
      using errcode = '22023';
  end if;

  delete from platform_operator_capabilities
  where user_id = p_user_id and capability_key = p_capability;

  perform app.write_platform_audit('platform.capability_revoked', null,
    jsonb_build_object('target_user', p_user_id, 'capability', p_capability));
end;
$$;

revoke all on function app.revoke_platform_capability(uuid, text) from public, anon;
grant execute on function app.revoke_platform_capability(uuid, text) to authenticated;

-- 5. Auditoría de plataforma -----------------------------------------------------
--
-- La auditoría de iglesia (audit_logs) exige church_id, porque todo lo que
-- registra ocurre dentro de un tenant. Las acciones del panel no siempre tienen
-- iglesia —dar de alta a un operador, por ejemplo— y su actor no es una persona
-- de ninguna iglesia, sino una cuenta de operación. Por eso van a una tabla
-- propia en vez de forzar audit_logs a admitir filas sin tenant.

create table platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  church_id uuid references churches (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint platform_audit_logs_action_not_blank_check check (btrim(action) <> ''),
  constraint platform_audit_logs_metadata_object_check check (jsonb_typeof(metadata) = 'object')
);

comment on table platform_audit_logs is
  'Qué hizo el equipo de operación, sobre qué iglesia y cuándo. Nunca guarda secretos, tokens ni datos personales de miembros: solo lo administrativo necesario para saber quién hizo qué.';

alter table platform_audit_logs enable row level security;
alter table platform_audit_logs force row level security;

revoke all on table platform_audit_logs from public, anon, authenticated;
grant select on table platform_audit_logs to authenticated;

-- Lo ve quien puede leer iglesias; escribir solo pasa por la función.
create policy platform_audit_logs_select on platform_audit_logs
  for select to authenticated
  using ( app.has_platform_capability('platform.churches.read') );

create index platform_audit_logs_church_idx on platform_audit_logs (church_id, created_at desc);
create index platform_audit_logs_actor_idx on platform_audit_logs (actor_user_id, created_at desc);

create or replace function app.write_platform_audit(
  p_action text,
  p_church_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  insert into platform_audit_logs (actor_user_id, action, church_id, metadata)
  values (auth.uid(), p_action, p_church_id, coalesce(p_metadata, '{}'::jsonb));
$$;

comment on function app.write_platform_audit(text, uuid, jsonb) is
  'Registra una acción de operación. Se llama dentro de la misma transacción que la mutación: si esta se deshace, el registro se va con ella y no queda constancia de algo que no pasó.';

revoke all on function app.write_platform_audit(text, uuid, jsonb) from public, anon, authenticated;

-- 6. El primer operador ------------------------------------------------------------
--
-- No hay ninguna ruta que permita convertirse en operador desde la aplicación,
-- ni pública ni autenticada: sería la puerta de atrás más obvia del sistema.
--
-- El primer operador se crea por SQL, con acceso directo a la base, y queda
-- registrado. A partir de ahí, ese operador concede capacidades a los demás con
-- app.grant_platform_capability, que sí exige permiso y deja auditoría.
--
-- El procedimiento está escrito en docs/FASE-14-ADMINISTRACION-PLATAFORMA.md.
-- Esta función existe para que ese paso quede auditado igual que los demás, en
-- vez de hacerse con un insert suelto que no deja rastro.

create or replace function app.bootstrap_platform_operator(p_user_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Indica el motivo: esta operación queda registrada.' using errcode = '22023';
  end if;

  if exists (select 1 from platform_operator_capabilities
             where capability_key = 'platform.operators.manage') then
    raise exception 'Ya hay alguien que puede gestionar operadores: usa grant_platform_capability.'
      using errcode = '22023';
  end if;

  insert into platform_operators (user_id, granted_by)
  values (p_user_id, null)
  on conflict (user_id) do nothing;

  insert into platform_operator_capabilities (user_id, capability_key, granted_by)
  select p_user_id, key, null from platform_capabilities
  on conflict (user_id, capability_key) do nothing;

  insert into platform_audit_logs (actor_user_id, action, church_id, metadata)
  values (p_user_id, 'platform.bootstrap', null,
          jsonb_build_object('motivo', p_motivo, 'via', 'sql_directo'));
end;
$$;

comment on function app.bootstrap_platform_operator(uuid, text) is
  'Crea el primer operador con todas las capacidades. Solo se puede ejecutar cuando NO existe ninguna cuenta que pueda gestionar operadores, y exige un motivo que queda auditado. No está concedida a nadie: se ejecuta con acceso directo a la base.';

-- A nadie. Ni a authenticated, ni a service_role: quien la ejecute tiene que
-- entrar a la base a propósito, y eso es exactamente la barrera que se busca.
revoke all on function app.bootstrap_platform_operator(uuid, text) from public, anon, authenticated;
