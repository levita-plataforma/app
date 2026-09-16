import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { hasCapability } from "@/server/tenant/authorize";

/**
 * Resumen real del módulo Servicios (Fase 3 §24). Solo cuenta lo que existe
 * de verdad en la base de datos: no hay actividad, turnos ni métricas
 * inventadas, porque el scheduling no forma parte de esta fase.
 */

export type ServingDashboard = {
  activeAreas: number;
  volunteers: number;
  teams: number;
  positions: number;
  expiringCredentials: number;
  expiredCredentials: number;
  peopleInTraining: number;
  canSeeCredentials: boolean;
};

const EXPIRY_WINDOW_DAYS = 30;

export async function getServingDashboard(churchId: string): Promise<ServingDashboard> {
  const supabase = await createSupabaseServerClient();
  const canSeeCredentials = await hasCapability(churchId, "credential.read");

  const expiryLimit = new Date();
  expiryLimit.setDate(expiryLimit.getDate() + EXPIRY_WINDOW_DAYS);
  const nowIso = new Date().toISOString();

  const [
    { count: activeAreas },
    { data: memberRows },
    { count: teams },
    { count: positions },
    expiringResult,
    expiredResult,
  ] = await Promise.all([
    supabase
      .from("service_areas")
      .select("id", { count: "exact", head: true })
      .eq("church_id", churchId)
      .eq("active", true)
      .is("archived_at", null),
    // Voluntarios distintos: una persona en tres áreas es un voluntario, no
    // tres. PostgREST no hace count(distinct), así que se deduplica aquí.
    supabase
      .from("service_area_members")
      .select("person_id, status, level")
      .eq("church_id", churchId)
      .is("left_at", null),
    supabase
      .from("service_teams")
      .select("id", { count: "exact", head: true })
      .eq("church_id", churchId)
      .is("archived_at", null),
    supabase
      .from("service_positions")
      .select("id", { count: "exact", head: true })
      .eq("church_id", churchId)
      .is("archived_at", null),
    canSeeCredentials
      ? supabase
          .from("person_credentials")
          .select("id", { count: "exact", head: true })
          .eq("church_id", churchId)
          .eq("status", "valid")
          .not("expires_at", "is", null)
          .gt("expires_at", nowIso)
          .lte("expires_at", expiryLimit.toISOString())
      : Promise.resolve({ count: 0 }),
    canSeeCredentials
      ? supabase
          .from("person_credentials")
          .select("id", { count: "exact", head: true })
          .eq("church_id", churchId)
          .or(`status.eq.expired,and(expires_at.lt.${nowIso})`)
      : Promise.resolve({ count: 0 }),
  ]);

  const members = memberRows ?? [];
  const volunteers = new Set(
    members.filter((m) => m.status === "active").map((m) => m.person_id as string),
  ).size;
  const peopleInTraining = new Set(
    members
      .filter((m) => m.status === "training" || m.level === "trainee")
      .map((m) => m.person_id as string),
  ).size;

  return {
    activeAreas: activeAreas ?? 0,
    volunteers,
    teams: teams ?? 0,
    positions: positions ?? 0,
    expiringCredentials: expiringResult.count ?? 0,
    expiredCredentials: expiredResult.count ?? 0,
    peopleInTraining,
    canSeeCredentials,
  };
}
