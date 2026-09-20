-- Fase 12 (Diogo) · RPC de conciliación de Giving.

create or replace function app.reconcile_giving_contribution(
  p_contribution_id uuid,
  p_church_id uuid,
  p_external_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_status giving_contribution_status;
  v_actor_id uuid;
begin
  if not app.has_capability(p_church_id, 'giving.reconcile') then
    raise exception 'No tienes permiso para conciliar aportaciones.' using errcode = '42501';
  end if;

  select status into v_status from giving_contributions where id = p_contribution_id and church_id = p_church_id;
  if v_status is null then
    raise exception 'Aportación no encontrada.' using errcode = 'P0002';
  end if;

  v_actor_id := app.current_person_id(p_church_id);

  insert into giving_reconciliations (church_id, contribution_id, external_reference, status, notes, reconciled_by_person_id)
  values (p_church_id, p_contribution_id, p_external_reference, 'reconciled', p_notes, v_actor_id)
  returning id into v_id;

  update giving_contributions set reconciliation_status = 'reconciled' where id = p_contribution_id and church_id = p_church_id;

  perform app.write_audit_log(
    p_church_id, 'giving.reconciliation.completed', 'giving_contributions', p_contribution_id,
    jsonb_build_object('reconciliation_id', v_id)
  );

  return v_id;
end;
$$;

revoke all on function app.reconcile_giving_contribution(uuid, uuid, text, text) from public, anon;
grant execute on function app.reconcile_giving_contribution(uuid, uuid, text, text) to authenticated;

create or replace function public.reconcile_giving_contribution(
  p_contribution_id uuid, p_church_id uuid, p_external_reference text default null, p_notes text default null
)
returns uuid
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.reconcile_giving_contribution(p_contribution_id, p_church_id, p_external_reference, p_notes);
$$;

revoke all on function public.reconcile_giving_contribution(uuid, uuid, text, text) from public, anon;
grant execute on function public.reconcile_giving_contribution(uuid, uuid, text, text) to authenticated;

-- ============================================================================
-- mark_giving_contribution_exception: marca una aportación como excepción
-- de conciliación (no encaja, requiere revisión manual) sin crear una fila
-- de giving_reconciliations completa (no hay referencia externa real).
-- ============================================================================

create or replace function app.mark_giving_contribution_exception(p_contribution_id uuid, p_church_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not app.has_capability(p_church_id, 'giving.reconcile') then
    raise exception 'No tienes permiso para marcar excepciones de conciliación.' using errcode = '42501';
  end if;

  if not exists (select 1 from giving_contributions where id = p_contribution_id and church_id = p_church_id) then
    raise exception 'Aportación no encontrada.' using errcode = 'P0002';
  end if;

  update giving_contributions set reconciliation_status = 'exception' where id = p_contribution_id and church_id = p_church_id;

  perform app.write_audit_log(
    p_church_id, 'giving.reconciliation.completed', 'giving_contributions', p_contribution_id,
    jsonb_build_object('status', 'exception', 'has_notes', p_notes is not null)
  );
end;
$$;

revoke all on function app.mark_giving_contribution_exception(uuid, uuid, text) from public, anon;
grant execute on function app.mark_giving_contribution_exception(uuid, uuid, text) to authenticated;

create or replace function public.mark_giving_contribution_exception(p_contribution_id uuid, p_church_id uuid, p_notes text default null)
returns void
language sql
security invoker
set search_path = pg_catalog, public
as $$
  select app.mark_giving_contribution_exception(p_contribution_id, p_church_id, p_notes);
$$;

revoke all on function public.mark_giving_contribution_exception(uuid, uuid, text) from public, anon;
grant execute on function public.mark_giving_contribution_exception(uuid, uuid, text) to authenticated;
