import { redirect } from "next/navigation";
import { getTenantContext } from "@/server/tenant/tenant-context";
import { getOnboardingState } from "@/server/onboarding/onboarding-service";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import OnboardingLayout from "./OnboardingLayout";
import PasoIglesia from "./PasoIglesia";
import PasoBranding from "./PasoBranding";
import PasoModulos from "./PasoModulos";
import PasoFinalizar from "./PasoFinalizar";
import "../../app-shell.css";

/**
 * Orquesta el wizard de onboarding a partir del estado persistido en
 * church_onboarding: si el usuario abandona y vuelve, retoma exactamente
 * en el paso donde lo dejó (ver encargo de Fase 1 §2 y §12).
 */
export default async function OnboardingPage() {
  const tenant = await getTenantContext();

  // Sin iglesia todavía: primer paso del wizard (crea iglesia + campus +
  // perfil del propietario en una sola operación transaccional).
  if (!tenant) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/acceso");

    return (
      <OnboardingLayout currentStep="church" completedSteps={["account"]}>
        <PasoIglesia defaultEmail={user.email ?? ""} />
      </OnboardingLayout>
    );
  }

  const onboarding = await getOnboardingState(tenant.churchId);

  if (!onboarding || onboarding.completedAt) {
    redirect("/app");
  }

  switch (onboarding.currentStep) {
    case "branding":
      return (
        <OnboardingLayout currentStep="branding" completedSteps={onboarding.completedSteps}>
          <PasoBranding churchName={tenant.churchName} />
        </OnboardingLayout>
      );
    case "modules":
      return (
        <OnboardingLayout currentStep="modules" completedSteps={onboarding.completedSteps}>
          <PasoModulos />
        </OnboardingLayout>
      );
    case "finish":
      return (
        <OnboardingLayout currentStep="finish" completedSteps={onboarding.completedSteps}>
          <PasoFinalizar churchName={tenant.churchName} />
        </OnboardingLayout>
      );
    default:
      // church / campus / profile ya se resuelven de una vez en el primer
      // paso; si el estado quedó a medias ahí, se reanuda mostrando branding.
      return (
        <OnboardingLayout currentStep="branding" completedSteps={onboarding.completedSteps}>
          <PasoBranding churchName={tenant.churchName} />
        </OnboardingLayout>
      );
  }
}
