import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { DomainError } from "@/server/errors/domain-error";
import { callActivityRpc, one, toDomainError } from "@/server/activities/rpc";
import type { GroupAttendanceStatus } from "@/lib/groups/constants";
import type { CohortStatus, CourseStatus, EnrollmentStatus } from "@/lib/discipleship/constants";

/**
 * Discipulado · cursos, cohortes, sesiones y matrículas (Fase 7). Lecturas con
 * el cliente del usuario (RLS decide qué se ve) y escrituras solo por RPC
 * `security definer`, que comprueban capacidad, aforo y pertenencia y auditan
 * en la misma transacción.
 *
 * Los itinerarios viven en `learning-paths-service.ts`.
 *
 * Una sesión cancelada se reconoce por `cancelledAt`, no por el estado de la
 * actividad: la sesión no recorre la máquina de estados de `activities`
 * (ADR 0019). Y un curso lo da por terminado el responsable con un acto
 * explícito: el umbral de asistencia solo alimenta una sugerencia legible
 * (decisión P-4).
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type CourseItem = {
  id: string;
  name: string;
  description: string | null;
  status: CourseStatus;
  sessionCount: number | null;
  /** Umbral de asistencia que alimenta la SUGERENCIA de finalización (P-4). */
  completionAttendanceRatio: number;
  archivedAt: string | null;
  createdAt: string;
  cohortCount: number;
};

export type CohortItem = {
  id: string;
  courseId: string;
  courseName: string | null;
  name: string;
  campusId: string | null;
  campusName: string | null;
  status: CohortStatus;
  startsOn: string | null;
  endsOn: string | null;
  capacity: number | null;
  allowsRequests: boolean;
  notes: string | null;
  archivedAt: string | null;
  enrolledCount: number;
  requestedCount: number;
};

export type CohortSessionItem = {
  id: string;
  cohortId: string;
  activityId: string;
  sessionNumber: number;
  title: string;
  topic: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  locationText: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  attendanceRecordedAt: string | null;
};

export type EnrollmentItem = {
  id: string;
  cohortId: string;
  personId: string;
  personName: string;
  status: EnrollmentStatus;
  requestMessage: string | null;
  decisionNote: string | null;
  completionNote: string | null;
  dropReason: string | null;
  requestedAt: string | null;
  enrolledAt: string | null;
  completedAt: string | null;
  droppedAt: string | null;
};

/**
 * Sugerencia de finalización: quien termina un curso es el responsable, con un
 * acto explícito (decisión P-4). `suggested` solo dice que se ha alcanzado el
 * umbral de asistencia del curso.
 */
export type CompletionSuggestion = {
  enrollmentId: string;
  personId: string;
  displayName: string;
  sessionsTotal: number;
  sessionsAttended: number;
  attendanceRatio: number;
  suggested: boolean;
};

export type DiscipleshipMetrics = {
  activeCourses: number;
  runningCohorts: number;
  enrolledPeople: number;
  pendingEnrollmentRequests: number;
  completionsLast90Days: number;
  activePaths: number;
  peopleInPaths: number;
};

export type CourseInput = {
  id?: string;
  name: string;
  description?: string | null;
  status?: CourseStatus;
  sessionCount?: number | null;
  completionAttendanceRatio?: number | null;
};

export type CohortInput = {
  name: string;
  campusId?: string | null;
  status?: CohortStatus;
  startsOn?: string | null;
  endsOn?: string | null;
  capacity?: number | null;
  allowsRequests?: boolean;
  notes?: string | null;
};

export type ScheduleSessionInput = {
  sessionNumber?: number | null;
  title?: string | null;
  topic?: string | null;
  description?: string | null;
  localStart: string;
  localEnd?: string | null;
  durationMinutes?: number | null;
  timezone?: string | null;
  locationText?: string | null;
};

export type SessionAttendanceEntry = {
  personId: string;
  status: GroupAttendanceStatus;
  notes?: string | null;
};

const DEFAULT_PAGE_SIZE = 25;

function normalizePageSize(pageSize?: number): number {
  return [25, 50, 100].includes(pageSize ?? DEFAULT_PAGE_SIZE) ? (pageSize ?? DEFAULT_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
}

function personLabel(
  person: { first_name: string; last_name: string | null; preferred_name: string | null } | null,
): string {
  if (!person) return "Una persona";
  return [person.preferred_name || person.first_name, person.last_name].filter(Boolean).join(" ").trim();
}

// ---------------------------------------------------------------------------
// Cursos
// ---------------------------------------------------------------------------

export type CourseListFilters = {
  status?: CourseStatus;
  search?: string;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
};

export async function listCourses(
  churchId: string,
  filters: CourseListFilters = {},
): Promise<{ items: CourseItem[]; total: number; page: number; pageSize: number }> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = normalizePageSize(filters.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("courses")
    .select(
      "id, name, description, status, session_count, completion_attendance_ratio, archived_at, created_at",
      { count: "exact" },
    )
    .eq("church_id", churchId);

  if (!filters.includeArchived) query = query.is("archived_at", null);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.search?.trim()) query = query.ilike("name", `%${filters.search.trim()}%`);

  const { data, count, error } = await query.order("name").range(from, to);
  if (error) throw toDomainError(error, "No se pudieron cargar los cursos.");

  const rows = data ?? [];
  const cohortCounts = await loadCohortCounts(churchId, rows.map((row) => row.id as string));

  const items: CourseItem[] = rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    status: row.status as CourseStatus,
    sessionCount: (row.session_count as number | null) ?? null,
    completionAttendanceRatio: Number(row.completion_attendance_ratio ?? 0),
    archivedAt: (row.archived_at as string | null) ?? null,
    createdAt: row.created_at as string,
    cohortCount: cohortCounts.get(row.id as string) ?? 0,
  }));

  return { items, total: count ?? items.length, page, pageSize };
}

async function loadCohortCounts(churchId: string, courseIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (courseIds.length === 0) return result;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("course_cohorts")
    .select("course_id")
    .eq("church_id", churchId)
    .in("course_id", courseIds)
    .is("archived_at", null);

  for (const row of data ?? []) {
    result.set(row.course_id as string, (result.get(row.course_id as string) ?? 0) + 1);
  }
  return result;
}

export async function getCourse(churchId: string, courseId: string): Promise<CourseItem | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("courses")
    .select("id, name, description, status, session_count, completion_attendance_ratio, archived_at, created_at")
    .eq("church_id", churchId)
    .eq("id", courseId)
    .maybeSingle();

  if (error) throw toDomainError(error, "No se pudo cargar el curso.");
  if (!data) return null;

  return {
    id: data.id as string,
    name: data.name as string,
    description: (data.description as string | null) ?? null,
    status: data.status as CourseStatus,
    sessionCount: (data.session_count as number | null) ?? null,
    completionAttendanceRatio: Number(data.completion_attendance_ratio ?? 0),
    archivedAt: (data.archived_at as string | null) ?? null,
    createdAt: data.created_at as string,
    cohortCount: 0,
  };
}

export async function saveCourse(churchId: string, input: CourseInput): Promise<{ courseId: string }> {
  const name = input.name.trim();
  if (!name) throw new DomainError("VALIDATION_ERROR", "El nombre del curso es obligatorio.");

  const ratio = input.completionAttendanceRatio;
  if (ratio !== undefined && ratio !== null && (ratio < 0 || ratio > 1)) {
    throw new DomainError("VALIDATION_ERROR", "El umbral de asistencia debe estar entre 0 y 1.");
  }

  const payload: Record<string, unknown> = { id: input.id ?? null, name };
  if (input.description !== undefined) payload.description = input.description?.trim() || null;
  if (input.status !== undefined) payload.status = input.status;
  if (input.sessionCount !== undefined) payload.session_count = input.sessionCount;
  if (ratio !== undefined && ratio !== null) payload.completion_attendance_ratio = ratio;

  const courseId = await callActivityRpc<string>(
    "save_course",
    { p_church_id: churchId, p_input: payload },
    "No se pudo guardar el curso.",
  );

  return { courseId };
}

export async function setCourseArchived(courseId: string, archived: boolean): Promise<void> {
  await callActivityRpc<null>(
    "set_course_archived",
    { p_course_id: courseId, p_archived: archived },
    archived ? "No se pudo archivar el curso." : "No se pudo restaurar el curso.",
  );
}

// ---------------------------------------------------------------------------
// Cohortes
// ---------------------------------------------------------------------------

type CohortRow = {
  id: string;
  course_id: string;
  name: string;
  campus_id: string | null;
  status: string;
  starts_on: string | null;
  ends_on: string | null;
  capacity: number | null;
  allows_requests: boolean;
  notes: string | null;
  archived_at: string | null;
  campuses: { name: string } | { name: string }[] | null;
  courses: { name: string } | { name: string }[] | null;
};

const COHORT_COLUMNS =
  "id, course_id, name, campus_id, status, starts_on, ends_on, capacity, allows_requests, notes, archived_at, campuses(name), courses(name)";

export async function listCohorts(
  churchId: string,
  options: { courseId?: string; status?: CohortStatus; includeArchived?: boolean; limit?: number } = {},
): Promise<CohortItem[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("course_cohorts").select(COHORT_COLUMNS).eq("church_id", churchId);

  if (options.courseId) query = query.eq("course_id", options.courseId);
  if (options.status) query = query.eq("status", options.status);
  if (!options.includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query
    .order("starts_on", { ascending: false, nullsFirst: false })
    .order("name")
    .limit(Math.min(Math.max(options.limit ?? 100, 1), 200));

  if (error) throw toDomainError(error, "No se pudieron cargar las cohortes.");

  const rows = (data ?? []) as unknown as CohortRow[];
  const counts = await loadEnrollmentCounts(churchId, rows.map((row) => row.id));

  return rows.map((row) => {
    const tally = counts.get(row.id) ?? { enrolled: 0, requested: 0 };
    return {
      id: row.id,
      courseId: row.course_id,
      courseName: one(row.courses)?.name ?? null,
      name: row.name,
      campusId: row.campus_id,
      campusName: one(row.campuses)?.name ?? null,
      status: row.status as CohortStatus,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      capacity: row.capacity,
      allowsRequests: row.allows_requests,
      notes: row.notes,
      archivedAt: row.archived_at,
      enrolledCount: tally.enrolled,
      requestedCount: tally.requested,
    };
  });
}

/**
 * Cuenta matriculados vivos y solicitudes pendientes por cohorte. Se agrupa en
 * aplicación (PostgREST no expone group by). RLS limita `course_enrollments` a
 * quien gestiona la formación o a la propia persona, así que un cero también
 * puede significar «no lo puedes ver».
 */
async function loadEnrollmentCounts(
  churchId: string,
  cohortIds: string[],
): Promise<Map<string, { enrolled: number; requested: number }>> {
  const result = new Map<string, { enrolled: number; requested: number }>();
  if (cohortIds.length === 0) return result;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("course_enrollments")
    .select("cohort_id, status")
    .eq("church_id", churchId)
    .in("cohort_id", cohortIds)
    .in("status", ["enrolled", "requested"]);

  for (const row of data ?? []) {
    const entry = result.get(row.cohort_id as string) ?? { enrolled: 0, requested: 0 };
    if (row.status === "enrolled") entry.enrolled += 1;
    else entry.requested += 1;
    result.set(row.cohort_id as string, entry);
  }
  return result;
}

export async function getCohort(churchId: string, cohortId: string): Promise<CohortItem | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("course_cohorts")
    .select(COHORT_COLUMNS)
    .eq("church_id", churchId)
    .eq("id", cohortId)
    .maybeSingle();

  if (error) throw toDomainError(error, "No se pudo cargar la cohorte.");
  if (!data) return null;

  const row = data as unknown as CohortRow;
  const counts = await loadEnrollmentCounts(churchId, [row.id]);
  const tally = counts.get(row.id) ?? { enrolled: 0, requested: 0 };

  return {
    id: row.id,
    courseId: row.course_id,
    courseName: one(row.courses)?.name ?? null,
    name: row.name,
    campusId: row.campus_id,
    campusName: one(row.campuses)?.name ?? null,
    status: row.status as CohortStatus,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    capacity: row.capacity,
    allowsRequests: row.allows_requests,
    notes: row.notes,
    archivedAt: row.archived_at,
    enrolledCount: tally.enrolled,
    requestedCount: tally.requested,
  };
}

function toCohortPayload(input: CohortInput): Record<string, unknown> {
  const payload: Record<string, unknown> = { name: input.name.trim() };
  if (input.campusId !== undefined) payload.campus_id = input.campusId || null;
  if (input.status !== undefined) payload.status = input.status;
  if (input.startsOn !== undefined) payload.starts_on = input.startsOn || null;
  if (input.endsOn !== undefined) payload.ends_on = input.endsOn || null;
  if (input.capacity !== undefined) payload.capacity = input.capacity;
  if (input.allowsRequests !== undefined) payload.allows_requests = input.allowsRequests;
  if (input.notes !== undefined) payload.notes = input.notes?.trim() || null;
  return payload;
}

export async function createCohort(courseId: string, input: CohortInput): Promise<{ cohortId: string }> {
  if (!input.name.trim()) throw new DomainError("VALIDATION_ERROR", "El nombre de la cohorte es obligatorio.");

  const cohortId = await callActivityRpc<string>(
    "create_cohort",
    { p_course_id: courseId, p_input: toCohortPayload(input) },
    "No se pudo crear la cohorte.",
  );
  return { cohortId };
}

export async function updateCohort(cohortId: string, input: CohortInput): Promise<void> {
  if (!input.name.trim()) throw new DomainError("VALIDATION_ERROR", "El nombre de la cohorte es obligatorio.");

  await callActivityRpc<null>(
    "update_cohort",
    { p_cohort_id: cohortId, p_input: toCohortPayload(input) },
    "No se pudo guardar la cohorte.",
  );
}

// ---------------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------------

type SessionRow = {
  id: string;
  cohort_id: string;
  activity_id: string;
  session_number: number;
  topic: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  attendance_recorded_at: string | null;
  activities:
    | { title: string; starts_at: string | null; ends_at: string | null; timezone: string; location_text: string | null }
    | { title: string; starts_at: string | null; ends_at: string | null; timezone: string; location_text: string | null }[]
    | null;
};

export async function listCohortSessions(churchId: string, cohortId: string): Promise<CohortSessionItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("course_sessions")
    .select(
      "id, cohort_id, activity_id, session_number, topic, cancelled_at, cancellation_reason, attendance_recorded_at, activities(title, starts_at, ends_at, timezone, location_text)",
    )
    .eq("church_id", churchId)
    .eq("cohort_id", cohortId)
    .order("session_number");

  if (error) throw toDomainError(error, "No se pudieron cargar las sesiones.");

  return ((data ?? []) as unknown as SessionRow[]).map((row) => {
    const activity = one(row.activities);
    return {
      id: row.id,
      cohortId: row.cohort_id,
      activityId: row.activity_id,
      sessionNumber: row.session_number,
      title: activity?.title ?? "",
      topic: row.topic,
      startsAt: activity?.starts_at ?? null,
      endsAt: activity?.ends_at ?? null,
      timezone: activity?.timezone ?? "UTC",
      locationText: activity?.location_text ?? null,
      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
      attendanceRecordedAt: row.attendance_recorded_at,
    };
  });
}

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;

function requireLocalDateTime(value: string | null | undefined, field: string): string {
  const trimmed = (value ?? "").trim();
  if (!LOCAL_DATETIME.test(trimmed)) {
    throw new DomainError("VALIDATION_ERROR", `Indica ${field} con su fecha y su hora.`);
  }
  return trimmed;
}

function toSessionSchedulePayload(input: {
  localStart: string;
  localEnd?: string | null;
  durationMinutes?: number | null;
  timezone?: string | null;
  locationText?: string | null;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    local_start: requireLocalDateTime(input.localStart, "el comienzo de la sesión"),
  };
  if (input.localEnd?.trim()) {
    payload.local_end = requireLocalDateTime(input.localEnd, "el final de la sesión");
  } else if (input.durationMinutes) {
    if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1) {
      throw new DomainError("VALIDATION_ERROR", "La duración debe ser de al menos un minuto.");
    }
    payload.duration_minutes = input.durationMinutes;
  }
  if (input.timezone?.trim()) payload.timezone = input.timezone.trim();
  if (input.locationText !== undefined) payload.location_text = input.locationText?.trim() || null;
  return payload;
}

export async function scheduleCohortSession(
  cohortId: string,
  input: ScheduleSessionInput,
): Promise<{ sessionId: string; activityId: string; sessionNumber: number }> {
  const payload = toSessionSchedulePayload(input);
  if (input.sessionNumber) payload.session_number = input.sessionNumber;
  if (input.title?.trim()) payload.title = input.title.trim();
  if (input.topic !== undefined) payload.topic = input.topic?.trim() || null;
  if (input.description !== undefined) payload.description = input.description?.trim() || null;

  const result = await callActivityRpc<{
    course_session_id: string;
    activity_id: string;
    session_number: number;
  } | null>("schedule_cohort_session", { p_cohort_id: cohortId, p_input: payload }, "No se pudo convocar la sesión.");

  if (!result) throw new DomainError("INTERNAL_ERROR", "No se pudo convocar la sesión.");

  return {
    sessionId: result.course_session_id,
    activityId: result.activity_id,
    sessionNumber: Number(result.session_number ?? 0),
  };
}

export async function rescheduleCohortSession(
  sessionId: string,
  input: { localStart: string; localEnd?: string | null; durationMinutes?: number | null; locationText?: string | null },
): Promise<void> {
  await callActivityRpc<null>(
    "reschedule_cohort_session",
    { p_session_id: sessionId, p_input: toSessionSchedulePayload(input) },
    "No se pudo cambiar la fecha de la sesión.",
  );
}

export async function cancelCohortSession(sessionId: string, reason?: string | null): Promise<void> {
  await callActivityRpc<null>(
    "cancel_cohort_session",
    { p_session_id: sessionId, p_reason: reason?.trim() || null },
    "No se pudo cancelar la sesión.",
  );
}

// ---------------------------------------------------------------------------
// Matrículas
// ---------------------------------------------------------------------------

type EnrollmentRow = {
  id: string;
  cohort_id: string;
  person_id: string;
  status: string;
  request_message: string | null;
  decision_note: string | null;
  completion_note: string | null;
  drop_reason: string | null;
  requested_at: string | null;
  enrolled_at: string | null;
  completed_at: string | null;
  dropped_at: string | null;
  people:
    | { first_name: string; last_name: string | null; preferred_name: string | null }
    | { first_name: string; last_name: string | null; preferred_name: string | null }[]
    | null;
};

export async function listEnrollments(
  churchId: string,
  options: { cohortId?: string; status?: EnrollmentStatus; limit?: number } = {},
): Promise<EnrollmentItem[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("course_enrollments")
    .select(
      "id, cohort_id, person_id, status, request_message, decision_note, completion_note, drop_reason, requested_at, enrolled_at, completed_at, dropped_at, people(first_name, last_name, preferred_name)",
    )
    .eq("church_id", churchId);

  if (options.cohortId) query = query.eq("cohort_id", options.cohortId);
  if (options.status) query = query.eq("status", options.status);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(options.limit ?? 200, 1), 500));

  if (error) throw toDomainError(error, "No se pudieron cargar las matrículas.");

  return ((data ?? []) as unknown as EnrollmentRow[]).map((row) => ({
    id: row.id,
    cohortId: row.cohort_id,
    personId: row.person_id,
    personName: personLabel(one(row.people)),
    status: row.status as EnrollmentStatus,
    requestMessage: row.request_message,
    decisionNote: row.decision_note,
    completionNote: row.completion_note,
    dropReason: row.drop_reason,
    requestedAt: row.requested_at,
    enrolledAt: row.enrolled_at,
    completedAt: row.completed_at,
    droppedAt: row.dropped_at,
  }));
}

export async function enrollPersonInCohort(cohortId: string, personId: string): Promise<{ enrollmentId: string }> {
  const enrollmentId = await callActivityRpc<string>(
    "enroll_person_in_cohort",
    { p_cohort_id: cohortId, p_person_id: personId },
    "No se pudo matricular a la persona.",
  );
  return { enrollmentId };
}

export async function requestCohortEnrollment(
  cohortId: string,
  message?: string | null,
): Promise<{ enrollmentId: string }> {
  const enrollmentId = await callActivityRpc<string>(
    "request_cohort_enrollment",
    { p_cohort_id: cohortId, p_message: message?.trim() || null },
    "No se pudo pedir la plaza.",
  );
  return { enrollmentId };
}

export async function resolveCohortEnrollment(
  enrollmentId: string,
  accept: boolean,
  note?: string | null,
): Promise<void> {
  await callActivityRpc<null>(
    "resolve_cohort_enrollment",
    { p_enrollment_id: enrollmentId, p_accept: accept, p_note: note?.trim() || null },
    "No se pudo resolver la solicitud de plaza.",
  );
}

export async function dropCohortEnrollment(enrollmentId: string, reason?: string | null): Promise<void> {
  await callActivityRpc<null>(
    "drop_cohort_enrollment",
    { p_enrollment_id: enrollmentId, p_reason: reason?.trim() || null },
    "No se pudo dar de baja la matrícula.",
  );
}

/** Acto explícito del responsable, con fecha y autor (decisión P-4). */
export async function completeCohortEnrollment(enrollmentId: string, note?: string | null): Promise<void> {
  await callActivityRpc<null>(
    "complete_cohort_enrollment",
    { p_enrollment_id: enrollmentId, p_note: note?.trim() || null },
    "No se pudo dar el curso por terminado.",
  );
}

// ---------------------------------------------------------------------------
// Asistencia y sugerencias
// ---------------------------------------------------------------------------

export async function getSessionAttendance(
  churchId: string,
  sessionId: string,
): Promise<Map<string, { status: GroupAttendanceStatus; notes: string | null }>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("course_session_attendance")
    .select("person_id, status, notes")
    .eq("church_id", churchId)
    .eq("course_session_id", sessionId);

  if (error) throw toDomainError(error, "No se pudo cargar la asistencia registrada.");

  const result = new Map<string, { status: GroupAttendanceStatus; notes: string | null }>();
  for (const row of data ?? []) {
    result.set(row.person_id as string, {
      status: row.status as GroupAttendanceStatus,
      notes: (row.notes as string | null) ?? null,
    });
  }
  return result;
}

export async function recordSessionAttendance(
  sessionId: string,
  entries: SessionAttendanceEntry[],
): Promise<number> {
  if (entries.length === 0) {
    throw new DomainError("VALIDATION_ERROR", "Marca al menos una persona antes de guardar la asistencia.");
  }

  const count = await callActivityRpc<number>(
    "record_session_attendance",
    {
      p_session_id: sessionId,
      p_entries: entries.map((entry) => ({
        person_id: entry.personId,
        status: entry.status,
        notes: entry.notes?.trim() || null,
      })),
    },
    "No se pudo guardar la asistencia.",
  );

  return count ?? 0;
}

export async function getCompletionSuggestions(cohortId: string): Promise<CompletionSuggestion[]> {
  const rows = await callActivityRpc<
    {
      enrollment_id: string;
      person_id: string;
      display_name: string | null;
      sessions_total: number | null;
      sessions_attended: number | null;
      attendance_ratio: number | string | null;
      suggested: boolean;
    }[]
  >("cohort_completion_suggestions", { p_cohort_id: cohortId }, "No se pudieron cargar las sugerencias.");

  return (rows ?? []).map((row) => ({
    enrollmentId: row.enrollment_id,
    personId: row.person_id,
    displayName: row.display_name ?? "Sin nombre",
    sessionsTotal: Number(row.sessions_total ?? 0),
    sessionsAttended: Number(row.sessions_attended ?? 0),
    attendanceRatio: Number(row.attendance_ratio ?? 0),
    suggested: Boolean(row.suggested),
  }));
}

// ---------------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------------

export async function getDiscipleshipMetrics(churchId: string): Promise<DiscipleshipMetrics> {
  const data = await callActivityRpc<Record<string, number> | null>(
    "discipleship_metrics",
    { p_church_id: churchId },
    "No se pudieron cargar las métricas de discipulado.",
  );

  return {
    activeCourses: Number(data?.active_courses ?? 0),
    runningCohorts: Number(data?.running_cohorts ?? 0),
    enrolledPeople: Number(data?.enrolled_people ?? 0),
    pendingEnrollmentRequests: Number(data?.pending_enrollment_requests ?? 0),
    completionsLast90Days: Number(data?.completions_last_90_days ?? 0),
    activePaths: Number(data?.active_paths ?? 0),
    peopleInPaths: Number(data?.people_in_paths ?? 0),
  };
}
