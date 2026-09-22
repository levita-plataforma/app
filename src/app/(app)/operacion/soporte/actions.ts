"use server";

import { revalidatePath } from "next/cache";
import { openSupportSession, revokeSupportSession } from "@/server/platform/operations-service";
import { DomainError } from "@/server/errors/domain-error";

export type SoporteState = { error: string | null; ok: boolean };

/**
 * Abre una sesión de soporte sobre una iglesia. El ámbito no se pide por
 * parámetro: solo existe el de diagnóstico, y dejar elegir daría a entender que
 * hay otros disponibles.
 */
export async function abrirSesionAction(
  churchId: string,
  motivo: string,
  minutos: number,
): Promise<SoporteState> {
  try {
    await openSupportSession(churchId, motivo, minutos);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message, ok: false };
    throw err;
  }
  revalidatePath("/operacion/soporte");
  revalidatePath(`/operacion/iglesias/${churchId}`);
  return { error: null, ok: true };
}

/** Revoca una sesión. Deja de valer en la comprobación siguiente, no al caducar. */
export async function revocarSesionAction(sessionId: string, motivo: string): Promise<SoporteState> {
  try {
    await revokeSupportSession(sessionId, motivo);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message, ok: false };
    throw err;
  }
  revalidatePath("/operacion/soporte");
  return { error: null, ok: true };
}
