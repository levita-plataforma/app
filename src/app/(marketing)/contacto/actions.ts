"use server";

import { createSupabaseServerClient } from "@/server/supabase/server-client";

export type ContactoFormState = { error: string | null; success?: boolean };

export async function enviarContactoAction(
  _prevState: ContactoFormState,
  formData: FormData,
): Promise<ContactoFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!name || !email || !message) {
    return { error: "Completa tu nombre, correo y mensaje." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_marketing_lead", {
    p_kind: "contacto",
    p_name: name,
    p_email: email,
    p_organization: null,
    p_community_size: null,
    p_message: message,
  });

  if (error) {
    if (error.message.includes("correo no es válido")) {
      return { error: "Revisa el formato del correo electrónico." };
    }
    if (error.message.includes("demasiadas solicitudes")) {
      return { error: "Ya hemos recibido varios mensajes con este correo. Te contactaremos pronto." };
    }
    return { error: "No se pudo enviar el mensaje. Inténtalo de nuevo en unos minutos." };
  }

  return { error: null, success: true };
}
