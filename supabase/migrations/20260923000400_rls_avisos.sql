-- Fase 5 (DI-02) · RLS de avisos.
-- Ver docs/FASE-5-AVISOS-DISPONIBILIDAD.md §4.4.
--
-- * notifications y notification_preferences: cada persona lee SOLO las suyas.
-- * notification_events y notification_deliveries: nadie las alcanza desde el
--   cliente (ni anon ni authenticated). Solo el motor con service_role.
-- * Escritura: revocada en las cuatro tablas. Se escribe por trigger
--   (20260923000300) y por RPC / motor (20260923000500), siempre con funciones
--   security definer.
--
-- Las cuatro tablas ya tienen RLS habilitado y forzado en 20260923000200.

-- Escritura directa: revocada para todos los roles del cliente.
revoke insert, update, delete, truncate
  on notification_events, notifications, notification_deliveries, notification_preferences
  from anon, authenticated;

-- Lectura.
revoke select on notification_events, notification_deliveries from anon, authenticated;
revoke select on notifications, notification_preferences from anon;
grant select on notifications, notification_preferences to authenticated;

-- No se crea ninguna política para notification_events ni notification_deliveries:
-- sin privilegio de select y con RLS forzado, quedan fuera del alcance del
-- cliente. service_role las lee por su atributo bypassrls.

create policy notifications_select_own on notifications
  for select to authenticated
  using (
    church_id = any ((select app.church_ids_for_user())::uuid[])
    and person_id in (select app.current_person_ids())
  );

create policy notification_preferences_select_own on notification_preferences
  for select to authenticated
  using (
    church_id = any ((select app.church_ids_for_user())::uuid[])
    and person_id in (select app.current_person_ids())
  );
