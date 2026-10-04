"use client";

import { useState, useTransition } from "react";
import { abrirSesionAction } from "../../soporte/actions";

/** Duraciones admitidas por la base (15, 30, 60, 120 y 240 minutos). Por defecto, una hora. */
const DURACIONES: { minutos: number; etiqueta: string }[] = [
  { minutos: 15, etiqueta: "15 minutos" },
  { minutos: 30, etiqueta: "30 minutos" },
  { minutos: 60, etiqueta: "1 hora" },
  { minutos: 120, etiqueta: "2 horas" },
  { minutos: 240, etiqueta: "4 horas (máximo)" },
];

/**
 * Abre una sesión de soporte con motivo obligatorio y duración explícita. El
 * ámbito no se elige: solo existe el de diagnóstico, y el servidor lo impone.
 */
export default function AbrirSesionForm({ churchId }: { churchId: string }) {
  const [pendiente, startTransition] = useTransition();
  const [motivo, setMotivo] = useState("");
  const [minutos, setMinutos] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setOk(false);
        startTransition(async () => {
          const r = await abrirSesionAction(churchId, motivo, minutos);
          if (r.error) setError(r.error);
          else {
            setOk(true);
            setMotivo("");
          }
        });
      }}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <label style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 4 }}>
        Motivo (obligatorio)
        <textarea
          required
          maxLength={500}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={2}
          style={{ fontSize: 12.5, padding: 6 }}
        />
      </label>
      <label style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 4 }}>
        Duración
        <select value={minutos} onChange={(e) => setMinutos(Number(e.target.value))} style={{ fontSize: 12.5, padding: 6, maxWidth: 240 }}>
          {DURACIONES.map((d) => (
            <option key={d.minutos} value={d.minutos}>
              {d.etiqueta}
            </option>
          ))}
        </select>
      </label>
      <div>
        <button type="submit" className="shell-button" disabled={pendiente || !motivo.trim()} style={{ fontSize: 12 }}>
          {pendiente ? "Abriendo…" : "Abrir sesión de soporte"}
        </button>
      </div>
      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 11.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      )}
      {ok && (
        <p role="status" style={{ margin: 0, fontSize: 11.5 }}>
          Sesión abierta. Solo da acceso a diagnóstico; no abre datos de la iglesia.
        </p>
      )}
    </form>
  );
}
