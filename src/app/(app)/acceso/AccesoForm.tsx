"use client";

import { useActionState } from "react";
import { signInAction, type AccesoState } from "./actions";

const initialState: AccesoState = { error: null };

export default function AccesoForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 14 }} noValidate>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="email" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--shell-text)" }}>
          Correo
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          style={inputStyle}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="password" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--shell-text)" }}>
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          style={inputStyle}
        />
      </div>

      {state.error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        style={{
          marginTop: 6,
          padding: "10px 16px",
          borderRadius: "var(--shell-radius-md)",
          border: "none",
          background: "var(--shell-text)",
          color: "#fff",
          fontSize: 13.5,
          fontWeight: 600,
          cursor: pending ? "wait" : "pointer",
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? "Accediendo…" : "Acceder"}
      </button>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: "var(--shell-radius-sm)",
  border: "1px solid var(--shell-border)",
  fontSize: 13.5,
  outline: "none",
  background: "var(--shell-surface)",
  color: "var(--shell-text)",
};
