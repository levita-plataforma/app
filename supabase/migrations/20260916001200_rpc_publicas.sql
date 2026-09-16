-- Fase 0 · Wrappers RPC en `public` para exponer funciones de contexto
-- seleccionadas a través de la API. El esquema `app` no está expuesto
-- (ver docs/adr/0013); estas funciones son la única puerta de entrada
-- pública, deliberadamente mínima.

create or replace function public.has_capability(
  p_church_id uuid,
  p_capability text,
  p_scope_type text default 'church',
  p_scope_id uuid default null
)
returns boolean
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select app.has_capability(p_church_id, p_capability, p_scope_type, p_scope_id);
$$;

revoke all on function public.has_capability(uuid, text, text, uuid) from public, anon;
grant execute on function public.has_capability(uuid, text, text, uuid) to authenticated;

create or replace function public.module_enabled(p_church_id uuid, p_module_key text)
returns boolean
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select app.module_enabled(p_church_id, p_module_key);
$$;

revoke all on function public.module_enabled(uuid, text) from public, anon;
grant execute on function public.module_enabled(uuid, text) to authenticated;

create or replace function public.write_audit_log(
  p_church_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb,
  p_correlation_id uuid default null
)
returns uuid
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.write_audit_log(p_church_id, p_action, p_entity_type, p_entity_id, p_metadata, p_correlation_id);
$$;

revoke all on function public.write_audit_log(uuid, text, text, uuid, jsonb, uuid) from public, anon;
grant execute on function public.write_audit_log(uuid, text, text, uuid, jsonb, uuid) to authenticated;
