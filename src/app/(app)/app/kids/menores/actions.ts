"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { getOrCreateKidsProfile } from "@/server/kids/kids-profiles-service";
import { DomainError } from "@/server/errors/domain-error";

export type MenoresState = { error: string | null; success?: boolean; personId?: string };
const OK = (personId: string): MenoresState => ({ error: null, success: true, personId });

function asState(err: unknown): MenoresState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

/**
 * "Dar de alta perfil Kids" (encargo §B) es en realidad getOrCreateKidsProfile
 * sobre una persona YA EXISTENTE en People. No hay selector sofisticado: el
 * admin introduce el person_id de una persona que ya conoce (por ejemplo,
 * copiado desde la ficha de esa persona en /app/personas), priorizando
 * simplicidad sobre un buscador propio, tal como permite el encargo.
 */
export async function altaPerfilKidsAction(_prev: MenoresState, formData: FormData): Promise<MenoresState> {
  const tenant = await requireTenantContext();
  const personId = String(formData.get("personId") ?? "").trim();
  if (!personId) return { error: "Indica el ID de la persona." };

  try {
    const profile = await getOrCreateKidsProfile(tenant.churchId, personId);
    revalidatePath("/app/kids/menores");
    revalidatePath("/app/kids");
    return OK(profile.personId);
  } catch (err) {
    return asState(err);
  }
}
