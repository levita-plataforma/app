import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { listSupportSessions } from "@/server/platform/operations-service";
import RevocarSesion from "../../soporte/RevocarSesion";
import AbrirSesionForm from "./AbrirSesionForm";

type Diagnostico = {
  lifecycle: string;
  commercial: string;
  access_mode: string;
  security_blocked: boolean;
  maintenance: boolean;
  archived: boolean;
  active_support_sessions: number;
  last_activity_at: string | null;
  failed_deliveries_7d: number;
  queued_deliveries: number;
};

const fecha = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" }) : "—";

/**
 * Soporte operacional de una iglesia (PR B). Muestra solo diagnóstico y metadatos.
 * El motivo de bloqueo de seguridad no sale aquí: lo ve solo quien tiene
 * platform.church_security.read, y esta pantalla no lo pide.
 */
export default async function PanelSoporte({
  churchId,
  puedeGestionar,
}: {
  churchId: string;
  puedeGestionar: boolean;
}) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("platform_church_diagnostics", { p_church_id: churchId });
  const d = (data ?? null) as Diagnostico | null;

  const sesiones = puedeGestionar ? await listSupportSessions(churchId) : [];
  const activas = sesiones.filter((s) => s.activa);
  const anteriores = sesiones.filter((s) => !s.activa).slice(0, 10);

  return (
    <section className="shell-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 15 }}>Soporte</h2>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--shell-text-muted)" }}>
          Diagnóstico sin datos de la iglesia. Una sesión de soporte no da acceso a personas, actividades, Kids,
          donaciones ni notas pastorales.
        </p>
      </div>

      {d && (
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 14px", margin: 0, fontSize: 12.5 }}>
          <dt>Estado de ciclo de vida</dt>
          <dd style={{ margin: 0 }}>{d.lifecycle}</dd>
          <dt>Plan y pago</dt>
          <dd style={{ margin: 0 }}>{d.commercial}</dd>
          <dt>Modo de acceso</dt>
          <dd style={{ margin: 0 }}>{d.access_mode}</dd>
          <dt>Bloqueo de seguridad</dt>
          <dd style={{ margin: 0 }}>{d.security_blocked ? "sí" : "no"}</dd>
          <dt>Mantenimiento</dt>
          <dd style={{ margin: 0 }}>{d.maintenance ? "sí" : "no"}</dd>
          <dt>Actividad técnica</dt>
          <dd style={{ margin: 0 }}>{fecha(d.last_activity_at)}</dd>
          <dt>Avisos fallidos (7 días)</dt>
          <dd style={{ margin: 0 }}>{d.failed_deliveries_7d}</dd>
          <dt>Avisos en cola</dt>
          <dd style={{ margin: 0 }}>{d.queued_deliveries}</dd>
        </dl>
      )}

      {puedeGestionar && (
        <>
          <div>
            <h3 style={{ margin: "0 0 6px", fontSize: 13 }}>Sesiones activas ({activas.length})</h3>
            {activas.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: "var(--shell-text-muted)" }}>Ninguna sesión abierta.</p>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {activas.map((s) => (
                  <li key={s.id} style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 6 }}>
                    <span>
                      {s.reason} · caduca {fecha(s.expiresAt)}
                    </span>
                    <RevocarSesion id={s.id} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 style={{ margin: "0 0 6px", fontSize: 13 }}>Nueva sesión</h3>
            <AbrirSesionForm churchId={churchId} />
          </div>

          {anteriores.length > 0 && (
            <div>
              <h3 style={{ margin: "0 0 6px", fontSize: 13 }}>Sesiones anteriores</h3>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                {anteriores.map((s) => (
                  <li key={s.id}>
                    {s.reason} · {s.revokedAt ? `cerrada ${fecha(s.revokedAt)}` : `caducó ${fecha(s.expiresAt)}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
