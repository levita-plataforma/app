-- Fase 15 · A1 (parte 4): los jobs de avisos y comunicaciones solo operan para
-- iglesias en full o grace. Las demás se saltan sin efectos: no se materializan,
-- no se reclaman entregas ni se envía nada. Retención no pasa por aquí: sigue su
-- propio camino (run_lifecycle).
--
-- Las tres funciones son copias de las migraciones anteriores con una única
-- condición añadida (app.church_access_mode), sin cambiar nada más.

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
           a.id as activity_id, a.church_id, a.campus_id, a.title, a.starts_at, a.ends_at, a.timezone,
           -- Solo confirmados: un turno enviado sin responder no cubre el puesto.
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
      app.church_admin_person_ids(v_rec.church_id, v_rec.campus_id),
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
      -- Una escalada por puesto y horario: si la actividad se mueve, vuelve a
      -- avisar. El horario se fija SIEMPRE en UTC: to_char sobre un timestamptz
      -- usa la zona de la sesión, así que dos pasadas del motor con TimeZone
      -- distinto generaban dos claves y escalaban dos veces a toda la
      -- administración.
      to_char(v_rec.starts_at at time zone 'UTC', 'YYYYMMDDHH24MI')
    ) is not null then
      v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object('escalations', v_created);
end;
$$;

comment on function app.escalate_uncovered_positions() is
  'Regla 3: un puesto crítico por debajo de su mínimo a menos de 3 días avisa a la administración de la iglesia (la de ámbito iglesia y la del campus de la actividad). La cobertura se mide SOLO con turnos confirmados (status = accepted): los enviados sin responder y los borradores no cuentan, porque hasta que alguien confirma no hay nadie comprometido; el texto del aviso lo dice. La clave de deduplicación fija el horario en UTC, así que no depende de la zona de la sesión que ejecute el motor.';

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

create or replace function public.cancel_communication(p_communication_id uuid)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.cancel_communication(p_communication_id);
$$;

revoke all on function public.cancel_communication(uuid) from public;
grant execute on function public.cancel_communication(uuid) to authenticated;

-- ============================================================================
-- 9. Descubrimiento para el cron (solo service_role)
-- ============================================================================

-- Comunicaciones programadas cuya hora ya llegó y todavía no se
-- materializaron.
create or replace function app.due_scheduled_communications(p_limit integer default 5)
returns table (id uuid)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select c.id from communications c
  where c.status = 'scheduled' and c.materialized_at is null and c.scheduled_at <= now()
    and app.church_access_mode(c.church_id) in ('full', 'grace')
  order by c.scheduled_at
  limit greatest(coalesce(p_limit, 5), 1);
$$;

create or replace function public.due_scheduled_communications(p_limit integer default 5)
returns table (id uuid)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.due_scheduled_communications(p_limit);
$$;

revoke all on function public.due_scheduled_communications(integer) from public, anon, authenticated;
grant execute on function public.due_scheduled_communications(integer) to service_role;

-- Comunicaciones materializadas con destinatarios todavía pendientes de
-- procesar (recién materializadas o enviadas a medias en una pasada previa).
create or replace function app.pending_send_communications(p_limit integer default 5)
returns table (id uuid)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select distinct c.id from communications c
  join communication_recipients cr on cr.communication_id = c.id and cr.status = 'pending'
  where c.materialized_at is not null and c.status in ('processing', 'scheduled', 'draft')
    and app.church_access_mode(c.church_id) in ('full', 'grace')
  limit greatest(coalesce(p_limit, 5), 1);
$$;

-- La purga en lote ya no puede borrar iglesias: el trigger lo impide sin bypass.
-- Su único uso era el runner de retención, que ahora llama a run_lifecycle por iglesia.
revoke all on function app.purge_archived_churches(integer, integer) from public, anon, authenticated, service_role;
