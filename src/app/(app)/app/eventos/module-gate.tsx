import { CalendarDays } from "lucide-react";
import { isModuleEnabled } from "@/server/tenant/authorize";

/**
 * Gating de módulo a nivel de página, análogo a
 * src/app/(app)/app/servicios/module-gate.tsx. RLS y las capabilities ya
 * impiden leer o escribir datos de Eventos si el módulo no está habilitado;
 * esta comprobación evita además renderizar una sección vacía y confusa.
 */
export async function ensureEventsModule(churchId: string): Promise<React.ReactNode | null> {
  const enabled = await isModuleEnabled(churchId, "events");
  if (enabled) return null;

  return (
    <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
      <span
        className="module-icon"
        style={{ background: "var(--mod-events-bg)", color: "var(--mod-events-fg)", marginBottom: 4 }}
      >
        <CalendarDays aria-hidden="true" />
      </span>
      <h3>El módulo Eventos no está activo</h3>
      <p>Actívalo desde Configuración para organizar eventos, inscripciones y check-in de tu iglesia.</p>
    </div>
  );
}
