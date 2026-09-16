import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/server/env";

/**
 * Cliente con service_role: se salta RLS por completo. Uso exclusivo en
 * procesos backend controlados (jobs, webhooks verificados, migraciones de
 * datos). NUNCA se importa desde una ruta que reciba un churchId del
 * cliente sin volver a validar tenant y permisos explícitamente.
 * Ver docs/05-despliegue.md y docs/16-arquitectura-multitenant.md §17.
 */
export function createSupabaseServiceRoleClient() {
  if (!env.supabaseServiceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY no está configurada. Este cliente no debe usarse en el navegador ni sin esta clave.",
    );
  }

  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
