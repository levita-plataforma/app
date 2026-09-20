"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { DomainError } from "@/server/errors/domain-error";
import { createGivingCampaign, transitionGivingCampaignStatus, type GivingCampaignStatus } from "@/server/giving/giving-service";

export type CampaignFormState = { error: string | null };
export const campaignFormInitialState: CampaignFormState = { error: null };

export async function crearCampanaAction(_prevState: CampaignFormState, formData: FormData): Promise<CampaignFormState> {
  const tenant = await requireTenantContext();
  const fundId = String(formData.get("fundId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const targetRaw = String(formData.get("targetAmount") ?? "").trim();

  if (!fundId) return { error: "Selecciona un fondo." };
  if (!name) return { error: "El nombre es obligatorio." };

  const targetAmountMinor = targetRaw ? Math.round(Number(targetRaw) * 100) : null;
  if (targetRaw && (!Number.isFinite(targetAmountMinor) || (targetAmountMinor ?? 0) <= 0)) {
    return { error: "La meta debe ser un importe válido." };
  }

  try {
    await requireCapability(tenant.churchId, "giving.manage_campaigns");
    await createGivingCampaign(tenant.churchId, { fundId, name, description, targetAmountMinor });
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/ofrendas/campanas");
  return { error: null };
}

export async function cambiarEstadoCampanaAction(
  campaignId: string,
  status: GivingCampaignStatus,
): Promise<{ error: string | null }> {
  const tenant = await requireTenantContext();
  try {
    await requireCapability(tenant.churchId, "giving.manage_campaigns");
    await transitionGivingCampaignStatus(tenant.churchId, campaignId, status);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/ofrendas/campanas");
  return { error: null };
}
