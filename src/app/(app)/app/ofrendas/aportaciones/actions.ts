"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { DomainError } from "@/server/errors/domain-error";
import {
  createGivingContribution,
  updateGivingContribution,
  cancelGivingContribution,
  createGivingRefund,
  type GivingMethod,
} from "@/server/giving/giving-service";

export type ContributionFormState = { error: string | null };
export const contributionFormInitialState: ContributionFormState = { error: null };

export async function crearAportacionAction(
  _prevState: ContributionFormState,
  formData: FormData,
): Promise<ContributionFormState> {
  const tenant = await requireTenantContext();

  const fundId = String(formData.get("fundId") ?? "");
  const method = String(formData.get("method") ?? "") as GivingMethod;
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const campaignId = String(formData.get("campaignId") ?? "") || null;
  const personId = String(formData.get("personId") ?? "") || null;
  const anonymous = formData.get("anonymous") === "on";
  const contributedAtRaw = String(formData.get("contributedAt") ?? "");
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!fundId) return { error: "Selecciona un fondo." };
  if (!method) return { error: "Selecciona un método." };

  const amountMinor = Math.round(Number(amountRaw) * 100);
  if (!amountRaw || !Number.isFinite(amountMinor) || amountMinor <= 0) {
    return { error: "El importe debe ser mayor que cero." };
  }

  let contributionId: string;
  try {
    await requireCapability(tenant.churchId, "giving.create_contribution");
    contributionId = await createGivingContribution(tenant.churchId, {
      fundId,
      amountMinor,
      method,
      campaignId,
      personId: anonymous ? null : personId,
      anonymous,
      contributedAt: contributedAtRaw ? new Date(contributedAtRaw).toISOString() : null,
      reference,
      notes,
    });
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/ofrendas");
  revalidatePath("/app/ofrendas/aportaciones");
  redirect(`/app/ofrendas/aportaciones/${contributionId}`);
}

export async function actualizarAportacionAction(
  contributionId: string,
  _prevState: ContributionFormState,
  formData: FormData,
): Promise<ContributionFormState> {
  const tenant = await requireTenantContext();
  const fundId = String(formData.get("fundId") ?? "");
  const campaignId = String(formData.get("campaignId") ?? "") || null;
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!fundId) return { error: "Selecciona un fondo." };

  try {
    await requireCapability(tenant.churchId, "giving.update_contribution");
    await updateGivingContribution(tenant.churchId, contributionId, { fundId, campaignId, reference, notes });
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath(`/app/ofrendas/aportaciones/${contributionId}`);
  return { error: null };
}

export async function cancelarAportacionAction(contributionId: string, reason?: string): Promise<{ error: string | null }> {
  const tenant = await requireTenantContext();
  try {
    await requireCapability(tenant.churchId, "giving.update_contribution");
    await cancelGivingContribution(tenant.churchId, contributionId, reason);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath(`/app/ofrendas/aportaciones/${contributionId}`);
  revalidatePath("/app/ofrendas/aportaciones");
  return { error: null };
}

export async function reembolsarAportacionAction(
  contributionId: string,
  amountMinor: number,
  reason?: string,
): Promise<{ error: string | null }> {
  const tenant = await requireTenantContext();
  try {
    await requireCapability(tenant.churchId, "giving.refund");
    await createGivingRefund(tenant.churchId, contributionId, amountMinor, reason);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath(`/app/ofrendas/aportaciones/${contributionId}`);
  revalidatePath("/app/ofrendas/aportaciones");
  return { error: null };
}
