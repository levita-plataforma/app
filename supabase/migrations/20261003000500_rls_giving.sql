-- Fase 12 (Diogo) · RLS de Giving. Toda escritura pasa por RPC security
-- definer (ver 20261003000600+): estas políticas solo cubren lectura
-- directa desde el cliente autenticado, y separan explícitamente resumen
-- de detalle (encargo §34/§43): quien solo tiene giving.read_summary NO
-- puede leer filas de giving_contributions directamente, únicamente
-- agregados vía RPC (app.giving_summary, sin política de SELECT que lo
-- sustituya).

create policy giving_funds_select on giving_funds
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      (select app.has_capability(church_id, 'giving.read_summary'))
      or (select app.has_capability(church_id, 'giving.read_contributions'))
      or (select app.has_capability(church_id, 'giving.manage_funds'))
    )
  );

create policy giving_campaigns_select on giving_campaigns
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (
      (select app.has_capability(church_id, 'giving.read_summary'))
      or (select app.has_capability(church_id, 'giving.read_contributions'))
      or (select app.has_capability(church_id, 'giving.manage_campaigns'))
    )
  );

-- giving_contributions: SOLO quien tiene el detalle financiero
-- (giving.read_contributions). Quien solo tiene giving.read_summary NUNCA
-- lee filas individuales por esta vía — ni por error de UI, porque no hay
-- política que se lo permita (encargo §43: "não mostrar lista de doadores").
create policy giving_contributions_select on giving_contributions
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'giving.read_contributions'))
  );

create policy giving_refunds_select on giving_refunds
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'giving.read_contributions'))
  );

create policy giving_recurring_plans_select on giving_recurring_plans
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'giving.read_contributions'))
  );

create policy giving_reconciliations_select on giving_reconciliations
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'giving.read_contributions'))
  );

-- Privilegios por defecto: revoke explícito, mismo patrón ya consolidado
-- (y ya encontrado roto dos veces en este repo si no se repite en cada
-- fase: 20260930000300_hotfix_revokes_wrappers_publicos.sql).
revoke insert, update, delete, truncate, select on
  giving_funds, giving_campaigns, giving_contributions, giving_refunds,
  giving_recurring_plans, giving_reconciliations
from anon;

revoke insert, update, delete, truncate on
  giving_funds, giving_campaigns, giving_contributions, giving_refunds,
  giving_recurring_plans, giving_reconciliations
from authenticated;
