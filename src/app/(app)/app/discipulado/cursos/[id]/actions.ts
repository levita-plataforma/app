"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import { createCohort, updateCohort, type CohortInput } from "@/server/discipleship/discipleship-service";
import { isCohortStatus } from "@/lib/discipleship/constants";

export type CursoState = { error: string | null };

const OK: CursoState = { error: null };

function asState(err: unknown): CursoState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

function optionalText(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  if (raw === null) return null;
  const value = String(raw).trim();
  return value === "" ? null : value;
}

/** Lee la cohorte validando el estado contra su lista blanca. */
function readCohortInput(formData: FormData): CohortInput {
  const status = String(formData.get("status") ?? "");
  const capacityRaw = optionalText(formData, "capacity");

  return {
    name: String(formData.get("name") ?? "").trim(),
    campusId: optionalText(formData, "campusId"),
    status: isCohortStatus(status) ? status : undefined,
    startsOn: optionalText(formData, "startsOn"),
    endsOn: optionalText(formData, "endsOn"),
    capacity: capacityRaw ? Number(capacityRaw) : null,
    allowsRequests: formData.get("allowsRequests") === "on",
    notes: optionalText(formData, "notes"),
  };
}

export async function crearCohorteAction(courseId: string, formData: FormData): Promise<CursoState> {
  await requireTenantContext();
  const input = readCohortInput(formData);
  if (!input.name) return { error: "El nombre de la cohorte es obligatorio." };

  try {
    await createCohort(courseId, input);
  } catch (err) {
    return asState(err);
  }
  revalidatePath(`/app/discipulado/cursos/${courseId}`);
  revalidatePath("/app/discipulado");
  return OK;
}

export async function guardarCohorteAction(
  courseId: string,
  cohortId: string,
  formData: FormData,
): Promise<CursoState> {
  await requireTenantContext();
  const input = readCohortInput(formData);
  if (!input.name) return { error: "El nombre de la cohorte es obligatorio." };

  try {
    await updateCohort(cohortId, input);
  } catch (err) {
    return asState(err);
  }
  revalidatePath(`/app/discipulado/cursos/${courseId}`);
  revalidatePath(`/app/discipulado/cohortes/${cohortId}`);
  return OK;
}
