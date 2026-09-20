-- Fase 12 (Diogo) · RPC de planes recurrentes de Giving.
--
-- Crear un plan NUNCA crea una contribution: es planificación/compromiso
-- (encargo §22). Sin proveedor, provider/provider_subscription_ref quedan
-- nulos y next_due_at es informativo, nunca dispara cobro real.

create or replace function app.create_giving_recurring_plan(
  p_church_id uuid,
  p_fund_id uuid,
  p_amount_minor bigint,
  p_frequency giving_recurrence_frequency,
  p_person_id uuid default null,
  p_campaign_id uuid default null,
  p_currency text default null,
  p_starts_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_currency text;
begin
  if not app.has_capability(p_church_id, 'giving.create_contribution') then
    raise exception 'No tienes permiso para registrar planes recurrentes.' using errcode = '42501';
  end if;

  perform app.require_giving_module(p_church_id);

  if p_amount_minor <= 0 then
    raise exception 'El importe debe ser mayor que cero.' using errcode = '22023';
  end if;

  if not exists (select 1 from giving_funds where id = p_fund_id and church_id = p_church_id and status = 'active') then
    raise exception 'El fondo indicado no existe o no está activo.' using errcode = 'P0002';
  end if;

  if p_person_id is not null and not exists (
    select 1 from church_people where church_id = p_church_id and person_id = p_person_id and archived_at is null
  ) then
    raise exception 'La persona indicada no pertenece a esta iglesia.' using errcode = 'P0002';
  end if;

  if p_currency is null then
    select currency into v_currency from churches where id = p_church_id;
  else
    v_currency := p_currency;
  end if;

  insert into giving_recurring_plans (
    church_id, person_id, fund_id, campaign_id, amount_minor, currency, frequency, starts_at, created_by_person_id
  ) values (
    p_church_id, p_person_id, p_fund_id, p_campaign_id, p_amount_minor, v_currency, p_frequency,
    coalesce(p_starts_at, now()), app.current_person_id(p_church_id)
  )
  returning id into v_id;

  perform app.write_audit_log(
    p_church_id, 'giving.recurring_plan.created', 'giving_recurring_plans', v_id,
    jsonb_build_object('fund_id', p_fund_id, 'frequency', p_frequency)
  );

  return v_id;
end;
$$;

revoke all on function app.create_giving_recurring_plan(
  uuid, uuid, bigint, giving_recurrence_frequency, uuid, uuid, text, timestamptz
) from public, anon;
grant execute on function app.create_giving_recurring_plan(
  uuid, uuid, bigint, giving_recurrence_frequency, uuid, uuid, text, timestamptz
) to authenticated;

create or replace function public.create_giving_recurring_plan(
  p_church_id uuid, p_fund_id uuid, p_amount_minor bigint, p_frequency giving_recurrence_frequency,
  p_person_id uuid default null, p_campaign_id uuid default null, p_currency text default null,
  p_starts_at timestamptz default null
)
returns uuid
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.create_giving_recurring_plan(p_church_id, p_fund_id, p_amount_minor, p_frequency, p_person_id, p_campaign_id, p_currency, p_starts_at);
$$;

revoke all on function public.create_giving_recurring_plan(
  uuid, uuid, bigint, giving_recurrence_frequency, uuid, uuid, text, timestamptz
) from public, anon;
grant execute on function public.create_giving_recurring_plan(
  uuid, uuid, bigint, giving_recurrence_frequency, uuid, uuid, text, timestamptz
) to authenticated;

-- ============================================================================
-- set_giving_recurring_plan_status: active/paused/ended.
-- ============================================================================

create or replace function app.set_giving_recurring_plan_status(
  p_plan_id uuid,
  p_church_id uuid,
  p_status giving_recurring_plan_status
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not app.has_capability(p_church_id, 'giving.update_contribution') then
    raise exception 'No tienes permiso para cambiar el estado del plan recurrente.' using errcode = '42501';
  end if;

  if not exists (select 1 from giving_recurring_plans where id = p_plan_id and church_id = p_church_id) then
    raise exception 'Plan recurrente no encontrado.' using errcode = 'P0002';
  end if;

  update giving_recurring_plans
  set status = p_status, ended_at = case when p_status = 'ended' then now() else null end
  where id = p_plan_id and church_id = p_church_id;

  perform app.write_audit_log(
    p_church_id, 'giving.recurring_plan.updated', 'giving_recurring_plans', p_plan_id, jsonb_build_object('status', p_status)
  );
end;
$$;

revoke all on function app.set_giving_recurring_plan_status(uuid, uuid, giving_recurring_plan_status) from public, anon;
grant execute on function app.set_giving_recurring_plan_status(uuid, uuid, giving_recurring_plan_status) to authenticated;

create or replace function public.set_giving_recurring_plan_status(p_plan_id uuid, p_church_id uuid, p_status giving_recurring_plan_status)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.set_giving_recurring_plan_status(p_plan_id, p_church_id, p_status);
$$;

revoke all on function public.set_giving_recurring_plan_status(uuid, uuid, giving_recurring_plan_status) from public, anon;
grant execute on function public.set_giving_recurring_plan_status(uuid, uuid, giving_recurring_plan_status) to authenticated;
