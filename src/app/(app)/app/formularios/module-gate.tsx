import { ClipboardList } from "lucide-react";
import { isModuleEnabled } from "@/server/tenant/authorize";

/**
 * Gating de módulo a nivel de página. Los formularios dependen del módulo
 * `events` según el catálogo de capabilities (form.* tienen module_key
 * 'events'). RLS y las capabilities ya impiden leer o escribir datos si el
 * módulo no está habilitado; esta comprobación evita además renderizar una
 * sección vacía y confusa. Se devuelve un estado vacío en vez de lanzar,
 * para no romper la navegación.
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
        <ClipboardList aria-hidden="true" />
      </span>
      <h3>El módulo Eventos no está activo</h3>
      <p>Actívalo desde Configuración para crear y gestionar formularios reutilizables.</p>
    </div>
  );
}
