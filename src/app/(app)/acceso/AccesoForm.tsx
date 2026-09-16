"use client";

import { useActionState } from "react";
import { signInAction, type AccesoState } from "./actions";
import { authInputStyle, authLabelStyle, authPrimaryButtonStyle } from "@/components/shell/AuthCard";

const initialState: AccesoState = { error: null };

export default function AccesoForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 14 }} noValidate>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="email" style={authLabelStyle}>
          Correo
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required style={authInputStyle} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="password" style={authLabelStyle}>
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
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
        {pending ? "Accediendo…" : "Acceder"}
      </button>
    </form>
  );
}
