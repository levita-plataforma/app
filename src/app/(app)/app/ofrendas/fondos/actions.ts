"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { DomainError } from "@/server/errors/domain-error";
import { createGivingFund, updateGivingFund, archiveGivingFund, setGivingFundDefault } from "@/server/giving/giving-service";

export type FundFormState = { error: string | null };
export const fundFormInitialState: FundFormState = { error: null };

export async function crearFondoAction(_prevState: FundFormState, formData: FormData): Promise<FundFormState> {
  const tenant = await requireTenantContext();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const isDefault = formData.get("isDefault") === "on";

  if (!name) return { error: "El nombre es obligatorio." };

  try {
    await requireCapability(tenant.churchId, "giving.manage_funds");
    await createGivingFund(tenant.churchId, { name, description, isDefault });
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/ofrendas");
  revalidatePath("/app/ofrendas/fondos");
  return { error: null };
}

export async function actualizarFondoAction(
  fundId: string,
  _prevState: FundFormState,
  formData: FormData,
): Promise<FundFormState> {
  const tenant = await requireTenantContext();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!name) return { error: "El nombre es obligatorio." };

  try {
    await requireCapability(tenant.churchId, "giving.manage_funds");
    await updateGivingFund(tenant.churchId, fundId, { name, description });
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/ofrendas/fondos");
  return { error: null };
}

export async function archivarFondoAction(fundId: string): Promise<{ error: string | null }> {
  const tenant = await requireTenantContext();
  try {
    await requireCapability(tenant.churchId, "giving.manage_funds");
    await archiveGivingFund(tenant.churchId, fundId);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/ofrendas/fondos");
  revalidatePath("/app/ofrendas");
  return { error: null };
}

export async function marcarFondoDefaultAction(fundId: string): Promise<{ error: string | null }> {
  const tenant = await requireTenantContext();
  try {
    await requireCapability(tenant.churchId, "giving.manage_funds");
    await setGivingFundDefault(tenant.churchId, fundId);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/ofrendas/fondos");
  return { error: null };
}
