"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import {
  createQualification,
  updateQualification,
  archiveQualification,
  assignQualification,
  updatePersonQualification,
  verifyQualification,
  removePersonQualification,
  type QualificationLevel,
} from "@/server/serving/qualifications-service";
import { DomainError } from "@/server/errors/domain-error";

export type CualificacionesState = { error: string | null; success?: boolean };
const OK: CualificacionesState = { error: null, success: true };

function asState(err: unknown): CualificacionesState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

function revalidate() {
  revalidatePath("/app/servicios/cualificaciones");
  revalidatePath("/app/servicios");
}

export async function crearCualificacionAction(
  _prev: CualificacionesState,
  formData: FormData,
): Promise<CualificacionesState> {
  const tenant = await requireTenantContext();
  try {
    await createQualification(tenant.churchId, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "").trim() || undefined,
      category: String(formData.get("category") ?? "").trim() || undefined,
      expiryRequired: formData.get("expiryRequired") === "on",
    });
  } catch (err) {
    return asState(err);
  }
  revalidate();
  return OK;
}

export async function editarCualificacionAction(
  qualificationId: string,
  input: { name?: string; description?: string; category?: string; expiryRequired?: boolean; active?: boolean },
): Promise<CualificacionesState> {
  const tenant = await requireTenantContext();
  try {
    await updateQualification(tenant.churchId, qualificationId, input);
  } catch (err) {
    return asState(err);
  }
  revalidate();
  return OK;
}

export async function archivarCualificacionAction(qualificationId: string): Promise<CualificacionesState> {
  const tenant = await requireTenantContext();
  try {
    await archiveQualification(tenant.churchId, qualificationId);
  } catch (err) {
    return asState(err);
  }
  revalidate();
  return OK;
}

export async function asignarCualificacionAction(
  _prev: CualificacionesState,
  formData: FormData,
): Promise<CualificacionesState> {
  const tenant = await requireTenantContext();
  try {
    await assignQualification(
      tenant.churchId,
      String(formData.get("personId") ?? ""),
      String(formData.get("qualificationId") ?? ""),
      {
        level: (String(formData.get("level") ?? "basic") as QualificationLevel) || "basic",
        expiresAt: String(formData.get("expiresAt") ?? "").trim() || null,
        verified: formData.get("verified") === "on",
      },
    );
  } catch (err) {
    return asState(err);
  }
  revalidate();
  return OK;
}

export async function verificarCualificacionAction(
  personId: string,
  qualificationId: string,
): Promise<CualificacionesState> {
  const tenant = await requireTenantContext();
  try {
    await verifyQualification(tenant.churchId, personId, qualificationId);
  } catch (err) {
    return asState(err);
  }
  revalidate();
  return OK;
}

export async function actualizarVencimientoAction(
  personId: string,
  qualificationId: string,
  expiresAt: string | null,
): Promise<CualificacionesState> {
  const tenant = await requireTenantContext();
  try {
    await updatePersonQualification(tenant.churchId, personId, qualificationId, { expiresAt });
  } catch (err) {
    return asState(err);
  }
  revalidate();
  return OK;
}

export async function quitarCualificacionPersonaAction(
  personId: string,
  qualificationId: string,
): Promise<CualificacionesState> {
  const tenant = await requireTenantContext();
  try {
    await removePersonQualification(tenant.churchId, personId, qualificationId);
  } catch (err) {
    return asState(err);
  }
  revalidate();
  return OK;
}
