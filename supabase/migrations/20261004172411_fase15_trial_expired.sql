-- Fase 15 · A1: estado trial_expired y supresión de avisos fuera de full/grace.
--
-- La fecha de inicio vive en subscriptions.trial_started_at, junto a trial_ends_at,
-- que ya escribe el provisioning (30 días). La app no calcula la prueba: el modo
-- compara now() con trial_ends_at. trial_expired no es cancelled ni suspended: no
-- borra datos, no entra en retención y el propietario conserva exportación.
--
-- Avisos: fuera de full/grace un evento se cierra como suppressed (processed_at,
-- suppressed_at, suppression_reason) y las entregas email/push en cola pasan a
-- suppressed con last_error estructurado. Nada se borra, y una reactivación no
-- reenvía lo suprimido.

alter table subscriptions add column trial_started_at timestamptz;
update subscriptions set trial_started_at = created_at where trial_started_at is null;
alter table subscriptions alter column trial_started_at set default now();
alter table subscriptions alter column trial_started_at set not null;
alter table subscriptions add constraint subscriptions_trial_fechas_check
  check (trial_ends_at is null or trial_ends_at > trial_started_at);

alter table notification_events
  add column suppressed_at timestamptz,
  add column suppression_reason jsonb,
  add constraint notification_events_supresion_check
    check ((suppressed_at is null) = (suppression_reason is null));

create or replace function app.church_access_mode(p_church_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church churches%rowtype;
  v_status subscription_status;
  v_desde timestamptz;
  v_fin timestamptz;
begin
  select * into v_church from churches where id = p_church_id;
  if not found then
    return 'none';
  end if;

  if v_church.security_block_reason is not null then
    return 'security_blocked';
  end if;

  if v_church.archived_at is not null or v_church.status = 'archived' then
    return 'cancelled';
  end if;

  select s.status, s.past_due_since, s.trial_ends_at into v_status, v_desde, v_fin
  from subscriptions s
  where s.church_id = p_church_id;

  if not found then
    return 'full';
  end if;

  case v_status
    when 'trial' then
      -- La prueba vence por fecha: sin conversión, el tenant pasa a trial_expired.
      -- Sin trial_ends_at (no debería ocurrir: el provisioning lo escribe) se trata como full.
      if v_fin is not null and now() >= v_fin then
        return 'trial_expired';
      end if;
      return 'full';
    when 'active' then return 'full';
    when 'past_due' then
      if v_desde is not null and now() < v_desde + interval '15 days' then
        return 'grace';
      end if;
      return 'suspended';
    when 'suspended' then return 'suspended';
    when 'cancelled' then return 'cancelled';
    else return 'suspended';
  end case;
end;
$$;

create or replace function app.assert_can_mutate(p_church_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_mode text := app.church_access_mode(p_church_id);
begin
  if v_mode in ('full', 'grace') then
    return;
  end if;

  raise exception 'La iglesia no permite cambios en este momento.'
    using errcode = '42501',
          detail = case v_mode
            when 'suspended' then 'CHURCH_SUSPENDED'
            when 'cancelled' then 'CHURCH_CANCELLED'
            when 'security_blocked' then 'CHURCH_SECURITY_BLOCKED'
            when 'trial_expired' then 'CHURCH_TRIAL_EXPIRED'
            else 'CHURCH_NOT_FOUND'
          end;
end;
$$;

create or replace function app.enforce_export_gate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if app.lifecycle_bypass_active() then
    return new;
  end if;
  if app.church_access_mode(new.church_id) not in ('full', 'grace', 'trial_expired', 'suspended', 'cancelled') then
    raise exception 'La exportación no está disponible en este momento.'
      using errcode = '42501', detail = 'CHURCH_SECURITY_BLOCKED';
  end if;
  return new;
end;
$$;

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

  -- Tope de reintentos: sin él, una entrega que falla siempre se reclama sin
  -- fin y tapa a las demás en la cabecera de la cola. A los 5 intentos deja de
  -- reclamarse y queda como `failed` con su motivo.
  update notification_deliveries d
  set status = 'failed',
      claimed_at = null,
      last_error = coalesce(d.last_error, 'Entrega agotada: 5 intentos sin cerrarse.')
  where d.channel = v_channel
    and d.status = 'queued'
    and d.attempts >= 5;

  -- Entregas por email o push que quedaron en cola antes de que la iglesia dejara
  -- de estar en full/grace: se cierran como suppressed con su motivo. Así una
  -- reactivación nunca las envía; la bandeja (inapp) no se toca.
  update notification_deliveries d
  set status = 'suppressed',
      claimed_at = null,
      last_error = jsonb_build_object('reason', 'tenant_access_mode', 'tenant_access_mode', m.mode)::text
  from (
    select distinct x.church_id, app.church_access_mode(x.church_id) as mode
    from notification_deliveries x
    where x.channel = v_channel and x.status = 'queued'
  ) m
  where d.church_id = m.church_id
    and d.channel = v_channel
    and d.status = 'queued'
    and m.mode not in ('full', 'grace');

  return query
  with picked as (
    select d.id
    from notification_deliveries d
    where d.channel = v_channel
      and d.status = 'queued'
      and d.attempts < 5
      and app.church_access_mode(d.church_id) in ('full', 'grace')
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
  v_discarded integer := 0;
  v_abandoned integer := 0;
  v_delivered integer;
  v_now timestamptz;
  v_attempts integer;
  v_mode text;
  v_suppressed integer := 0;
begin
  for v_event in
    select * from notification_events
    where processed_at is null
    order by occurred_at, id
    limit greatest(coalesce(p_limit, 100), 0)
    for update skip locked
  loop
    -- Fuera de full/grace el evento no genera avisos ni entregas: queda cerrado con
    -- su motivo (no se borra) y no se procesa aunque la iglesia se reactive.
    v_mode := app.church_access_mode(v_event.church_id);
    if v_mode not in ('full', 'grace') then
      update notification_events
      set processed_at = app.notification_clock(),
          suppressed_at = app.notification_clock(),
          suppression_reason = jsonb_build_object('reason', 'tenant_access_mode', 'tenant_access_mode', v_mode)
      where id = v_event.id;
      v_suppressed := v_suppressed + 1;
      continue;
    end if;

    begin
      v_text := app.notification_text(v_event);
      v_delivered := 0;

      foreach v_person in array v_event.recipient_person_ids loop
        -- Quien ya no pertenece a la iglesia deja de recibir el aviso.
        if not exists (
          select 1 from church_people cp
          where cp.church_id = v_event.church_id and cp.person_id = v_person and cp.archived_at is null
        ) then
          continue;
        end if;
        v_delivered := v_delivered + 1;

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

          -- La bandeja no tiene transporte que la cierre: la propia fila de
          -- `notifications` ES la entrega, así que nace enviada. Dejarla en
          -- `queued` sería una cola que nadie vacía nunca.
          insert into notification_deliveries (
            church_id, notification_id, person_id, channel, status, scheduled_for, sent_at, last_error
          ) values (
            v_event.church_id, v_notification_id, v_person, v_channel,
            case
              when v_channel = 'inapp' then 'sent'::notification_delivery_status
              when v_enabled then 'queued'::notification_delivery_status
              else 'suppressed'
            end,
            app.notification_delivery_schedule(v_event, v_channel),
            case when v_channel = 'inapp' then app.notification_clock() end,
            case when v_enabled then null else 'Canal desactivado por la persona.' end
          )
          on conflict (notification_id, channel) do nothing;
          v_deliveries := v_deliveries + 1;
        end loop;
      end loop;

      -- Un evento sin ningún destinatario vivo no desaparece en silencio: se
      -- cuenta aparte y queda en la auditoría de su iglesia.
      if v_delivered = 0 then
        v_discarded := v_discarded + 1;
        perform app.write_audit_log(
          v_event.church_id, 'notification_event.discarded', 'notification_events', v_event.id,
          jsonb_build_object(
            'event_type', v_event.event_type,
            'reason', 'sin destinatarios con pertenencia vigente',
            'recipients', cardinality(v_event.recipient_person_ids))
        );
      end if;

      update notification_events
      set processed_at = app.notification_clock(), attempts = attempts + 1, last_error = null
      where id = v_event.id;
      v_events := v_events + 1;
    exception when others then
      -- El fallo de un evento no tumba el lote. Tras 5 intentos se aparta, y
      -- apartarlo se registra: es un aviso que nadie va a recibir nunca.
      v_now := app.notification_clock();
      update notification_events
      set attempts = attempts + 1,
          last_error = left(sqlerrm, 500),
          processed_at = case when attempts + 1 >= 5 then v_now end
      where id = v_event.id
      returning attempts into v_attempts;

      if coalesce(v_attempts, 0) >= 5 then
        v_abandoned := v_abandoned + 1;
        perform app.write_audit_log(
          v_event.church_id, 'notification_event.abandoned', 'notification_events', v_event.id,
          jsonb_build_object(
            'event_type', v_event.event_type,
            'attempts', v_attempts,
            'last_error', left(sqlerrm, 500))
        );
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'events', v_events,
    'notifications', v_notifications,
    'deliveries', v_deliveries,
    'discarded', v_discarded,
    'abandoned', v_abandoned,
    'suppressed', v_suppressed
  );
end;
$$;


comment on column subscriptions.trial_started_at is
  'Inicio de la prueba (provisioning). Con trial_ends_at, fija la fecha de vencimiento; el modo de acceso la lee, la app no la calcula.';
comment on column notification_events.suppressed_at is
  'Momento en que el evento se cerró sin generar avisos por modo de acceso no full/grace.';
comment on column notification_events.suppression_reason is
  'Motivo estructurado de la supresión, p. ej. {"reason":"tenant_access_mode","tenant_access_mode":"suspended"}.';
