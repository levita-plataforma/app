import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente Supabase para Client Components. Solo usa las claves públicas
 * (NEXT_PUBLIC_*); toda autorización real ocurre en RLS, nunca confiando en
 * el navegador. Ver docs/adr/0013.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
