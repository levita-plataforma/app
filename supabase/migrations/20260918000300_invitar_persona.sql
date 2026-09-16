-- Fase 2 · Invitar a una persona existente a crear cuenta Auth.
-- Ver encargo de Fase 2 §16-17.
--
-- Reutiliza la tabla `invitations` de Fase 1 (alta asistida de owner), que
-- ya tenía token hasheado/expiración/single-use. Se añade person_id
-- nullable: en la invitación de owner (Fase 1) no existía persona todavía;
-- aquí sí, y queremos vincular esa persona exacta, nunca crear otra.

alter table invitations add column person_id uuid;
alter table invitations add constraint invitations_person_id_fk
  foreign key (person_id) references people (id) on delete cascade;

comment on column invitations.person_id is
  'Persona existente a la que se invita a crear cuenta (Fase 2). Null en invitaciones de alta asistida de owner (Fase 1), donde la persona aún no existe.';

create index invitations_person_id_idx on invitations (person_id) where person_id is not null;

-- app.invite_existing_person(...): crea una invitación para una persona ya
-- existente en el tenant. Requiere people.manage (misma capability que
-- gestionar personas, no roles.manage: invitar a una persona del
-- directorio no es lo mismo que gestionar roles de la iglesia).
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
begin
  if not (select app.has_capability(p_church_id, 'people.manage')) then
    raise exception 'FORBIDDEN: no tienes permiso para invitar personas';
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
    p_church_id, p_person_id, lower(p_email), p_role_key,
    encode(digest(v_token, 'sha256'), 'hex'), auth.uid(), now() + interval '7 days'
  )
  returning id into v_invitation_id;

  perform app.write_audit_log(
    p_church_id, 'person.invited', 'people', p_person_id,
    jsonb_build_object('invitation_id', v_invitation_id)
  );

  return query select v_invitation_id, v_token;
end;
$$;

revoke all on function app.invite_existing_person(uuid, uuid, text, text) from public, anon;
grant execute on function app.invite_existing_person(uuid, uuid, text, text) to authenticated;

-- app.accept_person_invitation(token): vincula el auth.uid() actual a la
-- persona exacta de la invitación. Nunca crea una persona nueva ni
-- resuelve por coincidencia de email: la identidad viene fijada por
-- person_id en el momento en que se generó la invitación (encargo §17,
-- "email igual no debe ser suficiente como prueba absoluta").
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

  update people set user_id = v_user_id where id = v_invitation.person_id;

  select id into v_church_people_id from church_people
    where church_id = v_invitation.church_id and person_id = v_invitation.person_id;

  insert into church_people_roles (church_id, church_people_id, role_key, scope_type)
  values (v_invitation.church_id, v_church_people_id, v_invitation.role_key, 'church')
  on conflict do nothing;

  update invitations
    set status = 'accepted', accepted_at = now(), accepted_by_person_id = v_invitation.person_id
    where id = v_invitation.id;

  perform app.write_audit_log(
    v_invitation.church_id, 'person.auth_linked', 'people', v_invitation.person_id,
    jsonb_build_object('invitation_id', v_invitation.id)
  );

  return query select v_invitation.church_id, v_invitation.person_id;
end;
$$;

revoke all on function app.accept_person_invitation(text) from public, anon;
grant execute on function app.accept_person_invitation(text) to authenticated;

create or replace function public.invite_existing_person(p_church_id uuid, p_person_id uuid, p_email text, p_role_key text default 'member')
returns table (out_invitation_id uuid, out_invitation_token text)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.invite_existing_person(p_church_id, p_person_id, p_email, p_role_key);
$$;

revoke all on function public.invite_existing_person(uuid, uuid, text, text) from public, anon;
grant execute on function public.invite_existing_person(uuid, uuid, text, text) to authenticated;

create or replace function public.accept_person_invitation(p_token text)
returns table (out_church_id uuid, out_person_id uuid)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.accept_person_invitation(p_token);
$$;

revoke all on function public.accept_person_invitation(text) from public, anon;
grant execute on function public.accept_person_invitation(text) to authenticated;
