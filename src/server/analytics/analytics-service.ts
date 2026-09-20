import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { toDomainError } from "@/server/activities/rpc";

/**
 * Fase 12 (Diogo) · Analítica. Todo el dashboard se resuelve con una sola
 * llamada a app.analytics_dashboard (ver
 * supabase/migrations/20261002000300_rpc_analitica_dashboard.sql): un jsonb
 * con un bloque por módulo, presente solo si el módulo está habilitado y el
 * llamante tiene la capability de lectura real de ese módulo (nunca solo
 * analytics.read). Ver docs/FASE-12-ANALITICA.md.
 */

export const ANALYTICS_PERIODS = ["7d", "30d", "this_month", "3m", "12m", "custom"] as const;
export type AnalyticsPeriod = (typeof ANALYTICS_PERIODS)[number];

export type Trend = {
  current: number;
  previous: number;
  deltaAbs: number;
  deltaPct: number | null;
};

export type AnalyticsDashboard = {
  churchId: string;
  timezone: string;
  period: AnalyticsPeriod;
  periodFrom: string;
  periodTo: string;
  previousFrom: string;
  previousTo: string;
  campusId: string | null;
  people?: {
    activePeople: number;
    newPeople: Trend;
    archivedPeople: Trend;
    byCampus: Record<string, number>;
  };
  serving?: {
    activities: Trend;
    byStatus: Record<string, number>;
    positionsPlanned: number;
    assignmentsConfirmed: number;
    assignmentsPending: number;
    assignmentsDeclined: number;
  };
  events?: {
    eventsPublished: Trend;
    registrations: Trend;
    cancelledRegistrations: number;
    waitlisted: number;
  };
  groups?: {
    activeGroups: number;
    groupsWithoutLeader: number;
    activeMembers: number;
    pendingRequests: number;
    groupsAtCapacity: number;
    newMembers: Trend;
    meetingsHeld: number;
  };
  discipleship?: {
    activeCourses: number;
    runningCohorts: number;
    enrolledPeople: number;
    pendingEnrollmentRequests: number;
    completionsLast90Days: number;
    activePaths: number;
    peopleInPaths: number;
  };
  kids?: {
    checkins: Trend;
    activeProfiles: number;
    incidents: number;
  };
  communications?: {
    communicationsSent: Trend;
    recipientsByStatus: Record<string, number>;
    optOuts: number;
  };
};

type RawTrend = { current: number; previous: number; delta_abs: number; delta_pct: number | null };

function mapTrend(raw: RawTrend): Trend {
  return { current: raw.current, previous: raw.previous, deltaAbs: raw.delta_abs, deltaPct: raw.delta_pct };
}

export type AnalyticsDashboardParams = {
  period: AnalyticsPeriod;
  from?: string;
  to?: string;
  campusId?: string;
};

export async function getAnalyticsDashboard(
  churchId: string,
  params: AnalyticsDashboardParams,
): Promise<AnalyticsDashboard> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("analytics_dashboard", {
    p_church_id: churchId,
    p_period: params.period,
    p_from: params.from ?? null,
    p_to: params.to ?? null,
    p_campus_id: params.campusId ?? null,
  });

  if (error) throw toDomainError(error, "No se pudo calcular el dashboard de Informes.");

  const raw = data as Record<string, unknown>;

  const dashboard: AnalyticsDashboard = {
    churchId: raw.church_id as string,
    timezone: raw.timezone as string,
    period: raw.period as AnalyticsPeriod,
    periodFrom: raw.period_from as string,
    periodTo: raw.period_to as string,
    previousFrom: raw.previous_from as string,
    previousTo: raw.previous_to as string,
    campusId: (raw.campus_id as string | null) ?? null,
  };

  if (raw.people) {
    const p = raw.people as Record<string, unknown>;
    dashboard.people = {
      activePeople: p.active_people as number,
      newPeople: mapTrend(p.new_people as RawTrend),
      archivedPeople: mapTrend(p.archived_people as RawTrend),
      byCampus: p.by_campus as Record<string, number>,
    };
  }

  if (raw.serving) {
    const s = raw.serving as Record<string, unknown>;
    dashboard.serving = {
      activities: mapTrend(s.activities as RawTrend),
      byStatus: s.by_status as Record<string, number>,
      positionsPlanned: s.positions_planned as number,
      assignmentsConfirmed: s.assignments_confirmed as number,
      assignmentsPending: s.assignments_pending as number,
      assignmentsDeclined: s.assignments_declined as number,
    };
  }

  if (raw.events) {
    const e = raw.events as Record<string, unknown>;
    dashboard.events = {
      eventsPublished: mapTrend(e.events_published as RawTrend),
      registrations: mapTrend(e.registrations as RawTrend),
      cancelledRegistrations: e.cancelled_registrations as number,
      waitlisted: e.waitlisted as number,
    };
  }

  if (raw.groups) {
    const g = raw.groups as Record<string, unknown>;
    dashboard.groups = {
      activeGroups: g.active_groups as number,
      groupsWithoutLeader: g.groups_without_leader as number,
      activeMembers: g.active_members as number,
      pendingRequests: g.pending_requests as number,
      groupsAtCapacity: g.groups_at_capacity as number,
      newMembers: mapTrend(g.new_members as RawTrend),
      meetingsHeld: g.meetings_held as number,
    };
  }

  if (raw.discipleship) {
    const d = raw.discipleship as Record<string, unknown>;
    dashboard.discipleship = {
      activeCourses: d.active_courses as number,
      runningCohorts: d.running_cohorts as number,
      enrolledPeople: d.enrolled_people as number,
      pendingEnrollmentRequests: d.pending_enrollment_requests as number,
      completionsLast90Days: d.completions_last_90_days as number,
      activePaths: d.active_paths as number,
      peopleInPaths: d.people_in_paths as number,
    };
  }

  if (raw.kids) {
    const k = raw.kids as Record<string, unknown>;
    dashboard.kids = {
      checkins: mapTrend(k.checkins as RawTrend),
      activeProfiles: k.active_profiles as number,
      incidents: k.incidents as number,
    };
  }

  if (raw.communications) {
    const c = raw.communications as Record<string, unknown>;
    dashboard.communications = {
      communicationsSent: mapTrend(c.communications_sent as RawTrend),
      recipientsByStatus: c.recipients_by_status as Record<string, number>,
      optOuts: c.opt_outs as number,
    };
  }

  return dashboard;
}

export const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  this_month: "Este mes",
  "3m": "Últimos 3 meses",
  "12m": "Últimos 12 meses",
  custom: "Intervalo personalizado",
};

function csvEscape(value: string): string {
  let safe = value;
  if (/^[=+\-@\t\r]/.test(safe)) safe = `'${safe}`;
  if (/[",\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

/**
 * Export síncrono de los agregados del dashboard, mismo patrón que
 * exportRegistrationsCsv (Fase 6): sin export_jobs (esquema sin worker real,
 * ver auditoría de Fase 12), descarga directa. Solo exporta lo que el
 * dashboard ya calculó — nunca filas individuales (§18 del prompt: no debe
 * exponer PII, notas ni contribuciones/casos individuales).
 */
export function dashboardToCsv(dashboard: AnalyticsDashboard): string {
  const rows: string[][] = [["módulo", "métrica", "valor actual", "valor anterior", "delta %"]];

  const pushTrend = (module: string, metric: string, t: Trend) => {
    rows.push([module, metric, String(t.current), String(t.previous), t.deltaPct === null ? "N/A" : `${t.deltaPct}%`]);
  };
  const pushCount = (module: string, metric: string, value: number) => {
    rows.push([module, metric, String(value), "", ""]);
  };

  if (dashboard.people) {
    pushCount("Personas", "Personas activas", dashboard.people.activePeople);
    pushTrend("Personas", "Nuevas personas", dashboard.people.newPeople);
    pushTrend("Personas", "Personas archivadas", dashboard.people.archivedPeople);
  }
  if (dashboard.serving) {
    pushTrend("Servicio", "Actividades", dashboard.serving.activities);
    pushCount("Servicio", "Puestos planificados", dashboard.serving.positionsPlanned);
    pushCount("Servicio", "Asignaciones confirmadas", dashboard.serving.assignmentsConfirmed);
    pushCount("Servicio", "Asignaciones pendientes", dashboard.serving.assignmentsPending);
    pushCount("Servicio", "Asignaciones rechazadas", dashboard.serving.assignmentsDeclined);
  }
  if (dashboard.events) {
    pushTrend("Eventos", "Eventos publicados", dashboard.events.eventsPublished);
    pushTrend("Eventos", "Inscripciones", dashboard.events.registrations);
    pushCount("Eventos", "Inscripciones canceladas", dashboard.events.cancelledRegistrations);
    pushCount("Eventos", "En lista de espera", dashboard.events.waitlisted);
  }
  if (dashboard.groups) {
    pushCount("Grupos", "Grupos activos", dashboard.groups.activeGroups);
    pushCount("Grupos", "Grupos sin líder", dashboard.groups.groupsWithoutLeader);
    pushCount("Grupos", "Participantes activos", dashboard.groups.activeMembers);
    pushCount("Grupos", "Solicitudes pendientes", dashboard.groups.pendingRequests);
    pushCount("Grupos", "Grupos a capacidad", dashboard.groups.groupsAtCapacity);
    pushTrend("Grupos", "Nuevos participantes", dashboard.groups.newMembers);
    pushCount("Grupos", "Reuniones realizadas", dashboard.groups.meetingsHeld);
  }
  if (dashboard.discipleship) {
    pushCount("Discipulado", "Cursos activos", dashboard.discipleship.activeCourses);
    pushCount("Discipulado", "Cohortes en curso", dashboard.discipleship.runningCohorts);
    pushCount("Discipulado", "Personas inscritas", dashboard.discipleship.enrolledPeople);
    pushCount("Discipulado", "Solicitudes pendientes", dashboard.discipleship.pendingEnrollmentRequests);
    pushCount("Discipulado", "Finalizaciones (90 días)", dashboard.discipleship.completionsLast90Days);
    pushCount("Discipulado", "Itinerarios activos", dashboard.discipleship.activePaths);
    pushCount("Discipulado", "Personas en itinerarios", dashboard.discipleship.peopleInPaths);
  }
  if (dashboard.kids) {
    pushTrend("Niños", "Check-ins", dashboard.kids.checkins);
    pushCount("Niños", "Perfiles activos", dashboard.kids.activeProfiles);
    pushCount("Niños", "Incidencias", dashboard.kids.incidents);
  }
  if (dashboard.communications) {
    pushTrend("Comunicación", "Comunicaciones enviadas", dashboard.communications.communicationsSent);
    pushCount("Comunicación", "Bajas por categoría", dashboard.communications.optOuts);
  }

  return rows.map((row) => row.map((cell) => csvEscape(cell)).join(",")).join("\n");
}
