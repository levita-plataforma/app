"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

export type AceptarInvitacionState = { error: string | null };

const ERROR_MESSAGES: Record<string, string> = {
  INVITATION_NOT_FOUND: "Este enlace de invitación no es válido.",
  INVITATION_REVOKED: "Esta invitación ha sido revocada.",
  INVITATION_ALREADY_ACCEPTED: "Esta invitación ya fue utilizada.",
  INVITATION_EXPIRED: "Esta invitación ha caducado. Pide a operación que te envíe una nueva.",
};

/**
 * Acepta una invitación de alta asistida: crea la cuenta si no existe
 * (registro implícito con el email de la invitación) y llama a
 * app.accept_invitation para completar el provisioning del owner. Ver
 * encargo de Fase 1 §17 y supabase/migrations/20260917000600_alta_asistida.sql.
 */
export async function aceptarInvitacionAction(
  token: string,
  _prevState: AceptarInvitacionState,
  formData: FormData,
): Promise<AceptarInvitacionState> {
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const email = String(formData.get("email") ?? "").trim();

  if (!firstName || !password || !email) {
    return { error: "Completa tu nombre, correo y una contraseña." };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const supabase = await createSupabaseServerClient();

  const {
    data: { user: existingUser },
  } = await supabase.auth.getUser();

  if (!existingUser) {
    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      return { error: "No se pudo crear tu cuenta. Comprueba el correo y vuelve a intentarlo." };
    }
  }

  const { error } = await supabase.rpc("accept_invitation", {
    p_token: token,
    p_first_name: firstName,
    p_last_name: lastName || null,
    p_phone: null,
  });

  if (error) {
    const code = Object.keys(ERROR_MESSAGES).find((c) => error.message.includes(c));
    return { error: code ? ERROR_MESSAGES[code] : "No se pudo aceptar la invitación." };
  }

  redirect("/acceso/onboarding");
}
