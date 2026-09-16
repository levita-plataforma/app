"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { updateServiceArea } from "@/server/serving/service-areas-service";
import { addAreaLeader, removeAreaLeader } from "@/server/serving/service-area-leaders-service";
import {
  addAreaMember,
  updateAreaMember,
  removeAreaMember,
  type AreaMemberStatus,
  type OperationalLevel,
} from "@/server/serving/service-area-members-service";
import { createPosition, archivePosition } from "@/server/serving/service-positions-service";
import { createTeam } from "@/server/serving/service-teams-service";
import { DomainError } from "@/server/errors/domain-error";

export type AreaFichaState = { error: string | null; success?: boolean };
const OK: AreaFichaState = { error: null, success: true };

function asState(err: unknown): AreaFichaState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

function revalidateArea(areaId: string) {
  revalidatePath(`/app/servicios/areas/${areaId}`);
  revalidatePath("/app/servicios/areas");
  revalidatePath("/app/servicios");
}

export async function guardarAreaAction(areaId: string, formData: FormData): Promise<AreaFichaState> {
  const tenant = await requireTenantContext();
  try {
    await updateServiceArea(tenant.churchId, areaId, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      campusId: String(formData.get("campusId") ?? "") || null,
      active: formData.get("active") === "on",
    });
  } catch (err) {
    return asState(err);
  }
  revalidateArea(areaId);
  return OK;
}

export async function anadirResponsableAction(
  areaId: string,
  personId: string,
  isPrimary: boolean,
): Promise<AreaFichaState> {
  const tenant = await requireTenantContext();
  try {
    await addAreaLeader(tenant.churchId, areaId, personId, { isPrimary });
  } catch (err) {
    return asState(err);
  }
  revalidateArea(areaId);
  return OK;
}

export async function quitarResponsableAction(areaId: string, personId: string): Promise<AreaFichaState> {
  const tenant = await requireTenantContext();
  try {
    await removeAreaLeader(tenant.churchId, areaId, personId);
  } catch (err) {
    return asState(err);
  }
  revalidateArea(areaId);
  return OK;
}

export async function anadirMiembroAction(
  areaId: string,
  personId: string,
  input: { status?: AreaMemberStatus; level?: OperationalLevel },
): Promise<AreaFichaState> {
  const tenant = await requireTenantContext();
  try {
    await addAreaMember(tenant.churchId, areaId, personId, input);
  } catch (err) {
    return asState(err);
  }
  revalidateArea(areaId);
  return OK;
}

export async function actualizarMiembroAction(
  areaId: string,
  personId: string,
  input: { status?: AreaMemberStatus; level?: OperationalLevel; notes?: string },
): Promise<AreaFichaState> {
  const tenant = await requireTenantContext();
  try {
    await updateAreaMember(tenant.churchId, areaId, personId, input);
  } catch (err) {
    return asState(err);
  }
  revalidateArea(areaId);
  return OK;
}

export async function quitarMiembroAction(areaId: string, personId: string): Promise<AreaFichaState> {
  const tenant = await requireTenantContext();
  try {
    await removeAreaMember(tenant.churchId, areaId, personId);
  } catch (err) {
    return asState(err);
  }
  revalidateArea(areaId);
  return OK;
}

export async function crearPuestoAction(areaId: string, formData: FormData): Promise<AreaFichaState> {
  const tenant = await requireTenantContext();
  try {
    const maxPeopleRaw = String(formData.get("maxPeople") ?? "").trim();
    await createPosition(tenant.churchId, areaId, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "").trim() || undefined,
      critical: formData.get("critical") === "on",
      minPeople: Number(formData.get("minPeople") ?? 1) || 1,
      maxPeople: maxPeopleRaw ? Number(maxPeopleRaw) : null,
      requiresAutonomousPerson: formData.get("requiresAutonomous") === "on",
    });
  } catch (err) {
    return asState(err);
  }
  revalidateArea(areaId);
  return OK;
}

export async function archivarPuestoAction(areaId: string, positionId: string): Promise<AreaFichaState> {
  const tenant = await requireTenantContext();
  try {
    await archivePosition(tenant.churchId, positionId);
  } catch (err) {
    return asState(err);
  }
  revalidateArea(areaId);
  return OK;
}

export async function crearEquipoEnAreaAction(areaId: string, formData: FormData): Promise<AreaFichaState> {
  const tenant = await requireTenantContext();
  try {
    await createTeam(tenant.churchId, {
      areaId,
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "").trim() || undefined,
    });
  } catch (err) {
    return asState(err);
  }
  revalidateArea(areaId);
  revalidatePath("/app/servicios/equipos");
  return OK;
}
