"use client";

import { useActionState, useState } from "react";
import { cambiarModuloAction, type PanelState } from "./actions";

const INICIAL: PanelState = { error: null, ok: null };

type Modulo = { module_key: string; name: string; status: string; enabled_at: string | null };

/**
 * Módulos de una iglesia.
 *
 * Activar un módulo dice que esa iglesia puede usar esa parte del producto. No
 * concede roles a nadie: quién puede hacer qué dentro lo sigue decidiendo la
 * iglesia con sus propios permisos.
 *
 * Desactivar no borra nada, y conviene que se lea antes de pulsar, no después:
 * de ahí la confirmación con el efecto escrito (CA-3.4).
 *
 * El motivo ya lo registraba la RPC y lo leía la server action, pero **este
 * formulario no tenía el campo**, así que siempre llegaba vacío: en la auditoría
 * constaba quién apagó un módulo y nunca por qué. Ahora se pide, y al desactivar
 * es obligatorio, que es cuando alguien pierde acceso a algo.
 */
export default function ModulosPanel({
  churchId,
  modulos,
  puedeGestionar,
}: {
  churchId: string;
  modulos: Modulo[];
  puedeGestionar: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(cambiarModuloAction, INICIAL);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  return (
    <section className="shell-card" style={{ padding: 16 }}>
      <h2 style={{ margin: "0 0 10px", fontSize: 15 }}>Módulos</h2>

      {modulos.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--shell-text-muted)" }}>
          No hay módulos en el catálogo.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {modulos.map((m) => {
            const activo = m.status === "enabled";
            return (
              <li
                key={m.module_key}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  borderBottom: "1px solid var(--shell-border)",
                }}
              >
                <div>
                  <strong style={{ fontSize: 13 }}>{m.name}</strong>
                  <div style={{ fontSize: 11.5, color: "var(--shell-text-muted)" }}>{m.module_key}</div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className={activo ? "serving-chip is-success" : "serving-chip is-muted"}>
                    {activo ? "Activo" : "Inactivo"}
                  </span>

                  {puedeGestionar && abierto !== m.module_key && (
                    <button
                      type="button"
                      style={botonStyle}
                      disabled={pendiente}
                      onClick={() => {
                        setAbierto(m.module_key);
                        setMotivo("");
                      }}
                    >
                      {activo ? "Desactivar" : "Activar"}
                    </button>
                  )}
                </div>

                {puedeGestionar && abierto === m.module_key && (
                  <form
                    action={accion}
                    style={{ flexBasis: "100%", display: "flex", flexDirection: "column", gap: 8 }}
                  >
                    <input type="hidden" name="churchId" value={churchId} />
                    <input type="hidden" name="moduleKey" value={m.module_key} />
                    <input type="hidden" name="activar" value={activo ? "0" : "1"} />

                    {/* El efecto, antes de pulsar y no después. */}
                    <p style={{ margin: 0, fontSize: 12.5 }}>
                      {activo ? (
                        <>
                          Las personas de esta iglesia dejarán de ver <strong>{m.name}</strong>. Los datos se conservan
                          y vuelven a verse si se reactiva. No cambia los permisos de nadie.
                        </>
                      ) : (
                        <>
                          Esta iglesia podrá usar <strong>{m.name}</strong>. No concede permisos a ninguna persona:
                          quién puede hacer qué dentro lo sigue decidiendo la iglesia.
                        </>
                      )}
                    </p>

                    <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                      {activo ? "Motivo (obligatorio)" : "Motivo (opcional)"}
                      <input
                        name="motivo"
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        placeholder={activo ? "Por qué se desactiva" : "Por qué se activa"}
                        style={{ fontSize: 12.5, padding: "6px 8px" }}
                      />
                    </label>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="submit"
                        style={botonStyle}
                        disabled={pendiente || (activo && motivo.trim().length === 0)}
                      >
                        {activo ? "Confirmar desactivación" : "Confirmar activación"}
                      </button>
                      <button type="button" style={botonStyle} onClick={() => setAbierto(null)}>
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {puedeGestionar && (
        <p style={{ marginTop: 12, marginBottom: 0, fontSize: 12, color: "var(--shell-text-muted)" }}>
          Activar un módulo no concede permisos a nadie dentro de la iglesia. Desactivarlo no borra
          datos: dejan de verse y vuelven si se reactiva.
        </p>
      )}

      {estado.error && (
        <p role="alert" style={{ marginTop: 10, marginBottom: 0, color: "var(--shell-danger)", fontSize: 12.5 }}>
          {estado.error}
        </p>
      )}
      {estado.ok && (
        <p role="status" style={{ marginTop: 10, marginBottom: 0, color: "var(--shell-success)", fontSize: 12.5 }}>
          {estado.ok}
        </p>
      )}
    </section>
  );
}

const botonStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "var(--shell-radius-md)",
  border: "1px solid var(--shell-border)",
  background: "transparent",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
