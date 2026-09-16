import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { DomainError } from "@/server/errors/domain-error";
import { logger } from "@/server/logger/logger";

export type ChurchMembership = {
  churchId: string;
  churchName: string;
  churchSlug: string;
  personId: string;
  relationship: string;
};

export type TenantContext = {
  userId: string;
  memberships: ChurchMembership[];
  churchId: string;
  churchName: string;
  churchSlug: string;
  campusId?: string;
  personId: string;
};

/**
 * Resuelve el contexto de tenant activo para la petición actual: cuenta,
 * pertenencias disponibles, iglesia activa y persona local. Es el único
 * punto de la aplicación que resuelve esto — nunca se duplica esta lógica
 * en cada ruta. Ver Fase 0 §22.
 *
 * El churchId "activo" nunca se toma de un parámetro de cliente sin
 * validar que está entre las pertenencias reales del usuario: eso es lo
 * que impide que un church_id enviado por el navegador actúe como
 * credencial (ver docs/adr/0001 y docs/16-arquitectura-multitenant.md §4).
 */
export const getTenantContext = cache(async function getTenantContext(
  requestedChurchId?: string,
): Promise<TenantContext | null> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const memberships = await loadMemberships(supabase);

  if (memberships.length === 0) {
    logger.warn("Usuario autenticado sin pertenencias a ninguna iglesia", {
      userId: user.id,
    });
    return null;
  }

  const active =
    memberships.find((m) => m.churchId === requestedChurchId) ?? memberships[0];

  return {
    userId: user.id,
    memberships,
    churchId: active.churchId,
    churchName: active.churchName,
    churchSlug: active.churchSlug,
    personId: active.personId,
  };
});

async function loadMemberships(
  supabase: SupabaseClient,
): Promise<ChurchMembership[]> {
  // RLS de church_people permite ver TODAS las pertenencias de una iglesia
  // a la que el usuario pertenece (es el directorio interno), no solo la
  // propia. Por eso hay que filtrar explícitamente por las personas
  // vinculadas a la cuenta actual, nunca asumir que la primera fila
  // devuelta es "la mía". Ver docs/adr/0002.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: ownPeople, error: peopleError } = await supabase
    .from("people")
    .select("id")
    .eq("user_id", user.id);

  if (peopleError) {
    logger.error("No se pudo resolver la persona del usuario", {
      error: peopleError.message,
    });
    return [];
  }

  const ownPersonIds = (ownPeople ?? []).map((p) => p.id as string);
  if (ownPersonIds.length === 0) return [];

  const { data, error } = await supabase
    .from("church_people")
    .select("church_id, person_id, relationship, churches(name, slug)")
    .in("person_id", ownPersonIds)
    .is("archived_at", null);

  if (error) {
    logger.error("No se pudieron resolver las pertenencias del usuario", {
      error: error.message,
    });
    return [];
  }

  return (data ?? []).map((row) => {
    const church = Array.isArray(row.churches) ? row.churches[0] : row.churches;
    return {
      churchId: row.church_id as string,
      churchName: (church?.name as string) ?? "",
      churchSlug: (church?.slug as string) ?? "",
      personId: row.person_id as string,
      relationship: row.relationship as string,
    };
  });
}

/**
 * Variante que lanza si no hay contexto de tenant, para usar en rutas que
 * lo requieren obligatoriamente. Ver código de error TENANT_CONTEXT_REQUIRED
 * en Fase 0 §20.
 */
export async function requireTenantContext(
  requestedChurchId?: string,
): Promise<TenantContext> {
  const context = await getTenantContext(requestedChurchId);
  if (!context) {
    throw new DomainError(
      "TENANT_CONTEXT_REQUIRED",
      "No se pudo resolver una iglesia activa para este usuario.",
    );
  }
  return context;
}
