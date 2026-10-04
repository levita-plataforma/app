"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/server/errors/domain-error";
import { blockChurchSecurity, unblockChurchSecurity } from "@/server/platform/commercial-service";

export type SeguridadState = { error: string | null; ok: string | null };

/**
 * Bloquear o desbloquear una iglesia por seguridad. La capacidad
 * (platform.church_security.manage) y la auditoría las impone la RPC; esta acción
 * solo traduce el error y refresca la ficha.
 */
export async function bloquearSeguridadAction(churchId: string, motivo: string): Promise<SeguridadState> {
  try {
    await blockChurchSecurity(churchId, motivo);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message, ok: null };
    throw err;
  }
  revalidatePath(`/operacion/iglesias/${churchId}`);
  return { error: null, ok: "Iglesia bloqueada por seguridad. Queda registrado en la auditoría." };
}

export async function desbloquearSeguridadAction(churchId: string, motivo: string): Promise<SeguridadState> {
  try {
    await unblockChurchSecurity(churchId, motivo);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message, ok: null };
    throw err;
  }
  revalidatePath(`/operacion/iglesias/${churchId}`);
  return { error: null, ok: "Iglesia desbloqueada. Queda registrado en la auditoría." };
}
