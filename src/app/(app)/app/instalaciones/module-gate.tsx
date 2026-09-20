import { Building2 } from "lucide-react";
import { isModuleEnabled } from "@/server/tenant/authorize";

/**
 * Gating de módulo a nivel de página, igual que en Grupos y Eventos. RLS y las
 * capacidades ya impiden leer o escribir nada de Facilities sin el módulo
 * activo; esto evita además pintar una sección vacía que no se entiende.
 */
export async function ensureFacilitiesModule(churchId: string): Promise<React.ReactNode | null> {
  const enabled = await isModuleEnabled(churchId, "facilities");
  if (enabled) return null;

  return (
    <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
      <span
        className="module-icon"
        style={{ background: "var(--mod-facilities-bg)", color: "var(--mod-facilities-fg)", marginBottom: 4 }}
      >
        <Building2 aria-hidden="true" />
      </span>
      <h3>El módulo Instalaciones no está activo</h3>
      <p>Actívalo desde Configuración para llevar las salas, los equipos y los vehículos de tu iglesia.</p>
    </div>
  );
}
