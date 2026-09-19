"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { setCommunicationCategoryPreference, type OptionalCommunicationPurpose } from "@/server/communications/communications-service";
import { DomainError } from "@/server/errors/domain-error";

export type PreferenciaCategoriaResult = { ok: true } | { ok: false; error: string };

/**
 * Cambia la preferencia propia (persona autenticada, sin necesidad de
 * token) para una categoría opcional de comunicación. Nunca acepta
 * institutional/operational/system: la RPC (app.set_communication_category_preference)
 * las rechaza igualmente, esto es solo la primera capa.
 */
export async function cambiarPreferenciaCategoriaAction(
  category: OptionalCommunicationPurpose,
  optedOut: boolean,
): Promise<PreferenciaCategoriaResult> {
  const tenant = await requireTenantContext();
  try {
    await setCommunicationCategoryPreference(tenant.churchId, category, optedOut);
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath("/app/comunicacion/preferencias");
  return { ok: true };
}
