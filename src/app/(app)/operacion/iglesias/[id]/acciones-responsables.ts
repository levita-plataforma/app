"use server";

import { revalidatePath } from "next/cache";
import { inviteAdmin, revokeInvitation } from "@/server/platform/platform-service";
import { DomainError } from "@/server/errors/domain-error";

/**
 * Invitar y revocar responsables desde la ficha (CA-2.4).
 *
 * La capacidad la comprueba la base. Aquí solo se traduce el error y se
 * devuelve el enlace, que es lo que hace entregable la invitación mientras no
 * haya correo.
 */

export type InvitacionState = {
  error: string | null;
  link?: string | null;
  reutilizada: boolean;
};

export async function invitarResponsableAction(
  churchId: string,
  email: string,
  rol: "church_owner" | "church_admin",
): Promise<InvitacionState> {
  try {
    const r = await inviteAdmin(churchId, email, rol);
    revalidatePath(`/operacion/iglesias/${churchId}`);
    return { error: null, link: r.link, reutilizada: r.reutilizada };
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message, reutilizada: false };
    throw err;
  }
}

export async function revocarInvitacionAction(
  invitationId: string,
  churchId: string,
  motivo: string,
): Promise<{ error: string | null }> {
  try {
    await revokeInvitation(invitationId, motivo);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/operacion/iglesias/${churchId}`);
  return { error: null };
}
