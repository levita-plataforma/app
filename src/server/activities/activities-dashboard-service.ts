import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { callActivityRpc } from "@/server/activities/rpc";
import { ACTIVITY_SUMMARY_COLUMNS, mapActivitySummary, type ActivitySummary } from "@/server/activities/activities-service";

/**
 * Resumen real de actividades para el dashboard (Fase 4 §25). Todos los
 * números salen de la base de datos con la RLS del usuario; no hay
 * estadísticas inventadas ni personas asignadas (llegan en Fase 5).
 */

export type ActivitiesDashboard = {
  timezone: string;
  weekStart: string;
  weekEnd: string;
  thisWeek: number;
  drafts: number;
  upcoming: number;
  incompleteStructure: number;
  flexibleOpenTasks: number;
  nextActivities: ActivitySummary[];
  nextServices: ActivitySummary[];
};

export async function getActivitiesDashboard(churchId: string): Promise<ActivitiesDashboard> {
  const supabase = await createSupabaseServerClient();
  const nowIso = new Date().toISOString();

  const [counts, nextActivities, nextServices] = await Promise.all([
    callActivityRpc<Record<string, unknown> | null>(
      "activity_dashboard",
      { p_church_id: churchId },
      "No se pudo cargar el resumen de actividades.",
    ),
    supabase
      .from("activities")
      .select(ACTIVITY_SUMMARY_COLUMNS)
      .eq("church_id", churchId)
      .in("status", ["planned", "published"])
      .eq("schedule_kind", "timed")
      .gte("ends_at", nowIso)
      .order("starts_at")
      .limit(5),
    supabase
      .from("activities")
      .select(ACTIVITY_SUMMARY_COLUMNS)
      .eq("church_id", churchId)
      .eq("type", "service")
      .in("status", ["draft", "planned", "published"])
      .gte("ends_at", nowIso)
      .order("starts_at")
      .limit(5),
  ]);

  const map = (result: { data: unknown }) =>
    ((result.data as Parameters<typeof mapActivitySummary>[0][] | null) ?? []).map(mapActivitySummary);

  return {
    timezone: (counts?.timezone as string) ?? "UTC",
    weekStart: (counts?.week_start as string) ?? nowIso,
    weekEnd: (counts?.week_end as string) ?? nowIso,
    thisWeek: Number(counts?.this_week ?? 0),
    drafts: Number(counts?.drafts ?? 0),
    upcoming: Number(counts?.upcoming ?? 0),
    incompleteStructure: Number(counts?.incomplete_structure ?? 0),
    flexibleOpenTasks: Number(counts?.flexible_open_tasks ?? 0),
    nextActivities: map(nextActivities),
    nextServices: map(nextServices),
  };
}

/** Incidencias por actividad para listados (máx. 200 ids). */
export async function getStructureStatusFor(activityIds: string[]): Promise<Map<string, { blocking: number; warnings: number }>> {
  const result = new Map<string, { blocking: number; warnings: number }>();
  if (activityIds.length === 0) return result;
  const data = await callActivityRpc<{ activity_id: string; blocking: number; warnings: number }[]>(
    "activities_structure_status",
    { p_activity_ids: activityIds.slice(0, 200) },
    "No se pudo validar la estructura.",
  );
  for (const row of data ?? []) result.set(row.activity_id, { blocking: row.blocking, warnings: row.warnings });
  return result;
}
