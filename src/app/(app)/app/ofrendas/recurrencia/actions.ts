"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { DomainError } from "@/server/errors/domain-error";
import {
  createGivingRecurringPlan,
  setGivingRecurringPlanStatus,
  type GivingRecurrenceFrequency,
  type GivingRecurringPlanStatus,
} from "@/server/giving/giving-service";

export type RecurringPlanFormState = { error: string | null };
export const recurringPlanFormInitialState: RecurringPlanFormState = { error: null };

export async function crearPlanRecurrenteAction(
  _prevState: RecurringPlanFormState,
  formData: FormData,
): Promise<RecurringPlanFormState> {
  const tenant = await requireTenantContext();
  const fundId = String(formData.get("fundId") ?? "");
  const frequency = String(formData.get("frequency") ?? "") as GivingRecurrenceFrequency;
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const personId = String(formData.get("personId") ?? "").trim() || null;

  if (!fundId) return { error: "Selecciona un fondo." };
  if (!frequency) return { error: "Selecciona una frecuencia." };

  const amountMinor = Math.round(Number(amountRaw) * 100);
  if (!amountRaw || !Number.isFinite(amountMinor) || amountMinor <= 0) {
    return { error: "El importe debe ser mayor que cero." };
  }

  try {
    await requireCapability(tenant.churchId, "giving.create_contribution");
    await createGivingRecurringPlan(tenant.churchId, { fundId, amountMinor, frequency, personId });
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/ofrendas/recurrencia");
  return { error: null };
}

export async function cambiarEstadoPlanAction(planId: string, status: GivingRecurringPlanStatus): Promise<{ error: string | null }> {
  const tenant = await requireTenantContext();
  try {
    await requireCapability(tenant.churchId, "giving.update_contribution");
    await setGivingRecurringPlanStatus(tenant.churchId, planId, status);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/ofrendas/recurrencia");
  return { error: null };
}
