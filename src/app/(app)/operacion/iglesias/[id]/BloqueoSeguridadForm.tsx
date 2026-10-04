"use client";

import { useState, useTransition } from "react";
import { bloquearSeguridadAction, desbloquearSeguridadAction } from "./seguridad-acciones";

/**
 * Bloquear o desbloquear por seguridad. Motivo obligatorio y confirmación explícita.
 * Solo se muestra a quien tiene platform.church_security.manage (la página lo decide).
 */
export default function BloqueoSeguridadForm({ churchId, bloqueada }: { churchId: string; bloqueada: boolean }) {
  const [pendiente, startTransition] = useTransition();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const accion = bloqueada ? desbloquearSeguridadAction : bloquearSeguridadAction;
  const texto = bloqueada ? "Desbloquear por seguridad" : "Bloquear por seguridad";
  const pregunta = bloqueada
    ? "¿Desbloquear esta iglesia? Su suscripción no cambia."
    : "¿Bloquear esta iglesia por seguridad? Las personas de la iglesia perderán el acceso a sus datos.";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setOk(null);
        if (!window.confirm(pregunta)) return;
        startTransition(async () => {
          const r = await accion(churchId, motivo);
          if (r.error) setError(r.error);
          else {
            setOk(r.ok);
            setMotivo("");
          }
        });
      }}
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <label style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 4 }}>
        Motivo (obligatorio, queda en la auditoría)
        <textarea required maxLength={500} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ fontSize: 12.5, padding: 6 }} />
      </label>
      <div>
        <button type="submit" className="shell-button" disabled={pendiente || !motivo.trim()} style={{ fontSize: 12 }}>
          {pendiente ? "Guardando…" : texto}
        </button>
      </div>
      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 11.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      )}
      {ok && (
        <p role="status" style={{ margin: 0, fontSize: 11.5 }}>
          {ok}
        </p>
      )}
    </form>
  );
}
