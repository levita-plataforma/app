"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createHousehold, archiveHousehold } from "@/server/people/households-service";
import { DomainError } from "@/server/errors/domain-error";

export type FamiliasState = { error: string | null };

export async function crearFamiliaAction(_prevState: FamiliasState, formData: FormData): Promise<FamiliasState> {
  const tenant = await requireTenantContext();
  try {
    await createHousehold(tenant.churchId, String(formData.get("name") ?? ""), String(formData.get("address") ?? "") || undefined);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  revalidatePath("/app/familias");
  return { error: null };
}

export async function archivarFamiliaAction(householdId: string): Promise<FamiliasState> {
  const tenant = await requireTenantContext();
  try {
    await archiveHousehold(tenant.churchId, householdId);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  revalidatePath("/app/familias");
  return { error: null };
}
