"use client";

import { useActionState } from "react";
import { cancelarInscripcionAction, type CancelacionState } from "./actions";

const initialState: CancelacionState = { error: null };

export default function CancelarInscripcionForm({
  churchSlug,
  eventSlug,
  cancelToken,
}: {
  churchSlug: string;
  eventSlug: string;
  cancelToken: string;
}) {
  const boundAction = cancelarInscripcionAction.bind(null, churchSlug, eventSlug);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} style={{ marginTop: 8 }}>
      <input type="hidden" name="cancelToken" value={cancelToken} />

      {state.error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)", marginBottom: 8 }}>
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        style={{
          background: "none",
          border: "1px solid var(--shell-border)",
          borderRadius: "var(--shell-radius-sm)",
          padding: "8px 14px",
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--shell-danger)",
          cursor: pending ? "wait" : "pointer",
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? "Cancelando…" : "Cancelar mi inscripción"}
      </button>
    </form>
  );
}
