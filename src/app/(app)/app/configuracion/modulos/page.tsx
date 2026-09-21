import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import { ACTIVATABLE_MODULE_KEYS, ACTIVATABLE_MODULE_DESCRIPTIONS } from "@/server/church/modules-catalog";
import ModulosManager, { type ModuloRow } from "./ModulosManager";

// NAV_ITEMS solo se usa aquí para el label (string, serializable); el icono
// (componente/función) no puede pasarse a ModulosManager, que es Client
// Component — lo resuelve él mismo por clave. Ver ModulosManager.tsx.

export default async function ConfiguracionModulosPage() {
  const tenant = await requireTenantContext();
  const canManage = await hasCapability(tenant.churchId, "modules.manage");

  const supabase = await createSupabaseServerClient();
  const { data: churchModules } = await supabase
    .from("church_modules")
    .select("module_key, status")
    .eq("church_id", tenant.churchId);

  const enabledKeys = new Set(
    (churchModules ?? []).filter((m) => m.status === "enabled" || m.status === "trial").map((m) => m.module_key as string),
  );

  const modules: ModuloRow[] = ACTIVATABLE_MODULE_KEYS.map((key) => {
    const navItem = NAV_ITEMS.find((item) => item.moduleKey === key);
    return {
      key,
      label: navItem?.label ?? key,
      description: ACTIVATABLE_MODULE_DESCRIPTIONS[key],
      enabled: enabledKeys.has(key),
    };
  });

  return (
    <>
      <section>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Módulos</h1>
        <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
          Activa módulos adicionales para {tenant.churchName}. Los módulos ya activados no se pueden
          desactivar desde aquí.
        </p>
      </section>

      <ModulosManager modules={modules} canManage={canManage} />
    </>
  );
}
