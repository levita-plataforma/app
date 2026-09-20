-- Fase 12 (Diogo) · Capabilities de Giving.
--
-- REGLA CRÍTICA (encargo §0/§33, D10 en docs/07-decisiones.md): Giving es
-- dominio sensible. church_owner/church_admin NO reciben automáticamente
-- acceso a donaciones individuales solo por ser owner/admin. La inserción
-- de capabilities de Fase 0 en role_capabilities (`select 'church_owner',
-- key from capabilities`) fue un seed de UNA SOLA VEZ contra las
-- capabilities que existían entonces — cada fase posterior concede
-- explícitamente lo suyo a los roles que corresponda (confirmado
-- inspeccionando 20261001000400_capabilities_comunicaciones.sql y
-- 20261002000200_capabilities_alabanza.sql: ninguna repite ese `select *
-- from capabilities`). Aquí se aplica ese mismo criterio de forma
-- deliberadamente MÁS estricta: ni siquiera church_owner recibe las
-- capabilities de detalle financiero por defecto.

insert into capabilities (key, description, module_key) values
  ('giving.read_summary', 'Ver totales agregados de Giving (sin desglose por donante)', 'giving'),
  ('giving.read_contributions', 'Ver el detalle de aportaciones individuales, incluida la persona asociada', 'giving'),
  ('giving.manage_funds', 'Crear, editar y archivar fondos', 'giving'),
  ('giving.manage_campaigns', 'Crear, editar, activar y cerrar campañas', 'giving'),
  ('giving.create_contribution', 'Registrar una aportación manual', 'giving'),
  ('giving.update_contribution', 'Editar una aportación existente', 'giving'),
  ('giving.refund', 'Registrar una devolución de aportación', 'giving'),
  ('giving.reconcile', 'Marcar aportaciones como conciliadas', 'giving'),
  ('giving.export', 'Exportar aportaciones a CSV', 'giving'),
  ('giving.manage_settings', 'Gestionar configuración de Giving (fondo por defecto, moneda)', 'giving');

-- `finance_manager` ya existe como rol desde la Fase 0
-- (20260916000700_rbac_capabilities_scopes.sql), sin ninguna capability
-- concedida hasta ahora. Es el rol que este encargo pide reutilizar en vez
-- de crear uno nuevo (§32). Recibe TODAS las capabilities de Giving.
insert into role_capabilities (role_key, capability_key)
select 'finance_manager', key from capabilities where key like 'giving.%';

-- church_owner y church_admin reciben SOLO lo administrativo/estructural
-- (fondos, campañas, ajustes) y el resumen agregado — NUNCA el detalle de
-- aportaciones individuales ni exportación ni refund/reconciliación por
-- defecto. Esto es una decisión deliberada de este encargo, no un olvido:
-- quien administra la iglesia en general no ve automáticamente quién donó
-- cuánto. Para que un owner vea detalle financiero, se le concede
-- explícitamente `finance_manager` (o las capabilities sueltas) como
-- segunda asignación de rol — la misma persona puede tener varios roles.
insert into role_capabilities (role_key, capability_key) values
  ('church_owner', 'giving.read_summary'),
  ('church_owner', 'giving.manage_funds'),
  ('church_owner', 'giving.manage_campaigns'),
  ('church_owner', 'giving.manage_settings'),
  ('church_admin', 'giving.read_summary'),
  ('church_admin', 'giving.manage_funds'),
  ('church_admin', 'giving.manage_campaigns'),
  ('church_admin', 'giving.manage_settings');

-- app.require_giving_module(): mismo patrón que app.require_serving_module
-- (Fase 4) / app.require_groups_module (Fase 7).
create or replace function app.require_giving_module(p_church_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not app.module_enabled(p_church_id, 'giving') then
    raise exception 'El módulo de Ofrendas no está activo en esta iglesia.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function app.require_giving_module(uuid) from public, anon;
grant execute on function app.require_giving_module(uuid) to authenticated;
