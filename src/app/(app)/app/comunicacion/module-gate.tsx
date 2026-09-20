import { MessageCircle } from "lucide-react";
import { isModuleEnabled } from "@/server/tenant/authorize";

/**
 * Gating de módulo a nivel de página, análogo a
 * src/app/(app)/app/eventos/module-gate.tsx. RLS y las capabilities ya
 * impiden leer o escribir datos de Comunicación si el módulo no está
 * habilitado; esta comprobación evita además renderizar una sección vacía y
 * confusa.
 */
export async function ensureCommunicationsModule(churchId: string): Promise<React.ReactNode | null> {
  const enabled = await isModuleEnabled(churchId, "communications");
  if (enabled) return null;

  return (
    <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
      <span
        className="module-icon"
        style={{ background: "var(--mod-communications-bg)", color: "var(--mod-communications-fg)", marginBottom: 4 }}
      >
        <MessageCircle aria-hidden="true" />
      </span>
      <h3>El módulo Comunicación no está activo</h3>
      <p>Actívalo desde Configuración para enviar comunicaciones segmentadas a tu comunidad.</p>
    </div>
  );
}
