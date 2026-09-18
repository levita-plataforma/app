import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Slug público de evento (Fase 6). El slug es único por iglesia (no global):
 * la URL pública compone slug de iglesia + slug de evento. La constraint
 * `events_church_public_slug_key` (unique (church_id, public_slug)) es la
 * última defensa en base de datos; esta función solo reduce la probabilidad
 * de colisión antes del INSERT. Ver ADR 0018 y migración
 * 20260924000100_events.sql.
 */

/**
 * Palabras que un slug de evento nunca puede ser, para no colisionar con
 * rutas reales de la app pública (incluida la sub-ruta `/ics` bajo el slug
 * de evento, planeada para el feed de calendario).
 */
export const RESERVED_SLUGS = [
  "nuevo",
  "admin",
  "api",
  "login",
  "registro",
  "configuracion",
  "ics",
] as const;

/** Mismo patrón que `slugify` de src/server/serving/service-areas-service.ts. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Genera un slug probablemente único a partir del título, añadiendo un
 * sufijo numérico incremental en caso de colisión contra `events.public_slug`
 * para esta iglesia. La constraint de base de datos sigue siendo la garantía
 * final ante condiciones de carrera.
 */
export async function generateUniqueEventSlug(
  churchId: string,
  baseTitle: string,
  supabaseClient: SupabaseClient<Database>,
): Promise<string> {
  const base = slugify(baseTitle) || `evento-${Date.now()}`;
  let candidate = base;
  let suffix = 2;

  // Límite de seguridad para no bucear indefinidamente ante datos anómalos.
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!(RESERVED_SLUGS as readonly string[]).includes(candidate)) {
      const { data } = await supabaseClient
        .from("events")
        .select("id")
        .eq("church_id", churchId)
        .eq("public_slug", candidate)
        .maybeSingle();

      if (!data) return candidate;
    }

    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return `${base}-${Date.now()}`;
}
