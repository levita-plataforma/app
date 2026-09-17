-- Fase 5 (DI-02) · RPC de avisos: lectura de la persona y motor de proceso.
-- Ver docs/FASE-5-AVISOS-DISPONIBILIDAD.md §4.3 y §4.4.
--
-- Dos bloques:
-- * Persona (authenticated): bandeja, contador, marcar leído y preferencias.
-- * Motor (solo service_role): proceso del outbox, recordatorios, escalado y
--   cola de salida por canal. Con el transporte desactivado, email y push se
--   quedan en `queued` y no se contacta con ningún proveedor.
--
-- Los textos se generan en español de España y nunca prometen correo ni push.

-- ===========================================================================
-- Reloj y redacción
-- ===========================================================================

-- Reloj del motor. `app.notification_now` permite fijar el instante en pruebas
-- y en reprocesos manuales; sin él es now(). Solo lo alcanzan funciones de
-- service_role, y únicamente afecta a la planificación de la cola.
create or replace function app.notification_clock()
returns timestamptz
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(nullif(current_setting('app.notification_now', true), '')::timestamptz, now());
$$;

-- "el 05/10/2031 a las 10:00" en la zona de la actividad, o '' si no hay hora.
create or replace function app.notification_when(p_payload jsonb)
returns text
language sql
stable
set search_path = pg_catalog, public
as $$
  select case
    when nullif(p_payload ->> 'starts_at', '') is null then ''
    else ' el ' || to_char(
           (p_payload ->> 'starts_at')::timestamptz at time zone coalesce(nullif(p_payload ->> 'timezone', ''), 'Europe/Madrid'),
           'DD/MM/YYYY') || ' a las ' || to_char(
           (p_payload ->> 'starts_at')::timestamptz at time zone coalesce(nullif(p_payload ->> 'timezone', ''), 'Europe/Madrid'),
           'HH24:MI')
  end;
$$;

create or replace function app.notification_person_label(p_person_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    nullif(btrim(coalesce(p.preferred_name, p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
    'Una persona')
  from people p where p.id = p_person_id;
$$;

-- Título y cuerpo del aviso, en español de España.
create or replace function app.notification_text(p_event notification_events)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_payload jsonb := coalesce(p_event.payload, '{}'::jsonb);
  v_when text := app.notification_when(v_payload);
  v_position text := coalesce(nullif(v_payload ->> 'position_name', ''), 'un puesto');
  v_activity text := coalesce(nullif(v_payload ->> 'activity_title', ''), 'una actividad');
  v_person text := app.notification_person_label(nullif(v_payload ->> 'person_id', '')::uuid);
  v_title text;
  v_body text;
begin
  case p_event.event_type
    when 'assignment.proposed' then
      v_title := 'Turno por confirmar';
      v_body := 'Te han asignado el puesto «' || v_position || '» en «' || v_activity || '»' || v_when
        || '. Entra en LEVITA para aceptarlo o rechazarlo.';

    when 'assignment.accepted' then
      v_title := 'Turno aceptado';
      v_body := v_person || ' ha aceptado el puesto «' || v_position || '» en «' || v_activity || '»' || v_when || '.';

    when 'assignment.declined' then
      v_title := 'Turno rechazado';
      v_body := v_person || ' no puede servir en el puesto «' || v_position || '» de «' || v_activity || '»' || v_when || '.';

    when 'assignment.cancelled' then
      v_title := 'Turno retirado';
      v_body := case v_payload ->> 'cause'
        when 'activity_cancelled' then 'Se ha cancelado «' || v_activity || '»' || v_when
          || ': ya no se te espera en el puesto «' || v_position || '».'
        when 'occurrence_removed' then 'Se ha cancelado «' || v_activity || '»' || v_when
          || ': ya no se te espera en el puesto «' || v_position || '».'
        when 'activity_archived' then 'Se ha archivado «' || v_activity || '»' || v_when
          || ': ya no se te espera en el puesto «' || v_position || '».'
        when 'substitution_withdrawn' then 'Se ha retirado la sustitución del puesto «' || v_position
          || '» en «' || v_activity || '»' || v_when || ': ya no se te espera.'
        else 'Se ha retirado tu turno del puesto «' || v_position || '» en «' || v_activity || '»' || v_when || '.'
      end;

    when 'assignment.substituted' then
      v_title := 'Te han sustituido en un turno';
      v_body := 'Otra persona ocupará el puesto «' || v_position || '» en «' || v_activity || '»' || v_when
        || '. Ya no se te espera.';

    when 'assignment.substitution_requested' then
      v_title := 'Solicitud de sustitución';
      v_body := v_person || ' necesita que le sustituyan en el puesto «' || v_position || '» de «'
        || v_activity || '»' || v_when || '.';

    when 'activity.rescheduled' then
      v_title := 'Cambio de hora';
      v_body := '«' || v_activity || '» cambia de hora: ahora empieza' || coalesce(nullif(v_when, ''), ' en otro momento')
        || '. Vuelve a confirmar tu turno del puesto «' || v_position || '».';

    when 'assignment.reminder' then
      if coalesce(v_payload ->> 'kind', 'pending') = 'accepted' then
        v_title := 'Recordatorio de turno';
        v_body := 'Sirves en el puesto «' || v_position || '» de «' || v_activity || '»' || v_when || '.';
      else
        v_title := 'Tienes un turno sin responder';
        v_body := 'Todavía no has respondido al puesto «' || v_position || '» de «' || v_activity || '»' || v_when
          || '. Entra en LEVITA para aceptarlo o rechazarlo.';
      end if;

    when 'assignment.coverage_at_risk' then
      v_title := 'Puesto crítico sin cubrir';
      v_body := 'El puesto crítico «' || v_position || '» de «' || v_activity || '»' || v_when
        || ' sigue sin cubrir: faltan ' || coalesce(v_payload ->> 'missing', '?') || ' persona(s) y quedan menos de 3 días.';

    else
      v_title := 'Aviso';
      v_body := 'Tienes un aviso nuevo en «' || v_activity || '».';
  end case;

  return jsonb_build_object('title', left(v_title, 200), 'body', left(v_body, 1000));
end;
$$;

-- ===========================================================================
-- Silencio 22:00-08:00 (regla 5)
-- ===========================================================================

create or replace function app.notification_quiet_shift(p_at timestamptz, p_timezone text)
returns timestamptz
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_tz text := coalesce(nullif(p_timezone, ''), 'Europe/Madrid');
  v_local timestamp;
  v_hour integer;
begin
  v_local := p_at at time zone v_tz;
  v_hour := extract(hour from v_local)::integer;
  if v_hour >= 22 then
    return (date_trunc('day', v_local) + interval '1 day' + interval '8 hours') at time zone v_tz;
  elsif v_hour < 8 then
    return (date_trunc('day', v_local) + interval '8 hours') at time zone v_tz;
  end if;
  return p_at;
end;
$$;

comment on function app.notification_quiet_shift(timestamptz, text) is
  'Regla 5: lo que cae entre las 22:00 y las 08:00 de la zona indicada se entrega al terminar la franja.';

create or replace function app.notification_delivery_schedule(
  p_event notification_events,
  p_channel notification_channel
)
returns timestamptz
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := app.notification_clock();
  v_tz text := coalesce(nullif(p_event.payload ->> 'timezone', ''), 'Europe/Madrid');
  v_starts timestamptz := nullif(p_event.payload ->> 'starts_at', '')::timestamptz;
begin
  -- La bandeja de la aplicación nunca se retrasa.
  if p_channel = 'inapp' then
    return v_now;
  end if;
  -- Única excepción al silencio: cancelar un turno de una actividad que
  -- empieza ese mismo día (zona de la actividad).
  if p_event.event_type = 'assignment.cancelled' and v_starts is not null
     and (v_starts at time zone v_tz)::date = (v_now at time zone v_tz)::date then
    return v_now;
  end if;
  return app.notification_quiet_shift(v_now, v_tz);
end;
$$;

-- ===========================================================================
-- Proceso del outbox (solo service_role)
-- ===========================================================================

create or replace function app.process_notification_events(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event notification_events%rowtype;
  v_text jsonb;
  v_person uuid;
  v_channel notification_channel;
  v_notification_id uuid;
  v_enabled boolean;
  v_events integer := 0;
  v_notifications integer := 0;
  v_deliveries integer := 0;
begin
  for v_event in
    select * from notification_events
    where processed_at is null
    order by occurred_at, id
    limit greatest(coalesce(p_limit, 100), 0)
    for update skip locked
  loop
    begin
      v_text := app.notification_text(v_event);

      foreach v_person in array v_event.recipient_person_ids loop
        -- Quien ya no pertenece a la iglesia deja de recibir el aviso.
        if not exists (
          select 1 from church_people cp
          where cp.church_id = v_event.church_id and cp.person_id = v_person and cp.archived_at is null
        ) then
          continue;
        end if;

        insert into notifications (
          church_id, event_id, person_id, event_type, title, body, entity_type, entity_id, activity_id
        ) values (
          v_event.church_id, v_event.id, v_person, v_event.event_type,
          v_text ->> 'title', v_text ->> 'body', v_event.entity_type, v_event.entity_id,
          nullif(v_event.payload ->> 'activity_id', '')::uuid
        )
        on conflict (event_id, person_id) do nothing
        returning id into v_notification_id;

        -- Ya existía: el evento se reprocesa sin duplicar la bandeja.
        if v_notification_id is null then
          continue;
        end if;
        v_notifications := v_notifications + 1;

        foreach v_channel in array enum_range(null::notification_channel) loop
          v_enabled := v_channel = 'inapp' or coalesce((
            select np.enabled from notification_preferences np
            where np.church_id = v_event.church_id and np.person_id = v_person and np.channel = v_channel
          ), true);

          insert into notification_deliveries (
            church_id, notification_id, person_id, channel, status, scheduled_for, last_error
          ) values (
            v_event.church_id, v_notification_id, v_person, v_channel,
            case when v_enabled then 'queued'::notification_delivery_status else 'suppressed' end,
            app.notification_delivery_schedule(v_event, v_channel),
            case when v_enabled then null else 'Canal desactivado por la persona.' end
          )
          on conflict (notification_id, channel) do nothing;
          v_deliveries := v_deliveries + 1;
        end loop;
      end loop;

      update notification_events
      set processed_at = app.notification_clock(), attempts = attempts + 1, last_error = null
      where id = v_event.id;
      v_events := v_events + 1;
    exception when others then
      -- El fallo de un evento no tumba el lote. Tras 5 intentos se aparta.
      update notification_events
      set attempts = attempts + 1,
          last_error = left(sqlerrm, 500),
          processed_at = case when attempts + 1 >= 5 then app.notification_clock() end
      where id = v_event.id;
    end;
  end loop;

  return jsonb_build_object('events', v_events, 'notifications', v_notifications, 'deliveries', v_deliveries);
end;
$$;

comment on function app.process_notification_events(integer) is
  'Consume el outbox con for update skip locked: una notificación por destinatario y sus entregas por canal según preferencias, aplicando el silencio en scheduled_for.';

-- ===========================================================================
-- Recordatorios (regla 4) y escalado (regla 3)
-- ===========================================================================

create or replace function app.enqueue_due_reminders()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := app.notification_clock();
  v_assignment activity_assignments%rowtype;
  v_days integer;
  v_kind text;
  v_created integer := 0;
begin
  for v_assignment in
    select aa.*
    from activity_assignments aa
    join activities a on a.id = aa.activity_id
    where aa.status in ('pending', 'accepted')
      and (aa.sent_at is not null or aa.response_source is not null)
      -- Nunca de actividades pasadas, canceladas ni archivadas.
      and a.status in ('planned', 'published')
      and a.starts_at is not null
      and a.starts_at > v_now
      and a.starts_at <= v_now + interval '7 days'
    order by aa.id
  loop
    if v_assignment.status = 'pending' then
      -- Sin respuesta: 7 y 2 días antes.
      v_kind := 'pending';
      v_days := case
        when (select starts_at from activities where id = v_assignment.activity_id) > v_now + interval '2 days'
          then 7 else 2 end;
    else
      -- Aceptada: la víspera.
      v_kind := 'accepted';
      if (select starts_at from activities where id = v_assignment.activity_id) > v_now + interval '1 day' then
        continue;
      end if;
      v_days := 1;
    end if;

    if app.emit_notification_event(
      v_assignment.church_id, 'assignment.reminder', 'activity_assignments', v_assignment.id, v_assignment.version,
      array[v_assignment.person_id],
      app.assignment_notification_payload(v_assignment) || jsonb_build_object('kind', v_kind, 'days', v_days),
      'd' || v_days::text
    ) is not null then
      v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object('reminders', v_created);
end;
$$;

comment on function app.enqueue_due_reminders() is
  'Regla 4: sin respuesta, 7 y 2 días antes; aceptada, la víspera. La clave de deduplicación (d7/d2/d1 + versión) evita repetirlos.';

create or replace function app.escalate_uncovered_positions()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := app.notification_clock();
  v_rec record;
  v_created integer := 0;
begin
  for v_rec in
    select ap.id as position_id, ap.name as position_name, ap.min_people, ap.service_area_id,
           a.id as activity_id, a.church_id, a.title, a.starts_at, a.ends_at, a.timezone,
           (select count(*) from activity_assignments aa
            where aa.activity_position_id = ap.id and aa.status = 'accepted') as accepted_count
    from activity_positions ap
    join activities a on a.id = ap.activity_id
    where ap.critical
      and a.status in ('planned', 'published')
      and a.starts_at is not null
      and a.starts_at > v_now
      and a.starts_at <= v_now + interval '3 days'
    order by ap.id
  loop
    if v_rec.accepted_count >= v_rec.min_people then
      continue;
    end if;

    if app.emit_notification_event(
      v_rec.church_id, 'assignment.coverage_at_risk', 'activity_positions', v_rec.position_id, 1,
      app.church_admin_person_ids(v_rec.church_id),
      jsonb_strip_nulls(jsonb_build_object(
        'activity_id', v_rec.activity_id,
        'activity_title', v_rec.title,
        'activity_position_id', v_rec.position_id,
        'position_name', v_rec.position_name,
        'service_area_id', v_rec.service_area_id,
        'starts_at', v_rec.starts_at,
        'ends_at', v_rec.ends_at,
        'timezone', v_rec.timezone,
        'min_people', v_rec.min_people,
        'accepted_count', v_rec.accepted_count,
        'missing', v_rec.min_people - v_rec.accepted_count
      )),
      -- Una escalada por puesto y horario: si la actividad se mueve, vuelve a avisar.
      to_char(v_rec.starts_at, 'YYYYMMDDHH24MI')
    ) is not null then
      v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object('escalations', v_created);
end;
$$;

comment on function app.escalate_uncovered_positions() is
  'Regla 3: un puesto crítico por debajo de su mínimo a menos de 3 días avisa a la administración de la iglesia.';

-- ===========================================================================
-- Cola de salida (solo service_role)
-- ===========================================================================

create or replace function app.claim_notification_deliveries(p_channel text, p_limit integer default 50)
returns table (
  delivery_id uuid,
  notification_id uuid,
  church_id uuid,
  person_id uuid,
  channel text,
  title text,
  body text,
  entity_type text,
  entity_id uuid,
  activity_id uuid,
  scheduled_for timestamptz,
  attempts integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_channel notification_channel;
begin
  if p_channel is null or p_channel not in ('inapp', 'email', 'push') then
    raise exception 'Canal de aviso no válido.' using errcode = '22023';
  end if;
  v_channel := p_channel::notification_channel;

  return query
  with picked as (
    select d.id
    from notification_deliveries d
    where d.channel = v_channel
      and d.status = 'queued'
      and d.scheduled_for <= app.notification_clock()
      and (d.claimed_at is null or d.claimed_at < app.notification_clock() - interval '15 minutes')
    order by d.scheduled_for, d.id
    limit greatest(coalesce(p_limit, 50), 0)
    for update skip locked
  ),
  claimed as (
    update notification_deliveries d
    set attempts = d.attempts + 1, claimed_at = app.notification_clock()
    from picked
    where d.id = picked.id
    returning d.id, d.notification_id, d.church_id, d.person_id, d.channel, d.scheduled_for, d.attempts
  )
  select c.id, c.notification_id, c.church_id, c.person_id, c.channel::text,
         n.title, n.body, n.entity_type, n.entity_id, n.activity_id, c.scheduled_for, c.attempts
  from claimed c
  join notifications n on n.id = c.notification_id
  order by c.scheduled_for, c.id;
end;
$$;

create or replace function app.complete_notification_delivery(
  p_delivery_id uuid,
  p_status text,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status notification_delivery_status;
  v_row notification_deliveries%rowtype;
begin
  if p_status is null or p_status not in ('sent', 'failed', 'suppressed') then
    raise exception 'Estado de entrega no válido.' using errcode = '22023';
  end if;
  v_status := p_status::notification_delivery_status;

  update notification_deliveries
  set status = v_status,
      sent_at = case when v_status = 'sent' then app.notification_clock() end,
      last_error = case when v_status = 'sent' then null else left(p_error, 500) end,
      claimed_at = null
  where id = p_delivery_id
  returning * into v_row;

  if not found then
    raise exception 'La entrega no existe.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'delivery_id', v_row.id, 'status', v_row.status, 'attempts', v_row.attempts, 'sent_at', v_row.sent_at
  );
end;
$$;

-- ===========================================================================
-- Bandeja de la persona (authenticated)
-- ===========================================================================

create or replace function app.list_my_notifications(
  p_church_id uuid,
  p_only_unread boolean default false,
  p_limit integer default 50
)
returns table (
  id uuid,
  event_type text,
  title text,
  body text,
  entity_type text,
  entity_id uuid,
  activity_id uuid,
  created_at timestamptz,
  read_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select n.id, n.event_type, n.title, n.body, n.entity_type, n.entity_id, n.activity_id, n.created_at, n.read_at
  from notifications n
  where n.church_id = p_church_id
    and p_church_id = any (app.church_ids_for_user())
    and n.person_id in (select app.current_person_ids())
    and (not coalesce(p_only_unread, false) or n.read_at is null)
  order by n.created_at desc, n.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

create or replace function app.count_my_unread_notifications(p_church_id uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(*)::integer
  from notifications n
  where n.church_id = p_church_id
    and p_church_id = any (app.church_ids_for_user())
    and n.person_id in (select app.current_person_ids())
    and n.read_at is null;
$$;

create or replace function app.mark_notification_read(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row notifications%rowtype;
begin
  update notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and church_id = any (app.church_ids_for_user())
    and person_id in (select app.current_person_ids())
  returning * into v_row;

  if not found then
    raise exception 'El aviso no existe.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('notification_id', v_row.id, 'read_at', v_row.read_at);
end;
$$;

create or replace function app.mark_all_notifications_read(p_church_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer;
begin
  if not (p_church_id = any (app.church_ids_for_user())) then
    raise exception 'No tienes acceso a esta iglesia.' using errcode = '42501';
  end if;

  update notifications
  set read_at = now()
  where church_id = p_church_id
    and person_id in (select app.current_person_ids())
    and read_at is null;
  get diagnostics v_count = row_count;

  return jsonb_build_object('updated', v_count);
end;
$$;

-- La bandeja de la aplicación no se puede desactivar. La preferencia es
-- personal: se aplica a todas las pertenencias vigentes de quien la cambia.
create or replace function app.set_my_notification_preference(p_channel text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_channel notification_channel;
  v_count integer;
  v_church uuid;
  v_person uuid;
begin
  if p_channel is null or p_channel not in ('inapp', 'email', 'push') then
    raise exception 'Canal de aviso no válido.' using errcode = '22023';
  end if;
  v_channel := p_channel::notification_channel;

  if v_channel = 'inapp' and not coalesce(p_enabled, true) then
    raise exception 'La bandeja de la aplicación no se puede desactivar.' using errcode = '22023';
  end if;

  insert into notification_preferences (church_id, person_id, channel, enabled)
  select cp.church_id, cp.person_id, v_channel, coalesce(p_enabled, true)
  from church_people cp
  where cp.person_id in (select app.current_person_ids())
    and cp.archived_at is null
  on conflict (church_id, person_id, channel) do update
  set enabled = excluded.enabled, updated_at = now();
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'No tienes ninguna pertenencia vigente.' using errcode = '42501';
  end if;

  for v_church, v_person in
    select cp.church_id, cp.person_id from church_people cp
    where cp.person_id in (select app.current_person_ids()) and cp.archived_at is null
  loop
    perform app.write_audit_log(
      v_church, 'notification_preference.updated', 'notification_preferences', v_person,
      jsonb_build_object('channel', p_channel, 'enabled', coalesce(p_enabled, true))
    );
  end loop;

  return jsonb_build_object('channel', p_channel, 'enabled', coalesce(p_enabled, true), 'churches', v_count);
end;
$$;

-- ===========================================================================
-- Wrappers públicos
-- ===========================================================================

create or replace function public.list_my_notifications(
  p_church_id uuid,
  p_only_unread boolean default false,
  p_limit integer default 50
)
returns table (
  id uuid,
  event_type text,
  title text,
  body text,
  entity_type text,
  entity_id uuid,
  activity_id uuid,
  created_at timestamptz,
  read_at timestamptz
)
language sql stable security invoker set search_path = pg_catalog, public
as $$ select * from app.list_my_notifications(p_church_id, p_only_unread, p_limit); $$;

create or replace function public.count_my_unread_notifications(p_church_id uuid)
returns integer
language sql stable security invoker set search_path = pg_catalog, public
as $$ select app.count_my_unread_notifications(p_church_id); $$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.mark_notification_read(p_notification_id); $$;

create or replace function public.mark_all_notifications_read(p_church_id uuid)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.mark_all_notifications_read(p_church_id); $$;

create or replace function public.set_my_notification_preference(p_channel text, p_enabled boolean)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.set_my_notification_preference(p_channel, p_enabled); $$;

create or replace function public.process_notification_events(p_limit integer default 100)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.process_notification_events(p_limit); $$;

create or replace function public.enqueue_due_reminders()
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.enqueue_due_reminders(); $$;

create or replace function public.escalate_uncovered_positions()
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.escalate_uncovered_positions(); $$;

create or replace function public.claim_notification_deliveries(p_channel text, p_limit integer default 50)
returns table (
  delivery_id uuid,
  notification_id uuid,
  church_id uuid,
  person_id uuid,
  channel text,
  title text,
  body text,
  entity_type text,
  entity_id uuid,
  activity_id uuid,
  scheduled_for timestamptz,
  attempts integer
)
language sql security invoker set search_path = pg_catalog, public
as $$ select * from app.claim_notification_deliveries(p_channel, p_limit); $$;

create or replace function public.complete_notification_delivery(
  p_delivery_id uuid, p_status text, p_error text default null
)
returns jsonb language sql security invoker set search_path = pg_catalog, public
as $$ select app.complete_notification_delivery(p_delivery_id, p_status, p_error); $$;

-- ===========================================================================
-- Permisos
-- ===========================================================================

do $grants$
declare
  v_signature text;
begin
  -- Interno del motor: nadie del cliente.
  foreach v_signature in array array[
    'app.notification_clock()',
    'app.notification_when(jsonb)',
    'app.notification_person_label(uuid)',
    'app.notification_text(notification_events)',
    'app.notification_quiet_shift(timestamptz, text)',
    'app.notification_delivery_schedule(notification_events, notification_channel)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;

  -- Motor: solo service_role (revocado a anon y authenticated).
  foreach v_signature in array array[
    'app.process_notification_events(integer)',
    'app.enqueue_due_reminders()',
    'app.escalate_uncovered_positions()',
    'app.claim_notification_deliveries(text, integer)',
    'app.complete_notification_delivery(uuid, text, text)',
    'public.process_notification_events(integer)',
    'public.enqueue_due_reminders()',
    'public.escalate_uncovered_positions()',
    'public.claim_notification_deliveries(text, integer)',
    'public.complete_notification_delivery(uuid, text, text)'
  ]
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;

  -- Persona autenticada.
  foreach v_signature in array array[
    'app.list_my_notifications(uuid, boolean, integer)',
    'app.count_my_unread_notifications(uuid)',
    'app.mark_notification_read(uuid)',
    'app.mark_all_notifications_read(uuid)',
    'app.set_my_notification_preference(text, boolean)',
    'public.list_my_notifications(uuid, boolean, integer)',
    'public.count_my_unread_notifications(uuid)',
    'public.mark_notification_read(uuid)',
    'public.mark_all_notifications_read(uuid)',
    'public.set_my_notification_preference(text, boolean)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', v_signature);
    execute format('grant execute on function %s to authenticated, service_role', v_signature);
  end loop;
end;
$grants$;
