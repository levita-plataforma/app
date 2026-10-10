"use server";

import { revalidatePath } from "next/cache";
import {
  getChurchContacts,
  inviteAdmin,
  resendInvitation,
  revokeInvitation,
} from "@/server/platform/platform-service";
import { env } from "@/server/env";
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

/**
 * Reenviar una invitación pendiente (también si ya caducó): revoca la anterior y
 * emite otra en la misma transacción. Devuelve el enlace nuevo una sola vez.
 */
export async function reenviarInvitacionAction(
  invitationId: string,
  churchId?: string,
): Promise<{ error: string | null; link?: string }> {
  try {
    const token = await resendInvitation(invitationId);
    if (churchId) revalidatePath(`/operacion/iglesias/${churchId}`);
    revalidatePath("/operacion/invitaciones");
    return { error: null, link: `${env.appUrl}/acceso/invitacion/${token}` };
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
}

/**
 * Correos de los responsables, bajo petición (CA-3.2).
 *
 * La RPC existía desde la Fase 14 y ninguna pantalla la llamaba: la ficha
 * prometía que los correos «se consultan con permiso» y no había dónde. Se pide
 * de una en una y a propósito, porque cada consulta queda registrada en la
 * auditoría: no es un dato más de la ficha.
 */
export async function verContactosAction(
  churchId: string,
): Promise<{ error: string | null; contactos?: Contacto[] }> {
  try {
    const contactos = await getChurchContacts(churchId);
    return {
      error: null,
      contactos: contactos.map((c) => ({
        personId: c.personId,
        name: c.name,
        roleKey: c.roleKey,
        email: c.email,
      })),
    };
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
}

export type Contacto = {
  personId: string;
  name: string;
  roleKey: string;
  email: string | null;
};
