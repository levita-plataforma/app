"use client";

import { useActionState } from "react";
import { signInAction, type AccesoState } from "./actions";

const initialState: AccesoState = { error: null };

export default function AccesoForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
      <div className="acceso-field">
        <label htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      <div className="acceso-field">
        <label htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>

      {state.error ? (
        <p role="alert" className="acceso-error">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="acceso-submit">
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
