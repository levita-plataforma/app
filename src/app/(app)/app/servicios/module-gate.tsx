import { CalendarClock } from "lucide-react";
import { isModuleEnabled } from "@/server/tenant/authorize";

/**
 * Gating de módulo a nivel de página. RLS y las capabilities ya impiden
 * leer o escribir datos de Serving si el módulo no está habilitado; esta
 * comprobación evita además renderizar una sección vacía y confusa. Se
 * devuelve un estado vacío en vez de lanzar, para no romper la navegación.
 */
export async function ensureServingModule(churchId: string): Promise<React.ReactNode | null> {
  const enabled = await isModuleEnabled(churchId, "serving");
  if (enabled) return null;

  return (
    <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
      <span
        className="module-icon"
        style={{ background: "var(--mod-serving-bg)", color: "var(--mod-serving-fg)", marginBottom: 4 }}
      >
        <CalendarClock aria-hidden="true" />
      </span>
      <h3>El módulo Servicios no está activo</h3>
      <p>Actívalo desde Configuración para organizar áreas, equipos y puestos de tu iglesia.</p>
    </div>
  );
}
