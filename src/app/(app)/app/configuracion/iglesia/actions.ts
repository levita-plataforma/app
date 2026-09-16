"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { auditLog } from "@/server/audit/audit-log";

export type ConfiguracionIglesiaState = { error: string | null; success?: boolean };

/**
 * Editar datos generales de la iglesia. Requiere church.settings.manage:
 * no todos los miembros pueden editar (ver encargo de Fase 1 §14).
 */
export async function actualizarIglesiaAction(
  _prevState: ConfiguracionIglesiaState,
  formData: FormData,
): Promise<ConfiguracionIglesiaState> {
  const tenant = await requireTenantContext();

  try {
    await requireCapability(tenant.churchId, "church.settings.manage");
  } catch {
    return { error: "No tienes permiso para editar la configuración de la iglesia." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim();
  const accentColor = String(formData.get("accentColor") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const website = String(formData.get("website") ?? "").trim();

  if (!name || !timezone || !currency) {
    return { error: "El nombre, la zona horaria y la moneda son obligatorios." };
  }

  const supabase = await createSupabaseServerClient();

  const { data: current } = await supabase
    .from("churches")
    .select("settings, branding")
    .eq("id", tenant.churchId)
    .single();

  const settings = { ...(current?.settings as Record<string, unknown> ?? {}), country, email, phone, website };
  const branding = { ...(current?.branding as Record<string, unknown> ?? {}), display_name: displayName || null, accent_color: accentColor || null };

  const { error } = await supabase
    .from("churches")
    .update({ name, timezone, currency, settings, branding })
    .eq("id", tenant.churchId);

  if (error) {
    return { error: "No se pudo guardar la configuración. Inténtalo de nuevo." };
  }

  await auditLog({
    churchId: tenant.churchId,
    action: "church.updated",
    entityType: "churches",
    entityId: tenant.churchId,
    metadata: { fields: ["name", "timezone", "currency", "settings", "branding"] },
  });

  revalidatePath("/app/configuracion/iglesia");
  return { error: null, success: true };
}
