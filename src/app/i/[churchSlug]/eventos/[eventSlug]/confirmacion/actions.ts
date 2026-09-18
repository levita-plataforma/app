"use server";

import { redirect } from "next/navigation";
import { cancelRegistrationByToken } from "@/server/events/public-events-service";
import { DomainError } from "@/server/errors/domain-error";

export type CancelacionState = { error: string | null };

/**
 * Cancela una inscripción pública usando el cancelToken (nunca expuesto en
 * un enlace <a> visible/indexable: viaja en un input hidden dentro de un
 * <form> POST). Ver §37 del encargo.
 */
export async function cancelarInscripcionAction(
  churchSlug: string,
  eventSlug: string,
  _prevState: CancelacionState,
  formData: FormData,
): Promise<CancelacionState> {
  const cancelToken = String(formData.get("cancelToken") ?? "");

  if (!cancelToken) {
    return { error: "Enlace de cancelación no válido." };
  }

  let redirectTo: string | null = null;

  try {
    await cancelRegistrationByToken(cancelToken);
    redirectTo = `/i/${churchSlug}/eventos/${eventSlug}/confirmacion?cancelled=1`;
  } catch (err) {
    if (err instanceof DomainError) {
      return { error: err.message };
    }
    return { error: "No se pudo cancelar la inscripción." };
  }

  redirect(redirectTo);
}
