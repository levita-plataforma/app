"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import {
  reorderPathSteps,
  savePathStep,
  setPathStepArchived,
  setPersonPathStep,
} from "@/server/discipleship/learning-paths-service";
import { listCandidatePeople } from "@/server/assignments/assignments-service";
import { isPathProgressStatus, isPathStepKind } from "@/lib/discipleship/constants";

export type ItinerarioState = { error: string | null };

const OK: ItinerarioState = { error: null };

function asState(err: unknown): ItinerarioState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

function revalidatePath_(pathId: string) {
  revalidatePath(`/app/discipulado/itinerarios/${pathId}`);
  revalidatePath("/app/discipulado/itinerarios");
  revalidatePath("/app/discipulado");
}

export async function buscarPersonasAction(search: string): Promise<{ id: string; name: string }[]> {
  const tenant = await requireTenantContext();
  try {
    const people = await listCandidatePeople(tenant.churchId, null, search);
    return people.map((person) => ({ id: person.id, name: person.name }));
  } catch {
    return [];
  }
}

export async function guardarPasoAction(pathId: string, formData: FormData): Promise<ItinerarioState> {
  await requireTenantContext();

  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const kind = String(formData.get("kind") ?? "manual");
  const courseId = String(formData.get("courseId") ?? "").trim();
  const orderRaw = String(formData.get("stepOrder") ?? "").trim();

  if (!title) return { error: "El título del paso es obligatorio." };

  try {
    await savePathStep(pathId, {
      id: id || undefined,
      title,
      description: description || null,
      kind: isPathStepKind(kind) ? kind : "manual",
      courseId: courseId || null,
      isRequired: formData.get("isRequired") === "on",
      // `step_order`, no `position`: en SQL `position` es palabra reservada.
      stepOrder: orderRaw ? Number(orderRaw) : null,
    });
  } catch (err) {
    return asState(err);
  }
  revalidatePath_(pathId);
  return OK;
}

/**
 * Archivar, nunca borrar (decisión P-8): el progreso ya conseguido se conserva
 * y sigue siendo legible como historial.
 */
export async function archivarPasoAction(
  pathId: string,
  stepId: string,
  archived: boolean,
): Promise<ItinerarioState> {
  await requireTenantContext();
  try {
    await setPathStepArchived(stepId, archived);
  } catch (err) {
    return asState(err);
  }
  revalidatePath_(pathId);
  return OK;
}

export async function reordenarPasosAction(pathId: string, stepIds: string[]): Promise<ItinerarioState> {
  await requireTenantContext();
  try {
    await reorderPathSteps(pathId, stepIds);
  } catch (err) {
    return asState(err);
  }
  revalidatePath_(pathId);
  return OK;
}

export async function marcarProgresoAction(
  pathId: string,
  stepId: string,
  personId: string,
  status: string,
  note?: string,
): Promise<ItinerarioState> {
  await requireTenantContext();
  if (!isPathProgressStatus(status)) return { error: "Ese estado de progreso no existe." };

  try {
    await setPersonPathStep(stepId, personId, status, note ?? null);
  } catch (err) {
    return asState(err);
  }
  revalidatePath_(pathId);
  return OK;
}
