-- Fase 9 (Diogo) · RLS de comunicaciones, segmentos, plantillas y
-- destinatarios. Toda escritura pasa por RPC security definer (ver
-- 20260931000600): las políticas de aquí solo cubren lectura directa desde
-- el cliente autenticado, y ninguna cubre anon (no hay superficie pública en
-- esta fase, a diferencia de Fase 6).

-- communications --------------------------------------------------------------
create policy communications_select on communications
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'communications.read'))
  );

-- Sin política de insert/update/delete directa: create/materialize/send/
-- cancel viven en app.* (security definer), invocadas vía sus wrappers
-- public.*. Confirmado por revoke explícito más abajo.

-- communication_segments -------------------------------------------------------
create policy communication_segments_select on communication_segments
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'communications.read'))
  );

-- communication_templates -------------------------------------------------------
create policy communication_templates_select on communication_templates
  for select to authenticated
  using (
    church_id = any((select app.church_ids_for_user())::uuid[])
    and (select app.has_capability(church_id, 'communications.read'))
  );

-- communication_recipients: SIN política de select directa (igual que
-- notification_deliveries de Fase 5) — contiene PII masiva (persona x canal
-- x comunicación) y solo se expone mediante agregados
-- (app.preview_communication_segment / RPC de métricas), nunca fila por fila
-- desde el cliente.

-- Privilegios por defecto: toda tabla nueva en public recibe
-- INSERT/UPDATE/DELETE/SELECT por defecto para anon y authenticated (bug real
-- confirmado y corregido ya dos veces en este repo — Fase 6
-- 20260925000500_hotfix_privilegios_fase6.sql y Fase 9-marketing
-- 20260926000100_marketing_leads.sql). Se revoca explícitamente, no basta con
-- las políticas de arriba.
revoke insert, update, delete, truncate, select on
  communications, communication_segments, communication_templates, communication_recipients
from anon;

revoke insert, update, delete, truncate on
  communications, communication_segments, communication_templates, communication_recipients
from authenticated;

revoke select on communication_recipients from authenticated;
