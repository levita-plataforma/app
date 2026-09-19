"use client";

import { useActionState } from "react";
import { guardarModulosAction, type OnboardingState } from "./actions";
import { authPrimaryButtonStyle } from "@/components/shell/AuthCard";

const initialState: OnboardingState = { error: null };

const CORE_MODULES = [
  { key: "people", label: "Personas", description: "Conoce y cuida a tu comunidad.", core: true },
  { key: "serving", label: "Servicios", description: "Organiza turnos y equipos.", core: true },
  { key: "events", label: "Eventos", description: "Organiza y gestiona.", core: true },
  { key: "communications", label: "Comunicación", description: "Mantén la cercanía.", core: true },
];

const AVAILABLE_MODULES = [
  { key: "groups", label: "Grupos", description: "Crea comunidad." },
  { key: "discipleship", label: "Discipulado", description: "Forma y acompaña." },
  { key: "kids", label: "Niños", description: "Check-in, salas y recogida segura." },
  { key: "facilities", label: "Instalaciones", description: "Espacios y recursos." },
  { key: "analytics", label: "Informes", description: "Toma mejores decisiones." },
];

const COMING_SOON_MODULES = [
  { key: "worship", label: "Alabanza" },
  { key: "pastoral", label: "Acompañamiento pastoral" },
  { key: "giving", label: "Ofrendas" },
  { key: "integrations", label: "Integraciones" },
];

export default function PasoModulos() {
  const [state, formAction, pending] = useActionState(guardarModulosAction, initialState);

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 20 }} noValidate>
      <div>
        <h1 style={{ fontSize: 19, fontWeight: 600, marginBottom: 4 }}>Elige tus módulos</h1>
        <p style={{ fontSize: 13, color: "var(--shell-text-muted)" }}>
          El núcleo recomendado ya está activado. Puedes activar módulos adicionales ahora o más adelante.
        </p>
      </div>

      <fieldset style={{ border: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <legend style={legendStyle}>Núcleo (recomendado)</legend>
        {CORE_MODULES.map((m) => (
          <label key={m.key} style={moduleRowStyle}>
            <input type="checkbox" name="modules" value={m.key} defaultChecked disabled />
            <span>
              <strong style={{ fontSize: 13 }}>{m.label}</strong>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--shell-text-muted)" }}>{m.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <legend style={legendStyle}>Disponibles</legend>
        {AVAILABLE_MODULES.map((m) => (
          <label key={m.key} style={moduleRowStyle}>
            <input type="checkbox" name="modules" value={m.key} />
            <span>
              <strong style={{ fontSize: 13 }}>{m.label}</strong>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--shell-text-muted)" }}>{m.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <legend style={legendStyle}>Próximamente</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {COMING_SOON_MODULES.map((m) => (
            <span
              key={m.key}
              style={{
                fontSize: 11.5,
                color: "var(--shell-text-subtle)",
                background: "var(--shell-bg)",
                border: "1px solid var(--shell-border)",
                borderRadius: 999,
                padding: "4px 10px",
              }}
            >
              {m.label}
            </span>
          ))}
        </div>
      </fieldset>

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

const legendStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--shell-text-subtle)",
  marginBottom: 4,
  padding: 0,
};

const moduleRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: "8px 10px",
  borderRadius: "var(--shell-radius-sm)",
  border: "1px solid var(--shell-border)",
  cursor: "pointer",
};
