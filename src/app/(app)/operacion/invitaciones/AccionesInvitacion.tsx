"use client";

import { useState, useTransition } from "react";
import { reenviarInvitacionAction, revocarInvitacionAction } from "../iglesias/[id]/acciones-responsables";

/** Reenviar (revoca y emite otra) o revocar una invitación pendiente. */
export default function AccionesInvitacion({ id, churchId }: { id: string; churchId: string }) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          className="shell-button"
          disabled={pendiente}
          style={{ fontSize: 11.5 }}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const r = await reenviarInvitacionAction(id, churchId);
              if (r.error) setError(r.error);
              else setLink(r.link ?? null);
            });
          }}
        >
          Reenviar
        </button>
        <button
          type="button"
          className="shell-button"
          disabled={pendiente}
          style={{ fontSize: 11.5 }}
          onClick={() => {
            if (!window.confirm("¿Revocar esta invitación? El enlace dejará de funcionar.")) return;
            setError(null);
            startTransition(async () => {
              const r = await revocarInvitacionAction(id, churchId, "revocada desde Invitaciones");
              if (r.error) setError(r.error);
            });
          }}
        >
          Revocar
        </button>
      </div>
      {link && (
        <div style={{ fontSize: 11.5, display: "flex", flexDirection: "column", gap: 4 }}>
          <span>
            <strong>Enlace nuevo</strong> (se muestra una vez, no se envía ningún correo):
          </span>
          <code style={{ wordBreak: "break-all" }}>{link}</code>
          <button type="button" className="shell-button" style={{ fontSize: 11.5, alignSelf: "flex-start" }} onClick={() => void navigator.clipboard?.writeText(link)}>
            Copiar
          </button>
        </div>
      )}
      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 11.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
