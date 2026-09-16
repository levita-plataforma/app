import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

/**
 * Servicio central de suscripción. Único punto de consulta del estado
 * comercial de una iglesia — ningún componente debe leer `subscriptions`
 * directamente ni dispersar lógica de "¿puede usar la plataforma?" en
 * condicionales propios. Ver docs/06-facturacion.md y encargo de Fase 1 §11.
 */

export type SubscriptionStatus =
  | "trial"
  | "active"
  | "past_due"
  | "suspended"
  | "cancelled";

export type Subscription = {
  id: string;
  churchId: string;
  planKey: string;
  status: SubscriptionStatus;
  trialEndsAt: string | null;
  startedAt: string;
  renewsAt: string | null;
  cancelAt: string | null;
  cancelledAt: string | null;
  billingProvider: string | null;
};

export async function getSubscription(churchId: string): Promise<Subscription | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("church_id", churchId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    churchId: data.church_id,
    planKey: data.plan_key,
    status: data.status,
    trialEndsAt: data.trial_ends_at,
    startedAt: data.started_at,
    renewsAt: data.renews_at,
    cancelAt: data.cancel_at,
    cancelledAt: data.cancelled_at,
    billingProvider: data.billing_provider,
  };
}

export async function getSubscriptionStatus(
  churchId: string,
): Promise<SubscriptionStatus | null> {
  const subscription = await getSubscription(churchId);
  return subscription?.status ?? null;
}

export function getPlan(subscription: Subscription | null): string {
  return subscription?.planKey ?? "trial";
}

/**
 * Único punto de decisión de "¿esta iglesia puede seguir usando la
 * plataforma?". No implementa todavía política de gracia/suspensión real
 * (pendiente D3 en docs/07-decisiones.md); por ahora trial/active/past_due
 * permiten uso, suspended/cancelled no.
 */
export function canUsePlatform(subscription: Subscription | null): boolean {
  if (!subscription) return false;
  return subscription.status === "trial" || subscription.status === "active" || subscription.status === "past_due";
}

/**
 * Entitlements derivados del plan. Fase 1 no tiene catálogo comercial
 * aprobado (ver docs/07-decisiones.md A1): se devuelve un conjunto mínimo
 * fijo hasta que exista `plan_entitlements` poblada con planes reales.
 */
export function getEntitlements(subscription: Subscription | null): {
  maxCampuses: number | null;
  maxActivePeople: number | null;
} {
  if (!subscription) return { maxCampuses: 0, maxActivePeople: 0 };
  return { maxCampuses: null, maxActivePeople: null };
}
