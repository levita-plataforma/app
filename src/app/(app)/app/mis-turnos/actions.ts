"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import { requestSubstitution, respondToAssignment } from "@/server/assignments/assignments-service";
import type { AssignmentStatus } from "@/lib/assignments/constants";

export type TurnoActionResult =
  | { ok: true; status?: AssignmentStatus; replayed: boolean }
  | { ok: false; error: string; conflict?: boolean; blocking?: string[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE_MAX = 1000;

function revalidateTurnos() {
  revalidatePath("/app/mis-turnos");
  revalidatePath("/app/mis-turnos/[id]", "page");
  revalidatePath("/app/actividades/[id]", "page");
  revalidatePath("/app");
}

function fromDomainError(error: unknown): TurnoActionResult {
  if (error instanceof DomainError) {
    return { ok: false, error: error.message, conflict: error.code === "CONFLICT" };
  }
  throw error;
}

/** Respuesta propia a un turno. note: undefined no la toca; "" la borra. */
export async function respondTurnoAction(
  assignmentId: string,
  response: "accepted" | "declined",
  version: number,
  note?: string,
): Promise<TurnoActionResult> {
  await requireTenantContext();
  if (typeof assignmentId !== "string" || !UUID_RE.test(assignmentId)) {
    return { ok: false, error: "El turno no es válido." };
  }
  if (response !== "accepted" && response !== "declined") {
    return { ok: false, error: "Respuesta no válida." };
  }
  if (!Number.isInteger(version) || version < 1) {
    return { ok: false, error: "Recarga la página e inténtalo de nuevo." };
  }
  if (note !== undefined && (typeof note !== "string" || note.length > NOTE_MAX)) {
    return { ok: false, error: `La nota no puede superar los ${NOTE_MAX} caracteres.` };
  }

  try {
    const result = await respondToAssignment(assignmentId, response, version, note);
    if (result.kind === "blocked") {
      return { ok: false, error: result.message, blocking: result.blocking };
    }
    if (result.kind !== "responded") {
      return { ok: false, error: "No se pudo guardar tu respuesta." };
    }
    revalidateTurnos();
    return { ok: true, status: result.status, replayed: result.replayed };
  } catch (error) {
    return fromDomainError(error);
  }
}

export async function requestSubstitutionAction(assignmentId: string): Promise<TurnoActionResult> {
  await requireTenantContext();
  if (typeof assignmentId !== "string" || !UUID_RE.test(assignmentId)) {
    return { ok: false, error: "El turno no es válido." };
  }
  try {
    const result = await requestSubstitution(assignmentId);
    revalidateTurnos();
    return { ok: true, replayed: result.replayed };
  } catch (error) {
    return fromDomainError(error);
  }
}
