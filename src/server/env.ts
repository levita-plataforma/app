import "server-only";

/**
 * Valida la configuración de entorno al arrancar. La aplicación debe fallar
 * de forma clara si falta una variable crítica, en vez de fallar tarde con
 * un error confuso en tiempo de ejecución. Ver Fase 0 §32.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno obligatoria "${name}". Copia .env.example a .env.local y complétala.`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  /** URL pública del sitio de marketing. Hoy el mismo dominio que appUrl. */
  marketingUrl: process.env.NEXT_PUBLIC_MARKETING_URL ?? "http://localhost:3000",
  nodeEnv: process.env.NODE_ENV ?? "development",
  /** Secreto de la tarea programada de avisos. Sin él, la ruta no hace nada. */
  cronSecret: process.env.CRON_SECRET,
  /** Transporte externo de avisos: "disabled" (por defecto) deja las entregas en cola. */
  notificationsTransport: process.env.NOTIFICATIONS_TRANSPORT ?? "disabled",
} as const;
