-- Fase 12 (Diogo) · RPC de resumen agregado de Giving.
--
-- Separación crítica (encargo §34/§43): quien tiene SOLO giving.read_summary
-- puede ver totales, nunca filas individuales de giving_contributions (no
-- hay política de SELECT que se lo permita, ver 20261003000500_rls_giving.sql).
-- Esta función expone únicamente sumas/conteos agregados, sin exponer
-- person_id ni ninguna fila reconocible.

create or replace function app.giving_summary(
  p_church_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb;
begin
  if not (
    app.has_capability(p_church_id, 'giving.read_summary')
    or app.has_capability(p_church_id, 'giving.read_contributions')
  ) then
    raise exception 'No tienes permiso para ver el resumen de Ofrendas.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'totalAmountMinor', coalesce(sum(amount_minor) filter (where status = 'succeeded'), 0),
    'contributionsCount', count(*) filter (where status = 'succeeded'),
    'pendingReconciliationCount', count(*) filter (where status = 'succeeded' and reconciliation_status = 'unreconciled'),
    'currency', (select currency from churches where id = p_church_id)
  ) into v_result
  from giving_contributions
  where church_id = p_church_id
    and (p_from is null or contributed_at >= p_from)
    and (p_to is null or contributed_at < p_to);

  return v_result;
end;
$$;

revoke all on function app.giving_summary(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function app.giving_summary(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.giving_summary(p_church_id uuid, p_from timestamptz default null, p_to timestamptz default null)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.giving_summary(p_church_id, p_from, p_to);
$$;

revoke all on function public.giving_summary(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.giving_summary(uuid, timestamptz, timestamptz) to authenticated;

-- ============================================================================
-- giving_summary_by_fund / giving_summary_by_method: informes básicos
-- (encargo §51), agregados, sin fila individual.
-- ============================================================================

create or replace function app.giving_summary_by_fund(p_church_id uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table (fund_id uuid, fund_name text, total_amount_minor bigint, contributions_count bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select f.id, f.name, coalesce(sum(c.amount_minor), 0), count(c.id)
  from giving_funds f
  left join giving_contributions c
    on c.fund_id = f.id and c.church_id = f.church_id and c.status = 'succeeded'
    and (p_from is null or c.contributed_at >= p_from)
    and (p_to is null or c.contributed_at < p_to)
  where f.church_id = p_church_id
    and (
      app.has_capability(p_church_id, 'giving.read_summary')
      or app.has_capability(p_church_id, 'giving.read_contributions')
    )
  group by f.id, f.name
  order by f.name;
$$;

revoke all on function app.giving_summary_by_fund(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function app.giving_summary_by_fund(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.giving_summary_by_fund(p_church_id uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table (fund_id uuid, fund_name text, total_amount_minor bigint, contributions_count bigint)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.giving_summary_by_fund(p_church_id, p_from, p_to);
$$;

revoke all on function public.giving_summary_by_fund(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.giving_summary_by_fund(uuid, timestamptz, timestamptz) to authenticated;

create or replace function app.giving_summary_by_method(p_church_id uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table (method giving_contribution_method, total_amount_minor bigint, contributions_count bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select c.method, coalesce(sum(c.amount_minor), 0), count(c.id)
  from giving_contributions c
  where c.church_id = p_church_id
    and c.status = 'succeeded'
    and (p_from is null or c.contributed_at >= p_from)
    and (p_to is null or c.contributed_at < p_to)
    and (
      app.has_capability(p_church_id, 'giving.read_summary')
      or app.has_capability(p_church_id, 'giving.read_contributions')
    )
  group by c.method
  order by c.method;
$$;

revoke all on function app.giving_summary_by_method(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function app.giving_summary_by_method(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.giving_summary_by_method(p_church_id uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table (method giving_contribution_method, total_amount_minor bigint, contributions_count bigint)
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select * from app.giving_summary_by_method(p_church_id, p_from, p_to);
$$;

revoke all on function public.giving_summary_by_method(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.giving_summary_by_method(uuid, timestamptz, timestamptz) to authenticated;
