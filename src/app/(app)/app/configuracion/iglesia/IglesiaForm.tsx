"use client";

import { useActionState } from "react";
import { actualizarIglesiaAction, type ConfiguracionIglesiaState } from "./actions";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";

type IglesiaFormProps = {
  name: string;
  displayName: string;
  accentColor: string;
  timezone: string;
  currency: string;
  country: string;
  email: string;
  phone: string;
  website: string;
};

const fieldWrapStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const rowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--shell-text-subtle)",
};

const initialState: ConfiguracionIglesiaState = { error: null };

export default function IglesiaForm(props: IglesiaFormProps) {
  const [state, formAction, pending] = useActionState(actualizarIglesiaAction, initialState);

  return (
    <form action={formAction} className="shell-card" style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }} noValidate>
      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={sectionTitleStyle}>General</p>
        <div style={rowStyle}>
          <div style={fieldWrapStyle}>
            <label htmlFor="name" style={authLabelStyle}>Nombre oficial</label>
            <input id="name" name="name" required defaultValue={props.name} style={authInputStyle} />
          </div>
          <div style={fieldWrapStyle}>
            <label htmlFor="displayName" style={authLabelStyle}>Nombre visible</label>
            <input id="displayName" name="displayName" defaultValue={props.displayName} style={authInputStyle} />
          </div>
        </div>
        <div style={fieldWrapStyle}>
          <label htmlFor="accentColor" style={authLabelStyle}>Color de acento</label>
          <input id="accentColor" name="accentColor" type="color" defaultValue={props.accentColor} style={{ ...authInputStyle, height: 38, padding: 4 }} />
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={sectionTitleStyle}>Regional</p>
        <div style={rowStyle}>
          <div style={fieldWrapStyle}>
            <label htmlFor="country" style={authLabelStyle}>País</label>
            <input id="country" name="country" defaultValue={props.country} style={authInputStyle} />
          </div>
          <div style={fieldWrapStyle}>
            <label htmlFor="currency" style={authLabelStyle}>Moneda</label>
            <select id="currency" name="currency" defaultValue={props.currency} style={authInputStyle}>
              <option value="EUR">EUR — Euro</option>
              <option value="USD">USD — Dólar estadounidense</option>
              <option value="MXN">MXN — Peso mexicano</option>
              <option value="COP">COP — Peso colombiano</option>
              <option value="ARS">ARS — Peso argentino</option>
            </select>
          </div>
        </div>
        <div style={fieldWrapStyle}>
          <label htmlFor="timezone" style={authLabelStyle}>Zona horaria</label>
          <select id="timezone" name="timezone" defaultValue={props.timezone} style={authInputStyle}>
            <option value="Europe/Madrid">Europe/Madrid</option>
            <option value="Atlantic/Canary">Atlantic/Canary</option>
            <option value="America/Mexico_City">America/Mexico_City</option>
            <option value="America/Bogota">America/Bogota</option>
            <option value="America/Argentina/Buenos_Aires">America/Argentina/Buenos_Aires</option>
          </select>
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={sectionTitleStyle}>Contacto</p>
        <div style={rowStyle}>
          <div style={fieldWrapStyle}>
            <label htmlFor="email" style={authLabelStyle}>Correo</label>
            <input id="email" name="email" type="email" defaultValue={props.email} style={authInputStyle} />
          </div>
          <div style={fieldWrapStyle}>
            <label htmlFor="phone" style={authLabelStyle}>Teléfono</label>
            <input id="phone" name="phone" type="tel" defaultValue={props.phone} style={authInputStyle} />
          </div>
        </div>
        <div style={fieldWrapStyle}>
          <label htmlFor="website" style={authLabelStyle}>Sitio web</label>
          <input id="website" name="website" type="url" defaultValue={props.website} style={authInputStyle} placeholder="https://" />
        </div>
      </section>

      {state.error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>{state.error}</p>
      ) : null}
      {state.success ? (
        <p role="status" style={{ fontSize: 12.5, color: "var(--shell-success)" }}>Cambios guardados.</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        style={{
          alignSelf: "flex-start",
          padding: "10px 20px",
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
        {pending ? "Guardando…" : "Guardar cambios"}
      </button>
    </form>
  );
}
