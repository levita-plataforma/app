-- Fase 9 (Diogo) · Métricas de entrega y programación de comunicaciones.
--
-- app.preview_communication_segment (20261001000600) sirve solo para el
-- preview PRE-envío (aún no hay communication_recipients). Para la ficha de
-- detalle de una comunicación ya materializada/enviada hace falta una
-- lectura agregada de communication_recipients — tabla sin política de
-- SELECT directa (PII masiva persona x canal). Se expone aquí una función
-- de solo lectura, mismo patrón security definer + wrapper public.* +
-- revoke/grant que el resto de 20261001000600.
--
-- Además, create_communication (20261001000600 §5) siempre crea en
-- 'draft': no acepta scheduled_at. Para "programar" hace falta una función
-- separada que mueva la comunicación a status='scheduled', con el mismo
-- patrón de capability check (communications.schedule) y auditoría que
-- cancel_communication.

-- ============================================================================
-- 1. Métricas agregadas de entrega (por canal y status)
-- ============================================================================

create or replace function app.communication_metrics(p_communication_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_church_id uuid;
  v_by_channel jsonb := '{}'::jsonb;
  v_channel notification_channel;
  v_channel_counts jsonb;
  v_total integer;
begin
  select church_id into v_church_id from communications where id = p_communication_id;
  if v_church_id is null then
    raise exception 'Comunicación no encontrada.' using errcode = 'P0002';
  end if;

  if not app.communication_cap(v_church_id, null, 'communications.read_metrics') then
    raise exception 'No tienes permiso para ver métricas de esta comunicación.' using errcode = '42501';
  end if;

  select count(*) into v_total
  from communication_recipients
  where communication_id = p_communication_id;

  foreach v_channel in array array['inapp', 'email', 'push']::notification_channel[]
  loop
    select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb) into v_channel_counts
    from (
      select status::text as status, count(*) as cnt
      from communication_recipients
      where communication_id = p_communication_id and channel = v_channel
      group by status
    ) s;

    v_by_channel := v_by_channel || jsonb_build_object(v_channel::text, v_channel_counts);
  end loop;

  return jsonb_build_object('total', v_total, 'by_channel', v_by_channel);
end;
$$;

revoke all on function app.communication_metrics(uuid) from public, anon;
grant execute on function app.communication_metrics(uuid) to authenticated;

create or replace function public.communication_metrics(p_communication_id uuid)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.communication_metrics(p_communication_id);
$$;

revoke all on function public.communication_metrics(uuid) from public;
grant execute on function public.communication_metrics(uuid) to authenticated;

-- ============================================================================
-- 2. Programación de comunicaciones (draft -> scheduled)
-- ============================================================================

create or replace function app.schedule_communication(p_communication_id uuid, p_scheduled_at timestamptz)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_comm communications%rowtype;
begin
  select * into v_comm from communications where id = p_communication_id for update skip locked;

  if not found then
    raise exception 'Comunicación no encontrada o bloqueada por otro proceso.' using errcode = 'P0002';
  end if;

  if not app.communication_cap(v_comm.church_id, null, 'communications.schedule') then
    raise exception 'No tienes permiso para programar esta comunicación.' using errcode = '42501';
  end if;

  if v_comm.status <> 'draft' then
    raise exception 'Solo se puede programar una comunicación en borrador.' using errcode = '22023';
  end if;

  if p_scheduled_at is null or p_scheduled_at <= now() then
    raise exception 'La fecha de programación debe ser futura.' using errcode = '22023';
  end if;

  update communications
  set status = 'scheduled', scheduled_at = p_scheduled_at
  where id = p_communication_id;

  perform app.write_audit_log(
    v_comm.church_id, 'communication.scheduled', 'communications', p_communication_id,
    jsonb_build_object('scheduled_at', p_scheduled_at)
  );
end;
$$;

revoke all on function app.schedule_communication(uuid, timestamptz) from public, anon;
grant execute on function app.schedule_communication(uuid, timestamptz) to authenticated;

create or replace function public.schedule_communication(p_communication_id uuid, p_scheduled_at timestamptz)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.schedule_communication(p_communication_id, p_scheduled_at);
$$;

revoke all on function public.schedule_communication(uuid, timestamptz) from public;
grant execute on function public.schedule_communication(uuid, timestamptz) to authenticated;
