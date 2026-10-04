-- Fase 15 · A2 hardening: datos internos, RPC de Kids y notificaciones fuera de estado operativo.
--
-- 1. security_block_reason no se expone al cliente autenticado: se revoca el SELECT
--    de la columna y app.church_service_state solo lo devuelve con
--    platform.commercial.read. Owner/admin reciben el estado sin el motivo.
-- 2. Kids fuera de full/grace: sin check-in (ni replay), sin notas, sin datos de
--    personal ni de fechas de nacimiento, sin nombres de sala en la recogida, y sin
--    avisos a tutores. El cierre seguro (check-out, recogida, incidencia de menor
--    presente) sigue por las RPC que ya existían.

-- 1. Motivo interno -------------------------------------------------------------

-- Un REVOKE de columna no basta si la tabla tiene SELECT completo: se quita el SELECT
-- de tabla a authenticated y se vuelve a conceder el resto de columnas. Las columnas
-- nuevas de churches no llegan al cliente hasta que se concedan aquí.
-- anon conserva su SELECT de tabla: RLS no le devuelve ninguna fila de churches.
do $$
declare
  v_cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
  into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'churches'
    and column_name not in ('security_block_reason', 'security_blocked_by');
  execute 'revoke select on public.churches from authenticated';
  execute 'grant select (' || v_cols || ') on public.churches to authenticated';
end;
$$;

create or replace function app.church_service_state(p_church_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_platform boolean := app.has_platform_capability('platform.commercial.read');
  v_owner_admin boolean := p_church_id = any (app.church_ids_for_user())
    and app.has_church_role(p_church_id, array['church_owner', 'church_admin']);
begin
  if not v_platform and not v_owner_admin then
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
    -- El motivo interno solo para quien tiene la capacidad de plataforma de lectura comercial.
    || case when v_platform
          then jsonb_build_object('security_block_reason', c.security_block_reason)
          else '{}'::jsonb end
  )
  from churches c
  left join subscriptions s on s.church_id = c.id
  where c.id = p_church_id;
end;
$$;

comment on function app.church_service_state(uuid) is
  'Estado de servicio de una iglesia. Plataforma (platform.commercial.read) ve también el motivo interno; owner/admin de la iglesia ven el estado sin motivo; el resto, 42501.';

revoke all on function app.church_service_state(uuid) from public, anon;
grant execute on function app.church_service_state(uuid) to authenticated;

-- 2. Kids fuera de full/grace --------------------------------------------------

-- Check-in: sin check-in nuevo ni replay (el replay devolvía el código de recogida).
CREATE OR REPLACE FUNCTION app.kids_checkin(p_session_id uuid, p_kid_person_id uuid)
 RETURNS TABLE(checkin_id uuid, pickup_code text, replayed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  v_session kids_sessions%rowtype;
  v_room kids_rooms%rowtype;
  v_activity activities%rowtype;
  v_church_id uuid;
  v_existing kid_checkins%rowtype;
  v_children_count integer;
  v_staff_count integer;
  v_code text;
  v_hash text;
  v_checkin_id uuid;
  v_alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i integer;
begin
  select ks.* into v_session from kids_sessions ks where ks.id = p_session_id for update;
  if not found then
    raise exception 'Sesión Kids no encontrada.' using errcode = 'P0002';
  end if;
  v_church_id := v_session.church_id;
  perform app.assert_can_read_church(v_church_id);

  select a.* into v_activity from activities a where a.id = v_session.activity_id and a.church_id = v_church_id;
  select r.* into v_room from kids_rooms r where r.id = v_session.room_id and r.church_id = v_church_id;

  if not app.kids_cap(v_church_id, v_activity.campus_id, v_activity.id, 'kids.checkin') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  if v_session.status not in ('scheduled', 'open') then
    raise exception 'La sesión no admite check-in.' using errcode = '22023';
  end if;

  -- El primer check-in abre la sesión, como hacía la versión original.
  if v_session.status = 'scheduled' then
    update kids_sessions set status = 'open', opened_at = now(), opened_by = auth.uid()
    where id = p_session_id;
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

  select count(*)::integer into v_children_count from kid_checkins
  where session_id = p_session_id and status = 'checked_in';

  if v_room.capacity is not null and v_children_count >= v_room.capacity then
    raise exception 'La sala «%» ha alcanzado su aforo.', v_room.name using errcode = '22023';
  end if;

  -- El ratio, que antes no se comprobaba. La sesión ya está bloqueada más
  -- arriba con FOR UPDATE, así que el recuento de personal es estable.
  select count(*)::integer into v_staff_count from kids_session_staff
  where session_id = p_session_id and checked_in_at is not null and checked_out_at is null;

  if v_staff_count < coalesce(v_room.min_adults, 0) then
    raise exception 'La sala «%» necesita al menos % adulto(s) y hay %.',
      v_room.name, v_room.min_adults, v_staff_count using errcode = '22023';
  end if;

  if coalesce(v_room.ratio_children_per_adult, 0) > 0
     and v_children_count + 1 > v_staff_count * v_room.ratio_children_per_adult then
    raise exception 'No se puede admitir a otro menor en «%»: el ratio es % por adulto y hay % adulto(s).',
      v_room.name, v_room.ratio_children_per_adult, v_staff_count using errcode = '22023';
  end if;

  v_checkin_id := gen_random_uuid();

  -- Ocho caracteres de un alfabeto de 32 sin ambigüedades (sin I, O, 0, 1):
  -- 40 bits, y la huella lleva dentro el identificador del check-in, que no se
  -- conoce hasta que existe.
  v_code := '';
  for i in 1..8 loop
    v_code := v_code || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::integer, 1);
  end loop;

  v_hash := encode(digest(v_code || ':' || p_session_id::text || ':' || v_checkin_id::text, 'sha256'), 'hex');

  insert into kid_checkins (id, church_id, session_id, kid_person_id, room_id, checked_in_by, pickup_token_hash)
  values (v_checkin_id, v_church_id, p_session_id, p_kid_person_id, v_room.id, auth.uid(), v_hash);

  perform app.write_audit_log(v_church_id, 'kids.checkin', 'kid_checkins', v_checkin_id,
    jsonb_build_object('session_id', p_session_id, 'room_id', v_room.id));

  return query select v_checkin_id, v_code, false;
end;
$function$;

-- Recogida: el nombre de la sala no hace falta para validar la recogida; fuera de
-- full/grace se devuelve nulo. El nombre del menor y la alerta médica (booleano)
-- sí se devuelven: son necesarios para validar a quién se entrega.
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
    raise exception 'Sesión Kids no encontrada.' using errcode = 'P0002';
  end if;

  select a.* into v_activity from activities a
  where a.id = v_session.activity_id and a.church_id = v_session.church_id;

  if not app.kids_cap(v_session.church_id, v_activity.campus_id, v_activity.id, 'kids.checkout') then
    raise exception 'No autorizado.' using errcode = '42501';
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

-- Personal de Kids: el fichaje de entrada, solo operativo. El check-out de personal se deja
-- permitido en cualquier modo: solo cierra una presencia y no devuelve datos.
CREATE OR REPLACE FUNCTION app.kids_staff_check_in(p_staff_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_staff kids_session_staff%rowtype;
  v_session kids_sessions%rowtype;
  v_activity activities%rowtype;
  v_eligible boolean;
  v_reasons text[];
begin
  select s.* into v_staff from kids_session_staff s where s.id = p_staff_id;
  if not found or not (v_staff.church_id = any (app.church_ids_for_user())) then
    raise exception 'Asignación no encontrada.' using errcode = 'P0002';
  end if;

  perform app.assert_can_read_church(v_staff.church_id);
  select ks.* into v_session from kids_sessions ks where ks.id = v_staff.session_id;
  select a.* into v_activity from activities a
  where a.id = v_session.activity_id and a.church_id = v_session.church_id;

  if not app.kids_cap(v_staff.church_id, v_activity.campus_id, v_activity.id, 'kids.session.manage')
     and not app.kids_cap(v_staff.church_id, v_activity.campus_id, v_activity.id, 'kids.checkin') then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  -- La credencial se vuelve a comprobar al entrar, no solo al asignar: entre
  -- una cosa y otra puede haber caducado.
  select e.eligible, e.reasons into v_eligible, v_reasons
  from app.kids_staff_eligibility(v_staff.church_id, v_staff.person_id, v_activity.campus_id) e;

  if not v_eligible then
    raise exception 'Esa persona no puede estar con menores: %.', array_to_string(v_reasons, ', ')
      using errcode = '22023';
  end if;

  update kids_session_staff
  set checked_in_at = now(), checked_in_by = auth.uid(), checked_out_at = null
  where id = p_staff_id;

  perform app.write_audit_log(v_staff.church_id, 'kids.staff_checked_in', 'kids_session_staff',
    p_staff_id, jsonb_build_object('session_id', v_staff.session_id, 'person_id', v_staff.person_id));
end;
$function$;


-- Notas sensibles: lectura y escritura solo operativas (las notas médicas no son
-- necesarias fuera de full/grace).
CREATE OR REPLACE FUNCTION app.kids_save_sensitive_notes(p_church_id uuid, p_kid_person_id uuid, p_accessibility_notes text, p_emergency_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  perform app.assert_can_read_church(p_church_id);
  perform app.assert_church_member(p_church_id);

  if not app.has_capability(p_church_id, 'kids.manage')
     or not app.has_capability(p_church_id, 'kids.sensitive.read') then
    raise exception 'No tienes permiso para editar las notas sensibles de un menor.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from kids_profiles kp
    where kp.church_id = p_church_id and kp.person_id = p_kid_person_id
  ) then
    raise exception 'El menor no tiene ficha en esta iglesia.' using errcode = 'P0002';
  end if;

  insert into kids_sensitive_notes (kid_person_id, church_id, accessibility_notes, emergency_notes, updated_by)
  values (p_kid_person_id, p_church_id,
          nullif(btrim(coalesce(p_accessibility_notes, '')), ''),
          nullif(btrim(coalesce(p_emergency_notes, '')), ''),
          app.current_person_id(p_church_id))
  on conflict (kid_person_id, church_id) do update set
    accessibility_notes = excluded.accessibility_notes,
    emergency_notes = excluded.emergency_notes,
    updated_at = now(),
    updated_by = excluded.updated_by;

  perform app.write_audit_log(p_church_id, 'kids.sensitive_notes_saved', 'kids_sensitive_notes',
    p_kid_person_id, '{}'::jsonb);
end;
$function$;

-- Fechas de nacimiento: dato personal, solo operativo.
CREATE OR REPLACE FUNCTION app.people_birth_dates(p_church_id uuid, p_person_ids uuid[])
 RETURNS TABLE(person_id uuid, birth_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  perform app.assert_can_read_church(p_church_id);
  perform app.assert_church_member(p_church_id);

  if not app.has_capability(p_church_id, 'kids.manage')
     and not app.has_capability(p_church_id, 'people.read') then
    raise exception 'No tienes permiso para ver fechas de nacimiento.' using errcode = '42501';
  end if;

  return query
  select p.id, p.birth_date
  from people p
  join church_people cp on cp.person_id = p.id and cp.church_id = p_church_id
  where p.id = any (p_person_ids);
end;
$function$;

-- Avisos a tutores: son avisos de negocio. Fuera de full/grace no se generan.
CREATE OR REPLACE FUNCTION app.notify_kid_guardians(p_church_id uuid, p_kid_person_id uuid, p_event_type text, p_key_suffix text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_recipients uuid[];
begin
  if app.church_access_mode(p_church_id) not in ('full', 'grace') then
    return 0;
  end if;
  select coalesce(array_agg(distinct guardian_person_id), '{}')
  into v_recipients
  from kid_guardians
  where church_id = p_church_id and kid_person_id = p_kid_person_id and active and can_view;

  if cardinality(v_recipients) = 0 then
    return 0;
  end if;

  perform app.emit_notification_event(
    p_church_id, p_event_type, 'kid_checkins', p_kid_person_id, null,
    v_recipients,
    jsonb_build_object('kid_person_id', p_kid_person_id),
    p_key_suffix
  );

  return cardinality(v_recipients);
end;
$function$;
