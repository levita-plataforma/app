import { listPlanVersions } from "@/server/platform/commercial-service";
import { requireOperator } from "../guard";
import "../../app-shell.css";

/**
 * Catálogo de planes (Fase 15).
 *
 * Solo lectura. Crear o editar planes es una decisión de producto que todavía
 * no tiene política acordada —precios, periodicidad, prueba, impuestos— y una
 * pantalla de edición invitaría a tomarla desde aquí por comodidad.
 *
 * Mientras el catálogo esté vacío, lo dice: un listado vacío sin explicación
 * parece un error de carga.
 */
export default async function PlanesPage() {
  const acceso = await requireOperator("platform.commercial.read");
  if ("bloqueado" in acceso) return acceso.bloqueado;

  const versiones = await listPlanVersions();

  const porPlan = new Map<string, typeof versiones>();
  for (const v of versiones) {
    const lista = porPlan.get(v.planKey) ?? [];
    lista.push(v);
    porPlan.set(v.planKey, lista);
  }

  return (
    <div style={{ minHeight: "100svh", background: "var(--shell-bg)", padding: "32px 20px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <header>
          <h1 style={{ margin: 0, fontSize: 20 }}>Catálogo de planes</h1>
          <p style={{ margin: "4px 0 0", color: "var(--shell-text-muted)", fontSize: 13 }}>
            Cada edición de un plan es una versión nueva. Las iglesias siguen en la versión que contrataron, así
            que cambiar el catálogo no altera lo que alguien ya tiene firmado.
          </p>
        </header>

        {versiones.length === 0 ? (
          <div className="shell-card shell-empty-state" style={{ padding: "40px 24px" }}>
            <h3>El catálogo está vacío</h3>
            <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 6, maxWidth: 560 }}>
              No es un fallo de carga: no hay planes dados de alta todavía. Los precios, la periodicidad y el
              periodo de prueba son decisiones pendientes, y la Fase 15 no los ha inventado para tener algo que
              enseñar aquí.
            </p>
          </div>
        ) : (
          [...porPlan.entries()].map(([planKey, lista]) => (
            <section key={planKey} className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 16 }}>{lista[0].planName}</h2>
                <span className={`serving-chip ${lista[0].availableForSignup ? "is-success" : "is-muted"}`}>
                  {lista[0].availableForSignup ? "Se puede contratar" : "Retirado del escaparate"}
                </span>
              </div>

              {!lista[0].availableForSignup && (
                <p style={{ fontSize: 12, color: "var(--shell-text-muted)" }}>
                  Retirarlo del escaparate no afecta a las iglesias que ya lo tienen.
                </p>
              )}

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--shell-text-muted)" }}>
                    <th style={celdaCabecera}>Versión</th>
                    <th style={celdaCabecera}>Precio</th>
                    <th style={celdaCabecera}>Periodicidad</th>
                    <th style={celdaCabecera}>Prueba</th>
                    <th style={celdaCabecera}>Vigente desde</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((v) => (
                    <tr key={v.id} style={{ borderTop: "1px solid var(--shell-border)" }}>
                      <td style={celda}>v{v.version}{v.effectiveUntil === null && " · actual"}</td>
                      <td style={celda}>
                        {v.priceCents === null ? (
                          <span style={{ color: "var(--shell-text-muted)" }}>sin precio acordado</span>
                        ) : (
                          new Intl.NumberFormat("es-ES", { style: "currency", currency: v.currency })
                            .format(v.priceCents / 100)
                        )}
                      </td>
                      <td style={celda}>{v.billingPeriod === "monthly" ? "Mensual" : "Anual"}</td>
                      <td style={celda}>{v.trialDays === null ? "—" : `${v.trialDays} días`}</td>
                      <td style={celda}>
                        {new Date(v.effectiveFrom).toLocaleDateString("es-ES", { dateStyle: "medium" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))
        )}

        <section className="shell-card" style={{ padding: 16 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 14 }}>Cobro</h2>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--shell-text-muted)" }}>
            No hay proveedor de cobro configurado, así que nada de lo que se haga aquí cobra ni deja de cobrar.
            Cambiar el plan de una iglesia cambia sus derechos y su historial; el dinero, cuando lo haya, irá por
            el proveedor que se decida.
          </p>
        </section>
      </div>
    </div>
  );
}

const celdaCabecera: React.CSSProperties = { padding: "6px 8px", fontWeight: 600, fontSize: 11.5 };
const celda: React.CSSProperties = { padding: "8px" };
