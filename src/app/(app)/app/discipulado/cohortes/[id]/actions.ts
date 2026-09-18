"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import {
  cancelCohortSession,
  completeCohortEnrollment,
  dropCohortEnrollment,
  enrollPersonInCohort,
  recordSessionAttendance,
  requestCohortEnrollment,
  rescheduleCohortSession,
  resolveCohortEnrollment,
  scheduleCohortSession,
  type SessionAttendanceEntry,
} from "@/server/discipleship/discipleship-service";
import { listCandidatePeople } from "@/server/assignments/assignments-service";
import { isGroupAttendanceStatus } from "@/lib/groups/constants";

export type CohorteState = { error: string | null };

const OK: CohorteState = { error: null };

function asState(err: unknown): CohorteState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

function revalidateCohort(cohortId: string) {
  revalidatePath(`/app/discipulado/cohortes/${cohortId}`);
  revalidatePath("/app/discipulado");
  revalidatePath("/app/calendario");
}

function optionalText(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  if (raw === null) return null;
  const value = String(raw).trim();
  return value === "" ? null : value;
}

// ---------------------------------------------------------------------------
// Matrículas · las dos vías acordadas (decisión P-3)
// ---------------------------------------------------------------------------

export async function buscarPersonasAction(search: string): Promise<{ id: string; name: string }[]> {
  const tenant = await requireTenantContext();
  try {
    const people = await listCandidatePeople(tenant.churchId, null, search);
    return people.map((person) => ({ id: person.id, name: person.name }));
  } catch {
    return [];
  }
}

export async function matricularAction(cohortId: string, personId: string): Promise<CohorteState> {
  await requireTenantContext();
  try {
    await enrollPersonInCohort(cohortId, personId);
  } catch (err) {
    return asState(err);
  }
  revalidateCohort(cohortId);
  return OK;
}

export async function pedirPlazaAction(cohortId: string, message?: string): Promise<CohorteState> {
  await requireTenantContext();
  try {
    await requestCohortEnrollment(cohortId, message ?? null);
  } catch (err) {
    return asState(err);
  }
  revalidateCohort(cohortId);
  return OK;
}

export async function resolverPlazaAction(
  cohortId: string,
  enrollmentId: string,
  accept: boolean,
  note?: string,
): Promise<CohorteState> {
  await requireTenantContext();
  try {
    await resolveCohortEnrollment(enrollmentId, accept, note ?? null);
  } catch (err) {
    return asState(err);
  }
  revalidateCohort(cohortId);
  return OK;
}

export async function darDeBajaAction(
  cohortId: string,
  enrollmentId: string,
  reason?: string,
): Promise<CohorteState> {
  await requireTenantContext();
  try {
    await dropCohortEnrollment(enrollmentId, reason ?? null);
  } catch (err) {
    return asState(err);
  }
  revalidateCohort(cohortId);
  return OK;
}

/**
 * Dar un curso por terminado es un acto explícito del responsable, con fecha y
 * autor (decisión P-4). La aplicación solo sugiere; nunca decide.
 */
export async function darPorTerminadoAction(
  cohortId: string,
  enrollmentId: string,
  note?: string,
): Promise<CohorteState> {
  await requireTenantContext();
  try {
    await completeCohortEnrollment(enrollmentId, note ?? null);
  } catch (err) {
    return asState(err);
  }
  revalidateCohort(cohortId);
  return OK;
}

// ---------------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------------

export async function convocarSesionAction(cohortId: string, formData: FormData): Promise<CohorteState> {
  await requireTenantContext();

  const localStart = optionalText(formData, "localStart");
  if (!localStart) return { error: "Indica la fecha y la hora de la sesión." };

  const durationRaw = optionalText(formData, "durationMinutes");
  const numberRaw = optionalText(formData, "sessionNumber");

  try {
    await scheduleCohortSession(cohortId, {
      sessionNumber: numberRaw ? Number(numberRaw) : null,
      title: optionalText(formData, "title"),
      topic: optionalText(formData, "topic"),
      localStart,
      durationMinutes: durationRaw ? Number(durationRaw) : 90,
      locationText: optionalText(formData, "locationText"),
    });
  } catch (err) {
    return asState(err);
  }
  revalidateCohort(cohortId);
  return OK;
}

export async function cambiarFechaSesionAction(
  cohortId: string,
  sessionId: string,
  localStart: string,
): Promise<CohorteState> {
  await requireTenantContext();
  if (!localStart) return { error: "Indica la fecha y la hora nuevas." };

  try {
    await rescheduleCohortSession(sessionId, { localStart });
  } catch (err) {
    return asState(err);
  }
  revalidateCohort(cohortId);
  return OK;
}

export async function cancelarSesionAction(
  cohortId: string,
  sessionId: string,
  reason?: string,
): Promise<CohorteState> {
  await requireTenantContext();
  try {
    await cancelCohortSession(sessionId, reason ?? null);
  } catch (err) {
    return asState(err);
  }
  revalidateCohort(cohortId);
  return OK;
}

// ---------------------------------------------------------------------------
// Asistencia
// ---------------------------------------------------------------------------

export type AsistenciaSesionState = { error: string | null; saved: number | null };

/** Idempotente: repetir el envío corrige lo anotado, no duplica. */
export async function guardarAsistenciaSesionAction(
  cohortId: string,
  sessionId: string,
  _prev: AsistenciaSesionState,
  formData: FormData,
): Promise<AsistenciaSesionState> {
  await requireTenantContext();

  const entries: SessionAttendanceEntry[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("estado-")) continue;
    const personId = key.slice("estado-".length);
    const status = String(value);
    if (status === "" || !isGroupAttendanceStatus(status)) continue;
    entries.push({
      personId,
      status,
      notes: String(formData.get(`nota-${personId}`) ?? "").trim() || null,
    });
  }

  if (entries.length === 0) {
    return { error: "Marca al menos una persona antes de guardar la asistencia.", saved: null };
  }

  let saved: number;
  try {
    saved = await recordSessionAttendance(sessionId, entries);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message, saved: null };
    throw err;
  }

  revalidateCohort(cohortId);
  return { error: null, saved };
}
