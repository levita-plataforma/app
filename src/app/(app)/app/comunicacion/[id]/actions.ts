"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { cancelCommunication } from "@/server/communications/communications-service";
import { DomainError } from "@/server/errors/domain-error";

export type ComunicacionDetalleState = { error: string | null };

/** Cancela una comunicación en borrador o programada (app.cancel_communication). */
export async function cancelarComunicacionAction(communicationId: string): Promise<ComunicacionDetalleState> {
  const tenant = await requireTenantContext();
  try {
    await requireCapability(tenant.churchId, "communications.schedule");
    await cancelCommunication(communicationId);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/app/comunicacion/${communicationId}`);
  revalidatePath("/app/comunicacion");
  return { error: null };
}
