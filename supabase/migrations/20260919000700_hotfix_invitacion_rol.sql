-- Hotfix · Escalada de privilegios mediante invitación de personas.
--
-- Fallo: app.invite_existing_person (Fase 2) solo exigía people.manage y
-- aceptaba cualquier p_role_key, incluido church_owner; al aceptar,
-- app.accept_person_invitation concedía ese rol con scope 'church'. Quien
-- solo podía gestionar personas podía crear (o hacerse con) una cuenta con
-- cualquier rol de la iglesia.
--
-- Corrección en dos capas:
-- 1. Al invitar: 'member' con people.manage; cualquier otro rol exige además
--    roles.manage; church_owner exige además que quien invita sea propietario.
-- 2. Al aceptar: se vuelve a comprobar que quien invitó sigue autorizado para
--    ese rol. Si no (o si la invitación es anterior a este arreglo y no
--    cumple la regla), se concede 'member' y se audita la degradación. No
--    hace falta migrar datos: las invitaciones pendientes quedan cubiertas.
--
-- Mismas firmas que las funciones de Fase 2 (create or replace): los wrappers
-- public.* y la aplicación no cambian.

-- Capability / rol de un usuario concreto (no del usuario de la sesión). Uso
-- interno de funciones security definer; no se concede a authenticated.
create or replace function app.user_has_capability(p_user_id uuid, p_church_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_user_id is not null and exists (
    select 1
    from church_people_roles cpr
    join church_people cp on cp.id = cpr.church_people_id and cp.church_id = cpr.church_id
    join people p on p.id = cp.person_id
    join role_capabilities rc on rc.role_key = cpr.role_key
    where cpr.church_id = p_church_id
      and cpr.scope_type = 'church'
      and p.user_id = p_user_id
      and cp.archived_at is null
      and rc.capability_key = p_capability
  );
$$;

create or replace function app.user_has_church_role(p_user_id uuid, p_church_id uuid, p_role_key text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_user_id is not null and exists (
    select 1
    from church_people_roles cpr
    join church_people cp on cp.id = cpr.church_people_id and cp.church_id = cpr.church_id
    join people p on p.id = cp.person_id
    where cpr.church_id = p_church_id
      and cpr.scope_type = 'church'
      and p.user_id = p_user_id
      and cp.archived_at is null
      and cpr.role_key = p_role_key
  );
$$;

revoke all on function app.user_has_capability(uuid, uuid, text) from public, anon, authenticated;
revoke all on function app.user_has_church_role(uuid, uuid, text) from public, anon, authenticated;

-- ¿Puede este usuario conceder este rol mediante invitación?
create or replace function app.can_grant_role_by_invitation(p_user_id uuid, p_church_id uuid, p_role_key text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when p_role_key = 'member' then app.user_has_capability(p_user_id, p_church_id, 'people.manage')
    when p_role_key = 'church_owner' then
      app.user_has_capability(p_user_id, p_church_id, 'roles.manage')
      and app.user_has_church_role(p_user_id, p_church_id, 'church_owner')
    else app.user_has_capability(p_user_id, p_church_id, 'roles.manage')
  end;
$$;

revoke all on function app.can_grant_role_by_invitation(uuid, uuid, text) from public, anon, authenticated;

create or replace function app.invite_existing_person(
  p_church_id uuid,
  p_person_id uuid,
  p_email text,
  p_role_key text default 'member'
)
returns table (out_invitation_id uuid, out_invitation_token text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_invitation_id uuid;
  v_token text;
  v_role_key text := coalesce(nullif(btrim(coalesce(p_role_key, '')), ''), 'member');
begin
  if not (select app.has_capability(p_church_id, 'people.manage')) then
    raise exception 'FORBIDDEN: no tienes permiso para invitar personas';
  end if;

  if not exists (select 1 from roles where key = v_role_key) then
    raise exception 'INVALID_ROLE: el rol indicado no existe';
  end if;

  -- Conceder un rol distinto de miembro es gestionar roles, no personas.
  if v_role_key <> 'member' and not (select app.has_capability(p_church_id, 'roles.manage')) then
    raise exception 'FORBIDDEN: no tienes permiso para invitar con el rol %', v_role_key;
  end if;
  if v_role_key = 'church_owner' and not (select app.has_church_role(p_church_id, array['church_owner'])) then
    raise exception 'FORBIDDEN: solo un propietario puede invitar a otro propietario';
  end if;

  if not exists (
    select 1 from church_people
    where church_id = p_church_id and person_id = p_person_id and archived_at is null
  ) then
    raise exception 'PERSON_NOT_IN_CHURCH: la persona no pertenece a esta iglesia';
  end if;

  if exists (select 1 from people where id = p_person_id and user_id is not null) then
    raise exception 'PERSON_ALREADY_HAS_ACCOUNT: esta persona ya tiene una cuenta vinculada';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into invitations (church_id, person_id, email, role_key, token_hash, invited_by, expires_at)
  values (
    p_church_id, p_person_id, lower(p_email), v_role_key,
    encode(digest(v_token, 'sha256'), 'hex'), auth.uid(), now() + interval '7 days'
  )
  returning id into v_invitation_id;

  perform app.write_audit_log(
    p_church_id, 'person.invited', 'people', p_person_id,
    jsonb_build_object('invitation_id', v_invitation_id, 'role_key', v_role_key)
  );

  return query select v_invitation_id, v_token;
end;
$$;

create or replace function app.accept_person_invitation(p_token text)
returns table (out_church_id uuid, out_person_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_invitation invitations%rowtype;
  v_token_hash text;
  v_church_people_id uuid;
  v_granted_role text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED: se requiere una sesión autenticada';
  end if;

  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');
  select * into v_invitation from invitations where token_hash = v_token_hash;

  if v_invitation.id is null then
    raise exception 'INVITATION_NOT_FOUND: token de invitación no válido';
  end if;
  if v_invitation.person_id is null then
    raise exception 'INVITATION_NOT_FOUND: esta invitación no corresponde a una persona existente';
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

  -- Blindaje cross-tenant y anti-secuestro: si el auth.uid() actual ya
  -- está vinculado a OTRA persona, no se reasigna silenciosamente.
  if exists (select 1 from people where user_id = v_user_id and id != v_invitation.person_id) then
    raise exception 'AUTH_ALREADY_LINKED: esta cuenta ya está vinculada a otra persona';
  end if;

  if exists (select 1 from people where id = v_invitation.person_id and user_id is not null and user_id != v_user_id) then
    raise exception 'PERSON_ALREADY_LINKED: esta persona ya tiene una cuenta vinculada';
  end if;

  -- Rol concedido: el de la invitación solo si quien invitó sigue pudiendo
  -- concederlo; si no, miembro (cubre invitaciones anteriores al arreglo).
  v_granted_role := case
    when v_invitation.role_key = 'member' then 'member'
    when app.can_grant_role_by_invitation(v_invitation.invited_by, v_invitation.church_id, v_invitation.role_key)
      then v_invitation.role_key
    else 'member'
  end;

  update people set user_id = v_user_id where id = v_invitation.person_id;

  select id into v_church_people_id from church_people
    where church_id = v_invitation.church_id and person_id = v_invitation.person_id;

  insert into church_people_roles (church_id, church_people_id, role_key, scope_type)
  values (v_invitation.church_id, v_church_people_id, v_granted_role, 'church')
  on conflict do nothing;

  update invitations
    set status = 'accepted', accepted_at = now(), accepted_by_person_id = v_invitation.person_id
    where id = v_invitation.id;

  perform app.write_audit_log(
    v_invitation.church_id, 'person.auth_linked', 'people', v_invitation.person_id,
    jsonb_build_object(
      'invitation_id', v_invitation.id,
      'role_key', v_granted_role,
      'requested_role_key', v_invitation.role_key,
      'role_downgraded', v_granted_role <> v_invitation.role_key
    )
  );

  return query select v_invitation.church_id, v_invitation.person_id;
end;
$$;

revoke all on function app.invite_existing_person(uuid, uuid, text, text) from public, anon;
grant execute on function app.invite_existing_person(uuid, uuid, text, text) to authenticated;
revoke all on function app.accept_person_invitation(text) from public, anon;
grant execute on function app.accept_person_invitation(text) to authenticated;
