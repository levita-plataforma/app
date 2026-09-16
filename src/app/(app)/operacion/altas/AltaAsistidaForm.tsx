"use client";

import { useActionState } from "react";
import { crearAltaAsistidaAction, type AltaAsistidaState } from "./actions";
import { authInputStyle, authLabelStyle, authPrimaryButtonStyle } from "@/components/shell/AuthCard";

const initialState: AltaAsistidaState = { error: null };

export default function AltaAsistidaForm() {
  const [state, formAction, pending] = useActionState(crearAltaAsistidaAction, initialState);

  return (
    <div className="shell-card" style={{ padding: "24px 28px" }}>
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 14 }} noValidate>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="name" style={authLabelStyle}>Nombre de la iglesia</label>
          <input id="name" name="name" required style={authInputStyle} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="slug" style={authLabelStyle}>Identificador (slug)</label>
          <input id="slug" name="slug" required pattern="[a-z0-9-]+" style={authInputStyle} placeholder="iglesia-central" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="ownerEmail" style={authLabelStyle}>Correo del propietario</label>
          <input id="ownerEmail" name="ownerEmail" type="email" required style={authInputStyle} />
        </div>

        {state.error ? (
          <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>{state.error}</p>
        ) : null}

        {state.invitationLink ? (
          <div style={{ fontSize: 12.5, background: "var(--shell-active-bg)", padding: 12, borderRadius: "var(--shell-radius-sm)" }}>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>Enlace de invitación generado:</p>
            <code style={{ wordBreak: "break-all" }}>{state.invitationLink}</code>
          </div>
        ) : null}

        <button type="submit" disabled={pending} style={authPrimaryButtonStyle(pending)}>
          {pending ? "Creando…" : "Crear alta asistida"}
        </button>
      </form>
    </div>
  );
}
