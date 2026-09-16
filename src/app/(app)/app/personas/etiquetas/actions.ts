"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createTag, updateTag, archiveTag } from "@/server/people/tags-service";
import { DomainError } from "@/server/errors/domain-error";

export type EtiquetasState = { error: string | null };

export async function crearEtiquetaAction(_prevState: EtiquetasState, formData: FormData): Promise<EtiquetasState> {
  const tenant = await requireTenantContext();
  try {
    await createTag(tenant.churchId, String(formData.get("name") ?? ""), String(formData.get("color") ?? "") || undefined);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  revalidatePath("/app/personas/etiquetas");
  return { error: null };
}

export async function editarEtiquetaAction(tagId: string, name: string, color: string): Promise<EtiquetasState> {
  const tenant = await requireTenantContext();
  try {
    await updateTag(tenant.churchId, tagId, name, color || undefined);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  revalidatePath("/app/personas/etiquetas");
  return { error: null };
}

export async function archivarEtiquetaAction(tagId: string): Promise<EtiquetasState> {
  const tenant = await requireTenantContext();
  try {
    await archiveTag(tenant.churchId, tagId);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  revalidatePath("/app/personas/etiquetas");
  return { error: null };
}
