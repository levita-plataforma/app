"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

export type RegistroState = { error: string | null };

/**
 * Registro de cuenta con Supabase Auth. Solo crea la cuenta (auth.users);
 * la creación de people/church_people ocurre en el onboarding, vía
 * app.provision_church. No se crea people aquí para no duplicarla si el
 * usuario abandona antes de completar el alta. Ver docs/adr/0002.
 */
export async function registroAction(
  _prevState: RegistroState,
  formData: FormData,
): Promise<RegistroState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const termsAccepted = formData.get("terms") === "on";
  const privacyAccepted = formData.get("privacy") === "on";

  if (!email || !password) {
    return { error: "Introduce tu correo y una contraseña." };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }
  if (password !== passwordConfirm) {
    return { error: "Las contraseñas no coinciden." };
  }
  if (!termsAccepted || !privacyAccepted) {
    return { error: "Debes aceptar los términos y la política de privacidad para continuar." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (error.message.toLowerCase().includes("already registered") || error.status === 422) {
      return { error: "Ya existe una cuenta con este correo. Prueba a acceder en su lugar." };
    }
    return { error: "No se pudo crear la cuenta. Inténtalo de nuevo." };
  }

  // Si el proyecto tiene verificación de email activada, Supabase no
  // devuelve sesión hasta confirmar: en ese caso no hay nada que redirigir
  // todavía. Si la sesión ya viene creada, continuamos al onboarding.
  if (!data.session) {
    return { error: null };
  }

  redirect("/acceso/onboarding");
}
