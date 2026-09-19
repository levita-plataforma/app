import { Baby } from "lucide-react";
import { isModuleEnabled } from "@/server/tenant/authorize";

/**
 * Gating de módulo a nivel de página, análogo a
 * `src/app/(app)/app/servicios/module-gate.tsx`. RLS y las capabilities ya
 * impiden leer o escribir datos de Kids si el módulo no está habilitado;
 * esta comprobación evita además renderizar una sección vacía y confusa. Se
 * devuelve un estado vacío en vez de lanzar, para no romper la navegación.
 */
export async function ensureKidsModule(churchId: string): Promise<React.ReactNode | null> {
  const enabled = await isModuleEnabled(churchId, "kids");
  if (enabled) return null;

  return (
    <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
      <span
        className="module-icon"
        style={{ background: "var(--mod-kids-bg)", color: "var(--mod-kids-fg)", marginBottom: 4 }}
      >
        <Baby aria-hidden="true" />
      </span>
      <h3>El módulo Niños no está activo</h3>
      <p>Actívalo desde Configuración para gestionar menores, salas y check-in/checkout.</p>
    </div>
  );
}
