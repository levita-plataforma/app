"use server";

import { createSupabaseServerClient } from "@/server/supabase/server-client";

export type DemoFormState = { error: string | null; success?: boolean };

export async function solicitarDemoAction(
  _prevState: DemoFormState,
  formData: FormData,
): Promise<DemoFormState> {
  const name = [String(formData.get("firstName") ?? "").trim(), String(formData.get("lastName") ?? "").trim()]
    .filter(Boolean)
    .join(" ");
  const email = String(formData.get("email") ?? "").trim();
  const organization = String(formData.get("church") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const communitySize = String(formData.get("communitySize") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!name || !email || !organization) {
    return { error: "Completa al menos tu nombre, correo e iglesia." };
  }

  const organizationWithCity = city ? `${organization} (${city})` : organization;
  const fullMessage = [phone ? `Teléfono: ${phone}` : null, message || null].filter(Boolean).join("\n");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("submit_marketing_lead", {
    p_kind: "demo",
    p_name: name,
    p_email: email,
    p_organization: organizationWithCity,
    p_community_size: communitySize || null,
    p_message: fullMessage || null,
  });

  if (error) {
    if (error.message.includes("correo no es válido")) {
      return { error: "Revisa el formato del correo electrónico." };
    }
    if (error.message.includes("demasiadas solicitudes")) {
      return { error: "Ya hemos recibido varias solicitudes con este correo. Te contactaremos pronto." };
    }
    return { error: "No se pudo enviar la solicitud. Inténtalo de nuevo en unos minutos." };
  }

  return { error: null, success: true };
}
