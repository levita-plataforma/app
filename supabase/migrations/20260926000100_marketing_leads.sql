-- Sitio público comercial · captación de leads (demo/contacto).
--
-- marketing_leads no es tenant-aware: son solicitudes externas de iglesias
-- interesadas, no personas del directorio multi-tenant. No lleva church_id
-- ni se relaciona con `people`. Toda escritura pasa por
-- app.submit_marketing_lead (security definer), nunca INSERT directo desde
-- anon/authenticated: no hay política de INSERT en la tabla a propósito.
-- Solo service_role puede leer (equipo de LEVITA), por lo que tampoco hay
-- política de SELECT.

create table public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('demo', 'contacto')),
  name text not null check (btrim(name) <> ''),
  email text not null,
  organization text,
  community_size text,
  message text check (message is null or char_length(message) <= 2000),
  created_at timestamptz not null default now()
);

comment on table public.marketing_leads is
  'Solicitudes de demo/contacto del sitio público. No tenant-aware: son leads externos, no personas del directorio. Ver app.submit_marketing_lead.';

create index marketing_leads_created_at_idx on public.marketing_leads (created_at desc);
create index marketing_leads_email_idx on public.marketing_leads (lower(email));

alter table public.marketing_leads enable row level security;
alter table public.marketing_leads force row level security;

-- Toda tabla nueva en `public` recibe por defecto INSERT/UPDATE/DELETE/
-- SELECT para `anon` y `authenticated` (confirmado y corregido ya una vez
-- para la Fase 6 en 20260925000500_hotfix_privilegios_fase6.sql): RLS sin
-- políticas de escritura ya bloquea el INSERT directo, pero revocar aquí
-- deja dos capas en vez de depender solo de RLS.
revoke insert, update, delete, truncate, select on public.marketing_leads from anon, authenticated;

-- app.submit_marketing_lead: única puerta de escritura. Valida campos,
-- aplica un límite simple de repetición por email (no hace falta locking de
-- fila ni cálculo de aforo: es un lead comercial, no un recurso concurrente
-- compartido como el aforo de un evento).
create or replace function app.submit_marketing_lead(
  p_kind text,
  p_name text,
  p_email text,
  p_organization text,
  p_community_size text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_email text;
  v_recent integer;
  v_id uuid;
begin
  if p_kind not in ('demo', 'contacto') then
    raise exception 'Tipo de solicitud no válido.' using errcode = '22023';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'El nombre es obligatorio.' using errcode = '22023';
  end if;

  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'El correo no es válido.' using errcode = '22023';
  end if;

  if p_message is not null and char_length(p_message) > 2000 then
    raise exception 'El mensaje es demasiado largo.' using errcode = '22023';
  end if;

  v_email := lower(btrim(p_email));

  select count(*) into v_recent
  from marketing_leads
  where lower(email) = v_email and created_at > now() - interval '1 hour';

  if v_recent >= 5 then
    raise exception 'Se han recibido demasiadas solicitudes recientes con este correo.'
      using errcode = '53400';
  end if;

  insert into marketing_leads (kind, name, email, organization, community_size, message)
  values (
    p_kind,
    btrim(p_name),
    v_email,
    nullif(btrim(p_organization), ''),
    nullif(btrim(p_community_size), ''),
    nullif(btrim(p_message), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function app.submit_marketing_lead(text, text, text, text, text, text) from public, anon;
grant execute on function app.submit_marketing_lead(text, text, text, text, text, text) to anon, authenticated;

create or replace function public.submit_marketing_lead(
  p_kind text,
  p_name text,
  p_email text,
  p_organization text,
  p_community_size text,
  p_message text
)
returns uuid
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.submit_marketing_lead(p_kind, p_name, p_email, p_organization, p_community_size, p_message);
$$;

revoke all on function public.submit_marketing_lead(text, text, text, text, text, text) from public;
grant execute on function public.submit_marketing_lead(text, text, text, text, text, text) to anon, authenticated;
