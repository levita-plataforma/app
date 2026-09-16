import { BrandMark } from "@/components/Logo";
import { ONBOARDING_STEPS, type OnboardingStep } from "@/server/onboarding/onboarding-service";

const STEP_LABELS: Record<OnboardingStep, string> = {
  account: "Cuenta",
  church: "Iglesia",
  campus: "Sede",
  profile: "Perfil",
  branding: "Personalización",
  modules: "Módulos",
  finish: "Listo",
};

type OnboardingLayoutProps = {
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  children: React.ReactNode;
};

export default function OnboardingLayout({ currentStep, completedSteps, children }: OnboardingLayoutProps) {
  const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);

  return (
    <div style={{ minHeight: "100svh", background: "var(--shell-bg)", padding: "40px 20px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28, color: "var(--shell-brand)" }}>
          <BrandMark style={{ width: 22, height: 26 }} />
          <span
            style={{
              fontFamily: "var(--font-serif), Georgia, serif",
              fontSize: 17,
              fontWeight: 600,
              letterSpacing: "0.1em",
              color: "var(--shell-text)",
            }}
          >
            LEVITA
          </span>
        </div>

        <ol
          style={{
            display: "flex",
            gap: 6,
            listStyle: "none",
            padding: 0,
            margin: "0 0 28px",
          }}
          aria-label="Progreso del alta"
        >
          {ONBOARDING_STEPS.filter((s) => s !== "account").map((step, i) => {
            const isDone = completedSteps.includes(step) || i < currentIndex - 1;
            const isCurrent = step === currentStep;
            return (
              <li
                key={step}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 4,
                  background: isDone || isCurrent ? "var(--shell-brand)" : "var(--shell-border)",
                }}
                title={STEP_LABELS[step]}
              />
            );
          })}
        </ol>

        <div className="shell-card" style={{ padding: "32px 28px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
