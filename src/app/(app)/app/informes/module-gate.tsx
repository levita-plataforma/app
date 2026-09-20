import { BarChart3 } from "lucide-react";
import { isModuleEnabled } from "@/server/tenant/authorize";

/**
 * Gating de módulo a nivel de página, mismo patrón que
 * src/app/(app)/app/comunicacion/module-gate.tsx.
 */
export async function ensureAnalyticsModule(churchId: string): Promise<React.ReactNode | null> {
  const enabled = await isModuleEnabled(churchId, "analytics");
  if (enabled) return null;

  return (
    <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
      <span
        className="module-icon"
        style={{ background: "var(--mod-analytics-bg)", color: "var(--mod-analytics-fg)", marginBottom: 4 }}
      >
        <BarChart3 aria-hidden="true" />
      </span>
      <h3>El módulo Informes no está activo</h3>
      <p>Actívalo desde Configuración para ver los dashboards agregados de tu iglesia.</p>
    </div>
  );
}
