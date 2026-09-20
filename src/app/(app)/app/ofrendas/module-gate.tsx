import { Coins } from "lucide-react";
import { isModuleEnabled } from "@/server/tenant/authorize";

/**
 * Gating de módulo a nivel de página, mismo patrón que
 * src/app/(app)/app/comunicacion/module-gate.tsx / alabanza/module-gate.tsx.
 * RLS y las capabilities ya impiden leer o escribir datos de Ofrendas si el
 * módulo no está habilitado; esta comprobación evita además renderizar una
 * sección vacía y confusa.
 */
export async function ensureGivingModule(churchId: string): Promise<React.ReactNode | null> {
  const enabled = await isModuleEnabled(churchId, "giving");
  if (enabled) return null;

  return (
    <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
      <span
        className="module-icon"
        style={{ background: "var(--mod-giving-bg)", color: "var(--mod-giving-fg)", marginBottom: 4 }}
      >
        <Coins aria-hidden="true" />
      </span>
      <h3>El módulo Ofrendas no está activo</h3>
      <p>Actívalo desde Configuración para gestionar fondos, campañas y aportaciones.</p>
    </div>
  );
}
