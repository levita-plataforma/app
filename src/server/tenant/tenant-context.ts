import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { DomainError } from "@/server/errors/domain-error";
import { logger } from "@/server/logger/logger";

/** Cookie con la iglesia activa elegida por el usuario. Se valida siempre contra sus membresías. */
export const ACTIVE_CHURCH_COOKIE = "levita_church";

/** Modo de acceso comercial (Fase 15 A1/A2). Solo full y grace permiten uso normal. */
export type ChurchAccessMode =
  | "full"
  | "grace"
  | "trial_expired"
  | "suspended"
  | "cancelled"
  | "security_blocked";

export function isOperationalAccessMode(mode: string): boolean {
  return mode === "full" || mode === "grace";
}

export type ChurchMembership = {
  churchId: string;
  churchName: string;
  churchSlug: string;
  personId: string;
  relationship: string;
  accessMode: ChurchAccessMode;
};

export type TenantContext = {
  userId: string;
  memberships: ChurchMembership[];
  churchId: string;
  churchName: string;
  churchSlug: string;
  campusId?: string;
  personId: string;
  accessMode: ChurchAccessMode;
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

  // Orden de preferencia: la iglesia pedida, la elegida en la cookie (ya
  // validada contra membresías), una iglesia operativa, y por último la primera.
  // Así un usuario con una iglesia bloqueada y otra activa no queda atrapado.
  const cookieChurchId = (await cookies()).get(ACTIVE_CHURCH_COOKIE)?.value;
  const active =
    memberships.find((m) => m.churchId === requestedChurchId) ??
    memberships.find((m) => m.churchId === cookieChurchId) ??
    memberships.find((m) => isOperationalAccessMode(m.accessMode)) ??
    memberships[0];

  return {
    userId: user.id,
    memberships,
    churchId: active.churchId,
    churchName: active.churchName,
    churchSlug: active.churchSlug,
    personId: active.personId,
    accessMode: active.accessMode,
  };
});

async function loadMemberships(
  supabase: SupabaseClient,
): Promise<ChurchMembership[]> {
  // Una sola RPC (app.get_my_memberships): solo las pertenencias del usuario
  // autenticado, con su modo comercial. No pasa por RLS de people ni de
  // church_people, que en un estado no operativo ocultarían la iglesia y
  // dejarían la recuperación inalcanzable.
  const { data, error } = await supabase.rpc("get_my_memberships");

  if (error) {
    logger.error("No se pudieron resolver las pertenencias del usuario", {
      error: error.message,
    });
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    churchId: row.church_id as string,
    churchName: (row.church_name as string) ?? "",
    churchSlug: (row.church_slug as string) ?? "",
    personId: row.person_id as string,
    relationship: row.relationship as string,
    accessMode: row.access_mode as ChurchAccessMode,
  }));
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
