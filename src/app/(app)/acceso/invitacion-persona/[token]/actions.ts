"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

export type AceptarInvitacionPersonaState = { error: string | null };

const ERROR_MESSAGES: Record<string, string> = {
  INVITATION_NOT_FOUND: "Este enlace de invitación no es válido.",
  INVITATION_REVOKED: "Esta invitación ha sido revocada.",
  INVITATION_ALREADY_ACCEPTED: "Esta invitación ya fue utilizada.",
  INVITATION_EXPIRED: "Esta invitación ha caducado.",
  AUTH_ALREADY_LINKED: "Tu cuenta ya está vinculada a otra persona.",
  PERSON_ALREADY_LINKED: "Esta persona ya tiene una cuenta vinculada.",
};

/**
 * Acepta la invitación de una persona existente del directorio (encargo de
 * Fase 2 §16-17). A diferencia del owner de Fase 1, aquí la persona ya
 * existe: nunca se crea otra people, solo se vincula auth.uid() a la
 * persona exacta que la invitación fijó.
 */
export async function aceptarInvitacionPersonaAction(
  token: string,
  _prevState: AceptarInvitacionPersonaState,
  formData: FormData,
): Promise<AceptarInvitacionPersonaState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Introduce tu correo y una contraseña." };
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };

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

  const { error } = await supabase.rpc("accept_person_invitation", { p_token: token });

  if (error) {
    const code = Object.keys(ERROR_MESSAGES).find((c) => error.message.includes(c));
    return { error: code ? ERROR_MESSAGES[code] : "No se pudo aceptar la invitación." };
  }

  redirect("/app");
}
