import { getServiceState } from "@/server/platform/commercial-service";
import BloqueoSeguridadForm from "./BloqueoSeguridadForm";

const fecha = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" }) : "—";

/**
 * Seguridad de la iglesia. Cualquiera con la ficha ve si está bloqueada y desde
 * cuándo. El motivo interno y el operador que lo fijó solo con
 * platform.church_security.read; bloquear o desbloquear solo con
 * platform.church_security.manage. Son capacidades separadas: ninguna implica la otra.
 */
export default async function PanelSeguridad({
  churchId,
  bloqueada,
  bloqueadaDesde,
  puedeLeerMotivo,
  puedeGestionar,
}: {
  churchId: string;
  bloqueada: boolean;
  bloqueadaDesde: string | null;
  puedeLeerMotivo: boolean;
  puedeGestionar: boolean;
}) {
  const detalle = puedeLeerMotivo ? await getServiceState(churchId) : null;

  return (
    <section id="seguridad" className="shell-card consola-seccion" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 15 }}>Seguridad</h2>

      <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 14px", margin: 0, fontSize: 12.5 }}>
        <dt>Estado</dt>
        <dd style={{ margin: 0 }}>
          {bloqueada ? <span className="serving-chip is-danger">Bloqueada por seguridad</span> : "Sin bloqueo"}
        </dd>
        {bloqueada && (
          <>
            <dt>Desde</dt>
            <dd style={{ margin: 0 }}>{fecha(bloqueadaDesde)}</dd>
          </>
        )}
        {bloqueada && puedeLeerMotivo && (
          <>
            <dt>Motivo interno</dt>
            <dd style={{ margin: 0 }}>{detalle?.security_block_reason ?? "—"}</dd>
            <dt>Operador</dt>
            <dd style={{ margin: 0, fontFamily: "monospace", fontSize: 11.5 }}>{detalle?.security_blocked_by ?? "—"}</dd>
          </>
        )}
      </dl>

      {bloqueada && !puedeLeerMotivo && (
        <p style={{ margin: 0, fontSize: 12, color: "var(--shell-text-muted)" }}>
          El motivo interno solo lo ve quien tiene permiso de lectura de seguridad.
        </p>
      )}

      {puedeGestionar ? (
        <div>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--shell-text-muted)" }}>
            Bloquear o desbloquear exige motivo y confirmación, y queda auditado. No cambia la suscripción.
          </p>
          <BloqueoSeguridadForm churchId={churchId} bloqueada={bloqueada} />
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: "var(--shell-text-muted)" }}>
          Bloquear o desbloquear necesita permiso de gestión de seguridad.
        </p>
      )}
    </section>
  );
}
