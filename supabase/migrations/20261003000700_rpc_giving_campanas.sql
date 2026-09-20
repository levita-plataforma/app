-- Fase 12 (Diogo) · RPC de campañas de Giving.

create or replace function app.create_giving_campaign(
  p_church_id uuid,
  p_fund_id uuid,
  p_name text,
  p_description text default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_target_amount_minor bigint default null,
  p_currency text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_currency text;
  v_fund_church uuid;
begin
  if not app.has_capability(p_church_id, 'giving.manage_campaigns') then
    raise exception 'No tienes permiso para crear campañas.' using errcode = '42501';
  end if;

  perform app.require_giving_module(p_church_id);

  select church_id into v_fund_church from giving_funds where id = p_fund_id and church_id = p_church_id and status = 'active';
  if v_fund_church is null then
    raise exception 'El fondo indicado no existe o no está activo.' using errcode = 'P0002';
  end if;

  -- Moneda: hereda churches.currency si no se especifica (encargo §10),
  -- nunca EUR hardcodeado.
  if p_currency is null then
    select currency into v_currency from churches where id = p_church_id;
  else
    v_currency := p_currency;
  end if;

  insert into giving_campaigns (
    church_id, fund_id, name, description, starts_at, ends_at, target_amount_minor, currency
  ) values (
    p_church_id, p_fund_id, p_name, p_description, p_starts_at, p_ends_at, p_target_amount_minor, v_currency
  )
  returning id into v_id;

  perform app.write_audit_log(
    p_church_id, 'giving.campaign.created', 'giving_campaigns', v_id, jsonb_build_object('name', p_name, 'fund_id', p_fund_id)
  );

  return v_id;
end;
$$;

revoke all on function app.create_giving_campaign(uuid, uuid, text, text, timestamptz, timestamptz, bigint, text) from public, anon;
grant execute on function app.create_giving_campaign(uuid, uuid, text, text, timestamptz, timestamptz, bigint, text) to authenticated;

create or replace function public.create_giving_campaign(
  p_church_id uuid, p_fund_id uuid, p_name text, p_description text default null,
  p_starts_at timestamptz default null, p_ends_at timestamptz default null,
  p_target_amount_minor bigint default null, p_currency text default null
)
returns uuid
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.create_giving_campaign(p_church_id, p_fund_id, p_name, p_description, p_starts_at, p_ends_at, p_target_amount_minor, p_currency);
$$;

revoke all on function public.create_giving_campaign(uuid, uuid, text, text, timestamptz, timestamptz, bigint, text) from public, anon;
grant execute on function public.create_giving_campaign(uuid, uuid, text, text, timestamptz, timestamptz, bigint, text) to authenticated;

-- ============================================================================
-- update_giving_campaign
-- ============================================================================

create or replace function app.update_giving_campaign(
  p_campaign_id uuid,
  p_church_id uuid,
  p_name text,
  p_description text default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_target_amount_minor bigint default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status giving_campaign_status;
begin
  if not app.has_capability(p_church_id, 'giving.manage_campaigns') then
    raise exception 'No tienes permiso para editar campañas.' using errcode = '42501';
  end if;

  select status into v_status from giving_campaigns where id = p_campaign_id and church_id = p_church_id;
  if v_status is null then
    raise exception 'Campaña no encontrada.' using errcode = 'P0002';
  end if;
  if v_status = 'archived' then
    raise exception 'No se puede editar una campaña archivada.' using errcode = '22023';
  end if;

  update giving_campaigns set
    name = p_name, description = p_description, starts_at = p_starts_at,
    ends_at = p_ends_at, target_amount_minor = p_target_amount_minor
  where id = p_campaign_id and church_id = p_church_id;

  perform app.write_audit_log(p_church_id, 'giving.campaign.updated', 'giving_campaigns', p_campaign_id, jsonb_build_object('name', p_name));
end;
$$;

revoke all on function app.update_giving_campaign(uuid, uuid, text, text, timestamptz, timestamptz, bigint) from public, anon;
grant execute on function app.update_giving_campaign(uuid, uuid, text, text, timestamptz, timestamptz, bigint) to authenticated;

create or replace function public.update_giving_campaign(
  p_campaign_id uuid, p_church_id uuid, p_name text, p_description text default null,
  p_starts_at timestamptz default null, p_ends_at timestamptz default null, p_target_amount_minor bigint default null
)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.update_giving_campaign(p_campaign_id, p_church_id, p_name, p_description, p_starts_at, p_ends_at, p_target_amount_minor);
$$;

revoke all on function public.update_giving_campaign(uuid, uuid, text, text, timestamptz, timestamptz, bigint) from public, anon;
grant execute on function public.update_giving_campaign(uuid, uuid, text, text, timestamptz, timestamptz, bigint) to authenticated;

-- ============================================================================
-- transition_giving_campaign_status: draft->active->closed->archived,
-- matriz simple (encargo §7: "não criar dezenas de estados").
-- ============================================================================

create or replace function app.transition_giving_campaign_status(
  p_campaign_id uuid,
  p_church_id uuid,
  p_status giving_campaign_status
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current giving_campaign_status;
  v_valid boolean;
begin
  if not app.has_capability(p_church_id, 'giving.manage_campaigns') then
    raise exception 'No tienes permiso para cambiar el estado de la campaña.' using errcode = '42501';
  end if;

  select status into v_current from giving_campaigns where id = p_campaign_id and church_id = p_church_id;
  if v_current is null then
    raise exception 'Campaña no encontrada.' using errcode = 'P0002';
  end if;

  v_valid := (v_current = 'draft' and p_status = 'active')
    or (v_current = 'active' and p_status = 'closed')
    or (v_current in ('draft', 'closed') and p_status = 'archived')
    or (v_current = 'closed' and p_status = 'active');

  if not v_valid then
    raise exception 'Transición de estado no permitida: % -> %', v_current, p_status using errcode = '22023';
  end if;

  update giving_campaigns
  set status = p_status, archived_at = case when p_status = 'archived' then now() else archived_at end
  where id = p_campaign_id and church_id = p_church_id;

  perform app.write_audit_log(
    p_church_id,
    case p_status when 'closed' then 'giving.campaign.closed' else 'giving.campaign.updated' end,
    'giving_campaigns', p_campaign_id, jsonb_build_object('from', v_current, 'to', p_status)
  );
end;
$$;

revoke all on function app.transition_giving_campaign_status(uuid, uuid, giving_campaign_status) from public, anon;
grant execute on function app.transition_giving_campaign_status(uuid, uuid, giving_campaign_status) to authenticated;

create or replace function public.transition_giving_campaign_status(p_campaign_id uuid, p_church_id uuid, p_status giving_campaign_status)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.transition_giving_campaign_status(p_campaign_id, p_church_id, p_status);
$$;

revoke all on function public.transition_giving_campaign_status(uuid, uuid, giving_campaign_status) from public, anon;
grant execute on function public.transition_giving_campaign_status(uuid, uuid, giving_campaign_status) to authenticated;
