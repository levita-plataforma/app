"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/server/errors/domain-error";
import { setModule } from "@/server/platform/platform-service";

export type PanelState = { error: string | null; ok: string | null };

/**
 * Cambiar un módulo de una iglesia desde el panel.
 *
 * La capacidad la comprueba la RPC, no esta acción: una server action es código
 * del servidor, pero su entrada la elige quien llama, así que la autorización
 * tiene que estar donde no se pueda rodear.
 *
 * El destino tampoco se confía: la RPC recibe el church_id y comprueba que
 * existe; manipularlo desde el navegador no lleva a ninguna iglesia distinta de
 * la que el operador está autorizado a tocar, porque la capacidad no es por
 * iglesia sino de plataforma, y lo que se registra es exactamente sobre cuál se
 * actuó.
 */
export async function cambiarModuloAction(_prev: PanelState, formData: FormData): Promise<PanelState> {
  const churchId = String(formData.get("churchId") ?? "");
  const moduleKey = String(formData.get("moduleKey") ?? "");
  const activar = String(formData.get("activar") ?? "") === "1";
  const motivo = String(formData.get("motivo") ?? "").trim();

  if (!churchId || !moduleKey) {
    return { error: "Falta la iglesia o el módulo.", ok: null };
  }

  try {
    await setModule(churchId, moduleKey, activar, motivo || undefined);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message, ok: null };
    return { error: "No se pudo cambiar el módulo.", ok: null };
  }

  revalidatePath(`/operacion/iglesias/${churchId}`);
  return {
    error: null,
    ok: activar ? "Módulo activado." : "Módulo desactivado. Los datos se conservan.",
  };
}
