import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/server/env";

/**
 * Cliente Supabase para Server Components, Server Actions y Route Handlers.
 * Usa la sesión del usuario (rol `authenticated`): toda la autorización pasa
 * por RLS, nunca por service_role. Ver docs/adr/0013.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Se llama desde un Server Component sin poder escribir cookies;
          // el middleware ya se encarga de refrescar la sesión en ese caso.
        }
      },
    },
  });
}
