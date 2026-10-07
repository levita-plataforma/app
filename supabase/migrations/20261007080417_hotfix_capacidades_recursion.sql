-- Hotfix: la política de lectura de platform_operator_capabilities se consultaba a
-- sí misma (EXISTS sobre la misma tabla) y Postgres la rechazaba con «infinite
-- recursion detected in policy». getOperatorContext tragaba el error y todo
-- operador veía cero capacidades: la consola no dejaba hacer nada.
--
-- La regla no cambia: cada operador lee sus propias capacidades, y quien tiene
-- platform.operators.manage lee las de todos. La comprobación de esa capacidad va
-- por app.has_platform_capability (security definer), que no vuelve a pasar por RLS.

drop policy platform_operator_capabilities_select on platform_operator_capabilities;

create policy platform_operator_capabilities_select on platform_operator_capabilities
  for select to authenticated
  using (
    user_id = auth.uid()
    or app.has_platform_capability('platform.operators.manage')
  );
