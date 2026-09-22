"use server";

import { revalidatePath } from "next/cache";
import { retryStorageDeletion } from "@/server/platform/operations-service";
import { DomainError } from "@/server/errors/domain-error";

export type ProcesoState = { error: string | null; hecho: boolean };

/**
 * Reintenta un borrado de fichero pendiente.
 *
 * Solo existe esta acción, y no por falta de tiempo: es la única operación de
 * la consola que se puede repetir sin arriesgar un efecto duplicado. La
 * capacidad se comprueba en la base, no aquí.
 */
export async function reintentarBorradoAction(queueId: string): Promise<ProcesoState> {
  try {
    await retryStorageDeletion(queueId);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message, hecho: false };
    throw err;
  }
  revalidatePath("/operacion/procesos");
  return { error: null, hecho: true };
}
