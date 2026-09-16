create extension if not exists unaccent;

-- Fase 1 · Provisioning transaccional de una iglesia nueva.
-- Ver encargo de Fase 1 §4, §6 y docs/16-arquitectura-multitenant.md §8.
--
-- Resuelve el problema de "huevo y gallina": el usuario que crea la iglesia
-- todavía no tiene church_people, así que no puede insertar iglesia/campus/
-- roles a través de las políticas RLS ordinarias. app.provision_church()
-- es security definer, valida explícitamente lo que haría RLS, y hace toda
-- la operación en una única transacción: si algo falla, no queda iglesia
-- sin owner, owner sin membership, ni campus huérfano.

create table reserved_slugs (
  slug text primary key
);

insert into reserved_slugs (slug) values
  ('app'), ('admin'), ('api'), ('login'), ('registro'), ('soporte'),
  ('help'), ('settings'), ('configuracion'), ('levita'), ('www'),
  ('acceso'), ('auth'), ('static'), ('public'), ('_next');

comment on table reserved_slugs is
  'Slugs de iglesia prohibidos por colisionar con rutas de la aplicación. Ver encargo de Fase 1 §6.';

alter table reserved_slugs enable row level security;
create policy reserved_slugs_select_all on reserved_slugs
  for select to authenticated using (true);

-- app.slugify(text): normaliza un nombre a slug URL-safe. --------------------
-- stable (no immutable): unaccent() depende de configuración de diccionario
-- de texto, que Postgres no garantiza como immutable.
create or replace function app.slugify(p_input text)
returns text
language sql
stable
set search_path = pg_catalog, public, extensions
as $$
  select trim(both '-' from
    regexp_replace(
      lower(unaccent(p_input)),
      '[^a-z0-9]+', '-', 'g'
    )
  );
$$;

-- app.slug_available(slug): true si el slug no está reservado ni en uso. -----
create or replace function app.slug_available(p_slug text)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select
    p_slug ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
    and not exists (select 1 from reserved_slugs where slug = p_slug)
    and not exists (select 1 from churches where slug = p_slug);
$$;

revoke all on function app.slug_available(text) from public, anon;
grant execute on function app.slug_available(text) to authenticated;

-- app.provision_church(...): alta transaccional completa. --------------------
-- p_person_id: si ya existe una persona vinculada al usuario actual se
-- reutiliza (evita duplicados, ver docs/adr/0002); si es null se crea una
-- nueva persona con los datos de perfil recibidos.
create or replace function app.provision_church(
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
returns table (out_church_id uuid, out_campus_id uuid, out_person_id uuid, out_onboarding_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_church_id uuid;
  v_campus_id uuid;
  v_person_id uuid;
  v_church_people_id uuid;
  v_onboarding_id uuid;
  v_subscription_id uuid;
  v_module_key text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED: se requiere una sesión autenticada para crear una iglesia';
  end if;

  -- Idempotencia: comprobar ANTES de validar el slug, porque un reintento
  -- legítimo con la misma idempotency_key reenvía el mismo slug, que ya
  -- está en uso por la iglesia creada en el primer intento.
  if p_idempotency_key is not null then
    select c.id, cp.person_id
      into v_church_id, v_person_id
    from churches c
    join church_people cp on cp.church_id = c.id
    where c.settings->>'provisioning_idempotency_key' = p_idempotency_key
    limit 1;

    if v_church_id is not null then
      select id into v_campus_id from campuses where church_id = v_church_id and is_primary limit 1;
      select id into v_onboarding_id from church_onboarding where church_id = v_church_id;
      return query select v_church_id, v_campus_id, v_person_id, v_onboarding_id;
      return;
    end if;
  end if;

  if not (select app.slug_available(p_slug)) then
    raise exception 'SLUG_UNAVAILABLE: el identificador "%" no está disponible', p_slug;
  end if;

  -- Reutilizar persona existente vinculada a esta cuenta si ya existe
  -- (evita duplicar people, ver docs/adr/0002).
  select id into v_person_id from people where user_id = v_user_id limit 1;

  if v_person_id is null then
    insert into people (user_id, first_name, last_name, email, phone)
    values (v_user_id, p_owner_first_name, p_owner_last_name, p_owner_email, p_owner_phone)
    returning id into v_person_id;
  end if;

  insert into churches (name, slug, status, locale, timezone, currency, settings)
  values (
    p_name, p_slug, 'trial', p_locale, p_timezone, p_currency,
    case when p_idempotency_key is not null
      then jsonb_build_object('provisioning_idempotency_key', p_idempotency_key, 'country', p_country)
      else jsonb_build_object('country', p_country)
    end
  )
  returning id into v_church_id;

  insert into campuses (church_id, name, slug, address, is_primary, status)
  values (
    v_church_id, p_campus_name, 'principal',
    nullif(trim(both ', ' from concat_ws(', ', p_campus_address, p_campus_city, p_campus_province, p_campus_postal_code)), ''),
    true, 'active'
  )
  returning id into v_campus_id;

  insert into church_people (church_id, person_id, relationship, primary_campus_id, directory_visible)
  values (v_church_id, v_person_id, 'leader', v_campus_id, true)
  returning id into v_church_people_id;

  insert into church_people_roles (church_id, church_people_id, role_key, scope_type)
  values (v_church_id, v_church_people_id, 'church_owner', 'church');

  foreach v_module_key in array p_module_keys loop
    insert into church_modules (church_id, module_key, status, enabled_at)
    values (v_church_id, v_module_key, 'enabled', now())
    on conflict (church_id, module_key) do nothing;
  end loop;

  insert into subscriptions (church_id, plan_key, status, trial_ends_at)
  values (v_church_id, 'trial', 'trial', now() + interval '30 days')
  returning id into v_subscription_id;

  update churches set subscription_id = v_subscription_id where id = v_church_id;

  insert into church_onboarding (church_id, current_step, completed_steps)
  values (v_church_id, 'campus', array['account', 'church']::church_onboarding_step[])
  returning id into v_onboarding_id;

  perform app.write_audit_log(
    v_church_id, 'church.created', 'churches', v_church_id,
    jsonb_build_object('name', p_name, 'slug', p_slug)
  );
  perform app.write_audit_log(
    v_church_id, 'campus.created', 'campuses', v_campus_id,
    jsonb_build_object('name', p_campus_name, 'is_primary', true)
  );
  perform app.write_audit_log(
    v_church_id, 'owner.assigned', 'church_people', v_church_people_id,
    jsonb_build_object('person_id', v_person_id)
  );
  perform app.write_audit_log(
    v_church_id, 'subscription.initialized', 'subscriptions', v_subscription_id,
    jsonb_build_object('plan_key', 'trial', 'status', 'trial')
  );

  return query select v_church_id, v_campus_id, v_person_id, v_onboarding_id;
end;
$$;

revoke all on function app.provision_church(
  text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text[], text
) from public, anon;
grant execute on function app.provision_church(
  text, text, text, text, text, text, text, text, text, text,
  text, text, text, text, text, text[], text
) to authenticated;
