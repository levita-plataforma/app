"use server";

import { revalidatePath } from "next/cache";
import { env } from "@/server/env";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { isActivatableModuleKey } from "@/server/church/modules-catalog";

export type AltaAsistidaState = {
  error: string | null;
  invitationLink?: string;
  churchId?: string;
  /** Si el identificador ya existía, a qué iglesia corresponde. */
  iglesiaExistenteId?: string;
};

const CORE_MODULES = ["people", "serving", "events", "communications"];

/**
 * Alta asistida desde la consola de plataforma.
 *
 * Delega en `assisted_provision_church`, el punto único de alta: crea la iglesia,
 * la sede principal, la suscripción en prueba, el onboarding, los módulos (núcleo
 * más los elegidos) y la invitación del propietario, y deja auditoría de
 * plataforma. El operador nunca define la contraseña del cliente: el propietario
 * acepta la invitación y crea su cuenta.
 *
 * Nunca usa service_role: la autorización (platform.churches.create) la hace la base.
 */
export async function crearAltaAsistidaAction(
  _prevState: AltaAsistidaState,
  formData: FormData,
): Promise<AltaAsistidaState> {
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const country = String(formData.get("country") ?? "España").trim();
  const locale = String(formData.get("locale") ?? "es-ES").trim();
  const timezone = String(formData.get("timezone") ?? "Europe/Madrid").trim();
  const currency = String(formData.get("currency") ?? "EUR").trim();
  const adminEmail = String(formData.get("adminEmail") ?? "").trim();
  const ownerName = String(formData.get("ownerName") ?? "").trim();
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim();
  const modulos = formData.getAll("modules").map(String).filter(isActivatableModuleKey);

  if (!name || !slug || !ownerEmail) {
    return { error: "Completa el nombre, el identificador y el correo del propietario." };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("assisted_provision_church", {
    p_name: name,
    p_slug: slug,
    p_locale: locale,
    p_timezone: timezone,
    p_currency: currency,
    p_country: country,
    p_owner_email: ownerEmail,
    p_module_keys: [...CORE_MODULES, ...modulos],
    p_owner_name: ownerName || undefined,
    p_admin_email: adminEmail || undefined,
  });

  if (error) {
    // Por código y no por texto: el rechazo por permisos llega como 42501.
    if (error.code === "42501") {
      return { error: "Tu cuenta no puede crear iglesias." };
    }
    if (error.code === "22023") {
      return { error: error.message };
    }
    if (error.message.includes("SLUG_UNAVAILABLE")) {
      // Un reintento tras un fallo de red aterriza aquí, y la iglesia puede
      // haberse creado en el primer intento: se busca y se enlaza.
      const { data: existente } = await supabase.from("churches").select("id").eq("slug", slug).maybeSingle();
      return {
        error: existente
          ? "Ese identificador ya está en uso. Si acabas de intentarlo y falló, puede que la iglesia se creara igualmente: ábrela para comprobarlo."
          : "Ese identificador ya está en uso.",
        iglesiaExistenteId: existente?.id,
      };
    }
    return { error: "No se pudo crear el alta asistida." };
  }

  const row = data?.[0];

  revalidatePath("/operacion");
  revalidatePath("/operacion/iglesias");

  // El wrapper público devuelve invitation_token (sin el prefijo out_ de la
  // función interna). Antes se leía out_invitation_token y el enlace salía
  // terminado en «undefined».
  return {
    error: null,
    churchId: row?.church_id,
    invitationLink: row?.invitation_token ? `${env.appUrl}/acceso/invitacion/${row.invitation_token}` : undefined,
  };
}
