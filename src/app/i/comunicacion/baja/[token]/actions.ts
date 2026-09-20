"use server";

import { unsubscribeByToken, COMMUNICATION_PURPOSE_LABELS } from "@/server/communications/communications-service";
import { DomainError } from "@/server/errors/domain-error";

export type BajaState = {
  status: "idle" | "error" | "done";
  error: string | null;
  categoryLabel: string | null;
};

/**
 * Da de baja el token de unsubscribe (categoría opcional de comunicación).
 * Requiere un POST explícito del usuario (nunca se dispara en el GET de la
 * página, para no quedar expuesto a prefetch de enlaces o crawlers que
 * siguen el link del correo automáticamente). Mismo criterio que
 * cancelarInscripcionAction (Fase 6).
 *
 * La etiqueta de la categoría se resuelve aquí (server) y no en el cliente,
 * porque communications-service.ts es "server-only" y no puede importarse
 * desde un componente cliente.
 */
export async function darDeBajaAction(_prevState: BajaState, formData: FormData): Promise<BajaState> {
  const token = String(formData.get("token") ?? "");

  if (!token) {
    return { status: "error", error: "Enlace de baja no válido.", categoryLabel: null };
  }

  try {
    const { category } = await unsubscribeByToken(token);
    return { status: "done", error: null, categoryLabel: COMMUNICATION_PURPOSE_LABELS[category] };
  } catch (err) {
    if (err instanceof DomainError) {
      return { status: "error", error: err.message, categoryLabel: null };
    }
    return { status: "error", error: "No se pudo procesar la baja.", categoryLabel: null };
  }
}
