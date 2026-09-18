-- Fase 8 (Diogo) · RPC transaccionales de check-in y check-out.
-- Ver prompt Fase 8 §44-45.
--
-- No hay wrappers públicos para `anon`: Kids no tiene superficie pública
-- (§41). Solo `authenticated` con la capability correspondiente.

create extension if not exists pgcrypto;

-- app.kids_checkin(...): valida capacidad y bloquea la fila de la sesión
-- antes de contar (FOR UPDATE), igual patrón que app.register_for_event de
-- Fase 6, para que dos operadores no dupliquen el check-in ni superen la
-- capacidad por una carrera. El índice único kid_checkins_active_unique es
-- la segunda línea de defensa si dos transacciones llegan a la vez.
create or replace function app.kids_checkin(
  p_session_id uuid,
  p_kid_person_id uuid
)
returns table (checkin_id uuid, pickup_code text, replayed boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_session kids_sessions%rowtype;
  v_room kids_rooms%rowtype;
  v_activity activities%rowtype;
  v_church_id uuid;
  v_existing kid_checkins%rowtype;
  v_children_count integer;
  v_code text;
  v_hash text;
  v_checkin_id uuid;
begin
  select ks.* into v_session from kids_sessions ks where ks.id = p_session_id for update;
  if not found then
    raise exception 'Sesión Kids no encontrada.' using errcode = 'P0002';
  end if;
  v_church_id := v_session.church_id;

  select a.* into v_activity from activities a where a.id = v_session.activity_id and a.church_id = v_church_id;
  select r.* into v_room from kids_rooms r where r.id = v_session.room_id and r.church_id = v_church_id;

  if not app.kids_cap(v_church_id, v_activity.campus_id, v_activity.id, 'kids.checkin') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if v_session.status not in ('scheduled', 'open') then
    raise exception 'La sesión no admite check-in.' using errcode = '22023';
  end if;

  if not exists (select 1 from church_people cp where cp.church_id = v_church_id and cp.person_id = p_kid_person_id and cp.archived_at is null) then
    raise exception 'El menor no pertenece a esta iglesia.' using errcode = '22023';
  end if;

  select * into v_existing from kid_checkins
  where session_id = p_session_id and kid_person_id = p_kid_person_id and status = 'checked_in';
  if found then
    return query select v_existing.id, null::text, true;
    return;
  end if;

  select count(*) into v_children_count from kid_checkins where session_id = p_session_id and status = 'checked_in';
  if v_children_count >= v_room.capacity then
    raise exception 'La sala está a capacidad completa.' using errcode = '22023';
  end if;

  if v_session.status = 'scheduled' then
    update kids_sessions set status = 'open', opened_at = now(), opened_by = auth.uid() where id = p_session_id;
  end if;

  v_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
  v_hash := encode(digest(v_code || ':' || p_session_id::text, 'sha256'), 'hex');

  insert into kid_checkins (church_id, session_id, kid_person_id, room_id, checked_in_by, pickup_token_hash)
  values (v_church_id, p_session_id, p_kid_person_id, v_room.id, auth.uid(), v_hash)
  returning id into v_checkin_id;

  perform app.write_audit_log(v_church_id, 'kids.checkin', 'kid_checkins', v_checkin_id,
    jsonb_build_object('session_id', p_session_id, 'room_id', v_room.id));

  return query select v_checkin_id, v_code, false;
end;
$$;

revoke all on function app.kids_checkin(uuid, uuid) from public, anon;
grant execute on function app.kids_checkin(uuid, uuid) to authenticated;

create or replace function public.kids_checkin(p_session_id uuid, p_kid_person_id uuid)
returns table (checkin_id uuid, pickup_code text, replayed boolean)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.kids_checkin(p_session_id, p_kid_person_id);
$$;

revoke all on function public.kids_checkin(uuid, uuid) from public, anon;
grant execute on function public.kids_checkin(uuid, uuid) to authenticated;

-- app.kids_checkout(...): resuelve por código (no por checkin_id directo,
-- para no depender de que el operador conozca IDs internos), valida quién
-- recoge contra kid_pickup_authorizations, bloquea si no autorizado
-- (hard-block, §16, §21), consume autorizaciones one_time.
create or replace function app.kids_checkout(
  p_pickup_code text,
  p_session_id uuid,
  p_pickup_person_name text,
  p_authorized_pickup_id uuid default null,
  p_override_reason text default null
)
returns table (checkin_id uuid, status kid_checkin_status, authorized boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_checkin kid_checkins%rowtype;
  v_session kids_sessions%rowtype;
  v_activity activities%rowtype;
  v_church_id uuid;
  v_hash text;
  v_auth kid_pickup_authorizations%rowtype;
  v_authorized boolean := false;
begin
  select ks.* into v_session from kids_sessions ks where ks.id = p_session_id for update;
  if not found then
    raise exception 'Sesión Kids no encontrada.' using errcode = 'P0002';
  end if;
  v_church_id := v_session.church_id;

  select a.* into v_activity from activities a where a.id = v_session.activity_id and a.church_id = v_church_id;

  if not app.kids_cap(v_church_id, v_activity.campus_id, v_activity.id, 'kids.checkout') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  v_hash := encode(digest(upper(btrim(p_pickup_code)) || ':' || p_session_id::text, 'sha256'), 'hex');

  select * into v_checkin from kid_checkins
  where session_id = p_session_id and pickup_token_hash = v_hash and kid_checkins.status = 'checked_in'
  for update;

  if not found then
    raise exception 'Código no válido o ya utilizado.' using errcode = 'P0002';
  end if;

  if p_authorized_pickup_id is not null then
    select * into v_auth from kid_pickup_authorizations
    where id = p_authorized_pickup_id and church_id = v_church_id and kid_person_id = v_checkin.kid_person_id
    for update;

    if found
       and v_auth.status = 'active'
       and (v_auth.valid_until is null or v_auth.valid_until > now())
       and v_auth.valid_from <= now()
    then
      v_authorized := true;
    end if;
  end if;

  if not v_authorized and p_override_reason is not null then
    if not app.kids_cap(v_church_id, v_activity.campus_id, v_activity.id, 'kids.pickup.override') then
      raise exception 'No autorizado para anular la validación de recogida.' using errcode = '42501';
    end if;
    v_authorized := true;

    insert into kid_pickup_overrides (church_id, checkin_id, operator_person_id, pickup_person_name, reason)
    values (v_church_id, v_checkin.id, app.current_person_id(v_church_id), p_pickup_person_name, p_override_reason);

    perform app.write_audit_log(v_church_id, 'kids.pickup_override', 'kid_checkins', v_checkin.id,
      jsonb_build_object('session_id', p_session_id, 'reason_recorded', true));
  end if;

  if not v_authorized then
    perform app.write_audit_log(v_church_id, 'kids.pickup_denied', 'kid_checkins', v_checkin.id,
      jsonb_build_object('session_id', p_session_id));
    return query select v_checkin.id, v_checkin.status, false;
    return;
  end if;

  update kid_checkins
  set status = 'checked_out',
      checked_out_at = now(),
      checked_out_by = auth.uid(),
      authorized_pickup_id = p_authorized_pickup_id,
      pickup_person_snapshot = p_pickup_person_name
  where id = v_checkin.id;

  if v_auth.id is not null and v_auth.one_time then
    update kid_pickup_authorizations
    set status = 'used', used_at = now(), used_checkin_id = v_checkin.id
    where id = v_auth.id;
  end if;

  perform app.write_audit_log(v_church_id, 'kids.checkout', 'kid_checkins', v_checkin.id,
    jsonb_build_object('session_id', p_session_id, 'authorized_pickup_id', p_authorized_pickup_id));

  return query select v_checkin.id, 'checked_out'::kid_checkin_status, true;
end;
$$;

revoke all on function app.kids_checkout(text, uuid, text, uuid, text) from public, anon;
grant execute on function app.kids_checkout(text, uuid, text, uuid, text) to authenticated;

create or replace function public.kids_checkout(
  p_pickup_code text,
  p_session_id uuid,
  p_pickup_person_name text,
  p_authorized_pickup_id uuid default null,
  p_override_reason text default null
)
returns table (checkin_id uuid, status kid_checkin_status, authorized boolean)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.kids_checkout(p_pickup_code, p_session_id, p_pickup_person_name, p_authorized_pickup_id, p_override_reason);
$$;

revoke all on function public.kids_checkout(text, uuid, text, uuid, text) from public, anon;
grant execute on function public.kids_checkout(text, uuid, text, uuid, text) to authenticated;

-- app.kids_authorized_pickups(): lista las autorizaciones activas de un
-- menor, para que el operador elija quién está recogiendo. Requiere
-- kids.checkout (no kids.pickup.manage) porque es parte del flujo de
-- checkout, pero nunca expone el listado a quien no tenga ni siquiera esa
-- capability operativa.
create or replace function app.kids_authorized_pickups(p_kid_person_id uuid, p_church_id uuid)
returns table (id uuid, authorized_name_snapshot text, relation_text text, authorization_type pickup_authorization_type)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select a.id, a.authorized_name_snapshot, a.relation_text, a.authorization_type
  from kid_pickup_authorizations a
  where a.church_id = p_church_id
    and a.kid_person_id = p_kid_person_id
    and a.status = 'active'
    and a.valid_from <= now()
    and (a.valid_until is null or a.valid_until > now())
    and app.has_capability(p_church_id, 'kids.checkout');
$$;

revoke all on function app.kids_authorized_pickups(uuid, uuid) from public, anon;
grant execute on function app.kids_authorized_pickups(uuid, uuid) to authenticated;

create or replace function public.kids_authorized_pickups(p_kid_person_id uuid, p_church_id uuid)
returns table (id uuid, authorized_name_snapshot text, relation_text text, authorization_type pickup_authorization_type)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.kids_authorized_pickups(p_kid_person_id, p_church_id);
$$;

revoke all on function public.kids_authorized_pickups(uuid, uuid) from public, anon;
grant execute on function public.kids_authorized_pickups(uuid, uuid) to authenticated;
