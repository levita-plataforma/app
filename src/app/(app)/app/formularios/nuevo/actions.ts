"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createForm } from "@/server/forms/forms-service";
import { DomainError } from "@/server/errors/domain-error";

export type NuevoFormularioState = { error: string | null };

export async function crearFormularioAction(
  _prev: NuevoFormularioState,
  formData: FormData,
): Promise<NuevoFormularioState> {
  const tenant = await requireTenantContext();

  let formId: string;
  try {
    const result = await createForm(tenant.churchId, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "").trim() || undefined,
      purpose: String(formData.get("purpose") ?? ""),
    });
    formId = result.formId;
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/formularios");
  redirect(`/app/formularios/${formId}`);
}
