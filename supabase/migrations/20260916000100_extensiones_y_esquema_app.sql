-- Fase 0 · Fundación
-- Extensiones necesarias y esquema `app` para funciones de contexto de seguridad.
-- Ver docs/adr/0013-estrategia-rls.md.

create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- Esquema `app`: contiene las funciones de contexto security definer.
-- No está en `schemas` expuestos de supabase/config.toml, así que no es
-- alcanzable directamente por la API REST/GraphQL. `authenticated` tiene
-- `usage`/`execute` porque las políticas RLS se evalúan con ese rol.
create schema if not exists app;

revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

comment on schema app is
  'Funciones de contexto de seguridad (security definer). No expuesto por la API. Ver docs/adr/0013-estrategia-rls.md.';

-- Trigger genérico para mantener updated_at en cualquier tabla del núcleo,
-- evitando depender de la extensión moddatetime.
create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
