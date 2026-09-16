import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

export const ONBOARDING_STEPS = [
  "account",
  "church",
  "campus",
  "profile",
  "branding",
  "modules",
  "finish",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type OnboardingState = {
  id: string;
  churchId: string;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  completedAt: string | null;
};

export async function getOnboardingState(churchId: string): Promise<OnboardingState | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("church_onboarding")
    .select("*")
    .eq("church_id", churchId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    churchId: data.church_id,
    currentStep: data.current_step,
    completedSteps: data.completed_steps,
    completedAt: data.completed_at,
  };
}

/**
 * Avanza el onboarding al siguiente paso, marcando el actual como
 * completado. Idempotente: si el paso ya estaba completado, no lo duplica
 * en el array.
 */
export async function advanceOnboardingStep(
  churchId: string,
  completedStep: OnboardingStep,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const state = await getOnboardingState(churchId);
  if (!state) return;

  const stepIndex = ONBOARDING_STEPS.indexOf(completedStep);
  const nextStep = ONBOARDING_STEPS[Math.min(stepIndex + 1, ONBOARDING_STEPS.length - 1)];

  const completedSteps = state.completedSteps.includes(completedStep)
    ? state.completedSteps
    : [...state.completedSteps, completedStep];

  const isFinishing = completedStep === "finish";

  await supabase
    .from("church_onboarding")
    .update({
      current_step: nextStep,
      completed_steps: completedSteps,
      completed_at: isFinishing ? new Date().toISOString() : null,
    })
    .eq("church_id", churchId);

  if (isFinishing) {
    const { auditLog } = await import("@/server/audit/audit-log");
    await auditLog({
      churchId,
      action: "onboarding.completed",
      entityType: "church_onboarding",
      entityId: state.id,
    });
  }
}
