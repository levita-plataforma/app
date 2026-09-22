"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

/**
 * Cierra la sesión del operador.
 *
 * La aplicación no tenía ninguna forma de salir: ni en el panel ni en la parte
 * de iglesia. En una consola que ve datos de todas las iglesias, y que se abre
 * desde portátiles compartidos, eso no es un detalle de comodidad.
 *
 * Solo cubre la consola. El resto de la aplicación sigue sin salida, y eso es
 * un hueco aparte que no toca arreglar desde aquí.
 */
export async function salirAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/acceso");
}
