"use server";

import { revalidatePath } from "next/cache";
import { env } from "@/server/env";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

export type AltaAsistidaState = {
  error: string | null;
  invitationLink?: string;
  /** Si el identificador ya existía, a qué iglesia corresponde. */
  iglesiaExistenteId?: string;
};

/**
 * Alta asistida por operación LEVITA.
 *
 * Delega en `app.assisted_provision_church`, que es el punto único de entrada:
 * `app.platform_create_church` de la Fase 14 la llama por dentro y solo oculta
 * el token. Las dos exigen `platform.churches.create` desde CA-0.2.
 *
 * Nunca usa service_role: la autorización la hace la base.
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
    // Por código y no por texto: desde CA-0.2 el rechazo por permisos llega
    // como 42501 con el mensaje estándar del panel y ya no dice «FORBIDDEN»,
    // así que esta comprobación había dejado de encontrarlo sin que nada
    // fallara a la vista: el operador recibía «no se pudo crear», a secas.
    if (error.code === "42501") {
      return { error: "Tu cuenta no puede crear iglesias." };
    }

    if (error.message.includes("SLUG_UNAVAILABLE")) {
      // Un reintento tras un fallo de red aterriza aquí, y la iglesia puede
      // haberse creado en el primer intento. En vez de dejar al operador
      // creyendo que no existe, se busca y se enlaza.
      const { data: existente } = await supabase
        .from("churches")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();

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

  revalidatePath("/operacion/altas");
  revalidatePath("/operacion/iglesias");

  return {
    error: null,
    // env.appUrl y no process.env directo: con la variable sin definir el
    // enlace salía relativo, y pegado en un correo no lleva a ninguna parte.
    invitationLink: row ? `${env.appUrl}/acceso/invitacion/${row.out_invitation_token}` : undefined,
  };
}
