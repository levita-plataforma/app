"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

export type AccesoState = { error: string | null };

/**
 * Acceso con contraseña, consistente con el funcionamiento existente de
 * Calserv (ver docs/adr/0016: se conserva el comportamiento de acceso
 * aunque la identidad visual cambie). La propuesta histórica de enlace
 * mágico queda descartada por decisión ya registrada en docs/07-decisiones.md.
 */
export async function signInAction(
  _prevState: AccesoState,
  formData: FormData,
): Promise<AccesoState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Introduce tu correo y contraseña." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "No hemos podido verificar tus datos. Revisa el correo y la contraseña." };
  }

  redirect("/app");
}
