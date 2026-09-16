"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import {
  createTeam,
  updateTeam,
  archiveTeam,
  addTeamMember,
  removeTeamMember,
} from "@/server/serving/service-teams-service";
import { DomainError } from "@/server/errors/domain-error";

export type EquiposState = { error: string | null; success?: boolean };
const OK: EquiposState = { error: null, success: true };

function asState(err: unknown): EquiposState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

export async function crearEquipoAction(_prev: EquiposState, formData: FormData): Promise<EquiposState> {
  const tenant = await requireTenantContext();
  try {
    await createTeam(tenant.churchId, {
      areaId: String(formData.get("areaId") ?? ""),
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "").trim() || undefined,
      campusId: String(formData.get("campusId") ?? "").trim() || undefined,
    });
  } catch (err) {
    return asState(err);
  }
  revalidatePath("/app/servicios/equipos");
  revalidatePath("/app/servicios");
  return OK;
}

export async function editarEquipoAction(
  teamId: string,
  input: { name?: string; description?: string; campusId?: string | null; active?: boolean; areaId?: string },
): Promise<EquiposState> {
  const tenant = await requireTenantContext();
  try {
    await updateTeam(tenant.churchId, teamId, input);
  } catch (err) {
    return asState(err);
  }
  revalidatePath("/app/servicios/equipos");
  return OK;
}

export async function archivarEquipoAction(teamId: string): Promise<EquiposState> {
  const tenant = await requireTenantContext();
  try {
    await archiveTeam(tenant.churchId, teamId);
  } catch (err) {
    return asState(err);
  }
  revalidatePath("/app/servicios/equipos");
  revalidatePath("/app/servicios");
  return OK;
}

export async function anadirMiembroEquipoAction(
  teamId: string,
  personId: string,
  isLeader: boolean,
): Promise<EquiposState> {
  const tenant = await requireTenantContext();
  try {
    await addTeamMember(tenant.churchId, teamId, personId, isLeader);
  } catch (err) {
    return asState(err);
  }
  revalidatePath("/app/servicios/equipos");
  return OK;
}

export async function quitarMiembroEquipoAction(teamId: string, personId: string): Promise<EquiposState> {
  const tenant = await requireTenantContext();
  try {
    await removeTeamMember(tenant.churchId, teamId, personId);
  } catch (err) {
    return asState(err);
  }
  revalidatePath("/app/servicios/equipos");
  return OK;
}
