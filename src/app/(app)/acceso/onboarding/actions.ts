"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { provisionChurch, checkSlugAvailable, slugify } from "@/server/church/provisioning-service";
import { advanceOnboardingStep } from "@/server/onboarding/onboarding-service";
import { requireCapability } from "@/server/tenant/authorize";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { auditLog } from "@/server/audit/audit-log";

export type OnboardingState = { error: string | null; success?: boolean };

/**
 * Módulos que el paso "modules" del onboarding puede activar, además del
 * núcleo fijo del provisioning (people/serving/events/communications). Debe
 * coincidir con AVAILABLE_MODULES de PasoModulos.tsx: un módulo sin ruta
 * funcional real detrás (placeholder, como pastoral/integrations) no debe
 * poder activarse desde aquí aunque el formulario llegue manipulado, porque
 * `church_modules` no lo valida por sí sola — solo comprueba la FK contra el
 * catálogo `modules`, que incluye los 13 módulos aunque cuatro sigan sin
 * construir.
 */
const ONBOARDING_SELECTABLE_MODULES = new Set([
  "groups",
  "discipleship",
  "kids",
  "worship",
  "giving",
  "facilities",
  "analytics",
]);

/**
 * Paso "church + campus + profile": el primer envío del wizard crea la
 * iglesia completa (ver app.provision_church). Los pasos "branding" y
 * "modules" ocurren después, sobre la iglesia ya creada.
 */
export async function crearIglesiaAction(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const country = String(formData.get("country") ?? "España");
  const timezone = String(formData.get("timezone") ?? "Europe/Madrid");
  const ownerFirstName = String(formData.get("ownerFirstName") ?? "").trim();
  const ownerLastName = String(formData.get("ownerLastName") ?? "").trim();
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim();
  const ownerPhone = String(formData.get("ownerPhone") ?? "").trim() || undefined;
  const campusAddress = String(formData.get("campusAddress") ?? "").trim() || undefined;
  const campusCity = String(formData.get("campusCity") ?? "").trim() || undefined;
  const campusProvince = String(formData.get("campusProvince") ?? "").trim() || undefined;
  const campusPostalCode = String(formData.get("campusPostalCode") ?? "").trim() || undefined;
  const idempotencyKey = String(formData.get("idempotencyKey") ?? "");

  if (!name || !slug || !ownerFirstName || !ownerEmail) {
    return { error: "Completa los campos obligatorios: nombre de la iglesia, identificador, nombre y correo del propietario." };
  }

  try {
    const result = await provisionChurch({
      name,
      slug,
      locale: "es-ES",
      timezone,
      currency: "EUR",
      country,
      ownerFirstName,
      ownerLastName,
      ownerEmail,
      ownerPhone,
      campusAddress,
      campusCity,
      campusProvince,
      campusPostalCode,
      idempotencyKey,
    });

    await advanceOnboardingStep(result.churchId, "church");
    await advanceOnboardingStep(result.churchId, "campus");
    await advanceOnboardingStep(result.churchId, "profile");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo crear la iglesia." };
  }

  revalidatePath("/acceso/onboarding");
  redirect("/acceso/onboarding");
}

export async function comprobarSlugAction(name: string): Promise<{ slug: string; available: boolean }> {
  const slug = await slugify(name);
  if (!slug) return { slug: "", available: false };
  const available = await checkSlugAvailable(slug);
  return { slug, available };
}

/**
 * Paso "branding": guarda nombre visible, color de acento y logo (URL de
 * archivo ya subido; la subida en sí se apoya en la capa de archivos de
 * Fase 0, fuera de alcance detallar aquí).
 */
export async function guardarBrandingAction(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const tenant = await requireTenantContext();
  await requireCapability(tenant.churchId, "church.settings.manage");

  const displayName = String(formData.get("displayName") ?? "").trim();
  const accentColor = String(formData.get("accentColor") ?? "").trim();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("churches")
    .update({
      branding: { display_name: displayName || null, accent_color: accentColor || null },
    })
    .eq("id", tenant.churchId);

  if (error) {
    return { error: "No se pudo guardar la personalización visual." };
  }

  await auditLog({
    churchId: tenant.churchId,
    action: "church.updated",
    entityType: "churches",
    entityId: tenant.churchId,
    metadata: { field: "branding" },
  });

  await advanceOnboardingStep(tenant.churchId, "branding");
  revalidatePath("/acceso/onboarding");
  redirect("/acceso/onboarding");
}

/**
 * Paso "modules": guarda qué módulos, además del núcleo activado en el
 * provisioning, quiere activar la iglesia desde el arranque.
 */
export async function guardarModulosAction(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const tenant = await requireTenantContext();
  await requireCapability(tenant.churchId, "modules.manage");

  const selectedModules = formData
    .getAll("modules")
    .map(String)
    .filter((key) => ONBOARDING_SELECTABLE_MODULES.has(key));

  const supabase = await createSupabaseServerClient();
  for (const moduleKey of selectedModules) {
    await supabase
      .from("church_modules")
      .upsert(
        { church_id: tenant.churchId, module_key: moduleKey, status: "enabled", enabled_at: new Date().toISOString() },
        { onConflict: "church_id,module_key" },
      );
  }

  await auditLog({
    churchId: tenant.churchId,
    action: "module.enabled",
    entityType: "church_modules",
    metadata: { module_keys: selectedModules },
  });

  await advanceOnboardingStep(tenant.churchId, "modules");
  revalidatePath("/acceso/onboarding");
  redirect("/acceso/onboarding");
}

export async function finalizarOnboardingAction(): Promise<void> {
  const tenant = await requireTenantContext();
  await advanceOnboardingStep(tenant.churchId, "finish");
  redirect("/app");
}
