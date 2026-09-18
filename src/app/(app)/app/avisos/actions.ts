"use server";

import { revalidatePath } from "next/cache";
import { getTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import {
  isNotificationChannel,
  markAllNotificationsRead,
  markNotificationRead,
  setMyNotificationPreference,
  type NotificationChannel,
} from "@/server/notifications/notifications-service";

/**
 * Acciones de la bandeja de avisos. Toda entrada se valida aquí (una acción es
 * un punto de entrada público) y la base vuelve a comprobar la propiedad del
 * aviso y la pertenencia a la iglesia. El churchId nunca viene del cliente: se
 * resuelve del contexto de tenant.
 */

export type AvisoActionResult = { ok: true; updated?: number } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La campana vive en el layout de /app: se invalida también la disposición
 * para que el número de avisos sin leer se actualice en la misma respuesta.
 */
function revalidateAvisos() {
  revalidatePath("/app/avisos");
  revalidatePath("/app", "layout");
}

/** Los errores de dominio ya traen un mensaje en español; el resto se propaga. */
function fromError(error: unknown): AvisoActionResult {
  if (error instanceof DomainError) return { ok: false, error: error.message };
  throw error;
}

export async function marcarAvisoLeidoAction(notificationId: string): Promise<AvisoActionResult> {
  if (typeof notificationId !== "string" || !UUID_RE.test(notificationId)) {
    return { ok: false, error: "El aviso no es válido." };
  }
  const tenant = await getTenantContext();
  if (!tenant) return { ok: false, error: "No perteneces a ninguna iglesia." };

  try {
    await markNotificationRead(notificationId);
    revalidateAvisos();
    return { ok: true };
  } catch (error) {
    return fromError(error);
  }
}

export async function marcarTodoLeidoAction(): Promise<AvisoActionResult> {
  const tenant = await getTenantContext();
  if (!tenant) return { ok: false, error: "No perteneces a ninguna iglesia." };

  try {
    const updated = await markAllNotificationsRead(tenant.churchId);
    revalidateAvisos();
    return { ok: true, updated };
  } catch (error) {
    return fromError(error);
  }
}

export async function cambiarPreferenciaAvisoAction(
  channel: NotificationChannel,
  enabled: boolean,
): Promise<AvisoActionResult> {
  if (!isNotificationChannel(channel)) {
    return { ok: false, error: "Ese canal de avisos no existe." };
  }
  if (typeof enabled !== "boolean") {
    return { ok: false, error: "El valor de la preferencia no es válido." };
  }
  if (channel === "inapp" && !enabled) {
    return { ok: false, error: "La bandeja de la aplicación no se puede desactivar." };
  }
  const tenant = await getTenantContext();
  if (!tenant) return { ok: false, error: "No perteneces a ninguna iglesia." };

  try {
    await setMyNotificationPreference(channel, enabled);
    revalidateAvisos();
    return { ok: true };
  } catch (error) {
    return fromError(error);
  }
}
