"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { auditLog } from "@/server/audit/audit-log";
import { isActivatableModuleKey } from "@/server/church/modules-catalog";

export type ModulosState = { error: string | null; success?: boolean };

/**
 * Activa un módulo que la iglesia no eligió en el onboarding. Solo activa,
 * nunca desactiva: desactivar un módulo con datos reales dentro (RLS deja
 * de dejar leer/escribir, pero nada se borra) es una decisión de producto
 * que este hotfix no toma — ver docs/13-plan-por-fases.md, hotfix del 21 de
 * septiembre de 2026. `on conflict do nothing` hace la operación idempotente
 * si el módulo ya estaba activo.
 */
export async function activarModuloAction(moduleKey: string): Promise<ModulosState> {
  const tenant = await requireTenantContext();
  await requireCapability(tenant.churchId, "modules.manage");

  if (!isActivatableModuleKey(moduleKey)) {
    return { error: "Ese módulo no está disponible todavía." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("church_modules")
    .upsert(
      { church_id: tenant.churchId, module_key: moduleKey, status: "enabled", enabled_at: new Date().toISOString() },
      { onConflict: "church_id,module_key" },
    );

  if (error) return { error: "No se pudo activar el módulo." };

  await auditLog({
    churchId: tenant.churchId,
    action: "module.enabled",
    entityType: "church_modules",
    metadata: { module_key: moduleKey },
  });

  revalidatePath("/app/configuracion/modulos");
  revalidatePath("/app");
  return { error: null, success: true };
}
