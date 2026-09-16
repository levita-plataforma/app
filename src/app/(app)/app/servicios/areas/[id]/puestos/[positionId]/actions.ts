"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import {
  addRequirement,
  removeRequirement,
  type RequirementType,
  type RequirementStrictness,
  type QualificationLevel,
} from "@/server/serving/position-requirements-service";
import { updatePosition } from "@/server/serving/service-positions-service";
import type { OperationalLevel } from "@/server/serving/service-area-members-service";
import { DomainError } from "@/server/errors/domain-error";

export type PuestoState = { error: string | null; success?: boolean };
const OK: PuestoState = { error: null, success: true };

function asState(err: unknown): PuestoState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

export async function anadirRequisitoAction(
  areaId: string,
  positionId: string,
  formData: FormData,
): Promise<PuestoState> {
  const tenant = await requireTenantContext();
  const type = String(formData.get("type") ?? "") as RequirementType;
  try {
    await addRequirement(tenant.churchId, positionId, {
      type,
      strictness: (String(formData.get("strictness") ?? "required") as RequirementStrictness) || "required",
      qualificationId: String(formData.get("qualificationId") ?? "").trim() || undefined,
      credentialTypeId: String(formData.get("credentialTypeId") ?? "").trim() || undefined,
      minLevel: (String(formData.get("minLevel") ?? "").trim() || undefined) as QualificationLevel | undefined,
      minOperationalLevel: (String(formData.get("minOperationalLevel") ?? "").trim() || undefined) as
        | OperationalLevel
        | undefined,
    });
  } catch (err) {
    return asState(err);
  }
  revalidatePath(`/app/servicios/areas/${areaId}/puestos/${positionId}`);
  return OK;
}

export async function quitarRequisitoAction(
  areaId: string,
  positionId: string,
  requirementId: string,
): Promise<PuestoState> {
  const tenant = await requireTenantContext();
  try {
    await removeRequirement(tenant.churchId, requirementId);
  } catch (err) {
    return asState(err);
  }
  revalidatePath(`/app/servicios/areas/${areaId}/puestos/${positionId}`);
  return OK;
}

export async function guardarPuestoAction(
  areaId: string,
  positionId: string,
  formData: FormData,
): Promise<PuestoState> {
  const tenant = await requireTenantContext();
  try {
    const maxPeopleRaw = String(formData.get("maxPeople") ?? "").trim();
    await updatePosition(tenant.churchId, positionId, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      critical: formData.get("critical") === "on",
      minPeople: Number(formData.get("minPeople") ?? 1) || 1,
      maxPeople: maxPeopleRaw ? Number(maxPeopleRaw) : null,
      requiresAutonomousPerson: formData.get("requiresAutonomous") === "on",
    });
  } catch (err) {
    return asState(err);
  }
  revalidatePath(`/app/servicios/areas/${areaId}/puestos/${positionId}`);
  revalidatePath(`/app/servicios/areas/${areaId}`);
  return OK;
}
