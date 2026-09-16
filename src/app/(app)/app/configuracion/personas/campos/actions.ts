"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createCustomField, archiveCustomField, type CustomFieldType } from "@/server/people/custom-fields-service";
import { DomainError } from "@/server/errors/domain-error";

export type CamposState = { error: string | null };

export async function crearCampoAction(_prevState: CamposState, formData: FormData): Promise<CamposState> {
  const tenant = await requireTenantContext();
  const optionsRaw = String(formData.get("options") ?? "").trim();

  try {
    await createCustomField(tenant.churchId, {
      name: String(formData.get("name") ?? ""),
      fieldType: String(formData.get("fieldType") ?? "text") as CustomFieldType,
      options: optionsRaw ? optionsRaw.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
      isSensitive: formData.get("isSensitive") === "on",
    });
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/configuracion/personas/campos");
  return { error: null };
}

export async function archivarCampoAction(fieldId: string): Promise<CamposState> {
  const tenant = await requireTenantContext();
  try {
    await archiveCustomField(tenant.churchId, fieldId);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  revalidatePath("/app/configuracion/personas/campos");
  return { error: null };
}
