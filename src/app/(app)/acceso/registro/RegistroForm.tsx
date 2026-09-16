"use client";

import { useActionState } from "react";
import { registroAction, type RegistroState } from "./actions";
import { authInputStyle, authLabelStyle, authPrimaryButtonStyle } from "@/components/shell/AuthCard";

const initialState: RegistroState = { error: null };

export default function RegistroForm() {
  const [state, formAction, pending] = useActionState(registroAction, initialState);

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
          autoComplete="new-password"
          minLength={8}
          required
          style={authInputStyle}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="passwordConfirm" style={authLabelStyle}>
          Confirma la contraseña
        </label>
        <input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          style={authInputStyle}
        />
      </div>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "var(--shell-text-muted)" }}>
        <input type="checkbox" name="terms" required style={{ marginTop: 2 }} />
        Acepto los términos y condiciones de LEVITA.
      </label>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "var(--shell-text-muted)" }}>
        <input type="checkbox" name="privacy" required style={{ marginTop: 2 }} />
        He leído y acepto la política de privacidad.
      </label>

      {state.error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} style={authPrimaryButtonStyle(pending)}>
        {pending ? "Creando cuenta…" : "Crear cuenta"}
      </button>
    </form>
  );
}
