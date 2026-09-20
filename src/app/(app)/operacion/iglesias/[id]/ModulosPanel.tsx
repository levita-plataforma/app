"use client";

import { useActionState } from "react";
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
 * Desactivar no borra nada, y conviene que se lea antes de pulsar, no después.
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

                  {puedeGestionar && (
                    <form action={accion}>
                      <input type="hidden" name="churchId" value={churchId} />
                      <input type="hidden" name="moduleKey" value={m.module_key} />
                      <input type="hidden" name="activar" value={activo ? "0" : "1"} />
                      <button type="submit" style={botonStyle} disabled={pendiente}>
                        {activo ? "Desactivar" : "Activar"}
                      </button>
                    </form>
                  )}
                </div>
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
