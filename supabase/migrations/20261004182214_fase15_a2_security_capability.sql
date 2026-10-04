-- Fase 15 · A2 hardening (2): capacidad específica para el motivo de seguridad y
-- errores uniformes en la recogida de Kids.
--
-- 1. platform.church_security.read: el motivo interno y el operador que lo fijó.
--    deny-by-default: no se concede a nadie aquí. Un operador con
--    platform.operators.manage la asigna explícitamente (app.grant_platform_capability).
--    platform.commercial.read ya no da acceso al motivo.
-- 2. Recogida: código inválido, sesión inexistente, sesión de otra iglesia o sin
--    capacidad devuelven el mismo error. Así no se revela si una sesión o un código
--    existen en otra iglesia.

insert into platform_capabilities (key, description) values
  ('platform.church_security.read',
   'Leer el motivo interno de un bloqueo de seguridad de una iglesia. Solo para operadores autorizados explícitamente.')
on conflict (key) do nothing;

create or replace function app.church_service_state(p_church_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_commercial boolean := app.has_platform_capability('platform.commercial.read');
  v_security boolean := app.has_platform_capability('platform.church_security.read');
  v_owner_admin boolean := p_church_id = any (app.church_ids_for_user())
    and app.has_church_role(p_church_id, array['church_owner', 'church_admin']);
begin
  if not v_commercial and not v_security and not v_owner_admin then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'lifecycle', c.status::text,
      'commercial', coalesce(s.status::text, 'sin_suscripcion'),
      'security_blocked', c.security_block_reason is not null,
      'in_maintenance', c.maintenance_until is not null and c.maintenance_until > now(),
      'maintenance_until', c.maintenance_until,
      'archived', c.archived_at is not null,
      'reasons', (
        select coalesce(jsonb_agg(r order by r), '[]'::jsonb)
        from (
          select 'security_block' as r where c.security_block_reason is not null
          union all
          select 'archived' where c.archived_at is not null or c.status = 'archived'
          union all
          select 'maintenance' where c.maintenance_until is not null and c.maintenance_until > now()
          union all
          select 'commercial' where s.status in ('suspended', 'cancelled')
          union all
          select 'provisioning' where c.status = 'provisioning'
        ) x
      )
    )
    -- Motivo interno y operador que lo fijó: solo con platform.church_security.read.
    -- platform.commercial.read y el propio owner no lo reciben nunca.
    || case when v_security
          then jsonb_build_object(
                 'security_block_reason', c.security_block_reason,
                 'security_blocked_by', c.security_blocked_by)
          else '{}'::jsonb end
  )
  from churches c
  left join subscriptions s on s.church_id = c.id
  where c.id = p_church_id;
end;
$$;

comment on function app.church_service_state(uuid) is
  'Estado de servicio de una iglesia. Motivo interno solo con platform.church_security.read; platform.commercial.read y owner/admin ven el estado sin motivo; el resto, 42501.';

revoke all on function app.church_service_state(uuid) from public, anon;
grant execute on function app.church_service_state(uuid) to authenticated;

-- Recogida de Kids: mismo error para código inválido, sesión inexistente y sin capacidad.
CREATE OR REPLACE FUNCTION app.kids_lookup_pickup(p_session_id uuid, p_pickup_code text)
 RETURNS TABLE(checkin_id uuid, kid_person_id uuid, kid_name text, room_name text, medical_alert boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_session kids_sessions%rowtype;
  v_activity activities%rowtype;
  v_id uuid;
begin
  select ks.* into v_session from kids_sessions ks where ks.id = p_session_id;
  if not found then
    raise exception 'Código no válido o ya utilizado.' using errcode = 'P0002';
  end if;

  select a.* into v_activity from activities a
  where a.id = v_session.activity_id and a.church_id = v_session.church_id;

  if not app.kids_cap(v_session.church_id, v_activity.campus_id, v_activity.id, 'kids.checkout') then
    raise exception 'Código no válido o ya utilizado.' using errcode = 'P0002';
  end if;

  v_id := app.kids_find_checkin_by_code(p_session_id, p_pickup_code);
  if v_id is null then
    raise exception 'Código no válido o ya utilizado.' using errcode = 'P0002';
  end if;

  return query
  select kc.id, kc.kid_person_id,
         coalesce(nullif(p.preferred_name, ''), p.first_name) || coalesce(' ' || p.last_name, ''),
         case when app.can_read_church(kc.church_id) then r.name end,
         coalesce(kp.medical_alert_flag, false)
  from kid_checkins kc
  join people p on p.id = kc.kid_person_id
  left join kids_rooms r on r.id = kc.room_id
  left join kids_profiles kp on kp.person_id = kc.kid_person_id and kp.church_id = kc.church_id
  where kc.id = v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION app.kids_checkout(p_pickup_code text, p_session_id uuid, p_pickup_person_name text, p_authorized_pickup_id uuid DEFAULT NULL::uuid, p_override_reason text DEFAULT NULL::text)
 RETURNS TABLE(checkin_id uuid, status kid_checkin_status, authorized boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_checkin kid_checkins%rowtype;
  v_session kids_sessions%rowtype;
  v_activity activities%rowtype;
  v_church_id uuid;
  v_checkin_id uuid;
  v_auth kid_pickup_authorizations%rowtype;
  v_authorized boolean := false;
  v_por_autorizacion boolean := false;
begin
  select ks.* into v_session from kids_sessions ks where ks.id = p_session_id for update;
  if not found then
    raise exception 'Código no válido o ya utilizado.' using errcode = 'P0002';
  end if;
  v_church_id := v_session.church_id;

  select a.* into v_activity from activities a where a.id = v_session.activity_id and a.church_id = v_church_id;

  if not app.kids_cap(v_church_id, v_activity.campus_id, v_activity.id, 'kids.checkout') then
    raise exception 'Código no válido o ya utilizado.' using errcode = 'P0002';
  end if;

  v_checkin_id := app.kids_find_checkin_by_code(p_session_id, p_pickup_code);
  if v_checkin_id is null then
    raise exception 'Código no válido o ya utilizado.' using errcode = 'P0002';
  end if;

  select * into v_checkin from kid_checkins where id = v_checkin_id for update;
  if not found or v_checkin.status <> 'checked_in' then
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
      v_por_autorizacion := true;
    end if;
  end if;

  if not v_authorized and p_override_reason is not null then
    if not app.kids_cap(v_church_id, v_activity.campus_id, v_activity.id, 'kids.pickup.override') then
      raise exception 'No autorizado para anular la validación de recogida.' using errcode = '42501';
    end if;
    if btrim(coalesce(p_pickup_person_name, '')) = '' then
      raise exception 'Para anular la validación hay que registrar a quién se entrega el menor.'
        using errcode = '22023';
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
      authorized_pickup_id = case when v_por_autorizacion then p_authorized_pickup_id end,
      pickup_person_snapshot = p_pickup_person_name
  where id = v_checkin.id;

  -- Solo se consume la autorización si fue ella la que autorizó la recogida.
  if v_por_autorizacion and v_auth.id is not null and v_auth.one_time then
    update kid_pickup_authorizations
    set status = 'used', used_at = now(), used_checkin_id = v_checkin.id
    where id = v_auth.id;
  end if;

  perform app.write_audit_log(v_church_id, 'kids.checkout', 'kid_checkins', v_checkin.id,
    jsonb_build_object('session_id', p_session_id,
                       'authorized_pickup_id', case when v_por_autorizacion then p_authorized_pickup_id end,
                       'override', not v_por_autorizacion));

  return query select v_checkin.id, 'checked_out'::kid_checkin_status, true;
end;
$function$;

