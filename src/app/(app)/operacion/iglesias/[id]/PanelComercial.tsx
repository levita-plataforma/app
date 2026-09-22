"use client";

import { useState, useTransition } from "react";
import type { Entitlement, Override, PlanChangePreview, PlanVersion, ServiceState } from "@/server/platform/commercial-service";
import { cambiarPlanAction, previsualizarPlanAction, revocarExcepcionAction, cancelarSuscripcionAction } from "./acciones-comerciales";

/**
 * Parte comercial de la ficha de iglesia (Fase 15).
 *
 * El cambio de plan va en dos pasos a propósito: primero se consulta el efecto
 * —qué derechos se pierden, cuánto consume hoy la iglesia, qué dice el precio—
 * y solo después se confirma. Una operación que cambia lo que alguien tiene
 * contratado no debería descubrirse al pulsar.
 */

function dinero(cents: number | null, moneda: string | null): string {
  if (cents === null) return "sin precio acordado";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: moneda ?? "EUR" }).format(cents / 100);
}

function fecha(valor: string | null): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleDateString("es-ES", { dateStyle: "medium" });
}

const MOTIVOS: Record<string, string> = {
  security_block: "bloqueo de seguridad",
  archived: "archivada",
  maintenance: "en mantenimiento",
  commercial: "situación comercial",
  provisioning: "alta sin terminar",
};

export default function PanelComercial({
  churchId,
  estado,
  derechos,
  excepciones,
  versiones,
  puedeGestionar,
}: {
  churchId: string;
  estado: ServiceState | null;
  derechos: Entitlement[];
  excepciones: Override[];
  versiones: PlanVersion[];
  puedeGestionar: boolean;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [previa, setPrevia] = useState<PlanChangePreview | null>(null);
  const [versionElegida, setVersionElegida] = useState("");
  const [motivo, setMotivo] = useState("");

  const vigentes = excepciones.filter(
    (e) => !e.revokedAt && (e.expiresAt === null || new Date(e.expiresAt) > new Date()),
  );
  const pasadas = excepciones.filter((e) => !vigentes.includes(e));

  return (
    <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ margin: 0, fontSize: 15 }}>Comercial</h2>

      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      )}
      {aviso && (
        <p role="status" style={{ margin: 0, fontSize: 12.5 }}>
          {aviso}
        </p>
      )}

      {/* Las cuatro dimensiones del estado, por separado: mezclarlas obligaba a
          elegir una cuando podían darse a la vez. */}
      {estado && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="serving-chip is-muted">ciclo: {estado.lifecycle}</span>
            <span className="serving-chip is-muted">comercial: {estado.commercial}</span>
            {estado.security_blocked && <span className="serving-chip is-danger">bloqueada por seguridad</span>}
            {estado.in_maintenance && <span className="serving-chip is-warning">en mantenimiento</span>}
          </div>
          {estado.reasons.length > 0 && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--shell-text-muted)" }}>
              Su servicio no es normal por: {estado.reasons.map((r) => MOTIVOS[r] ?? r).join(", ")}.
            </p>
          )}
          {estado.security_blocked && estado.security_block_reason && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--shell-danger)" }}>
              Motivo del bloqueo: {estado.security_block_reason}
            </p>
          )}
        </div>
      )}

      {/* Derechos vigentes */}
      <div>
        <p style={{ margin: "0 0 6px", fontSize: 12.5, fontWeight: 600 }}>Derechos vigentes</p>
        {derechos.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--shell-text-muted)" }}>
            Ninguno registrado: esta iglesia no tiene una versión de plan asignada todavía.
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
            {derechos.map((d) => (
              <li key={d.capability}>
                {d.capability}: <strong>{d.limitValue === null ? "sin límite" : d.limitValue}</strong>{" "}
                <span style={{ color: "var(--shell-text-muted)" }}>
                  ({d.source === "override" ? "por excepción" : "del plan"})
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Excepciones */}
      <div>
        <p style={{ margin: "0 0 6px", fontSize: 12.5, fontWeight: 600 }}>
          Excepciones vigentes ({vigentes.length})
        </p>
        {vigentes.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: "var(--shell-text-muted)" }}>Ninguna.</p>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 6, margin: 0, padding: 0, listStyle: "none" }}>
            {vigentes.map((e) => (
              <li key={e.id} style={{ fontSize: 12.5, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span>
                  {e.capability}: {e.limitValue === null ? "sin límite" : e.limitValue} · {e.reason} · hasta{" "}
                  {e.expiresAt ? fecha(e.expiresAt) : "sin caducidad"}
                </span>
                {puedeGestionar && (
                  <button
                    type="button"
                    className="shell-button"
                    disabled={pendiente}
                    style={{ fontSize: 11.5 }}
                    onClick={() => {
                      setError(null);
                      startTransition(async () => {
                        const r = await revocarExcepcionAction(e.id, churchId, "retirada desde la ficha");
                        if (r.error) setError(r.error);
                        else setAviso("Excepción revocada.");
                      });
                    }}
                  >
                    Revocar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {pasadas.length > 0 && (
          <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--shell-text-muted)" }}>
            {pasadas.length} excepción(es) caducada(s) o revocada(s). Dejan de aplicar solas, sin borrarlas.
          </p>
        )}
      </div>

      {/* Cambio de plan, en dos pasos */}
      {puedeGestionar && (
        <div style={{ borderTop: "1px solid var(--shell-border)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>Cambiar de plan</p>

          {versiones.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: "var(--shell-text-muted)" }}>
              No hay planes en el catálogo todavía, así que no hay a qué cambiar.
            </p>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select
                  value={versionElegida}
                  onChange={(e) => {
                    setVersionElegida(e.target.value);
                    setPrevia(null);
                  }}
                  style={{ fontSize: 12.5, padding: "6px 8px" }}
                >
                  <option value="">Elegir versión…</option>
                  {versiones.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.planName} v{v.version} · {dinero(v.priceCents, v.currency)}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="shell-button"
                  disabled={pendiente || !versionElegida}
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    setError(null);
                    setAviso(null);
                    startTransition(async () => {
                      const r = await previsualizarPlanAction(churchId, versionElegida);
                      if (r.error) setError(r.error);
                      else setPrevia(r.previa);
                    });
                  }}
                >
                  {pendiente ? "Calculando…" : "Ver qué cambiaría"}
                </button>
              </div>

              {previa && (
                <div style={{ border: "1px solid var(--shell-border)", borderRadius: "var(--shell-radius-sm)", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <p style={{ margin: 0, fontSize: 12.5 }}>
                    De <strong>{previa.actual.plan_key ?? "sin plan"}</strong>{" "}
                    {previa.actual.version ? `v${previa.actual.version}` : ""} (
                    {dinero(previa.actual.price_cents, previa.actual.currency)}) a{" "}
                    <strong>{previa.nueva.plan_key}</strong> v{previa.nueva.version} (
                    {dinero(previa.nueva.price_cents, previa.nueva.currency)}).
                  </p>

                  {previa.pierde.length > 0 ? (
                    <div>
                      <p style={{ margin: 0, fontSize: 12.5, color: "var(--shell-danger)", fontWeight: 600 }}>
                        Pierde:
                      </p>
                      <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12 }}>
                        {previa.pierde.map((p) => (
                          <li key={p.capability}>
                            {p.capability}: de {p.limit_ahora === null ? "sin límite" : p.limit_ahora} a{" "}
                            {p.limit_despues === null ? "no incluido" : p.limit_despues}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p style={{ margin: 0, fontSize: 12.5 }}>No pierde ningún derecho.</p>
                  )}

                  <p style={{ margin: 0, fontSize: 12 }}>
                    Consumo hoy: {previa.uso_actual.personas_activas} personas, {previa.uso_actual.sedes} sede(s).
                    Reducir un límite <strong>no borra nada</strong>: los datos y las personas siguen ahí.
                  </p>

                  <p style={{ margin: 0, fontSize: 11.5, color: "var(--shell-text-muted)" }}>
                    Cobro: {previa.cobro === "sin_proveedor_configurado" ? "no hay proveedor configurado, así que este cambio no cobra nada" : previa.cobro}. Prorrateo:{" "}
                    {previa.prorrateo === "sin_politica_acordada" ? "sin política acordada" : previa.prorrateo}.
                  </p>

                  <input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Motivo del cambio (obligatorio)"
                    style={{ fontSize: 12.5, padding: "6px 8px" }}
                  />

                  <button
                    type="button"
                    className="shell-button"
                    disabled={pendiente || motivo.trim().length === 0}
                    style={{ alignSelf: "flex-start", fontSize: 12 }}
                    onClick={() => {
                      setError(null);
                      startTransition(async () => {
                        const r = await cambiarPlanAction(churchId, versionElegida, motivo);
                        if (r.error) setError(r.error);
                        else {
                          setAviso("Plan cambiado.");
                          setPrevia(null);
                          setMotivo("");
                        }
                      });
                    }}
                  >
                    {pendiente ? "Cambiando…" : "Confirmar el cambio"}
                  </button>
                </div>
              )}
            </>
          )}

          <details style={{ marginTop: 6 }}>
            <summary style={{ fontSize: 12.5, cursor: "pointer" }}>Cancelar la suscripción</summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              <p style={{ margin: 0, fontSize: 12, color: "var(--shell-text-muted)" }}>
                Cancelar <strong>no borra nada</strong>. Los datos de la iglesia se conservan; su eliminación va por
                el procedimiento de retención, a los 30 días de archivarla.
              </p>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo de la cancelación (obligatorio)"
                style={{ fontSize: 12.5, padding: "6px 8px" }}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="shell-button"
                  disabled={pendiente || motivo.trim().length === 0}
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const r = await cancelarSuscripcionAction(churchId, motivo, true);
                      if (r.error) setError(r.error);
                      else setAviso("Se cancelará al terminar el periodo en curso.");
                    });
                  }}
                >
                  Al final del periodo
                </button>
                <button
                  type="button"
                  className="shell-button"
                  disabled={pendiente || motivo.trim().length === 0}
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const r = await cancelarSuscripcionAction(churchId, motivo, false);
                      if (r.error) setError(r.error);
                      else setAviso("Cancelada ahora. Los datos se conservan.");
                    });
                  }}
                >
                  Ahora mismo
                </button>
              </div>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
