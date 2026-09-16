import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { hasCapability } from "@/server/tenant/authorize";
import { callActivityRpc, one, toDomainError } from "@/server/activities/rpc";
import type {
  ActivityStatus,
  ActivityType,
  ActivityVisibility,
  ScheduleKind,
  SeriesEditScope,
  StructureIssueSeverity,
} from "@/lib/activities/constants";

/**
 * Actividades (Fase 4). Lecturas con el cliente del usuario (RLS decide qué
 * ve); escrituras solo mediante RPC, que comprueban capability, scope, módulo
 * y reglas en base de datos y auditan en la misma transacción. Ver ADR 0017.
 *
 * Fechas de entrada: hora LOCAL ("YYYY-MM-DDTHH:MM") + zona IANA opcional; la
 * conversión a instante la hace PostgreSQL. Fechas de salida: ISO (UTC).
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type ActivitySummary = {
  id: string;
  type: ActivityType;
  title: string;
  status: ActivityStatus;
  visibility: ActivityVisibility;
  scheduleKind: ScheduleKind;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  campusId: string | null;
  campusName: string | null;
  locationText: string | null;
  seriesId: string | null;
  occurrenceDate: string | null;
  seriesModified: boolean;
};

export type ActivitySeriesInfo = {
  id: string;
  frequency: "weekly" | "monthly";
  intervalCount: number;
  weekdays: number[] | null;
  monthlyMode: "day_of_month" | "nth_weekday" | null;
  monthDay: number | null;
  weekOfMonth: number | null;
  monthWeekday: number | null;
  monthDayFallback: "skip" | "last_day";
  startsOn: string;
  localStartTime: string;
  durationMinutes: number;
  timezone: string;
  untilDate: string | null;
  occurrenceCount: number | null;
  rrule: string | null;
  splitFromSeriesId: string | null;
};

export type ActivityDetail = ActivitySummary & {
  churchId: string;
  description: string | null;
  organizerPersonId: string | null;
  organizerName: string | null;
  templateId: string | null;
  templateName: string | null;
  duplicatedFromActivityId: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  publishedAt: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  statusBeforeArchive: ActivityStatus | null;
  createdAt: string;
  updatedAt: string;
  series: ActivitySeriesInfo | null;
  /** null si no hay notas o si el usuario no puede leerlas. */
  adminNotes: string | null;
};

export type ActivityCapabilities = {
  manage: boolean;
  publish: boolean;
  cancel: boolean;
  archive: boolean;
  managePlan: boolean;
  duplicate: boolean;
  readAdminNotes: boolean;
  servingEnabled: boolean;
  /** Por activity_service_area_id: puede gestionar sus puestos. */
  managePositionsByArea: Record<string, boolean>;
};

export type CreationScopes = {
  createChurch: boolean;
  createCampusIds: string[];
  templatesChurch: boolean;
  templatesCampusIds: string[];
  readAll: boolean;
  servingEnabled: boolean;
};

export type StructureIssue = {
  code: string;
  severity: StructureIssueSeverity;
  activityServiceAreaId: string | null;
  activityPositionId: string | null;
};

export type ActivityHistoryEntry = {
  id: string;
  action: string;
  createdAt: string;
  /** null = acción del sistema (sin persona autora). */
  actorPersonId: string | null;
  /** null si no hay autor o si la RLS no deja ver a la persona. */
  actorName: string | null;
  metadata: Record<string, unknown>;
};

export type RecurrenceInput = {
  frequency: "weekly" | "monthly";
  interval?: number;
  weekdays?: number[];
  monthly_mode?: "day_of_month" | "nth_weekday";
  month_day?: number;
  week_of_month?: number;
  month_weekday?: number;
  month_day_fallback?: "skip" | "last_day";
  until_date?: string;
  count?: number;
};

export type CreateActivityInput = {
  requestId: string;
  type?: ActivityType;
  title?: string;
  description?: string | null;
  campusId?: string | null;
  scheduleKind?: ScheduleKind;
  localStart?: string | null;
  localEnd?: string | null;
  durationMinutes?: number | null;
  timezone?: string | null;
  visibility?: ActivityVisibility;
  locationText?: string | null;
  organizerPersonId?: string | null;
  adminNotes?: string | null;
  templateId?: string | null;
  recurrence?: RecurrenceInput | null;
};

export type TemplateSkip = { kind: "area" | "position"; name: string; reason: string };

export type CreateActivityResult = {
  activityId: string;
  seriesId: string | null;
  occurrences: number | null;
  skipped: TemplateSkip[];
  replayed: boolean;
};

export type UpdateActivityInput = Partial<{
  title: string;
  description: string | null;
  type: ActivityType;
  visibility: ActivityVisibility;
  locationText: string | null;
  organizerPersonId: string | null;
  campusId: string | null;
  scheduleKind: ScheduleKind;
  localStart: string | null;
  localEnd: string | null;
  durationMinutes: number | null;
  timezone: string | null;
  adminNotes: string | null;
}>;

export type UpdateSeriesInput = Partial<{
  title: string;
  description: string | null;
  type: ActivityType;
  visibility: ActivityVisibility;
  locationText: string | null;
  organizerPersonId: string | null;
  campusId: string | null;
  /** "HH:MM" */
  localStartTime: string;
  durationMinutes: number;
}>;

export type ActivityListFilters = {
  from?: string;
  to?: string;
  campusId?: string;
  type?: ActivityType;
  status?: ActivityStatus;
  serviceAreaId?: string;
  search?: string;
  includeArchived?: boolean;
  /** Orden por inicio: "asc" (por defecto) o "desc" (más reciente primero). */
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

/** Escapa los comodines de LIKE (`\`, `%`, `_`) para buscar el texto literal. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// ---------------------------------------------------------------------------
// Mapeo
// ---------------------------------------------------------------------------

export const ACTIVITY_SUMMARY_COLUMNS =
  "id, type, title, status, visibility, schedule_kind, starts_at, ends_at, timezone, campus_id, location_text, series_id, occurrence_date, series_modified, campuses(name)";

type SummaryRow = {
  id: string;
  type: ActivityType;
  title: string;
  status: ActivityStatus;
  visibility: ActivityVisibility;
  schedule_kind: ScheduleKind;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  campus_id: string | null;
  location_text: string | null;
  series_id: string | null;
  occurrence_date: string | null;
  series_modified: boolean;
  campuses: { name: string } | { name: string }[] | null;
};

export function mapActivitySummary(row: SummaryRow): ActivitySummary {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    status: row.status,
    visibility: row.visibility,
    scheduleKind: row.schedule_kind,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    campusId: row.campus_id,
    campusName: one(row.campuses)?.name ?? null,
    locationText: row.location_text,
    seriesId: row.series_id,
    occurrenceDate: row.occurrence_date,
    seriesModified: row.series_modified,
  };
}

function toRpcInput(input: Record<string, unknown>): Record<string, unknown> {
  const keys: Record<string, string> = {
    requestId: "request_id",
    campusId: "campus_id",
    scheduleKind: "schedule_kind",
    localStart: "local_start",
    localEnd: "local_end",
    durationMinutes: "duration_minutes",
    locationText: "location_text",
    organizerPersonId: "organizer_person_id",
    adminNotes: "admin_notes",
    templateId: "template_id",
    localStartTime: "local_start_time",
  };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    out[keys[key] ?? key] = value;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

/**
 * Lista paginada. Con from/to devuelve actividades con horario que SOLAPAN el
 * rango (no solo las que empiezan dentro); las tareas sin hora fija se
 * consultan con listFlexibleTasks.
 */
export async function listActivities(
  churchId: string,
  filters: ActivityListFilters = {},
): Promise<{ items: ActivitySummary[]; total: number; page: number; pageSize: number }> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));

  const columns = filters.serviceAreaId
    ? `${ACTIVITY_SUMMARY_COLUMNS}, activity_service_areas!inner(service_area_id)`
    : ACTIVITY_SUMMARY_COLUMNS;

  let query = supabase.from("activities").select(columns, { count: "exact" }).eq("church_id", churchId);

  if (filters.serviceAreaId) query = query.eq("activity_service_areas.service_area_id", filters.serviceAreaId);
  if (filters.campusId) query = query.eq("campus_id", filters.campusId);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);
  else if (!filters.includeArchived) query = query.neq("status", "archived");
  if (filters.search?.trim()) query = query.ilike("title", `%${escapeLikePattern(filters.search.trim())}%`);
  if (filters.from || filters.to) {
    query = query.eq("schedule_kind", "timed");
    if (filters.to) query = query.lt("starts_at", filters.to);
    if (filters.from) {
      query = query.gt("ends_at", filters.from);
      // Las actividades duran como máximo 62 días: acota el índice por starts_at.
      query = query.gt("starts_at", new Date(new Date(filters.from).getTime() - 62 * 86400000).toISOString());
    }
  }

  const ascending = filters.order !== "desc";
  const { data, count, error } = await query
    .order("starts_at", { ascending, nullsFirst: false })
    .order("title")
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (error) throw toDomainError(error, "No se pudieron cargar las actividades.");
  return { items: ((data ?? []) as unknown as SummaryRow[]).map(mapActivitySummary), total: count ?? 0, page, pageSize };
}

/** Tareas sin hora fija cuya ventana (si la tienen) toca el rango. */
export async function listFlexibleTasks(
  churchId: string,
  filters: Pick<ActivityListFilters, "from" | "to" | "campusId" | "status" | "serviceAreaId" | "includeArchived" | "search"> = {},
  limit = 50,
): Promise<ActivitySummary[]> {
  const supabase = await createSupabaseServerClient();
  const columns = filters.serviceAreaId
    ? `${ACTIVITY_SUMMARY_COLUMNS}, activity_service_areas!inner(service_area_id)`
    : ACTIVITY_SUMMARY_COLUMNS;

  let query = supabase.from("activities").select(columns).eq("church_id", churchId).eq("schedule_kind", "flexible");
  if (filters.serviceAreaId) query = query.eq("activity_service_areas.service_area_id", filters.serviceAreaId);
  if (filters.campusId) query = query.eq("campus_id", filters.campusId);
  if (filters.status) query = query.eq("status", filters.status);
  else if (!filters.includeArchived) query = query.not("status", "in", "(archived,completed,cancelled)");
  if (filters.from) query = query.or(`ends_at.is.null,ends_at.gte.${filters.from}`);
  if (filters.to) query = query.or(`starts_at.is.null,starts_at.lt.${filters.to}`);
  // Búsqueda en SQL (antes del límite), con los comodines escapados.
  if (filters.search?.trim()) query = query.ilike("title", `%${escapeLikePattern(filters.search.trim())}%`);

  const { data, error } = await query.order("ends_at", { ascending: true, nullsFirst: false }).limit(limit);
  if (error) throw toDomainError(error, "No se pudieron cargar las tareas sin hora fija.");
  return ((data ?? []) as unknown as SummaryRow[]).map(mapActivitySummary);
}

export async function getActivity(churchId: string, activityId: string): Promise<ActivityDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("activities")
    .select(
      `${ACTIVITY_SUMMARY_COLUMNS}, church_id, description, organizer_person_id, template_id, duplicated_from_activity_id,
       cancellation_reason, cancelled_at, published_at, completed_at, archived_at, status_before_archive, created_at, updated_at,
       people(first_name, last_name, preferred_name), activity_templates(name),
       activity_series(id, frequency, interval_count, weekdays, monthly_mode, month_day, week_of_month, month_weekday,
         month_day_fallback, starts_on, local_start_time, duration_minutes, timezone, until_date, occurrence_count, rrule,
         split_from_series_id)`,
    )
    .eq("church_id", churchId)
    .eq("id", activityId)
    .maybeSingle();

  if (error) throw toDomainError(error, "No se pudo cargar la actividad.");
  // maybeSingle sin error y sin datos: no existe o la RLS no la deja ver.
  if (!data) return null;

  const row = data as unknown as SummaryRow & {
    church_id: string;
    description: string | null;
    organizer_person_id: string | null;
    template_id: string | null;
    duplicated_from_activity_id: string | null;
    cancellation_reason: string | null;
    cancelled_at: string | null;
    published_at: string | null;
    completed_at: string | null;
    archived_at: string | null;
    status_before_archive: ActivityStatus | null;
    created_at: string;
    updated_at: string;
    people: { first_name: string; last_name: string | null; preferred_name: string | null } | null;
    activity_templates: { name: string } | null;
    activity_series: {
      id: string;
      frequency: "weekly" | "monthly";
      interval_count: number;
      weekdays: number[] | null;
      monthly_mode: "day_of_month" | "nth_weekday" | null;
      month_day: number | null;
      week_of_month: number | null;
      month_weekday: number | null;
      month_day_fallback: "skip" | "last_day";
      starts_on: string;
      local_start_time: string;
      duration_minutes: number;
      timezone: string;
      until_date: string | null;
      occurrence_count: number | null;
      rrule: string | null;
      split_from_series_id: string | null;
    } | null;
  };

  const organizer = one(row.people);
  const series = one(row.activity_series);

  // Si la lectura de notas falla se lanza: devolver null haría creer que no
  // hay notas y un guardado posterior podría borrarlas. (Sin permiso, la RLS
  // no devuelve filas: eso no es un error.)
  const { data: notes, error: notesError } = await supabase
    .from("activity_admin_notes")
    .select("notes")
    .eq("activity_id", activityId)
    .maybeSingle();
  if (notesError) throw toDomainError(notesError, "No se pudieron cargar las notas administrativas.");

  return {
    ...mapActivitySummary(row),
    churchId: row.church_id,
    description: row.description,
    organizerPersonId: row.organizer_person_id,
    organizerName: organizer
      ? [organizer.preferred_name || organizer.first_name, organizer.last_name].filter(Boolean).join(" ")
      : null,
    templateId: row.template_id,
    templateName: one(row.activity_templates)?.name ?? null,
    duplicatedFromActivityId: row.duplicated_from_activity_id,
    cancellationReason: row.cancellation_reason,
    cancelledAt: row.cancelled_at,
    publishedAt: row.published_at,
    completedAt: row.completed_at,
    archivedAt: row.archived_at,
    statusBeforeArchive: row.status_before_archive,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    series: series
      ? {
          id: series.id,
          frequency: series.frequency,
          intervalCount: series.interval_count,
          weekdays: series.weekdays,
          monthlyMode: series.monthly_mode,
          monthDay: series.month_day,
          weekOfMonth: series.week_of_month,
          monthWeekday: series.month_weekday,
          monthDayFallback: series.month_day_fallback,
          startsOn: series.starts_on,
          localStartTime: series.local_start_time.slice(0, 5),
          durationMinutes: series.duration_minutes,
          timezone: series.timezone,
          untilDate: series.until_date,
          occurrenceCount: series.occurrence_count,
          rrule: series.rrule,
          splitFromSeriesId: series.split_from_series_id,
        }
      : null,
    adminNotes: (notes as { notes: string } | null)?.notes ?? null,
  };
}

export async function getActivityCapabilities(activityId: string): Promise<ActivityCapabilities | null> {
  const data = await callActivityRpc<Record<string, unknown> | null>(
    "activity_capabilities",
    { p_activity_id: activityId },
    "No se pudieron cargar los permisos de la actividad.",
  );
  if (!data) return null;
  return {
    manage: Boolean(data.manage),
    publish: Boolean(data.publish),
    cancel: Boolean(data.cancel),
    archive: Boolean(data.archive),
    managePlan: Boolean(data.manage_plan),
    duplicate: Boolean(data.duplicate),
    readAdminNotes: Boolean(data.read_admin_notes),
    servingEnabled: Boolean(data.serving_enabled),
    managePositionsByArea: (data.manage_positions_by_area as Record<string, boolean>) ?? {},
  };
}

export async function getCreationScopes(churchId: string): Promise<CreationScopes> {
  const data = await callActivityRpc<Record<string, unknown> | null>(
    "activity_creation_scopes",
    { p_church_id: churchId },
    "No se pudieron cargar los permisos.",
  );
  return {
    createChurch: Boolean(data?.create_church),
    createCampusIds: (data?.create_campus_ids as string[]) ?? [],
    templatesChurch: Boolean(data?.templates_church),
    templatesCampusIds: (data?.templates_campus_ids as string[]) ?? [],
    readAll: Boolean(data?.read_all),
    servingEnabled: Boolean(data?.serving_enabled),
  };
}

export function canCreateAnywhere(scopes: CreationScopes): boolean {
  return scopes.createChurch || scopes.createCampusIds.length > 0;
}

export async function getStructureIssues(activityId: string): Promise<StructureIssue[]> {
  const data = await callActivityRpc<
    { code: string; severity: StructureIssueSeverity; activity_service_area_id: string | null; activity_position_id: string | null }[]
  >("activity_structure_issues", { p_activity_id: activityId }, "No se pudo validar la estructura.");
  return (data ?? []).map((row) => ({
    code: row.code,
    severity: row.severity,
    activityServiceAreaId: row.activity_service_area_id,
    activityPositionId: row.activity_position_id,
  }));
}

/** Historial de auditoría de la actividad (y de su serie). Requiere audit.read. */
export async function getActivityHistory(
  churchId: string,
  activity: Pick<ActivityDetail, "id" | "seriesId">,
): Promise<{ canRead: boolean; entries: ActivityHistoryEntry[] }> {
  const canRead = await hasCapability(churchId, "audit.read");
  if (!canRead) return { canRead, entries: [] };

  const supabase = await createSupabaseServerClient();
  const ids = [activity.id, activity.seriesId].filter(Boolean) as string[];
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, created_at, metadata, actor_person_id")
    .eq("church_id", churchId)
    .in("entity_id", ids)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw toDomainError(error, "No se pudo cargar el historial.");

  const actorIds = [...new Set(data.map((r) => r.actor_person_id as string | null).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: people, error: peopleError } = await supabase
      .from("people")
      .select("id, first_name, last_name")
      .in("id", actorIds);
    if (peopleError) throw toDomainError(peopleError, "No se pudo cargar el historial.");
    for (const p of people ?? []) {
      names.set(p.id as string, [p.first_name, p.last_name].filter(Boolean).join(" "));
    }
  }

  return {
    canRead,
    entries: data.map((r) => ({
      id: r.id as string,
      action: r.action as string,
      createdAt: r.created_at as string,
      actorPersonId: (r.actor_person_id as string | null) ?? null,
      actorName: r.actor_person_id ? names.get(r.actor_person_id as string) ?? null : null,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
    })),
  };
}

export async function previewRecurrence(
  churchId: string,
  input: Pick<CreateActivityInput, "campusId" | "timezone" | "localStart" | "localEnd" | "durationMinutes"> & {
    recurrence: RecurrenceInput;
  },
): Promise<{ occurrenceDate: string; startsAt: string; endsAt: string; timezone: string | null }[]> {
  // La zona la resuelve SQL (indicada → sede → iglesia). Si la RPC devuelve la
  // zona usada en cada fila, se expone para mostrar; si no, timezone = null.
  const data = await callActivityRpc<
    { occurrence_date: string; starts_at: string; ends_at: string; timezone?: string | null }[]
  >("preview_activity_recurrence", { p_church_id: churchId, p_input: toRpcInput(input) }, "No se pudo calcular la repetición.");
  return (data ?? []).map((r) => ({
    occurrenceDate: r.occurrence_date,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    timezone: r.timezone ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------

export async function createActivity(churchId: string, input: CreateActivityInput): Promise<CreateActivityResult> {
  const data = await callActivityRpc<{
    activity_id: string;
    series_id: string | null;
    occurrences: number | null;
    skipped: TemplateSkip[] | null;
    replayed: boolean;
  }>("create_activity", { p_church_id: churchId, p_input: toRpcInput(input) }, "No se pudo crear la actividad.");
  return {
    activityId: data.activity_id,
    seriesId: data.series_id,
    occurrences: data.occurrences,
    skipped: data.skipped ?? [],
    replayed: data.replayed,
  };
}

/** Edita una actividad puntual o SOLO esta ocurrencia (la marca como excepción). */
export async function updateActivity(activityId: string, input: UpdateActivityInput): Promise<void> {
  await callActivityRpc("update_activity", { p_activity_id: activityId, p_input: toRpcInput(input) }, "No se pudo guardar la actividad.");
}

/** Edita esta y las siguientes ocurrencias, o toda la serie. */
export async function updateActivitySeries(
  activityId: string,
  input: UpdateSeriesInput,
  scope: Exclude<SeriesEditScope, "this">,
): Promise<{ seriesId: string; updated: number }> {
  const data = await callActivityRpc<{ series_id: string; updated: number }>(
    "update_activity_series",
    { p_activity_id: activityId, p_input: toRpcInput(input), p_scope: scope },
    "No se pudo guardar la serie.",
  );
  return { seriesId: data.series_id, updated: data.updated };
}

export async function updateActivitySeriesRule(
  activityId: string,
  rule: RecurrenceInput & { localStartTime?: string; durationMinutes?: number },
): Promise<{ seriesId: string; firstActivityId: string | null; created: number; removed: number; cancelled: number; updated: number }> {
  const data = await callActivityRpc<{
    series_id: string;
    first_activity_id: string | null;
    created: number;
    removed: number;
    cancelled: number;
    updated: number;
  }>("update_activity_series_rule", { p_activity_id: activityId, p_input: toRpcInput(rule) }, "No se pudo cambiar la repetición.");
  return {
    seriesId: data.series_id,
    firstActivityId: data.first_activity_id,
    created: data.created,
    removed: data.removed,
    cancelled: data.cancelled,
    updated: data.updated,
  };
}

export async function applyStructureToSeries(activityId: string, scope: "future" | "all"): Promise<number> {
  return callActivityRpc<number>(
    "apply_activity_structure_to_series",
    { p_activity_id: activityId, p_scope: scope },
    "No se pudo aplicar la estructura a la serie.",
  );
}

export async function transitionActivityStatus(
  activityId: string,
  to: ActivityStatus,
  reason?: string | null,
): Promise<ActivityStatus> {
  return callActivityRpc<ActivityStatus>(
    "transition_activity_status",
    { p_activity_id: activityId, p_to: to, p_reason: reason?.trim() || null },
    "No se pudo cambiar el estado de la actividad.",
  );
}

export async function duplicateActivity(
  activityId: string,
  input: { requestId: string; localStart?: string | null; title?: string | null },
): Promise<{ activityId: string; replayed: boolean }> {
  const data = await callActivityRpc<{ activity_id: string; replayed: boolean }>(
    "duplicate_activity",
    { p_activity_id: activityId, p_input: toRpcInput(input) },
    "No se pudo duplicar la actividad.",
  );
  return { activityId: data.activity_id, replayed: data.replayed };
}
