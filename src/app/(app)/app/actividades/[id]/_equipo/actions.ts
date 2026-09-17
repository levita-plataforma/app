"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/server/errors/domain-error";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import type { AssignmentStatus } from "@/lib/assignments/constants";
import {
  cancelAssignment,
  cancelSubstitutionRequest,
  createAssignment,
  listCandidatePeople,
  previewEligibility,
  proposeSubstitutionCandidate,
  recordResponse,
  requestSubstitution,
  sendAssignments,
  type AssignmentAttempt,
  type AssignmentPerson,
  type EligibilityResult,
} from "@/server/assignments/assignments-service";

/**
 * Acciones de la pestaña Equipo. Envoltorios finos: permisos, módulo, estado
 * de la actividad, elegibilidad, capacidad y versión los comprueba la base de
 * datos en cada RPC. El churchId sale siempre del contexto del servidor.
 */

export type EquipoFailure = { error: string; conflict: boolean };
export type EquipoResult<T> = EquipoFailure | ({ error: null } & T);

export type CandidatePerson = AssignmentPerson & { isAreaMember: boolean };
export type ResponseOutcome =
  | AssignmentAttempt
  | { kind: "responded"; status: AssignmentStatus; version: number; replayed: boolean };

function revalidate() {
  revalidatePath("/app/actividades/[id]", "page");
  revalidatePath("/app/mis-turnos");
  revalidatePath("/app");
}

async function guard<T>(fn: () => Promise<T>, options: { revalidate: boolean }): Promise<EquipoResult<T>> {
  try {
    await requireTenantContext();
    const value = await fn();
    if (options.revalidate) revalidate();
    return { error: null, ...value };
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message, conflict: err.code === "CONFLICT" };
    throw err;
  }
}

export async function searchCandidatesAction(
  serviceAreaId: string | null,
  search: string,
): Promise<EquipoResult<{ people: CandidatePerson[] }>> {
  try {
    const tenant = await requireTenantContext();
    const people = await listCandidatePeople(tenant.churchId, serviceAreaId, search.slice(0, 80));
    return { error: null, people };
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message, conflict: false };
    throw err;
  }
}

export async function previewEligibilityAction(
  activityPositionId: string,
  personId: string,
): Promise<EquipoResult<{ eligibility: EligibilityResult }>> {
  return guard(async () => ({ eligibility: await previewEligibility(activityPositionId, personId) }), {
    revalidate: false,
  });
}

export async function createAssignmentAction(
  activityPositionId: string,
  personId: string,
  options: { acknowledgeWarnings: boolean; send: boolean },
): Promise<EquipoResult<{ attempt: AssignmentAttempt }>> {
  return guard(
    async () => ({
      attempt: await createAssignment(activityPositionId, personId, {
        acknowledgeWarnings: options.acknowledgeWarnings,
        send: options.send,
      }),
    }),
    { revalidate: true },
  );
}

export async function sendAssignmentsAction(
  activityId: string,
  assignmentIds?: string[],
): Promise<EquipoResult<{ sent: number }>> {
  return guard(async () => ({ sent: await sendAssignments(activityId, assignmentIds) }), { revalidate: true });
}

export async function cancelAssignmentAction(assignmentId: string, version: number): Promise<EquipoResult<object>> {
  return guard(async () => {
    await cancelAssignment(assignmentId, version);
    return {};
  }, { revalidate: true });
}

export async function recordResponseAction(
  assignmentId: string,
  response: "accepted" | "declined",
  version: number,
): Promise<EquipoResult<{ outcome: ResponseOutcome }>> {
  return guard(async () => ({ outcome: await recordResponse(assignmentId, response, version) }), { revalidate: true });
}

export async function requestSubstitutionAction(
  assignmentId: string,
): Promise<EquipoResult<{ requestId: string; replayed: boolean }>> {
  return guard(() => requestSubstitution(assignmentId), { revalidate: true });
}

export async function proposeCandidateAction(
  requestId: string,
  personId: string,
  acknowledgeWarnings: boolean,
): Promise<EquipoResult<{ attempt: AssignmentAttempt }>> {
  return guard(
    async () => ({ attempt: await proposeSubstitutionCandidate(requestId, personId, acknowledgeWarnings) }),
    { revalidate: true },
  );
}

export async function cancelSubstitutionAction(requestId: string): Promise<EquipoResult<object>> {
  return guard(async () => {
    await cancelSubstitutionRequest(requestId);
    return {};
  }, { revalidate: true });
}
