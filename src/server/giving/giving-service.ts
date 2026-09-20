import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { callActivityRpc, toDomainError } from "@/server/activities/rpc";

/**
 * Giving: donaciones/aportaciones que recibe la iglesia (Fase 12, Diogo).
 * NO es billing de LEVITA — ver docs/06-facturacion.md §9. Dominio sensible:
 * church_owner/church_admin NO tienen automáticamente acceso al detalle de
 * aportaciones individuales (giving.read_contributions), solo al resumen
 * agregado (giving.read_summary). Ver docs/FASE-12-GIVING.md.
 *
 * Dinero SIEMPRE en amount_minor (bigint, céntimos), nunca float/double.
 */

export const GIVING_METHODS = ["cash", "bank_transfer", "card", "direct_debit", "other"] as const;
export type GivingMethod = (typeof GIVING_METHODS)[number];

export const GIVING_METHOD_LABELS: Record<GivingMethod, string> = {
  cash: "Efectivo",
  bank_transfer: "Transferencia",
  card: "Tarjeta",
  direct_debit: "Domiciliación",
  other: "Otro",
};

export const GIVING_CONTRIBUTION_STATUSES = ["pending", "succeeded", "failed", "refunded", "cancelled"] as const;
export type GivingContributionStatus = (typeof GIVING_CONTRIBUTION_STATUSES)[number];

export const GIVING_RECONCILIATION_STATUSES = ["unreconciled", "reconciled", "exception"] as const;
export type GivingReconciliationStatus = (typeof GIVING_RECONCILIATION_STATUSES)[number];

export const GIVING_CAMPAIGN_STATUSES = ["draft", "active", "closed", "archived"] as const;
export type GivingCampaignStatus = (typeof GIVING_CAMPAIGN_STATUSES)[number];

export const GIVING_RECURRENCE_FREQUENCIES = ["weekly", "monthly", "yearly"] as const;
export type GivingRecurrenceFrequency = (typeof GIVING_RECURRENCE_FREQUENCIES)[number];

export const GIVING_RECURRING_PLAN_STATUSES = ["active", "paused", "ended"] as const;
export type GivingRecurringPlanStatus = (typeof GIVING_RECURRING_PLAN_STATUSES)[number];

// ---------------------------------------------------------------------------
// Formato de dinero (encargo §53): siempre Intl.NumberFormat, nunca cálculo
// float autoritativo. Esta función es de presentación, no de dominio.
// ---------------------------------------------------------------------------

export function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amountMinor / 100);
}

// ---------------------------------------------------------------------------
// Funds
// ---------------------------------------------------------------------------

export type GivingFund = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

type GivingFundRow = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

function mapFund(row: GivingFundRow): GivingFund {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listGivingFunds(churchId: string, status: "active" | "archived" = "active"): Promise<GivingFund[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("giving_funds")
    .select("id, name, description, status, is_default, created_at, updated_at")
    .eq("church_id", churchId)
    .eq("status", status)
    .order("name");

  if (error) throw toDomainError(error, "No se pudieron cargar los fondos.");
  return ((data ?? []) as GivingFundRow[]).map(mapFund);
}

export async function createGivingFund(
  churchId: string,
  input: { name: string; description?: string | null; isDefault?: boolean },
): Promise<string> {
  return callActivityRpc<string>(
    "create_giving_fund",
    { p_church_id: churchId, p_name: input.name, p_description: input.description ?? null, p_is_default: input.isDefault ?? false },
    "No se pudo crear el fondo.",
  );
}

export async function updateGivingFund(churchId: string, fundId: string, input: { name: string; description?: string | null }): Promise<void> {
  await callActivityRpc<void>(
    "update_giving_fund",
    { p_fund_id: fundId, p_church_id: churchId, p_name: input.name, p_description: input.description ?? null },
    "No se pudo actualizar el fondo.",
  );
}

export async function setGivingFundDefault(churchId: string, fundId: string): Promise<void> {
  await callActivityRpc<void>(
    "set_giving_fund_default",
    { p_fund_id: fundId, p_church_id: churchId },
    "No se pudo cambiar el fondo por defecto.",
  );
}

export async function archiveGivingFund(churchId: string, fundId: string): Promise<void> {
  await callActivityRpc<void>("archive_giving_fund", { p_fund_id: fundId, p_church_id: churchId }, "No se pudo archivar el fondo.");
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export type GivingCampaign = {
  id: string;
  fundId: string;
  name: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  targetAmountMinor: number | null;
  currency: string;
  status: GivingCampaignStatus;
  createdAt: string;
};

type GivingCampaignRow = {
  id: string;
  fund_id: string;
  name: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  target_amount_minor: number | null;
  currency: string;
  status: GivingCampaignStatus;
  created_at: string;
};

function mapCampaign(row: GivingCampaignRow): GivingCampaign {
  return {
    id: row.id,
    fundId: row.fund_id,
    name: row.name,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    targetAmountMinor: row.target_amount_minor,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function listGivingCampaigns(churchId: string): Promise<GivingCampaign[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("giving_campaigns")
    .select("id, fund_id, name, description, starts_at, ends_at, target_amount_minor, currency, status, created_at")
    .eq("church_id", churchId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  if (error) throw toDomainError(error, "No se pudieron cargar las campañas.");
  return ((data ?? []) as GivingCampaignRow[]).map(mapCampaign);
}

export type GivingCampaignInput = {
  fundId: string;
  name: string;
  description?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  targetAmountMinor?: number | null;
  currency?: string | null;
};

export async function createGivingCampaign(churchId: string, input: GivingCampaignInput): Promise<string> {
  return callActivityRpc<string>(
    "create_giving_campaign",
    {
      p_church_id: churchId,
      p_fund_id: input.fundId,
      p_name: input.name,
      p_description: input.description ?? null,
      p_starts_at: input.startsAt ?? null,
      p_ends_at: input.endsAt ?? null,
      p_target_amount_minor: input.targetAmountMinor ?? null,
      p_currency: input.currency ?? null,
    },
    "No se pudo crear la campaña.",
  );
}

export async function updateGivingCampaign(
  churchId: string,
  campaignId: string,
  input: Omit<GivingCampaignInput, "fundId" | "currency">,
): Promise<void> {
  await callActivityRpc<void>(
    "update_giving_campaign",
    {
      p_campaign_id: campaignId,
      p_church_id: churchId,
      p_name: input.name,
      p_description: input.description ?? null,
      p_starts_at: input.startsAt ?? null,
      p_ends_at: input.endsAt ?? null,
      p_target_amount_minor: input.targetAmountMinor ?? null,
    },
    "No se pudo actualizar la campaña.",
  );
}

export async function transitionGivingCampaignStatus(churchId: string, campaignId: string, status: GivingCampaignStatus): Promise<void> {
  await callActivityRpc<void>(
    "transition_giving_campaign_status",
    { p_campaign_id: campaignId, p_church_id: churchId, p_status: status },
    "No se pudo cambiar el estado de la campaña.",
  );
}

// ---------------------------------------------------------------------------
// Contributions (detalle — exige giving.read_contributions vía RLS)
// ---------------------------------------------------------------------------

export type GivingContribution = {
  id: string;
  fundId: string;
  campaignId: string | null;
  personId: string | null;
  anonymous: boolean;
  amountMinor: number;
  currency: string;
  method: GivingMethod;
  status: GivingContributionStatus;
  reconciliationStatus: GivingReconciliationStatus;
  contributedAt: string;
  reference: string | null;
  notes: string | null;
};

type GivingContributionRow = {
  id: string;
  fund_id: string;
  campaign_id: string | null;
  person_id: string | null;
  anonymous: boolean;
  amount_minor: number;
  currency: string;
  method: GivingMethod;
  status: GivingContributionStatus;
  reconciliation_status: GivingReconciliationStatus;
  contributed_at: string;
  reference: string | null;
  notes: string | null;
};

const CONTRIBUTION_COLUMNS =
  "id, fund_id, campaign_id, person_id, anonymous, amount_minor, currency, method, status, reconciliation_status, contributed_at, reference, notes";

function mapContribution(row: GivingContributionRow): GivingContribution {
  return {
    id: row.id,
    fundId: row.fund_id,
    campaignId: row.campaign_id,
    personId: row.person_id,
    anonymous: row.anonymous,
    amountMinor: row.amount_minor,
    currency: row.currency,
    method: row.method,
    status: row.status,
    reconciliationStatus: row.reconciliation_status,
    contributedAt: row.contributed_at,
    reference: row.reference,
    notes: row.notes,
  };
}

export type GivingContributionFilters = {
  fundId?: string;
  campaignId?: string;
  method?: GivingMethod;
  status?: GivingContributionStatus;
  reconciliationStatus?: GivingReconciliationStatus;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

/**
 * Lectura de DETALLE. Requiere giving.read_contributions vía RLS — si el
 * usuario solo tiene giving.read_summary, esta consulta devuelve 0 filas
 * (no hay política de SELECT que se lo permita), nunca un error que revele
 * que hay datos ocultos.
 */
export async function listGivingContributions(
  churchId: string,
  filters: GivingContributionFilters = {},
): Promise<GivingContribution[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("giving_contributions")
    .select(CONTRIBUTION_COLUMNS)
    .eq("church_id", churchId)
    .order("contributed_at", { ascending: false });

  if (filters.fundId) query = query.eq("fund_id", filters.fundId);
  if (filters.campaignId) query = query.eq("campaign_id", filters.campaignId);
  if (filters.method) query = query.eq("method", filters.method);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.reconciliationStatus) query = query.eq("reconciliation_status", filters.reconciliationStatus);
  if (filters.from) query = query.gte("contributed_at", filters.from);
  if (filters.to) query = query.lt("contributed_at", filters.to);
  if (filters.limit) query = query.limit(filters.limit);
  if (filters.offset) query = query.range(filters.offset, filters.offset + (filters.limit ?? 50) - 1);

  const { data, error } = await query;
  if (error) throw toDomainError(error, "No se pudieron cargar las aportaciones.");
  return ((data ?? []) as GivingContributionRow[]).map(mapContribution);
}

export type GivingContributionInput = {
  fundId: string;
  amountMinor: number;
  method: GivingMethod;
  campaignId?: string | null;
  personId?: string | null;
  anonymous?: boolean;
  currency?: string | null;
  contributedAt?: string | null;
  reference?: string | null;
  notes?: string | null;
};

export async function createGivingContribution(churchId: string, input: GivingContributionInput): Promise<string> {
  return callActivityRpc<string>(
    "create_giving_contribution",
    {
      p_church_id: churchId,
      p_fund_id: input.fundId,
      p_amount_minor: input.amountMinor,
      p_method: input.method,
      p_campaign_id: input.campaignId ?? null,
      p_person_id: input.personId ?? null,
      p_anonymous: input.anonymous ?? false,
      p_currency: input.currency ?? null,
      p_contributed_at: input.contributedAt ?? null,
      p_reference: input.reference ?? null,
      p_notes: input.notes ?? null,
    },
    "No se pudo registrar la aportación.",
  );
}

export async function updateGivingContribution(
  churchId: string,
  contributionId: string,
  input: { fundId: string; campaignId?: string | null; reference?: string | null; notes?: string | null; contributedAt?: string | null },
): Promise<void> {
  await callActivityRpc<void>(
    "update_giving_contribution",
    {
      p_contribution_id: contributionId,
      p_church_id: churchId,
      p_fund_id: input.fundId,
      p_campaign_id: input.campaignId ?? null,
      p_reference: input.reference ?? null,
      p_notes: input.notes ?? null,
      p_contributed_at: input.contributedAt ?? null,
    },
    "No se pudo actualizar la aportación.",
  );
}

export async function cancelGivingContribution(churchId: string, contributionId: string, reason?: string): Promise<void> {
  await callActivityRpc<void>(
    "cancel_giving_contribution",
    { p_contribution_id: contributionId, p_church_id: churchId, p_reason: reason ?? null },
    "No se pudo cancelar la aportación.",
  );
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export async function createGivingRefund(
  churchId: string,
  contributionId: string,
  amountMinor: number,
  reason?: string,
): Promise<string> {
  return callActivityRpc<string>(
    "create_giving_refund",
    { p_contribution_id: contributionId, p_church_id: churchId, p_amount_minor: amountMinor, p_reason: reason ?? null },
    "No se pudo registrar la devolución.",
  );
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export async function reconcileGivingContribution(
  churchId: string,
  contributionId: string,
  externalReference?: string,
  notes?: string,
): Promise<string> {
  return callActivityRpc<string>(
    "reconcile_giving_contribution",
    { p_contribution_id: contributionId, p_church_id: churchId, p_external_reference: externalReference ?? null, p_notes: notes ?? null },
    "No se pudo conciliar la aportación.",
  );
}

export async function markGivingContributionException(churchId: string, contributionId: string, notes?: string): Promise<void> {
  await callActivityRpc<void>(
    "mark_giving_contribution_exception",
    { p_contribution_id: contributionId, p_church_id: churchId, p_notes: notes ?? null },
    "No se pudo marcar la excepción de conciliación.",
  );
}

// ---------------------------------------------------------------------------
// Recurring plans
// ---------------------------------------------------------------------------

export type GivingRecurringPlan = {
  id: string;
  personId: string | null;
  fundId: string;
  campaignId: string | null;
  amountMinor: number;
  currency: string;
  frequency: GivingRecurrenceFrequency;
  status: GivingRecurringPlanStatus;
  nextDueAt: string | null;
  startsAt: string;
};

type GivingRecurringPlanRow = {
  id: string;
  person_id: string | null;
  fund_id: string;
  campaign_id: string | null;
  amount_minor: number;
  currency: string;
  frequency: GivingRecurrenceFrequency;
  status: GivingRecurringPlanStatus;
  next_due_at: string | null;
  starts_at: string;
};

function mapRecurringPlan(row: GivingRecurringPlanRow): GivingRecurringPlan {
  return {
    id: row.id,
    personId: row.person_id,
    fundId: row.fund_id,
    campaignId: row.campaign_id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    frequency: row.frequency,
    status: row.status,
    nextDueAt: row.next_due_at,
    startsAt: row.starts_at,
  };
}

export async function listGivingRecurringPlans(churchId: string): Promise<GivingRecurringPlan[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("giving_recurring_plans")
    .select("id, person_id, fund_id, campaign_id, amount_minor, currency, frequency, status, next_due_at, starts_at")
    .eq("church_id", churchId)
    .order("starts_at", { ascending: false });

  if (error) throw toDomainError(error, "No se pudieron cargar los planes recurrentes.");
  return ((data ?? []) as GivingRecurringPlanRow[]).map(mapRecurringPlan);
}

export type GivingRecurringPlanInput = {
  fundId: string;
  amountMinor: number;
  frequency: GivingRecurrenceFrequency;
  personId?: string | null;
  campaignId?: string | null;
  currency?: string | null;
  startsAt?: string | null;
};

export async function createGivingRecurringPlan(churchId: string, input: GivingRecurringPlanInput): Promise<string> {
  return callActivityRpc<string>(
    "create_giving_recurring_plan",
    {
      p_church_id: churchId,
      p_fund_id: input.fundId,
      p_amount_minor: input.amountMinor,
      p_frequency: input.frequency,
      p_person_id: input.personId ?? null,
      p_campaign_id: input.campaignId ?? null,
      p_currency: input.currency ?? null,
      p_starts_at: input.startsAt ?? null,
    },
    "No se pudo crear el plan recurrente.",
  );
}

export async function setGivingRecurringPlanStatus(churchId: string, planId: string, status: GivingRecurringPlanStatus): Promise<void> {
  await callActivityRpc<void>(
    "set_giving_recurring_plan_status",
    { p_plan_id: planId, p_church_id: churchId, p_status: status },
    "No se pudo cambiar el estado del plan recurrente.",
  );
}

// ---------------------------------------------------------------------------
// Summary (agregado — separado del detalle, giving.read_summary basta)
// ---------------------------------------------------------------------------

export type GivingSummary = {
  totalAmountMinor: number;
  contributionsCount: number;
  pendingReconciliationCount: number;
  currency: string;
};

export async function getGivingSummary(churchId: string, from?: string, to?: string): Promise<GivingSummary> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("giving_summary", { p_church_id: churchId, p_from: from ?? null, p_to: to ?? null });
  if (error) throw toDomainError(error, "No se pudo cargar el resumen de Ofrendas.");
  const result = (data ?? {}) as Partial<{
    totalAmountMinor: number;
    contributionsCount: number;
    pendingReconciliationCount: number;
    currency: string;
  }>;
  return {
    totalAmountMinor: result.totalAmountMinor ?? 0,
    contributionsCount: result.contributionsCount ?? 0,
    pendingReconciliationCount: result.pendingReconciliationCount ?? 0,
    currency: result.currency ?? "EUR",
  };
}

export type GivingFundSummary = { fundId: string; fundName: string; totalAmountMinor: number; contributionsCount: number };

export async function getGivingSummaryByFund(churchId: string, from?: string, to?: string): Promise<GivingFundSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("giving_summary_by_fund", { p_church_id: churchId, p_from: from ?? null, p_to: to ?? null });
  if (error) throw toDomainError(error, "No se pudo cargar el resumen por fondo.");
  return ((data ?? []) as { fund_id: string; fund_name: string; total_amount_minor: number; contributions_count: number }[]).map((row) => ({
    fundId: row.fund_id,
    fundName: row.fund_name,
    totalAmountMinor: row.total_amount_minor,
    contributionsCount: row.contributions_count,
  }));
}

export type GivingMethodSummary = { method: GivingMethod; totalAmountMinor: number; contributionsCount: number };

export async function getGivingSummaryByMethod(churchId: string, from?: string, to?: string): Promise<GivingMethodSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("giving_summary_by_method", { p_church_id: churchId, p_from: from ?? null, p_to: to ?? null });
  if (error) throw toDomainError(error, "No se pudo cargar el resumen por método.");
  return ((data ?? []) as { method: GivingMethod; total_amount_minor: number; contributions_count: number }[]).map((row) => ({
    method: row.method,
    totalAmountMinor: row.total_amount_minor,
    contributionsCount: row.contributions_count,
  }));
}
