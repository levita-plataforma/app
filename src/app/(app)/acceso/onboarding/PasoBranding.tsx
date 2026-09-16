"use client";

import { useActionState, useState } from "react";
import { guardarBrandingAction, type OnboardingState } from "./actions";
import { authInputStyle, authLabelStyle, authPrimaryButtonStyle } from "@/components/shell/AuthCard";

const initialState: OnboardingState = { error: null };

const ACCENT_OPTIONS = [
  { value: "#c89b4a", label: "Dorado (por defecto)" },
  { value: "#4472ca", label: "Azul" },
  { value: "#3f9d63", label: "Verde" },
  { value: "#c4626a", label: "Rojo suave" },
];

export default function PasoBranding({ churchName }: { churchName: string }) {
  const [state, formAction, pending] = useActionState(guardarBrandingAction, initialState);
  const [accent, setAccent] = useState(ACCENT_OPTIONS[0].value);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 18 }} noValidate>
      <div>
        <h1 style={{ fontSize: 19, fontWeight: 600, marginBottom: 4 }}>Personaliza tu espacio</h1>
        <p style={{ fontSize: 13, color: "var(--shell-text-muted)" }}>
          Un nombre visible y un color de acento propios de tu iglesia, dentro del sistema visual de LEVITA.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="displayName" style={authLabelStyle}>Nombre visible</label>
        <input id="displayName" name="displayName" defaultValue={churchName} style={authInputStyle} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={authLabelStyle}>Color de acento</span>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {ACCENT_OPTIONS.map((option) => (
            <label
              key={option.value}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: `1px solid ${accent === option.value ? option.value : "var(--shell-border)"}`,
                borderRadius: "var(--shell-radius-sm)",
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: 12.5,
              }}
            >
              <input
                type="radio"
                name="accentColor"
                value={option.value}
                checked={accent === option.value}
                onChange={() => setAccent(option.value)}
                style={{ accentColor: option.value }}
              />
              <span style={{ width: 14, height: 14, borderRadius: "50%", background: option.value, display: "inline-block" }} />
              {option.label}
            </label>
          ))}
        </div>
        <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
          El acento se aplica dentro de los límites de contraste y accesibilidad del sistema de diseño de LEVITA.
        </p>
      </div>

      {state.error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} style={authPrimaryButtonStyle(pending)}>
        {pending ? "Guardando…" : "Continuar"}
      </button>
    </form>
  );
}
