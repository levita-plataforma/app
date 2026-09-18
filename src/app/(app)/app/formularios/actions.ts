"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { duplicateForm, archiveForm } from "@/server/forms/forms-service";
import { DomainError } from "@/server/errors/domain-error";

export type FormulariosState = { error: string | null; success?: boolean };
const OK: FormulariosState = { error: null, success: true };

function asState(err: unknown): FormulariosState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

function revalidate() {
  revalidatePath("/app/formularios");
}

export async function duplicarFormularioAction(formId: string): Promise<FormulariosState> {
  const tenant = await requireTenantContext();
  try {
    await duplicateForm(tenant.churchId, formId);
  } catch (err) {
    return asState(err);
  }
  revalidate();
  return OK;
}

export async function archivarFormularioAction(formId: string): Promise<FormulariosState> {
  const tenant = await requireTenantContext();
  try {
    await archiveForm(tenant.churchId, formId);
  } catch (err) {
    return asState(err);
  }
  revalidate();
  return OK;
}
