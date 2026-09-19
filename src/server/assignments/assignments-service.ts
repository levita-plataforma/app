import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { callActivityRpc, one, toDomainError } from "@/server/activities/rpc";
import { DomainError } from "@/server/errors/domain-error";
import type { AssignmentStatus, ResponseSource } from "@/lib/assignments/constants";
import type { ActivityStatus, ActivityType, ScheduleKind } from "@/lib/activities/constants";

/**
 * Asignaciones (Fase 5, parte de Carlos). Lecturas con el cliente del usuario
 * (RLS decide qué ve); escrituras solo por RPC, que comprueban permisos,
 * elegibilidad en la fecha de la actividad, capacidad y versión, y auditan en
 * la misma transacción. Sin avisos: los emite el motor de Diogo cuando exista.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type AssignmentPerson = { id: string; name: string; hasAccount: boolean };

export type ActivityAssignment = {
  id: string;
  activityId: string;
  activityPositionId: string | null;
  positionName: string;
  person: AssignmentPerson;
  status: AssignmentStatus;
  version: number;
  substitutesAssignmentId: string | null;
  /** Avisos registrados al crear (enmascarados). Solo llegan a quien gestiona el puesto; si no, vacío. */
  eligibilityWarnings: string[];
  /** Avisos confirmados expresamente al crear. Solo para quien gestiona el puesto. */
  acknowledgedWarnings: string[];
  sentAt: string | null;
  respondedAt: string | null;
  responseSource: ResponseSource | null;
  reconfirmationRequestedAt: string | null;
  cancelCause: string | null;
  createdAt: string;
};

export type SubstitutionRequest = {
  id: string;
  originalAssignmentId: string;
  candidateAssignmentId: string | null;
  status: "open" | "completed" | "cancelled";
  requestedBySelf: boolean;
  requestedAt: string;
};

export type AssignmentReview = { assignmentId: string; blocking: string[]; warnings: string[] };

/** pending, proposed y expected son nulos si quien consulta no gestiona el puesto. */
export type PositionStaffing = {
  activityPositionId: string;
  confirmed: number;
  pending: number | null;
  proposed: number | null;
  expected: number | null;
  coverageStatus: "uncovered" | "partially_covered" | "covered" | "overstaffed";
};

/** pending y proposed: solo de los puestos que quien consulta gestiona; nulos si no gestiona ninguno. */
export type StaffingSummary = {
  activityId: string;
  positions: number;
  positionsRequiringPeople: number;
  confirmed: number;
  pending: number | null;
  proposed: number | null;
  uncoveredPositions: number;
};

export type EligibilityResult = { blocking: string[]; warnings: string[] };

/** Resultado del envío: las bloqueadas siguen en borrador y se indican con sus motivos. */
export type SendResult = { sent: number; blocked: { assignmentId: string; blocking: string[] }[] };

/** Resultado de crear/proponer: o se creó, o faltan confirmaciones, o está bloqueado. */
export type AssignmentAttempt =
  | { kind: "created"; assignmentId: string; status: AssignmentStatus; version: number; replayed: boolean; warnings: string[] }
  | { kind: "needs_confirmation"; warnings: string[] }
  | { kind: "blocked"; blocking: string[]; message: string };

export type MyAssignment = ActivityAssignment & {
  activity: {
    id: string;
    title: string;
    type: ActivityType;
    status: ActivityStatus;
    scheduleKind: ScheduleKind;
    startsAt: string | null;
    endsAt: string | null;
    timezone: string;
    locationText: string | null;
    campusName: string | null;
  };
  note: string | null;
  openSubstitutionRequestId: string | null;
  /** La sustitución abierta la pidió la propia persona (solo entonces puede retirarla). */
  openSubstitutionRequestedBySelf: boolean;
};

// ---------------------------------------------------------------------------
// Mapeo
// ---------------------------------------------------------------------------

// Los códigos de elegibilidad guardados no son legibles por columna (privacidad):
// quien gestiona los obtiene con activity_assignment_recorded_warnings.
const ASSIGNMENT_COLUMNS = `id, activity_id, activity_position_id, position_name, person_id, status, version, substitutes_assignment_id,
  sent_at, responded_at, response_source, reconfirmation_requested_at,
  cancel_cause, created_at, people(id, first_name, last_name, preferred_name, user_id)`;

type AssignmentRow = {
  id: string;
  activity_id: string;
  activity_position_id: string | null;
  position_name: string;
  person_id: string;
  status: AssignmentStatus;
  version: number;
  substitutes_assignment_id: string | null;
  sent_at: string | null;
  responded_at: string | null;
  response_source: ResponseSource | null;
  reconfirmation_requested_at: string | null;
  cancel_cause: string | null;
  created_at: string;
  people:
    | { id: string; first_name: string; last_name: string | null; preferred_name: string | null; user_id: string | null }
    | { id: string; first_name: string; last_name: string | null; preferred_name: string | null; user_id: string | null }[]
    | null;
};

type RecordedWarnings = { eligibilityWarnings: string[]; acknowledgedWarnings: string[] };

function mapAssignment(row: AssignmentRow, recorded?: RecordedWarnings): ActivityAssignment {
  const person = one(row.people);
  return {
    id: row.id,
    activityId: row.activity_id,
    activityPositionId: row.activity_position_id,
    positionName: row.position_name,
    person: {
      id: row.person_id,
      name: person ? [person.preferred_name || person.first_name, person.last_name].filter(Boolean).join(" ") : "Persona no visible",
      hasAccount: Boolean(person?.user_id),
    },
    status: row.status,
    version: row.version,
    substitutesAssignmentId: row.substitutes_assignment_id,
    eligibilityWarnings: recorded?.eligibilityWarnings ?? [],
    acknowledgedWarnings: recorded?.acknowledgedWarnings ?? [],
    sentAt: row.sent_at,
    respondedAt: row.responded_at,
    responseSource: row.response_source,
    reconfirmationRequestedAt: row.reconfirmation_requested_at,
    cancelCause: row.cancel_cause,
    createdAt: row.created_at,
  };
}

function codes(details: string | null | undefined): string[] {
  return (details ?? "").split(",").map((c) => c.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Coordinación (ficha de actividad)
// ---------------------------------------------------------------------------

export async function listActivityAssignments(activityId: string): Promise<ActivityAssignment[]> {
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, warningsRes] = await Promise.all([
    supabase.from("activity_assignments").select(ASSIGNMENT_COLUMNS).eq("activity_id", activityId).order("created_at"),
    supabase.rpc("activity_assignment_recorded_warnings", { p_activity_id: activityId }),
  ]);
  if (error) throw toDomainError(error, "No se pudieron cargar las asignaciones.");
  if (warningsRes.error) throw toDomainError(warningsRes.error, "No se pudieron cargar los avisos de las asignaciones.");
  const recorded = new Map<string, RecordedWarnings>();
  for (const r of (warningsRes.data ?? []) as { assignment_id: string; eligibility_warnings: string[] | null; acknowledged_warnings: string[] | null }[]) {
    recorded.set(r.assignment_id, { eligibilityWarnings: r.eligibility_warnings ?? [], acknowledgedWarnings: r.acknowledged_warnings ?? [] });
  }
  return ((data ?? []) as unknown as AssignmentRow[]).map((row) => mapAssignment(row, recorded.get(row.id)));
}

export async function listSubstitutionRequests(activityId: string): Promise<SubstitutionRequest[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("activity_substitution_requests")
    .select("id, original_assignment_id, candidate_assignment_id, status, requested_by_self, requested_at")
    .eq("activity_id", activityId)
    .order("requested_at");
  if (error) throw toDomainError(error, "No se pudieron cargar las sustituciones.");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    originalAssignmentId: r.original_assignment_id as string,
    candidateAssignmentId: (r.candidate_assignment_id as string | null) ?? null,
    status: r.status as SubstitutionRequest["status"],
    requestedBySelf: Boolean(r.requested_by_self),
    requestedAt: r.requested_at as string,
  }));
}

/** Reevalúa las asignaciones vigentes con los datos y la fecha actuales (solo gestores). */
export async function reviewActivityAssignments(activityId: string): Promise<AssignmentReview[]> {
  const data = await callActivityRpc<{ assignment_id: string; blocking: string[] | null; warnings: string[] | null }[]>(
    "activity_assignment_review",
    { p_activity_id: activityId },
    "No se pudieron revisar las asignaciones.",
  );
  return (data ?? []).map((r) => ({ assignmentId: r.assignment_id, blocking: r.blocking ?? [], warnings: r.warnings ?? [] }));
}

export async function getPositionStaffing(activityId: string): Promise<PositionStaffing[]> {
  const data = await callActivityRpc<
    { activity_position_id: string; assigned_count: number; pending_count: number; proposed_count: number; expected_count: number; coverage_status: PositionStaffing["coverageStatus"] }[]
  >("activity_position_coverage", { p_activity_id: activityId }, "No se pudo calcular la cobertura.");
  return (data ?? []).map((r) => ({
    activityPositionId: r.activity_position_id,
    confirmed: r.assigned_count,
    pending: r.pending_count,
    proposed: r.proposed_count,
    expected: r.expected_count,
    coverageStatus: r.coverage_status,
  }));
}

export async function getStaffingSummaries(activityIds: string[]): Promise<Map<string, StaffingSummary>> {
  const result = new Map<string, StaffingSummary>();
  if (activityIds.length === 0) return result;
  const data = await callActivityRpc<
    { activity_id: string; positions: number; positions_requiring_people: number; confirmed: number; pending: number; proposed: number; uncovered_positions: number }[]
  >("activity_staffing_summary", { p_activity_ids: activityIds.slice(0, 200) }, "No se pudo calcular la cobertura.");
  for (const r of data ?? []) {
    result.set(r.activity_id, {
      activityId: r.activity_id,
      positions: r.positions,
      positionsRequiringPeople: r.positions_requiring_people,
      confirmed: r.confirmed,
      pending: r.pending,
      proposed: r.proposed,
      uncoveredPositions: r.uncovered_positions,
    });
  }
  return result;
}

export async function previewEligibility(activityPositionId: string, personId: string): Promise<EligibilityResult> {
  const data = await callActivityRpc<{ blocking: string[] | null; warnings: string[] | null }[]>(
    "preview_assignment_eligibility",
    { p_activity_position_id: activityPositionId, p_person_id: personId },
    "No se pudo evaluar a la persona.",
  );
  const row = data?.[0];
  return { blocking: row?.blocking ?? [], warnings: row?.warnings ?? [] };
}

async function attempt(fn: string, args: Record<string, unknown>, fallback: string): Promise<AssignmentAttempt> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (error.code === "PT412") return { kind: "needs_confirmation", warnings: codes(error.details) };
    if (error.code === "22023" && error.details) {
      return { kind: "blocked", blocking: codes(error.details), message: error.message };
    }
    throw toDomainError(error, fallback);
  }
  const d = data as { assignment_id: string; status: AssignmentStatus; version?: number; replayed?: boolean; warnings?: string[] };
  return {
    kind: "created",
    assignmentId: d.assignment_id,
    status: d.status,
    version: d.version ?? 1,
    replayed: Boolean(d.replayed),
    warnings: d.warnings ?? [],
  };
}

/**
 * Crea una asignación (borrador por defecto). Los avisos se confirman uno a uno:
 * acknowledgedWarnings debe incluir los códigos que se mostraron; si aparece
 * alguno nuevo, vuelve needs_confirmation con los que faltan. Reintentar con
 * send sobre un borrador existente lo envía.
 */
export async function createAssignment(
  activityPositionId: string,
  personId: string,
  options: { acknowledgedWarnings?: string[]; send?: boolean } = {},
): Promise<AssignmentAttempt> {
  return attempt(
    "create_activity_assignment",
    {
      p_activity_position_id: activityPositionId,
      p_person_id: personId,
      p_input: { acknowledged_warnings: options.acknowledgedWarnings ?? [], send: options.send ?? false },
    },
    "No se pudo crear la asignación.",
  );
}

/** Envía borradores (todos los de la actividad que puedas gestionar, o los indicados). Las bloqueadas no se envían. */
export async function sendAssignments(activityId: string, assignmentIds?: string[]): Promise<SendResult> {
  const d = await callActivityRpc<{ sent: number; blocked: { assignment_id: string; blocking: string[] }[] | null }>(
    "send_activity_assignments",
    { p_activity_id: activityId, p_assignment_ids: assignmentIds ?? null },
    "No se pudieron enviar las asignaciones.",
  );
  return {
    sent: d?.sent ?? 0,
    blocked: (d?.blocked ?? []).map((b) => ({ assignmentId: b.assignment_id, blocking: b.blocking ?? [] })),
  };
}

export async function cancelAssignment(assignmentId: string, expectedVersion?: number): Promise<void> {
  await callActivityRpc(
    "cancel_activity_assignment",
    { p_assignment_id: assignmentId, p_expected_version: expectedVersion ?? null },
    "No se pudo retirar la asignación.",
  );
}

/** Respuesta registrada por quien coordina (representante), p. ej. personas sin cuenta. */
export async function recordResponse(
  assignmentId: string,
  response: "accepted" | "declined",
  expectedVersion?: number,
): Promise<AssignmentAttempt | { kind: "responded"; status: AssignmentStatus; version: number; replayed: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_assignment_response", {
    p_assignment_id: assignmentId,
    p_response: response,
    p_expected_version: expectedVersion ?? null,
  });
  if (error) {
    if (error.code === "22023" && error.details) return { kind: "blocked", blocking: codes(error.details), message: error.message };
    throw toDomainError(error, "No se pudo registrar la respuesta.");
  }
  const d = data as { status: AssignmentStatus; version: number; replayed: boolean };
  return { kind: "responded", status: d.status, version: d.version, replayed: d.replayed };
}

export async function requestSubstitution(assignmentId: string): Promise<{ requestId: string; replayed: boolean }> {
  const d = await callActivityRpc<{ request_id: string; replayed: boolean }>(
    "request_assignment_substitution",
    { p_assignment_id: assignmentId },
    "No se pudo solicitar la sustitución.",
  );
  return { requestId: d.request_id, replayed: d.replayed };
}

export async function proposeSubstitutionCandidate(
  requestId: string,
  personId: string,
  acknowledgedWarnings: string[] = [],
): Promise<AssignmentAttempt> {
  return attempt(
    "propose_substitution_candidate",
    { p_request_id: requestId, p_person_id: personId, p_acknowledged_warnings: acknowledgedWarnings },
    "No se pudo proponer el candidato.",
  );
}

export async function cancelSubstitutionRequest(requestId: string): Promise<void> {
  await callActivityRpc("cancel_substitution_request", { p_request_id: requestId }, "No se pudo cancelar la sustitución.");
}

const CANDIDATE_LIMIT = 50;

/**
 * Palabras de búsqueda seguras para el filtro `or` de PostgREST: se eliminan
 * los caracteres con significado en la sintaxis (comas, paréntesis, comillas,
 * comodines, dos puntos y barras invertidas).
 */
export function candidateSearchTerms(search?: string): string[] {
  return (search ?? "")
    .replace(/[%_*\\,()":.]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 5);
}

/**
 * Personas candidatas para un puesto: primero los miembros activos del área
 * (hasta el límite) y después el resto de la iglesia. Con varias palabras,
 * cada una debe aparecer en el nombre, el apellido o el nombre preferido.
 */
export async function listCandidatePeople(
  churchId: string,
  serviceAreaId: string | null,
  search?: string,
): Promise<(AssignmentPerson & { isAreaMember: boolean })[]> {
  const supabase = await createSupabaseServerClient();
  const members = serviceAreaId
    ? await supabase
        .from("service_area_members")
        .select("person_id")
        .eq("church_id", churchId)
        .eq("service_area_id", serviceAreaId)
        .eq("status", "active")
        .is("left_at", null)
    : { data: [] as { person_id: string }[], error: null };
  if (members.error) throw toDomainError(members.error, "No se pudieron cargar los miembros del área.");
  const memberIds = [...new Set((members.data ?? []).map((m) => m.person_id as string))];

  const terms = candidateSearchTerms(search);
  const peopleQuery = (only: "members" | "all") => {
    let query = supabase
      .from("people")
      .select("id, first_name, last_name, preferred_name, user_id, church_people!church_people_person_id_fkey!inner(church_id, archived_at)")
      .eq("church_people.church_id", churchId)
      .is("church_people.archived_at", null)
      .order("first_name")
      .order("last_name");
    for (const term of terms) {
      query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,preferred_name.ilike.%${term}%`);
    }
    // Resto de la iglesia: se piden de más para descontar a los miembros ya incluidos.
    return only === "members" ? query.in("id", memberIds).limit(CANDIDATE_LIMIT) : query.limit(CANDIDATE_LIMIT * 2);
  };

  const [membersRes, allRes] = await Promise.all([
    memberIds.length > 0 ? peopleQuery("members") : Promise.resolve({ data: [], error: null }),
    peopleQuery("all"),
  ]);
  const error = membersRes.error ?? allRes.error;
  if (error) throw toDomainError(error, "No se pudieron cargar las personas.");
  const memberSet = new Set(memberIds);
  const others = (allRes.data ?? []).filter((p) => !memberSet.has(p.id as string));
  const rows = [...(membersRes.data ?? []), ...others].slice(0, CANDIDATE_LIMIT) as {
    id: string;
    first_name: string;
    last_name: string | null;
    preferred_name: string | null;
    user_id: string | null;
  }[];
  return rows
    .map((p) => ({
      id: p.id,
      name: [p.preferred_name || p.first_name, p.last_name].filter(Boolean).join(" "),
      hasAccount: Boolean(p.user_id),
      isAreaMember: memberSet.has(p.id),
    }))
    .sort((a, b) => Number(b.isAreaMember) - Number(a.isAreaMember) || a.name.localeCompare(b.name, "es"));
}

// ---------------------------------------------------------------------------
// Mis turnos
// ---------------------------------------------------------------------------

const MY_COLUMNS = `${ASSIGNMENT_COLUMNS},
  activities(id, title, type, status, schedule_kind, starts_at, ends_at, timezone, location_text, campuses(name)),
  activity_assignment_notes(note),
  activity_substitution_requests!activity_substitution_requests_original_fkey(id, status, requested_by_self)`;

type MyRow = AssignmentRow & {
  activities: {
    id: string;
    title: string;
    type: ActivityType;
    status: ActivityStatus;
    schedule_kind: ScheduleKind;
    starts_at: string | null;
    ends_at: string | null;
    timezone: string;
    location_text: string | null;
    campuses: { name: string } | { name: string }[] | null;
  } | null;
  activity_assignment_notes: { note: string } | { note: string }[] | null;
  activity_substitution_requests: { id: string; status: string; requested_by_self: boolean | null }[] | null;
};

function mapMine(row: MyRow): MyAssignment {
  const activity = one(row.activities);
  const openRequest = (row.activity_substitution_requests ?? []).find((r) => r.status === "open");
  if (!activity) throw new DomainError("RESOURCE_NOT_FOUND", "La actividad del turno no está disponible.");
  return {
    ...mapAssignment(row),
    activity: {
      id: activity.id,
      title: activity.title,
      type: activity.type,
      status: activity.status,
      scheduleKind: activity.schedule_kind,
      startsAt: activity.starts_at,
      endsAt: activity.ends_at,
      timezone: activity.timezone,
      locationText: activity.location_text,
      campusName: one(activity.campuses)?.name ?? null,
    },
    note: one(row.activity_assignment_notes)?.note ?? null,
    openSubstitutionRequestId: openRequest?.id ?? null,
    openSubstitutionRequestedBySelf: Boolean(openRequest?.requested_by_self),
  };
}

/**
 * Turnos de la persona actual en la iglesia activa (sin borradores, que no le
 * pertenecen todavía). Próximos: actividades sin fin o que aún no han
 * terminado. El filtro por fecha se hace en la base de datos, así el límite
 * se aplica dentro del ámbito pedido y no a los más recientes creados.
 */
export async function listMyAssignments(
  churchId: string,
  personId: string,
  options: { scope?: "upcoming" | "past"; limit?: number } = {},
): Promise<MyAssignment[]> {
  const supabase = await createSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const columns = MY_COLUMNS.replace("activities(", "activities!inner(");
  let query = supabase
    .from("activity_assignments")
    .select(columns)
    .eq("church_id", churchId)
    .eq("person_id", personId)
    .neq("status", "proposed");
  query =
    options.scope === "past"
      ? query.lt("activities.ends_at", nowIso)
      : query.or(`ends_at.is.null,ends_at.gte.${nowIso}`, { referencedTable: "activities" });
  const { data, error } = await query.order("created_at", { ascending: false }).limit(options.limit ?? 200);
  if (error) throw toDomainError(error, "No se pudieron cargar tus turnos.");

  const rows = ((data ?? []) as unknown as MyRow[]).filter((r) => one(r.activities)).map(mapMine);
  const startOf = (a: MyAssignment) => new Date(a.activity.startsAt ?? a.activity.endsAt ?? a.createdAt).getTime();
  return rows.sort((a, b) => (options.scope === "past" ? startOf(b) - startOf(a) : startOf(a) - startOf(b)));
}

export async function getMyAssignment(churchId: string, personId: string, assignmentId: string): Promise<MyAssignment | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("activity_assignments")
    .select(MY_COLUMNS)
    .eq("church_id", churchId)
    .eq("person_id", personId)
    .eq("id", assignmentId)
    .neq("status", "proposed")
    .maybeSingle();
  if (error) throw toDomainError(error, "No se pudo cargar el turno.");
  if (!data || !one((data as unknown as MyRow).activities)) return null;
  return mapMine(data as unknown as MyRow);
}

/** Respuesta propia. note: undefined no la toca; "" la borra. */
export async function respondToAssignment(
  assignmentId: string,
  response: "accepted" | "declined",
  expectedVersion: number,
  note?: string,
): Promise<AssignmentAttempt | { kind: "responded"; status: AssignmentStatus; version: number; replayed: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("respond_activity_assignment", {
    p_assignment_id: assignmentId,
    p_response: response,
    p_expected_version: expectedVersion,
    p_note: note === undefined ? null : note,
  });
  if (error) {
    if (error.code === "22023" && error.details) return { kind: "blocked", blocking: codes(error.details), message: error.message };
    throw toDomainError(error, "No se pudo guardar tu respuesta.");
  }
  const d = data as { status: AssignmentStatus; version: number; replayed: boolean };
  return { kind: "responded", status: d.status, version: d.version, replayed: d.replayed };
}

/** Turnos que la persona todavía puede responder (pendientes y en plazo), para navegación y dashboard. */
export async function countMyPendingAssignments(churchId: string): Promise<number> {
  const count = await callActivityRpc<number>(
    "my_respondable_assignments_count",
    { p_church_id: churchId },
    "No se pudieron contar tus turnos pendientes.",
  );
  return count ?? 0;
}
