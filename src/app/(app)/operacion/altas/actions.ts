"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

export type AltaAsistidaState = { error: string | null; invitationLink?: string };

/**
 * Alta asistida por operación LEVITA. Nunca usa service_role desde el
 * cliente: delega en app.assisted_provision_church (security definer,
 * comprueba app.is_platform_operator()). Ver encargo de Fase 1 §16.
 */
export async function crearAltaAsistidaAction(
  _prevState: AltaAsistidaState,
  formData: FormData,
): Promise<AltaAsistidaState> {
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim();
  const country = String(formData.get("country") ?? "España");
  const timezone = String(formData.get("timezone") ?? "Europe/Madrid");

  if (!name || !slug || !ownerEmail) {
    return { error: "Completa el nombre, el identificador y el correo del propietario." };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("assisted_provision_church", {
    p_name: name,
    p_slug: slug,
    p_locale: "es-ES",
    p_timezone: timezone,
    p_currency: "EUR",
    p_country: country,
    p_owner_email: ownerEmail,
  });

  if (error) {
    if (error.message.includes("FORBIDDEN")) {
      return { error: "No tienes capacidad de operación de plataforma." };
    }
    if (error.message.includes("SLUG_UNAVAILABLE")) {
      return { error: "Ese identificador ya está en uso." };
    }
    return { error: "No se pudo crear el alta asistida." };
  }

  const row = data?.[0];
  const link = row
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/acceso/invitacion/${row.out_invitation_token}`
    : undefined;

  revalidatePath("/operacion/altas");
  return { error: null, invitationLink: link };
}
