import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { toDomainError } from "@/server/activities/rpc";

/**
 * Gestión comercial del panel de operación (Fase 15).
 *
 * Todo pasa por RPC: la capacidad se comprueba en la base, no aquí. Este
 * fichero traduce nombres y errores, no decide permisos. Si alguien llamara a
 * estas funciones sin capacidad, la base responde 42501 y aquí se convierte en
 * un mensaje, no en un permiso.
 *
 * Esto es la cuota que la iglesia paga a LEVITA. Las donaciones que la iglesia
 * recibe son el módulo Giving (Fase 12) y no se tocan desde aquí.
 */

export type PlanVersion = {
  id: string;
  planKey: string;
  planName: string;
  version: number;
  priceCents: number | null;
  currency: string;
  billingPeriod: string;
  trialDays: number | null;
  availableForSignup: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
};

export type Entitlement = {
  capability: string;
  limitValue: number | null;
  source: "plan" | "override";
};

export type Override = {
  id: string;
  capability: string;
  limitValue: number | null;
  reason: string;
  startsAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type PlanChangePreview = {
  actual: { plan_key: string | null; version: number | null; price_cents: number | null; currency: string | null; status: string; current_period_end: string | null };
  nueva: { plan_key: string; version: number; price_cents: number | null; currency: string; billing_period: string };
  pierde: { capability: string; limit_ahora: number | null; limit_despues: number | null }[];
  uso_actual: { personas_activas: number; sedes: number };
  prorrateo: string;
  cobro: string;
};

/** Catálogo completo, con las versiones de cada plan. Solo lectura. */
export async function listPlanVersions(): Promise<PlanVersion[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("plan_versions")
    .select("id, plan_key, version, price_cents, currency, billing_period, trial_days, effective_from, effective_until, plans(name, available_for_signup)")
    .order("plan_key")
    .order("version", { ascending: false });

  if (error) throw toDomainError(error, "No se pudo cargar el catálogo de planes.");

  return (data ?? []).map((row) => {
    const plan = Array.isArray(row.plans) ? row.plans[0] : row.plans;
    return {
      id: row.id as string,
      planKey: row.plan_key as string,
      planName: (plan?.name as string) ?? (row.plan_key as string),
      version: row.version as number,
      priceCents: row.price_cents as number | null,
      currency: row.currency as string,
      billingPeriod: row.billing_period as string,
      trialDays: row.trial_days as number | null,
      availableForSignup: Boolean(plan?.available_for_signup),
      effectiveFrom: row.effective_from as string,
      effectiveUntil: row.effective_until as string | null,
    };
  });
}

/** Los derechos vigentes de una iglesia: plan más excepciones que estén en vigor. */
export async function getChurchEntitlements(churchId: string): Promise<Entitlement[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("church_entitlements", { p_church_id: churchId });
  if (error) throw toDomainError(error, "No se pudieron cargar los derechos de la iglesia.");

  type Fila = { capability: string; limit_value: number | null; source: string };
  return ((data ?? []) as Fila[]).map((row) => ({
    capability: row.capability as string,
    limitValue: row.limit_value as number | null,
    source: (row.source as "plan" | "override") ?? "plan",
  }));
}

/** Excepciones de una iglesia, incluidas las caducadas y revocadas, para poder revisarlas. */
export async function listOverrides(churchId: string): Promise<Override[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("church_entitlement_overrides")
    .select("id, capability, limit_value, reason, starts_at, expires_at, revoked_at")
    .eq("church_id", churchId)
    .order("starts_at", { ascending: false });

  if (error) throw toDomainError(error, "No se pudieron cargar las excepciones.");
  return (data ?? []).map((row) => ({
    id: row.id as string,
    capability: row.capability as string,
    limitValue: row.limit_value as number | null,
    reason: row.reason as string,
    startsAt: row.starts_at as string,
    expiresAt: row.expires_at as string | null,
    revokedAt: row.revoked_at as string | null,
  }));
}

/**
 * Qué pasaría al cambiar de plan, sin cambiar nada.
 *
 * Se llama antes de confirmar, y su resultado se enseña entero: incluidos
 * `prorrateo` y `cobro`, que dicen «no hay política» y «no hay proveedor».
 * Ocultarlos daría a entender que el cambio cobra algo, y no es así.
 */
export async function previewPlanChange(churchId: string, planVersionId: string): Promise<PlanChangePreview> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("preview_plan_change", {
    p_church_id: churchId,
    p_plan_version_id: planVersionId,
  });
  if (error) throw toDomainError(error, "No se pudo calcular el efecto del cambio de plan.");
  return data as unknown as PlanChangePreview;
}

export async function changePlan(
  churchId: string,
  planVersionId: string,
  reason: string,
  effectiveAt?: string,
): Promise<{ scheduled: boolean; effective_at: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_change_plan", {
    p_church_id: churchId,
    p_plan_version_id: planVersionId,
    p_reason: reason,
    p_effective_at: effectiveAt ?? undefined,
  });
  if (error) throw toDomainError(error, "No se pudo cambiar el plan.");
  return data as unknown as { scheduled: boolean; effective_at: string };
}

export async function grantOverride(input: {
  churchId: string;
  capability: string;
  limitValue: number | null;
  reason: string;
  expiresAt?: string;
  startsAt?: string;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("platform_grant_override", {
    p_church_id: input.churchId,
    p_capability: input.capability,
    p_limit_value: input.limitValue,
    p_reason: input.reason,
    p_expires_at: input.expiresAt ?? undefined,
    p_starts_at: input.startsAt ?? undefined,
  });
  if (error) throw toDomainError(error, "No se pudo conceder la excepción.");
}

export async function revokeOverride(overrideId: string, reason: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("platform_revoke_override", {
    p_override_id: overrideId,
    p_reason: reason,
  });
  if (error) throw toDomainError(error, "No se pudo revocar la excepción.");
}

export async function cancelSubscription(
  churchId: string,
  reason: string,
  atPeriodEnd: boolean,
): Promise<{ cancelled_now: boolean; effective_at: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_cancel_subscription", {
    p_church_id: churchId,
    p_reason: reason,
    p_at_period_end: atPeriodEnd,
  });
  if (error) throw toDomainError(error, "No se pudo cancelar la suscripción.");
  return data as unknown as { cancelled_now: boolean; effective_at: string | null };
}

export type HistoryEntry = {
  id: string;
  event: string;
  reason: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
};

export async function listSubscriptionHistory(churchId: string): Promise<HistoryEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("subscription_history")
    .select("id, event, reason, occurred_at, metadata")
    .eq("church_id", churchId)
    .order("occurred_at", { ascending: false })
    .limit(50);

  if (error) throw toDomainError(error, "No se pudo cargar el historial comercial.");
  return (data ?? []).map((row) => ({
    id: row.id as string,
    event: row.event as string,
    reason: row.reason as string | null,
    occurredAt: row.occurred_at as string,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  }));
}

/**
 * Las cuatro dimensiones del estado de una iglesia. Se leen juntas porque
 * mezclarlas en un solo indicador fue justo el problema que F15 vino a
 * arreglar: una iglesia puede estar al corriente de pago y bloqueada por
 * seguridad a la vez.
 */
export type ServiceState = {
  lifecycle: string;
  commercial: string;
  security_blocked: boolean;
  security_block_reason: string | null;
  in_maintenance: boolean;
  maintenance_until: string | null;
  archived: boolean;
  reasons: string[];
};

export async function getServiceState(churchId: string): Promise<ServiceState | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("church_service_state", { p_church_id: churchId });
  if (error) throw toDomainError(error, "No se pudo cargar el estado de la iglesia.");
  return (data as unknown as ServiceState) ?? null;
}

export async function setSecurityBlock(churchId: string, reason: string | null): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("platform_set_security_block", {
    p_church_id: churchId,
    p_reason: reason,
  });
  if (error) throw toDomainError(error, "No se pudo cambiar el bloqueo de seguridad.");
}
