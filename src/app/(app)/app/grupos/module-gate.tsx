import { UserRound } from "lucide-react";
import { isModuleEnabled } from "@/server/tenant/authorize";

/**
 * Gating de módulo a nivel de página, análogo a
 * src/app/(app)/app/eventos/module-gate.tsx. RLS y las capacidades ya impiden
 * leer o escribir datos de Grupos si el módulo no está habilitado; esta
 * comprobación evita además renderizar una sección vacía y confusa.
 */
export async function ensureGroupsModule(churchId: string): Promise<React.ReactNode | null> {
  const enabled = await isModuleEnabled(churchId, "groups");
  if (enabled) return null;

  return (
    <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
      <span
        className="module-icon"
        style={{ background: "var(--mod-groups-bg)", color: "var(--mod-groups-fg)", marginBottom: 4 }}
      >
        <UserRound aria-hidden="true" />
      </span>
      <h3>El módulo Grupos no está activo</h3>
      <p>Actívalo desde Configuración para organizar los grupos de tu iglesia, sus reuniones y su asistencia.</p>
    </div>
  );
}
