"use client";

import { useActionState } from "react";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import { primaryButtonStyle } from "../ui";
import type { WorshipRepertoire } from "@/server/worship/worship-service";
import { crearRepertorioAction, actualizarRepertorioAction, type RepertorioFormState } from "./actions";

const initialState: RepertorioFormState = { error: null };

export default function RepertorioForm({ repertoire }: { repertoire?: WorshipRepertoire }) {
  const action = repertoire ? actualizarRepertorioAction.bind(null, repertoire.id) : crearRepertorioAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      {state.error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {state.error}
        </p>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="name" style={authLabelStyle}>
          Nombre *
        </label>
        <input id="name" name="name" required defaultValue={repertoire?.name} style={authInputStyle} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="description" style={authLabelStyle}>
          Descripción
        </label>
        <textarea id="description" name="description" defaultValue={repertoire?.description ?? ""} rows={3} style={authInputStyle} />
      </div>

      <div>
        <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </form>
  );
}
