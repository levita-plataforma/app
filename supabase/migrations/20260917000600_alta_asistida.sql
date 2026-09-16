-- Fase 1 · Alta asistida por operación LEVITA e invitaciones.
-- Ver encargo de Fase 1 §16-17.
--
-- La operación de plataforma no usa capabilities de iglesia (no pertenece a
-- ninguna church_people): usa una capability de plataforma dedicada,
-- comprobada contra una tabla explícita de operadores, nunca contra
-- service_role directamente desde el cliente.

create table platform_operators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_by uuid,
  created_at timestamptz not null default now()
);

comment on table platform_operators is
  'Cuentas con capacidad de operación de plataforma LEVITA (altas asistidas, soporte). Nunca se usa service_role directamente desde el cliente para estas operaciones. Ver docs/adr/0012.';

alter table platform_operators enable row level security;
alter table platform_operators force row level security;

create policy platform_operators_select_self on platform_operators
  for select to authenticated
  using ( user_id = auth.uid() );

-- app.is_platform_operator(): comprobación de capability de plataforma. -----
create or replace function app.is_platform_operator()
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select exists (select 1 from platform_operators where user_id = auth.uid());
$$;

revoke all on function app.is_platform_operator() from public, anon;
grant execute on function app.is_platform_operator() to authenticated;

-- app.assisted_provision_church(...): crea iglesia sin owner con cuenta aún.
-- Genera una invitación (token de un solo uso) en vez de crear la persona
-- directamente, porque el propietario todavía no se ha autenticado. El
-- token en claro se devuelve una única vez; solo su hash se persiste.
create or replace function app.assisted_provision_church(
  p_name text,
  p_slug text,
  p_locale text,
  p_timezone text,
  p_currency text,
  p_country text,
  p_owner_email text,
  p_module_keys text[] default array['people', 'serving', 'events', 'communications']
)
returns table (out_church_id uuid, out_invitation_id uuid, out_invitation_token text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_church_id uuid;
  v_campus_id uuid;
  v_onboarding_id uuid;
  v_subscription_id uuid;
  v_invitation_id uuid;
  v_token text;
  v_module_key text;
begin
  if not (select app.is_platform_operator()) then
    raise exception 'FORBIDDEN: se requiere capacidad de operación de plataforma';
  end if;

  if not (select app.slug_available(p_slug)) then
    raise exception 'SLUG_UNAVAILABLE: el identificador "%" no está disponible', p_slug;
  end if;

  insert into churches (name, slug, status, locale, timezone, currency, settings)
  values (p_name, p_slug, 'provisioning', p_locale, p_timezone, p_currency, jsonb_build_object('country', p_country))
  returning id into v_church_id;

  insert into campuses (church_id, name, slug, is_primary, status)
  values (v_church_id, 'Sede principal', 'principal', true, 'active')
  returning id into v_campus_id;

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
  values (v_church_id, 'church', array['account']::church_onboarding_step[])
  returning id into v_onboarding_id;

  -- Token de invitación: 32 bytes aleatorios en hex. Se devuelve una única
  -- vez en el resultado de esta función; solo el hash se persiste.
  v_token := encode(gen_random_bytes(32), 'hex');

  insert into invitations (church_id, email, role_key, token_hash, invited_by, expires_at)
  values (v_church_id, lower(p_owner_email), 'church_owner', encode(digest(v_token, 'sha256'), 'hex'), auth.uid(), now() + interval '7 days')
  returning id into v_invitation_id;

  perform app.write_audit_log(
    v_church_id, 'church.created', 'churches', v_church_id,
    jsonb_build_object('name', p_name, 'slug', p_slug, 'assisted', true)
  );
  perform app.write_audit_log(
    v_church_id, 'campus.created', 'campuses', v_campus_id,
    jsonb_build_object('name', 'Sede principal', 'is_primary', true)
  );
  perform app.write_audit_log(
    v_church_id, 'subscription.initialized', 'subscriptions', v_subscription_id,
    jsonb_build_object('plan_key', 'trial', 'status', 'trial')
  );
  perform app.write_audit_log(
    v_church_id, 'invitation.created', 'invitations', v_invitation_id,
    jsonb_build_object('role_key', 'church_owner')
  );

  return query select v_church_id, v_invitation_id, v_token;
end;
$$;

revoke all on function app.assisted_provision_church(text, text, text, text, text, text, text, text[]) from public, anon;
grant execute on function app.assisted_provision_church(text, text, text, text, text, text, text, text[]) to authenticated;

-- app.accept_invitation(token): vincula al usuario autenticado actual con
-- la invitación pendiente, crea/reutiliza su persona y completa el
-- provisioning del owner que la alta asistida dejó pendiente.
create or replace function app.accept_invitation(
  p_token text,
  p_first_name text,
  p_last_name text,
  p_phone text default null
)
returns table (out_church_id uuid, out_person_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_invitation invitations%rowtype;
  v_person_id uuid;
  v_church_people_id uuid;
  v_campus_id uuid;
  v_token_hash text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED: se requiere una sesión autenticada para aceptar la invitación';
  end if;

  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  select * into v_invitation from invitations where token_hash = v_token_hash;

  if v_invitation.id is null then
    raise exception 'INVITATION_NOT_FOUND: token de invitación no válido';
  end if;

  if v_invitation.status = 'revoked' then
    raise exception 'INVITATION_REVOKED: esta invitación ha sido revocada';
  end if;

  if v_invitation.status = 'accepted' then
    raise exception 'INVITATION_ALREADY_ACCEPTED: esta invitación ya fue utilizada';
  end if;

  if v_invitation.expires_at < now() then
    update invitations set status = 'expired' where id = v_invitation.id;
    raise exception 'INVITATION_EXPIRED: esta invitación ha caducado';
  end if;

  select id into v_person_id from people where user_id = v_user_id limit 1;

  if v_person_id is null then
    insert into people (user_id, first_name, last_name, email, phone)
    values (v_user_id, p_first_name, p_last_name, v_invitation.email, p_phone)
    returning id into v_person_id;
  end if;

  select id into v_campus_id from campuses where church_id = v_invitation.church_id and is_primary limit 1;

  insert into church_people (church_id, person_id, relationship, primary_campus_id, directory_visible)
  values (v_invitation.church_id, v_person_id, 'leader', v_campus_id, true)
  on conflict (church_id, person_id) do nothing
  returning id into v_church_people_id;

  if v_church_people_id is null then
    select id into v_church_people_id from church_people
      where church_id = v_invitation.church_id and person_id = v_person_id;
  end if;

  insert into church_people_roles (church_id, church_people_id, role_key, scope_type)
  values (v_invitation.church_id, v_church_people_id, v_invitation.role_key, 'church')
  on conflict do nothing;

  update churches set status = 'trial' where id = v_invitation.church_id and status = 'provisioning';

  update invitations
    set status = 'accepted', accepted_at = now(), accepted_by_person_id = v_person_id
    where id = v_invitation.id;

  perform app.write_audit_log(
    v_invitation.church_id, 'owner.assigned', 'church_people', v_church_people_id,
    jsonb_build_object('person_id', v_person_id, 'via_invitation', true)
  );

  return query select v_invitation.church_id, v_person_id;
end;
$$;

revoke all on function app.accept_invitation(text, text, text, text) from public, anon;
grant execute on function app.accept_invitation(text, text, text, text) to authenticated;

create or replace function public.assisted_provision_church(
  p_name text, p_slug text, p_locale text, p_timezone text, p_currency text,
  p_country text, p_owner_email text,
  p_module_keys text[] default array['people', 'serving', 'events', 'communications']
)
returns table (church_id uuid, invitation_id uuid, invitation_token text)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.assisted_provision_church(
    p_name, p_slug, p_locale, p_timezone, p_currency, p_country, p_owner_email, p_module_keys
  );
$$;

revoke all on function public.assisted_provision_church(text, text, text, text, text, text, text, text[]) from public, anon;
grant execute on function public.assisted_provision_church(text, text, text, text, text, text, text, text[]) to authenticated;

create or replace function public.accept_invitation(p_token text, p_first_name text, p_last_name text, p_phone text default null)
returns table (church_id uuid, person_id uuid)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.accept_invitation(p_token, p_first_name, p_last_name, p_phone);
$$;

revoke all on function public.accept_invitation(text, text, text, text) from public, anon;
grant execute on function public.accept_invitation(text, text, text, text) to authenticated;
