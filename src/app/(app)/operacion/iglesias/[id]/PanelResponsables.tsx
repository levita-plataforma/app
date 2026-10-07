"use client";

import { useState, useTransition } from "react";
import { invitarResponsableAction, revocarInvitacionAction, reenviarInvitacionAction } from "./acciones-responsables";

/**
 * Invitar y revocar responsables desde la ficha (CA-2.4).
 *
 * La función de invitar existía desde la Fase 14 y **ninguna pantalla la
 * llamaba**. Ahora se puede usar, y lo que hace útil la pantalla no es el
 * botón: es enseñar el enlace, porque no hay correo que lo lleve.
 */

type Invitacion = {
  id: string;
  role_key: string;
  status: string;
  expires_at: string | null;
  caducada: boolean;
};

function fecha(valor: string | null): string {
  if (!valor) return "sin caducidad";
  return new Date(valor).toLocaleDateString("es-ES", { dateStyle: "medium" });
}

export default function PanelResponsables({
  churchId,
  invitaciones,
  puedeGestionar,
}: {
  churchId: string;
  invitaciones: Invitacion[];
  puedeGestionar: boolean;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<"church_owner" | "church_admin">("church_admin");
  const [resultado, setResultado] = useState<{ link: string | null; reutilizada: boolean } | null>(null);

  if (!puedeGestionar) {
    return (
      <section className="shell-card" style={{ padding: 16 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 15 }}>Invitaciones</h2>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--shell-text-muted)" }}>
          Gestionar responsables necesita su propia capacidad.
        </p>
      </section>
    );
  }

  return (
    <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ margin: 0, fontSize: 15 }}>Responsables e invitaciones</h2>

      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      )}

      {invitaciones.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--shell-text-muted)" }}>No hay invitaciones.</p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
          {invitaciones.map((i) => (
            <li key={i.id} style={{ fontSize: 12.5, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span>
                {i.role_key === "church_owner" ? "Propietario" : "Administrador"} ·{" "}
                {i.caducada ? "caducada" : i.status} · hasta {fecha(i.expires_at)}
              </span>
              {i.status === "pending" && (
                <button
                  type="button"
                  className="shell-button"
                  disabled={pendiente}
                  style={{ fontSize: 11.5 }}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const r = await reenviarInvitacionAction(i.id, churchId);
                      if (r.error) setError(r.error);
                      else setResultado({ link: r.link ?? null, reutilizada: false });
                    });
                  }}
                >
                  Reenviar
                </button>
              )}
              {!i.caducada && i.status === "pending" && (
                <button
                  type="button"
                  className="shell-button"
                  disabled={pendiente}
                  style={{ fontSize: 11.5 }}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const r = await revocarInvitacionAction(i.id, churchId, "retirada desde la ficha");
                      if (r.error) setError(r.error);
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

      <div style={{ borderTop: "1px solid var(--shell-border)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600 }}>Invitar a un responsable</p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="correo@iglesia.test"
            style={{ fontSize: 12.5, padding: "6px 8px", flex: "1 1 220px", minWidth: 0 }}
          />
          <select
            value={rol}
            onChange={(e) => setRol(e.target.value as "church_owner" | "church_admin")}
            style={{ fontSize: 12.5, padding: "6px 8px" }}
          >
            <option value="church_admin">Administrador</option>
            <option value="church_owner">Propietario</option>
          </select>
          <button
            type="button"
            className="shell-button"
            disabled={pendiente || email.trim().length === 0}
            style={{ fontSize: 12 }}
            onClick={() => {
              setError(null);
              setResultado(null);
              startTransition(async () => {
                const r = await invitarResponsableAction(churchId, email.trim(), rol);
                if (r.error) setError(r.error);
                else {
                  setResultado({ link: r.link ?? null, reutilizada: r.reutilizada });
                  setEmail("");
                }
              });
            }}
          >
            {pendiente ? "Invitando…" : "Invitar"}
          </button>
        </div>

        {resultado && (
          <div style={{ fontSize: 12.5, background: "var(--shell-active-bg)", padding: 12, borderRadius: "var(--shell-radius-sm)", display: "flex", flexDirection: "column", gap: 8 }}>
            {resultado.link ? (
              <>
                <p style={{ margin: 0, fontWeight: 600 }}>Invitación creada. Este es el enlace:</p>
                <code style={{ wordBreak: "break-all" }}>{resultado.link}</code>
                <p style={{ margin: 0, color: "var(--shell-text-muted)" }}>
                  <strong>No se ha enviado ningún correo.</strong> Cópialo y hazlo llegar tú. Se muestra una sola
                  vez —solo se guarda su huella— y caduca a los 14 días.
                </p>
                <button
                  type="button"
                  className="shell-button"
                  style={{ alignSelf: "flex-start", fontSize: 12 }}
                  onClick={() => void navigator.clipboard?.writeText(resultado.link ?? "")}
                >
                  Copiar enlace
                </button>
              </>
            ) : (
              // Reutilizada: el token de la anterior no se puede recuperar, y
              // decirlo es mejor que dejar un hueco donde se espera un enlace.
              <p style={{ margin: 0 }}>
                Esa persona ya tenía una invitación viva para ese papel, así que se ha conservado esa.{" "}
                <strong>Su enlace no se puede recuperar</strong>: solo se guardó su huella. Si se perdió, revócala
                y vuelve a invitar para generar uno nuevo.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
