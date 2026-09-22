import Link from "next/link";
import { getProcessesOverview, listProcessFailures } from "@/server/platform/operations-service";
import { requireOperator } from "../guard";
import ReintentarBoton from "./ReintentarBoton";
import "../../app-shell.css";

/**
 * Consola de procesos (Fase 15).
 *
 * Lo importante de esta pantalla es lo que no hace: no pinta en verde lo que
 * nadie está mirando. Las familias sin procesador salen como «desconocido», con
 * esa palabra, porque un contador a cero sin nadie procesando no significa que
 * todo vaya bien.
 */

const ETIQUETAS: Record<string, string> = {
  avisos: "Avisos",
  comunicaciones: "Comunicaciones",
  borrado_ficheros: "Borrado de ficheros",
  webhooks_entrantes: "Webhooks entrantes",
  importaciones: "Importaciones",
  exportaciones: "Exportaciones",
};

const FAMILIA_FALLO: Record<string, string> = {
  comunicaciones: "Comunicación",
  borrado_ficheros: "Borrado de fichero",
  importaciones: "Importación",
  exportaciones: "Exportación",
  webhooks_entrantes: "Webhook entrante",
};

function fecha(valor: string | null | undefined): string {
  if (!valor) return "nunca";
  return new Date(valor).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

export default async function ProcesosPage() {
  const acceso = await requireOperator("platform.operations.read");
  if ("bloqueado" in acceso) return acceso.bloqueado;

  const [resumen, fallos] = await Promise.all([getProcessesOverview(), listProcessFailures(50)]);
  const puedeReintentar = acceso.contexto.capabilities.includes("platform.operations.retry");

  return (
    <div style={{ minHeight: "100svh", background: "var(--shell-bg)", padding: "32px 20px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 20 }}>Procesos</h1>
          <p style={{ margin: "4px 0 0", color: "var(--shell-text-muted)", fontSize: 13 }}>
            Estado de las colas y los trabajos. Las cifras salen de lo que cada proceso registra al ejecutarse.
          </p>
        </header>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}>
          {Object.entries(resumen ?? {}).map(([clave, familia]) => {
            const sinProcesador = familia.procesador === "ninguno";
            const contadores = Object.entries(familia).filter(
              ([k]) => !["procesador", "estado", "ultima_senal"].includes(k),
            );
            return (
              <section
                key={clave}
                className="shell-card"
                style={{
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  borderLeft: sinProcesador ? "3px solid var(--shell-text-muted)" : undefined,
                }}
              >
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>{ETIQUETAS[clave] ?? clave}</p>

                {contadores.map(([k, v]) => (
                  <p key={k} style={{ margin: 0, fontSize: 12.5, color: "var(--shell-text-muted)" }}>
                    {k.replace(/_/g, " ")}: <strong style={{ color: "var(--shell-text)" }}>{String(v)}</strong>
                  </p>
                ))}

                {sinProcesador ? (
                  <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--shell-text-muted)" }}>
                    <strong>Estado desconocido.</strong> Esta cola no tiene ningún proceso que la lea, así que
                    estos números no dicen si algo va bien o mal.
                  </p>
                ) : (
                  <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--shell-text-muted)" }}>
                    Última señal: {fecha(familia.ultima_senal as string | null)}
                  </p>
                )}
              </section>
            );
          })}
        </div>

        <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 15 }}>Lo que ha fallado</h2>

          {fallos.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
              Nada fallido pendiente. Ten en cuenta que las colas sin procesador no pueden fallar porque nadie las
              intenta.
            </p>
          ) : (
            <ul style={{ display: "flex", flexDirection: "column", gap: 10, margin: 0, padding: 0, listStyle: "none" }}>
              {fallos.map((f) => (
                <li
                  key={`${f.familia}-${f.id}`}
                  style={{
                    border: "1px solid var(--shell-border)",
                    borderRadius: "var(--shell-radius-sm)",
                    padding: 12,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 13 }}>{FAMILIA_FALLO[f.familia] ?? f.familia}</strong>
                    <span className="serving-chip is-danger">{f.estado}</span>
                    {f.intentos > 0 && (
                      <span style={{ fontSize: 11.5, color: "var(--shell-text-muted)" }}>
                        {f.intentos} intento{f.intentos === 1 ? "" : "s"}
                      </span>
                    )}
                    <span style={{ fontSize: 11.5, color: "var(--shell-text-muted)" }}>{fecha(f.ocurridoEn)}</span>
                  </div>

                  {f.churchId && (
                    <Link href={`/operacion/iglesias/${f.churchId}`} style={{ fontSize: 12, color: "inherit" }}>
                      Ver la iglesia afectada
                    </Link>
                  )}

                  {f.error && (
                    <p style={{ margin: 0, fontSize: 11.5, fontFamily: "monospace", whiteSpace: "pre-wrap", color: "var(--shell-text-muted)" }}>
                      {f.error}
                    </p>
                  )}

                  {f.correlationId && (
                    <p style={{ margin: 0, fontSize: 11, color: "var(--shell-text-subtle)" }}>
                      Correlación: {f.correlationId}
                    </p>
                  )}

                  {f.reintentable ? (
                    puedeReintentar ? (
                      <ReintentarBoton id={f.id} familia={f.familia} />
                    ) : (
                      <p style={{ margin: 0, fontSize: 11.5, color: "var(--shell-text-muted)" }}>
                        Se puede reintentar, pero tu cuenta no tiene esa capacidad.
                      </p>
                    )
                  ) : (
                    <p style={{ margin: 0, fontSize: 11.5, color: "var(--shell-text-muted)" }}>
                      {f.familia === "comunicaciones"
                        ? "Lo resuelve la iglesia desde su ficha de comunicación, con su permiso y su auditoría."
                        : "No se puede reintentar desde aquí: repetirlo no es seguro o no hay ningún proceso que lo ejecute."}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
