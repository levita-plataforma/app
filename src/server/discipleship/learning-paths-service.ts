import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { DomainError } from "@/server/errors/domain-error";
import { callActivityRpc, one, toDomainError } from "@/server/activities/rpc";
import type { LearningPathStatus, PathProgressStatus, PathStepKind } from "@/lib/discipleship/constants";

/**
 * Discipulado · itinerarios, pasos y progreso por persona (Fase 7).
 *
 * Los pasos se archivan, nunca se borran (decisión P-8): el progreso ya
 * conseguido se conserva y sigue siendo legible. Un paso archivado solo
 * aparece en el itinerario de una persona si esa persona tiene progreso en
 * él, y entonces se enseña como historial, no como paso vivo.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type LearningPathItem = {
  id: string;
  name: string;
  description: string | null;
  status: LearningPathStatus;
  archivedAt: string | null;
  createdAt: string;
  stepCount: number;
};

export type PathStepItem = {
  id: string;
  learningPathId: string;
  stepOrder: number;
  title: string;
  description: string | null;
  kind: PathStepKind;
  courseId: string | null;
  courseName: string | null;
  isRequired: boolean;
  archivedAt: string | null;
};

/** Una línea del itinerario de una persona, tal como la devuelve la RPC. */
export type PersonPathStep = {
  pathStepId: string;
  stepOrder: number;
  title: string;
  kind: PathStepKind;
  isRequired: boolean;
  /** Archivado: se enseña como historial, no como paso vivo (decisión P-8). */
  archived: boolean;
  status: PathProgressStatus;
  completedAt: string | null;
};

export type PathPersonSummary = {
  personId: string;
  personName: string;
  completedSteps: number;
  inProgressSteps: number;
  lastActivityAt: string | null;
};

export type LearningPathInput = {
  id?: string;
  name: string;
  description?: string | null;
  status?: LearningPathStatus;
};

export type PathStepInput = {
  id?: string;
  title: string;
  description?: string | null;
  kind?: PathStepKind;
  courseId?: string | null;
  isRequired?: boolean;
  /** `step_order`, no `position`: en SQL `position` es palabra reservada. */
  stepOrder?: number | null;
};

function personLabel(
  person: { first_name: string; last_name: string | null; preferred_name: string | null } | null,
): string {
  if (!person) return "Una persona";
  return [person.preferred_name || person.first_name, person.last_name].filter(Boolean).join(" ").trim();
}

// ---------------------------------------------------------------------------
// Itinerarios
// ---------------------------------------------------------------------------

export async function listLearningPaths(
  churchId: string,
  options: { status?: LearningPathStatus; includeArchived?: boolean } = {},
): Promise<LearningPathItem[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("learning_paths")
    .select("id, name, description, status, archived_at, created_at")
    .eq("church_id", churchId);

  if (!options.includeArchived) query = query.is("archived_at", null);
  if (options.status) query = query.eq("status", options.status);

  const { data, error } = await query.order("name");
  if (error) throw toDomainError(error, "No se pudieron cargar los itinerarios.");

  const rows = data ?? [];
  const stepCounts = await loadStepCounts(churchId, rows.map((row) => row.id as string));

  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    status: row.status as LearningPathStatus,
    archivedAt: (row.archived_at as string | null) ?? null,
    createdAt: row.created_at as string,
    stepCount: stepCounts.get(row.id as string) ?? 0,
  }));
}

/** Solo cuenta los pasos vivos: los archivados son historial (decisión P-8). */
async function loadStepCounts(churchId: string, pathIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (pathIds.length === 0) return result;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("path_steps")
    .select("learning_path_id")
    .eq("church_id", churchId)
    .in("learning_path_id", pathIds)
    .is("archived_at", null);

  for (const row of data ?? []) {
    const key = row.learning_path_id as string;
    result.set(key, (result.get(key) ?? 0) + 1);
  }
  return result;
}

export async function getLearningPath(churchId: string, pathId: string): Promise<LearningPathItem | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("learning_paths")
    .select("id, name, description, status, archived_at, created_at")
    .eq("church_id", churchId)
    .eq("id", pathId)
    .maybeSingle();

  if (error) throw toDomainError(error, "No se pudo cargar el itinerario.");
  if (!data) return null;

  const counts = await loadStepCounts(churchId, [pathId]);

  return {
    id: data.id as string,
    name: data.name as string,
    description: (data.description as string | null) ?? null,
    status: data.status as LearningPathStatus,
    archivedAt: (data.archived_at as string | null) ?? null,
    createdAt: data.created_at as string,
    stepCount: counts.get(pathId) ?? 0,
  };
}

export async function saveLearningPath(churchId: string, input: LearningPathInput): Promise<{ pathId: string }> {
  const name = input.name.trim();
  if (!name) throw new DomainError("VALIDATION_ERROR", "El nombre del itinerario es obligatorio.");

  const payload: Record<string, unknown> = { id: input.id ?? null, name };
  if (input.description !== undefined) payload.description = input.description?.trim() || null;
  if (input.status !== undefined) payload.status = input.status;

  const pathId = await callActivityRpc<string>(
    "save_learning_path",
    { p_church_id: churchId, p_input: payload },
    "No se pudo guardar el itinerario.",
  );
  return { pathId };
}

// ---------------------------------------------------------------------------
// Pasos
// ---------------------------------------------------------------------------

type PathStepRow = {
  id: string;
  learning_path_id: string;
  step_order: number;
  title: string;
  description: string | null;
  kind: string;
  course_id: string | null;
  is_required: boolean;
  archived_at: string | null;
  courses: { name: string } | { name: string }[] | null;
};

export async function listPathSteps(
  churchId: string,
  pathId: string,
  includeArchived = true,
): Promise<PathStepItem[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("path_steps")
    .select(
      "id, learning_path_id, step_order, title, description, kind, course_id, is_required, archived_at, courses(name)",
    )
    .eq("church_id", churchId)
    .eq("learning_path_id", pathId);

  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query.order("step_order");
  if (error) throw toDomainError(error, "No se pudieron cargar los pasos del itinerario.");

  return ((data ?? []) as unknown as PathStepRow[]).map((row) => ({
    id: row.id,
    learningPathId: row.learning_path_id,
    stepOrder: row.step_order,
    title: row.title,
    description: row.description,
    kind: row.kind as PathStepKind,
    courseId: row.course_id,
    courseName: one(row.courses)?.name ?? null,
    isRequired: row.is_required,
    archivedAt: row.archived_at,
  }));
}

export async function savePathStep(pathId: string, input: PathStepInput): Promise<{ stepId: string }> {
  const title = input.title.trim();
  if (!title) throw new DomainError("VALIDATION_ERROR", "El título del paso es obligatorio.");
  if (input.kind === "course" && !input.courseId) {
    throw new DomainError("VALIDATION_ERROR", "Un paso de tipo curso necesita un curso.");
  }

  const payload: Record<string, unknown> = { id: input.id ?? null, title };
  if (input.description !== undefined) payload.description = input.description?.trim() || null;
  if (input.kind !== undefined) payload.kind = input.kind;
  if (input.courseId !== undefined) payload.course_id = input.courseId || null;
  if (input.isRequired !== undefined) payload.is_required = input.isRequired;
  if (input.stepOrder !== undefined && input.stepOrder !== null) payload.step_order = input.stepOrder;

  const stepId = await callActivityRpc<string>(
    "save_path_step",
    { p_learning_path_id: pathId, p_input: payload },
    "No se pudo guardar el paso.",
  );
  return { stepId };
}

export async function setPathStepArchived(stepId: string, archived: boolean): Promise<void> {
  await callActivityRpc<null>(
    "set_path_step_archived",
    { p_path_step_id: stepId, p_archived: archived },
    archived ? "No se pudo archivar el paso." : "No se pudo restaurar el paso.",
  );
}

export async function reorderPathSteps(pathId: string, stepIds: string[]): Promise<number> {
  if (stepIds.length === 0) throw new DomainError("VALIDATION_ERROR", "No hay pasos que reordenar.");

  const moved = await callActivityRpc<number>(
    "reorder_path_steps",
    { p_learning_path_id: pathId, p_step_ids: stepIds },
    "No se pudo reordenar el itinerario.",
  );
  return moved ?? 0;
}

// ---------------------------------------------------------------------------
// Progreso por persona
// ---------------------------------------------------------------------------

export async function getPersonPathProgress(pathId: string, personId: string): Promise<PersonPathStep[]> {
  const rows = await callActivityRpc<
    {
      path_step_id: string;
      step_order: number;
      title: string;
      kind: string;
      is_required: boolean;
      archived: boolean;
      status: string;
      completed_at: string | null;
    }[]
  >(
    "person_path_progress_view",
    { p_learning_path_id: pathId, p_person_id: personId },
    "No se pudo cargar el progreso de la persona.",
  );

  return (rows ?? []).map((row) => ({
    pathStepId: row.path_step_id,
    stepOrder: row.step_order,
    title: row.title,
    kind: row.kind as PathStepKind,
    isRequired: row.is_required,
    archived: row.archived,
    status: row.status as PathProgressStatus,
    completedAt: row.completed_at,
  }));
}

export async function setPersonPathStep(
  stepId: string,
  personId: string,
  status: PathProgressStatus,
  note?: string | null,
): Promise<void> {
  await callActivityRpc<string>(
    "set_person_path_step",
    { p_path_step_id: stepId, p_person_id: personId, p_status: status, p_note: note?.trim() || null },
    "No se pudo actualizar el progreso.",
  );
}

type ProgressRow = {
  person_id: string;
  status: string;
  updated_at: string;
  people:
    | { first_name: string; last_name: string | null; preferred_name: string | null }
    | { first_name: string; last_name: string | null; preferred_name: string | null }[]
    | null;
};

/**
 * Personas con algún progreso en el itinerario, con su recuento por estado. Se
 * agrupa en aplicación (PostgREST no expone group by); RLS ya deja fuera a
 * quien no puede ver el progreso ajeno.
 */
export async function listPathPeople(
  churchId: string,
  pathId: string,
  limit = 100,
): Promise<PathPersonSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("person_path_progress")
    .select("person_id, status, updated_at, people(first_name, last_name, preferred_name)")
    .eq("church_id", churchId)
    .eq("learning_path_id", pathId)
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500) * 10);

  if (error) throw toDomainError(error, "No se pudieron cargar las personas del itinerario.");

  const byPerson = new Map<string, PathPersonSummary>();
  for (const row of (data ?? []) as unknown as ProgressRow[]) {
    const entry = byPerson.get(row.person_id) ?? {
      personId: row.person_id,
      personName: personLabel(one(row.people)),
      completedSteps: 0,
      inProgressSteps: 0,
      lastActivityAt: null,
    };
    if (row.status === "completed") entry.completedSteps += 1;
    else if (row.status === "in_progress") entry.inProgressSteps += 1;
    if (!entry.lastActivityAt || row.updated_at > entry.lastActivityAt) entry.lastActivityAt = row.updated_at;
    byPerson.set(row.person_id, entry);
  }

  return [...byPerson.values()]
    .sort((a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""))
    .slice(0, limit);
}
