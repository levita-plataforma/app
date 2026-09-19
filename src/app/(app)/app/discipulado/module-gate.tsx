import { GraduationCap } from "lucide-react";
import { isModuleEnabled } from "@/server/tenant/authorize";

/**
 * Gating de módulo a nivel de página, análogo a
 * src/app/(app)/app/eventos/module-gate.tsx. RLS y las capacidades ya impiden
 * leer o escribir datos de Discipulado si el módulo no está habilitado; esta
 * comprobación evita además renderizar una sección vacía y confusa.
 */
export async function ensureDiscipleshipModule(churchId: string): Promise<React.ReactNode | null> {
  const enabled = await isModuleEnabled(churchId, "discipleship");
  if (enabled) return null;

  return (
    <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
      <span
        className="module-icon"
        style={{ background: "var(--mod-discipleship-bg)", color: "var(--mod-discipleship-fg)", marginBottom: 4 }}
      >
        <GraduationCap aria-hidden="true" />
      </span>
      <h3>El módulo Discipulado no está activo</h3>
      <p>Actívalo desde Configuración para organizar cursos, cohortes e itinerarios de formación.</p>
    </div>
  );
}
