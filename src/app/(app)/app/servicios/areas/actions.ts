"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import {
  createServiceArea,
  updateServiceArea,
  archiveServiceArea,
  restoreServiceArea,
  reorderServiceAreas,
} from "@/server/serving/service-areas-service";
import { DomainError } from "@/server/errors/domain-error";

export type AreasState = { error: string | null; success?: boolean };
const OK: AreasState = { error: null, success: true };

function asState(err: unknown): AreasState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

export async function crearAreaAction(_prev: AreasState, formData: FormData): Promise<AreasState> {
  const tenant = await requireTenantContext();
  try {
    await createServiceArea(tenant.churchId, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "").trim() || undefined,
      icon: String(formData.get("icon") ?? "").trim() || undefined,
      campusId: String(formData.get("campusId") ?? "").trim() || undefined,
      templateKey: String(formData.get("templateKey") ?? "").trim() || undefined,
    });
  } catch (err) {
    return asState(err);
  }
  revalidatePath("/app/servicios/areas");
  revalidatePath("/app/servicios");
  return OK;
}

export async function editarAreaAction(
  areaId: string,
  input: { name?: string; description?: string; campusId?: string | null; active?: boolean },
): Promise<AreasState> {
  const tenant = await requireTenantContext();
  try {
    await updateServiceArea(tenant.churchId, areaId, input);
  } catch (err) {
    return asState(err);
  }
  revalidatePath("/app/servicios/areas");
  revalidatePath(`/app/servicios/areas/${areaId}`);
  return OK;
}

export async function archivarAreaAction(areaId: string): Promise<AreasState> {
  const tenant = await requireTenantContext();
  try {
    await archiveServiceArea(tenant.churchId, areaId);
  } catch (err) {
    return asState(err);
  }
  revalidatePath("/app/servicios/areas");
  revalidatePath("/app/servicios");
  return OK;
}

export async function restaurarAreaAction(areaId: string): Promise<AreasState> {
  const tenant = await requireTenantContext();
  try {
    await restoreServiceArea(tenant.churchId, areaId);
  } catch (err) {
    return asState(err);
  }
  revalidatePath("/app/servicios/areas");
  return OK;
}

export async function reordenarAreasAction(orderedIds: string[]): Promise<AreasState> {
  const tenant = await requireTenantContext();
  try {
    await reorderServiceAreas(tenant.churchId, orderedIds);
  } catch (err) {
    return asState(err);
  }
  revalidatePath("/app/servicios/areas");
  return OK;
}
