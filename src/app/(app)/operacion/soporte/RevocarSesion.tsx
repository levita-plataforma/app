"use client";

import { useState, useTransition } from "react";
import { revocarSesionAction } from "./actions";

/** Cierra una sesión de soporte antes de que caduque. */
export default function RevocarSesion({ id }: { id: string }) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo del cierre (opcional)"
          style={{ fontSize: 12.5, padding: "6px 8px", flex: "1 1 220px", minWidth: 0 }}
        />
        <button
          type="button"
          className="shell-button"
          disabled={pendiente}
          style={{ fontSize: 12 }}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await revocarSesionAction(id, motivo);
              if (r.error) setError(r.error);
            });
          }}
        >
          {pendiente ? "Cerrando…" : "Cerrar sesión de soporte"}
        </button>
      </div>
      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 11.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
