"use client";

import { useActionState } from "react";
import { authPrimaryButtonStyle } from "@/components/shell/AuthCard";
import { darDeBajaAction, type BajaState } from "./actions";

const initialState: BajaState = { status: "idle", error: null, categoryLabel: null };

export default function DarDeBajaForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(darDeBajaAction, initialState);

  if (state.status === "done") {
    const label = state.categoryLabel ?? "esta categoría";
    return (
      <p style={{ fontSize: 13.5, color: "var(--shell-text-muted)" }}>
        Ya no recibirás correos ni notificaciones de la categoría <strong>{label}</strong>. Puedes cambiar esta
        preferencia en cualquier momento desde tu cuenta.
      </p>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="token" value={token} />

      {state.status === "error" ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)", marginBottom: 12 }}>
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} style={authPrimaryButtonStyle(pending)}>
        {pending ? "Procesando…" : "Confirmar baja"}
      </button>
    </form>
  );
}
