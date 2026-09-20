-- Fase 12 (Diogo) · RPC de aportaciones (contributions) de Giving.
--
-- Registro manual (cash/bank_transfer) puede marcarse succeeded directamente
-- por quien tiene giving.create_contribution — nunca se finge un
-- procesamiento bancario que no existe (encargo §15).

create or replace function app.create_giving_contribution(
  p_church_id uuid,
  p_fund_id uuid,
  p_amount_minor bigint,
  p_method giving_contribution_method,
  p_campaign_id uuid default null,
  p_person_id uuid default null,
  p_anonymous boolean default false,
  p_currency text default null,
  p_contributed_at timestamptz default null,
  p_reference text default null,
  p_notes text default null,
  p_status giving_contribution_status default 'succeeded'
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_currency text;
  v_person_id uuid;
  v_actor_id uuid;
begin
  if not app.has_capability(p_church_id, 'giving.create_contribution') then
    raise exception 'No tienes permiso para registrar aportaciones.' using errcode = '42501';
  end if;

  perform app.require_giving_module(p_church_id);

  if p_amount_minor <= 0 then
    raise exception 'El importe debe ser mayor que cero.' using errcode = '22023';
  end if;

  if not exists (select 1 from giving_funds where id = p_fund_id and church_id = p_church_id and status = 'active') then
    raise exception 'El fondo indicado no existe o no está activo.' using errcode = 'P0002';
  end if;

  if p_campaign_id is not null and not exists (
    select 1 from giving_campaigns where id = p_campaign_id and church_id = p_church_id
  ) then
    raise exception 'La campaña indicada no existe.' using errcode = 'P0002';
  end if;

  -- anonymous=true siempre implica person_id NULL en esta fase (encargo §46).
  v_person_id := case when p_anonymous then null else p_person_id end;

  if v_person_id is not null and not exists (
    select 1 from church_people where church_id = p_church_id and person_id = v_person_id and archived_at is null
  ) then
    raise exception 'La persona indicada no pertenece a esta iglesia.' using errcode = 'P0002';
  end if;

  if p_status not in ('pending', 'succeeded') then
    raise exception 'Solo se puede crear una aportación en pending o succeeded.' using errcode = '22023';
  end if;

  if p_currency is null then
    select currency into v_currency from churches where id = p_church_id;
  else
    v_currency := p_currency;
  end if;

  v_actor_id := app.current_person_id(p_church_id);

  insert into giving_contributions (
    church_id, fund_id, campaign_id, person_id, anonymous, amount_minor, currency, method, status,
    contributed_at, reference, notes, created_by_person_id, updated_by_person_id
  ) values (
    p_church_id, p_fund_id, p_campaign_id, v_person_id, coalesce(p_anonymous, false), p_amount_minor, v_currency,
    p_method, p_status, coalesce(p_contributed_at, now()), p_reference, p_notes, v_actor_id, v_actor_id
  )
  returning id into v_id;

  -- Auditoría: nunca el importe completo con contexto personal identificable
  -- innecesario, ni las notas (encargo §39/§56). Fondo, campaña y método sí,
  -- porque son operativos, no financieros sensibles por sí solos.
  perform app.write_audit_log(
    p_church_id, 'giving.contribution.created', 'giving_contributions', v_id,
    jsonb_build_object('fund_id', p_fund_id, 'campaign_id', p_campaign_id, 'method', p_method, 'status', p_status, 'anonymous', p_anonymous)
  );

  return v_id;
end;
$$;

revoke all on function app.create_giving_contribution(
  uuid, uuid, bigint, giving_contribution_method, uuid, uuid, boolean, text, timestamptz, text, text, giving_contribution_status
) from public, anon;
grant execute on function app.create_giving_contribution(
  uuid, uuid, bigint, giving_contribution_method, uuid, uuid, boolean, text, timestamptz, text, text, giving_contribution_status
) to authenticated;

create or replace function public.create_giving_contribution(
  p_church_id uuid, p_fund_id uuid, p_amount_minor bigint, p_method giving_contribution_method,
  p_campaign_id uuid default null, p_person_id uuid default null, p_anonymous boolean default false,
  p_currency text default null, p_contributed_at timestamptz default null, p_reference text default null,
  p_notes text default null, p_status giving_contribution_status default 'succeeded'
)
returns uuid
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.create_giving_contribution(
    p_church_id, p_fund_id, p_amount_minor, p_method, p_campaign_id, p_person_id, p_anonymous,
    p_currency, p_contributed_at, p_reference, p_notes, p_status
  );
$$;

revoke all on function public.create_giving_contribution(
  uuid, uuid, bigint, giving_contribution_method, uuid, uuid, boolean, text, timestamptz, text, text, giving_contribution_status
) from public, anon;
grant execute on function public.create_giving_contribution(
  uuid, uuid, bigint, giving_contribution_method, uuid, uuid, boolean, text, timestamptz, text, text, giving_contribution_status
) to authenticated;

-- ============================================================================
-- update_giving_contribution: solo campos administrativos (fondo, campaña,
-- referencia, notas, fecha) — NUNCA el importe ni la moneda una vez creada
-- (una corrección de importe es cancelar + crear de nuevo, o un refund
-- parcial; cambiar amount_minor en sitio rompería la trazabilidad que el
-- encargo exige preservar, §40).
-- ============================================================================

create or replace function app.update_giving_contribution(
  p_contribution_id uuid,
  p_church_id uuid,
  p_fund_id uuid,
  p_campaign_id uuid default null,
  p_reference text default null,
  p_notes text default null,
  p_contributed_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status giving_contribution_status;
begin
  if not app.has_capability(p_church_id, 'giving.update_contribution') then
    raise exception 'No tienes permiso para editar aportaciones.' using errcode = '42501';
  end if;

  select status into v_status from giving_contributions where id = p_contribution_id and church_id = p_church_id;
  if v_status is null then
    raise exception 'Aportación no encontrada.' using errcode = 'P0002';
  end if;
  if v_status in ('refunded', 'cancelled') then
    raise exception 'No se puede editar una aportación % .', v_status using errcode = '22023';
  end if;

  if not exists (select 1 from giving_funds where id = p_fund_id and church_id = p_church_id and status = 'active') then
    raise exception 'El fondo indicado no existe o no está activo.' using errcode = 'P0002';
  end if;

  update giving_contributions set
    fund_id = p_fund_id, campaign_id = p_campaign_id, reference = p_reference,
    notes = p_notes, contributed_at = coalesce(p_contributed_at, contributed_at),
    updated_by_person_id = app.current_person_id(p_church_id)
  where id = p_contribution_id and church_id = p_church_id;

  perform app.write_audit_log(
    p_church_id, 'giving.contribution.updated', 'giving_contributions', p_contribution_id,
    jsonb_build_object('fund_id', p_fund_id, 'campaign_id', p_campaign_id)
  );
end;
$$;

revoke all on function app.update_giving_contribution(uuid, uuid, uuid, uuid, text, text, timestamptz) from public, anon;
grant execute on function app.update_giving_contribution(uuid, uuid, uuid, uuid, text, text, timestamptz) to authenticated;

create or replace function public.update_giving_contribution(
  p_contribution_id uuid, p_church_id uuid, p_fund_id uuid, p_campaign_id uuid default null,
  p_reference text default null, p_notes text default null, p_contributed_at timestamptz default null
)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.update_giving_contribution(p_contribution_id, p_church_id, p_fund_id, p_campaign_id, p_reference, p_notes, p_contributed_at);
$$;

revoke all on function public.update_giving_contribution(uuid, uuid, uuid, uuid, text, text, timestamptz) from public, anon;
grant execute on function public.update_giving_contribution(uuid, uuid, uuid, uuid, text, text, timestamptz) to authenticated;

-- ============================================================================
-- cancel_giving_contribution: reversal para "mal registrada", nunca delete
-- físico (encargo §18/§40).
-- ============================================================================

create or replace function app.cancel_giving_contribution(p_contribution_id uuid, p_church_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status giving_contribution_status;
begin
  if not app.has_capability(p_church_id, 'giving.update_contribution') then
    raise exception 'No tienes permiso para cancelar aportaciones.' using errcode = '42501';
  end if;

  select status into v_status from giving_contributions where id = p_contribution_id and church_id = p_church_id;
  if v_status is null then
    raise exception 'Aportación no encontrada.' using errcode = 'P0002';
  end if;
  if v_status not in ('pending', 'succeeded') then
    raise exception 'Solo se puede cancelar una aportación pending o succeeded.' using errcode = '22023';
  end if;

  update giving_contributions
  set status = 'cancelled', updated_by_person_id = app.current_person_id(p_church_id)
  where id = p_contribution_id and church_id = p_church_id;

  perform app.write_audit_log(
    p_church_id, 'giving.contribution.updated', 'giving_contributions', p_contribution_id,
    jsonb_build_object('to_status', 'cancelled', 'has_reason', p_reason is not null)
  );
end;
$$;

revoke all on function app.cancel_giving_contribution(uuid, uuid, text) from public, anon;
grant execute on function app.cancel_giving_contribution(uuid, uuid, text) to authenticated;

create or replace function public.cancel_giving_contribution(p_contribution_id uuid, p_church_id uuid, p_reason text default null)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.cancel_giving_contribution(p_contribution_id, p_church_id, p_reason);
$$;

revoke all on function public.cancel_giving_contribution(uuid, uuid, text) from public, anon;
grant execute on function public.cancel_giving_contribution(uuid, uuid, text) to authenticated;
