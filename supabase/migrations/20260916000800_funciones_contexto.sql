-- Fase 0 · Funciones de contexto de seguridad (security definer, stable).
-- Ver docs/adr/0013-estrategia-rls.md.
--
-- Todas fijan search_path, son stable (evaluación una vez por consulta) y
-- revocan execute a public/anon. Viven en el esquema `app`, no expuesto por
-- la API.

-- app.current_person_ids(): personas vinculadas a auth.uid() -----------------
-- Una cuenta puede estar vinculada a más de una persona en tenants distintos
-- (ver docs/adr/0002); esta función devuelve todas sus personas.
create or replace function app.current_person_ids()
returns setof uuid
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select id from people where user_id = auth.uid();
$$;

revoke all on function app.current_person_ids() from public, anon;
grant execute on function app.current_person_ids() to authenticated;

-- app.church_ids_for_user(): iglesias a las que pertenece el usuario ---------
-- Devuelve uuid[] (no setof) para poder usarse como `col = any((select
-- app.church_ids_for_user())::uuid[])` en políticas RLS, patrón fijo del
-- ADR 0013.
create or replace function app.church_ids_for_user()
returns uuid[]
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select coalesce(array_agg(distinct cp.church_id), '{}')
  from church_people cp
  where cp.person_id in (select app.current_person_ids())
    and cp.archived_at is null;
$$;

revoke all on function app.church_ids_for_user() from public, anon;
grant execute on function app.church_ids_for_user() to authenticated;

-- app.current_person_id(church): persona local del usuario en ese tenant -----
create or replace function app.current_person_id(p_church_id uuid)
returns uuid
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select cp.person_id
  from church_people cp
  where cp.church_id = p_church_id
    and cp.person_id in (select app.current_person_ids())
    and cp.archived_at is null
  limit 1;
$$;

revoke all on function app.current_person_id(uuid) from public, anon;
grant execute on function app.current_person_id(uuid) to authenticated;

-- app.has_capability(church, capability, scope_type, scope_id): autorización -
-- Comprueba si el usuario, dentro del tenant dado, tiene la capability
-- solicitada en el scope solicitado (o con un rol de scope 'church', que
-- autoriza cualquier scope más específico).
create or replace function app.has_capability(
  p_church_id uuid,
  p_capability text,
  p_scope_type text default 'church',
  p_scope_id uuid default null
)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from church_people_roles cpr
    join church_people cp
      on cp.id = cpr.church_people_id and cp.church_id = cpr.church_id
    join role_capabilities rc
      on rc.role_key = cpr.role_key
    where cpr.church_id = p_church_id
      and cp.person_id in (select app.current_person_ids())
      and cp.archived_at is null
      and rc.capability_key = p_capability
      and (
        cpr.scope_type = 'church'
        or (cpr.scope_type = p_scope_type and cpr.scope_id is not distinct from p_scope_id)
      )
  );
$$;

revoke all on function app.has_capability(uuid, text, text, uuid) from public, anon;
grant execute on function app.has_capability(uuid, text, text, uuid) to authenticated;

-- app.has_church_role(church, roles[]): comprobación simple por rol ----------
create or replace function app.has_church_role(p_church_id uuid, p_roles text[])
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from church_people_roles cpr
    join church_people cp
      on cp.id = cpr.church_people_id and cp.church_id = cpr.church_id
    where cpr.church_id = p_church_id
      and cp.person_id in (select app.current_person_ids())
      and cp.archived_at is null
      and cpr.role_key = any (p_roles)
  );
$$;

revoke all on function app.has_church_role(uuid, text[]) from public, anon;
grant execute on function app.has_church_role(uuid, text[]) to authenticated;

-- app.module_enabled(church, module_key): entitlement de módulo --------------
create or replace function app.module_enabled(p_church_id uuid, p_module_key text)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from church_modules
    where church_id = p_church_id
      and module_key = p_module_key
      and status in ('enabled', 'trial')
  );
$$;

revoke all on function app.module_enabled(uuid, text) from public, anon;
grant execute on function app.module_enabled(uuid, text) to authenticated;
