-- Fase 1 · Wrappers RPC en `public` para las funciones de app.* de esta
-- fase, siguiendo el mismo patrón que 20260916001200_rpc_publicas.sql.

create or replace function public.slug_available(p_slug text)
returns boolean
language sql
security invoker
stable
set search_path = pg_catalog, public
as $$
  select app.slug_available(p_slug);
$$;

revoke all on function public.slug_available(text) from public, anon;
grant execute on function public.slug_available(text) to authenticated;

create or replace function public.slugify(p_input text)
returns text
language sql
security invoker
stable
set search_path = pg_catalog, public, extensions
as $$
  select app.slugify(p_input);
$$;

revoke all on function public.slugify(text) from public, anon;
grant execute on function public.slugify(text) to authenticated;

create or replace function public.provision_church(
  p_name text,
  p_slug text,
  p_locale text,
  p_timezone text,
  p_currency text,
  p_country text,
  p_owner_first_name text,
  p_owner_last_name text,
  p_owner_email text,
  p_owner_phone text default null,
  p_campus_name text default 'Sede principal',
  p_campus_address text default null,
  p_campus_city text default null,
  p_campus_province text default null,
  p_campus_postal_code text default null,
  p_module_keys text[] default array['people', 'serving', 'events', 'communications'],
  p_idempotency_key text default null
)
returns table (church_id uuid, campus_id uuid, person_id uuid, onboarding_id uuid)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.provision_church(
    p_name, p_slug, p_locale, p_timezone, p_currency, p_country,
    p_owner_first_name, p_owner_last_name, p_owner_email, p_owner_phone,
    p_campus_name, p_campus_address, p_campus_city, p_campus_province,
    p_campus_postal_code, p_module_keys, p_idempotency_key
  );
$$;

revoke all on function public.provision_church(
  text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text[], text
) from public, anon;
grant execute on function public.provision_church(
  text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text[], text
) to authenticated;
