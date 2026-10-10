"use client";

import { useState, useTransition } from "react";
import {
  altaOperadorAction,
  concederCapacidadAction,
  retirarCapacidadAction,
  retirarOperadorAction,
} from "./acciones";

type Miembro = {
  userId: string;
  email: string | null;
  createdAt: string;
  capabilities: string[];
  esUnoMismo: boolean;
};

type Capacidad = { key: string; description: string };

const GESTION = "platform.operators.manage";

export default function PanelEquipo({
  miembros,
  catalogo,
}: {
  miembros: Miembro[];
  catalogo: Capacidad[];
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [aniadir, setAniadir] = useState<Record<string, string>>({});
  const [confirmando, setConfirmando] = useState<string | null>(null);

  function ejecutar(accion: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const r = await accion();
      if (r.error) setError(r.error);
    });
  }

  const gestores = miembros.filter((m) => m.capabilities.includes(GESTION));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && (
        <div className="shell-card" role="alert" style={{ padding: 12, borderLeft: "3px solid var(--shell-danger, #c0392b)" }}>
          <p style={{ margin: 0, fontSize: 12.5 }}>{error}</p>
        </div>
      )}

      {/*
        Con un solo gestor, perder esa cuenta deja la consola sin forma de
        recuperar el equipo: el arranque inicial no está concedido a nadie y hay
        que entrar a la base a propósito. Más vale decirlo antes que después.
      */}
      {gestores.length === 1 && (
        <div className="shell-card" style={{ padding: 12, borderLeft: "3px solid var(--shell-warning, #c98a00)" }}>
          <p style={{ margin: 0, fontSize: 12.5 }}>
            <strong>Solo una cuenta puede gestionar el equipo.</strong> Si se pierde el acceso a{" "}
            {gestores[0].email ?? "esa cuenta"}, recuperar la consola exige entrar a la base de datos a mano. Conviene
            que haya al menos dos.
          </p>
        </div>
      )}

      <section className="shell-card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="serving-table" style={{ margin: 0 }}>
          <thead>
            <tr>
              <th>Cuenta</th>
              <th>En el equipo desde</th>
              <th>Qué puede hacer</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {miembros.map((m) => {
              const disponibles = catalogo.filter((c) => !m.capabilities.includes(c.key));
              const seleccion = aniadir[m.userId] ?? "";
              return (
                <tr key={m.userId}>
                  <td>
                    {m.email ?? "sin correo"}
                    {m.esUnoMismo && (
                      <span style={{ color: "var(--shell-text-muted)", fontSize: 11.5 }}> · tú</span>
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {new Date(m.createdAt).toLocaleDateString("es-ES", { dateStyle: "medium" })}
                  </td>
                  <td>
                    {m.capabilities.length === 0 ? (
                      <span style={{ color: "var(--shell-text-muted)", fontSize: 12 }}>
                        Nada todavía: puede entrar, no puede actuar.
                      </span>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {m.capabilities.map((c) => (
                          <span
                            key={c}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 11.5,
                              background: "var(--shell-active-bg)",
                              borderRadius: "var(--shell-radius-sm)",
                              padding: "2px 6px",
                            }}
                          >
                            {c}
                            <button
                              type="button"
                              aria-label={`Retirar ${c} a ${m.email ?? "esta cuenta"}`}
                              disabled={pendiente}
                              onClick={() => ejecutar(() => retirarCapacidadAction(m.userId, c))}
                              style={{ border: 0, background: "none", cursor: "pointer", fontSize: 13, lineHeight: 1 }}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/*
                      Concederse capacidades a uno mismo lo rechaza la base. Aquí
                      no se ofrece, para no enseñar un botón que solo sirve para
                      recibir un error.
                    */}
                    {!m.esUnoMismo && disponibles.length > 0 && (
                      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                        <select
                          value={seleccion}
                          aria-label={`Conceder una capacidad a ${m.email ?? "esta cuenta"}`}
                          onChange={(e) => setAniadir((a) => ({ ...a, [m.userId]: e.target.value }))}
                          style={{ fontSize: 12, padding: "4px 6px", maxWidth: 260 }}
                        >
                          <option value="">Conceder…</option>
                          {disponibles.map((c) => (
                            <option key={c.key} value={c.key} title={c.description}>
                              {c.key}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="shell-button"
                          disabled={pendiente || seleccion === ""}
                          style={{ fontSize: 11.5 }}
                          onClick={() => {
                            ejecutar(() => concederCapacidadAction(m.userId, seleccion));
                            setAniadir((a) => ({ ...a, [m.userId]: "" }));
                          }}
                        >
                          Conceder
                        </button>
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {confirmando === m.userId ? (
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 11.5 }}>
                        ¿Seguro?
                        <button
                          type="button"
                          className="shell-button"
                          disabled={pendiente}
                          style={{ fontSize: 11.5 }}
                          onClick={() => {
                            setConfirmando(null);
                            ejecutar(() => retirarOperadorAction(m.userId));
                          }}
                        >
                          Sí, retirar
                        </button>
                        <button
                          type="button"
                          className="shell-button"
                          style={{ fontSize: 11.5 }}
                          onClick={() => setConfirmando(null)}
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="shell-button"
                        disabled={pendiente}
                        style={{ fontSize: 11.5 }}
                        onClick={() => setConfirmando(m.userId)}
                      >
                        {m.esUnoMismo ? "Salir del equipo" : "Retirar del equipo"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="shell-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>Añadir a alguien</h2>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--shell-text-muted)" }}>
          Esa persona necesita tener ya una cuenta de LEVITA: esto no envía ninguna invitación. Entra sin capacidades y se
          le conceden aquí, una a una.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="persona@levita.test"
            style={{ fontSize: 12.5, padding: "6px 8px", flex: "1 1 240px", minWidth: 0 }}
          />
          <button
            type="button"
            className="shell-button"
            disabled={pendiente || email.trim().length === 0}
            style={{ fontSize: 12 }}
            onClick={() => {
              ejecutar(async () => {
                const r = await altaOperadorAction(email.trim());
                if (!r.error) setEmail("");
                return r;
              });
            }}
          >
            {pendiente ? "Añadiendo…" : "Añadir al equipo"}
          </button>
        </div>
      </section>
    </div>
  );
}
