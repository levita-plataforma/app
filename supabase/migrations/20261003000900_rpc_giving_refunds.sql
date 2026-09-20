-- Fase 12 (Diogo) · RPC de devoluciones (refunds) de Giving.
--
-- Sin provider real: refund manual exige giving.refund y queda auditado
-- (encargo §25). La suma de refunds succeeded nunca supera el importe
-- original — validado server-side, no solo en frontend (encargo §25).

create or replace function app.create_giving_refund(
  p_contribution_id uuid,
  p_church_id uuid,
  p_amount_minor bigint,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_contribution_amount bigint;
  v_contribution_status giving_contribution_status;
  v_already_refunded bigint;
  v_actor_id uuid;
begin
  if not app.has_capability(p_church_id, 'giving.refund') then
    raise exception 'No tienes permiso para registrar devoluciones.' using errcode = '42501';
  end if;

  if p_amount_minor <= 0 then
    raise exception 'El importe de la devolución debe ser mayor que cero.' using errcode = '22023';
  end if;

  select amount_minor, status into v_contribution_amount, v_contribution_status
  from giving_contributions
  where id = p_contribution_id and church_id = p_church_id
  for update;

  if v_contribution_amount is null then
    raise exception 'Aportación no encontrada.' using errcode = 'P0002';
  end if;
  if v_contribution_status not in ('succeeded', 'refunded') then
    raise exception 'Solo se puede devolver una aportación succeeded.' using errcode = '22023';
  end if;

  select coalesce(sum(amount_minor), 0) into v_already_refunded
  from giving_refunds
  where contribution_id = p_contribution_id and church_id = p_church_id and status = 'succeeded';

  if v_already_refunded + p_amount_minor > v_contribution_amount then
    raise exception 'La suma de devoluciones no puede superar el importe original de la aportación.' using errcode = '22023';
  end if;

  v_actor_id := app.current_person_id(p_church_id);

  insert into giving_refunds (church_id, contribution_id, amount_minor, reason, status, created_by_person_id)
  values (p_church_id, p_contribution_id, p_amount_minor, p_reason, 'succeeded', v_actor_id)
  returning id into v_id;

  update giving_contributions
  set status = 'refunded', updated_by_person_id = v_actor_id
  where id = p_contribution_id and church_id = p_church_id;

  perform app.write_audit_log(
    p_church_id, 'giving.contribution.refunded', 'giving_contributions', p_contribution_id,
    jsonb_build_object('refund_id', v_id, 'has_reason', p_reason is not null)
  );

  return v_id;
end;
$$;

revoke all on function app.create_giving_refund(uuid, uuid, bigint, text) from public, anon;
grant execute on function app.create_giving_refund(uuid, uuid, bigint, text) to authenticated;

create or replace function public.create_giving_refund(p_contribution_id uuid, p_church_id uuid, p_amount_minor bigint, p_reason text default null)
returns uuid
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.create_giving_refund(p_contribution_id, p_church_id, p_amount_minor, p_reason);
$$;

revoke all on function public.create_giving_refund(uuid, uuid, bigint, text) from public, anon;
grant execute on function public.create_giving_refund(uuid, uuid, bigint, text) to authenticated;
