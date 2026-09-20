"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { DomainError } from "@/server/errors/domain-error";
import { reconcileGivingContribution, markGivingContributionException } from "@/server/giving/giving-service";

export async function conciliarAction(contributionId: string, externalReference: string): Promise<{ error: string | null }> {
  const tenant = await requireTenantContext();
  try {
    await requireCapability(tenant.churchId, "giving.reconcile");
    await reconcileGivingContribution(tenant.churchId, contributionId, externalReference || undefined);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/ofrendas/conciliacion");
  return { error: null };
}

export async function marcarExcepcionAction(contributionId: string): Promise<{ error: string | null }> {
  const tenant = await requireTenantContext();
  try {
    await requireCapability(tenant.churchId, "giving.reconcile");
    await markGivingContributionException(tenant.churchId, contributionId);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/ofrendas/conciliacion");
  return { error: null };
}
