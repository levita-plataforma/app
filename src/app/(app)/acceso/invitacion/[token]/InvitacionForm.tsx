"use client";

import { useActionState } from "react";
import { aceptarInvitacionAction, type AceptarInvitacionState } from "./actions";
import { authInputStyle, authLabelStyle, authPrimaryButtonStyle } from "@/components/shell/AuthCard";

const initialState: AceptarInvitacionState = { error: null };

export default function InvitacionForm({ token }: { token: string }) {
  const boundAction = aceptarInvitacionAction.bind(null, token);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 14 }} noValidate>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="firstName" style={authLabelStyle}>Nombre</label>
        <input id="firstName" name="firstName" required style={authInputStyle} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="lastName" style={authLabelStyle}>Apellidos</label>
        <input id="lastName" name="lastName" style={authInputStyle} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="email" style={authLabelStyle}>Correo</label>
        <input id="email" name="email" type="email" autoComplete="email" required style={authInputStyle} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="password" style={authLabelStyle}>Crea una contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          style={authInputStyle}
        />
      </div>

      {state.error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} style={authPrimaryButtonStyle(pending)}>
        {pending ? "Activando…" : "Activar mi acceso"}
      </button>
    </form>
  );
}
