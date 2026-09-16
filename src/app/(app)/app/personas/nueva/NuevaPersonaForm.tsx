"use client";

import { useActionState, useState } from "react";
import { crearPersonaAction, type NuevaPersonaState } from "./actions";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";

const initialState: NuevaPersonaState = { error: null };

const fieldWrapStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const rowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };

export default function NuevaPersonaForm({
  campuses,
  tags,
}: {
  campuses: { id: string; name: string }[];
  tags: { id: string; name: string; color: string | null }[];
}) {
  const [state, formAction, pending] = useActionState(crearPersonaAction, initialState);
  const [confirmDespiteDuplicate, setConfirmDespiteDuplicate] = useState(false);

  return (
    <form action={formAction} className="shell-card" style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }} noValidate>
      <input type="hidden" name="confirmDespiteDuplicate" value={confirmDespiteDuplicate ? "true" : "false"} />

      <div style={rowStyle}>
        <div style={fieldWrapStyle}>
          <label htmlFor="firstName" style={authLabelStyle}>Nombre</label>
          <input id="firstName" name="firstName" required style={authInputStyle} />
        </div>
        <div style={fieldWrapStyle}>
          <label htmlFor="lastName" style={authLabelStyle}>Apellidos</label>
          <input id="lastName" name="lastName" style={authInputStyle} />
        </div>
      </div>

      <div style={fieldWrapStyle}>
        <label htmlFor="preferredName" style={authLabelStyle}>Nombre preferido (opcional)</label>
        <input id="preferredName" name="preferredName" style={authInputStyle} />
      </div>

      <div style={rowStyle}>
        <div style={fieldWrapStyle}>
          <label htmlFor="email" style={authLabelStyle}>Correo</label>
          <input id="email" name="email" type="email" style={authInputStyle} />
        </div>
        <div style={fieldWrapStyle}>
          <label htmlFor="phone" style={authLabelStyle}>Teléfono</label>
          <input id="phone" name="phone" type="tel" style={authInputStyle} />
        </div>
      </div>

      <div style={rowStyle}>
        <div style={fieldWrapStyle}>
          <label htmlFor="birthDate" style={authLabelStyle}>Fecha de nacimiento (opcional)</label>
          <input id="birthDate" name="birthDate" type="date" style={authInputStyle} />
        </div>
        <div style={fieldWrapStyle}>
          <label htmlFor="campusId" style={authLabelStyle}>Sede</label>
          <select id="campusId" name="campusId" style={authInputStyle}>
            <option value="">Sin especificar</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={fieldWrapStyle}>
        <label htmlFor="relationship" style={authLabelStyle}>Estado</label>
        <select id="relationship" name="relationship" defaultValue="visitor" style={authInputStyle}>
          <option value="visitor">Visitante</option>
          <option value="connected">Conectado</option>
          <option value="member">Miembro</option>
          <option value="server">Voluntario</option>
          <option value="leader">Líder</option>
        </select>
      </div>

      {tags.length > 0 ? (
        <div style={fieldWrapStyle}>
          <span style={authLabelStyle}>Etiquetas iniciales</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {tags.map((tag) => (
              <label key={tag.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, border: "1px solid var(--shell-border)", borderRadius: 999, padding: "4px 10px" }}>
                <input type="checkbox" name="tagIds" value={tag.id} />
                {tag.name}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {state.duplicates && state.duplicates.length > 0 ? (
        <div className="shell-card" style={{ padding: 14, background: "var(--shell-bg)", border: "1px solid var(--shell-warning)" }}>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Es posible que esta persona ya exista:
          </p>
          <ul style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {state.duplicates.map((d) => (
              <li key={d.personId} style={{ fontSize: 12.5 }}>
                <a href={`/app/personas/${d.personId}`} style={{ color: "var(--shell-brand)", fontWeight: 600 }}>
                  {d.firstName} {d.lastName ?? ""}
                </a>{" "}
                — coincidencia por {d.matchType === "email" ? "correo" : "teléfono"}
              </li>
            ))}
          </ul>
          <button
            type="submit"
            onClick={() => setConfirmDespiteDuplicate(true)}
            style={{ fontSize: 12.5, fontWeight: 600, color: "var(--shell-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            Son personas distintas, crear de todos modos
          </button>
        </div>
      ) : null}

      {state.error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>{state.error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        style={{
          alignSelf: "flex-start",
          padding: "10px 20px",
          borderRadius: "var(--shell-radius-md)",
          border: "none",
          background: "var(--shell-brand)",
          color: "#fff",
          fontSize: 13.5,
          fontWeight: 600,
          cursor: pending ? "wait" : "pointer",
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? "Creando…" : "Crear persona"}
      </button>
    </form>
  );
}
