"use client";

import { useActionState, useState, useTransition } from "react";
import { crearPlantillaAction, archivarPlantillaAction, type PlantillasState } from "./actions";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import { primaryButtonStyle } from "../ui";
import type { CommunicationTemplate } from "@/server/communications/communications-service";

const initialState: PlantillasState = { error: null };

const fieldWrapStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("es-ES");
}

export default function PlantillasManager({
  templates,
  canManage,
}: {
  templates: CommunicationTemplate[];
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(crearPlantillaAction, initialState);
  const [archivePending, startTransition] = useTransition();
  const [archiveError, setArchiveError] = useState<string | null>(null);

  function handleArchive(templateId: string) {
    startTransition(async () => {
      const result = await archivarPlantillaAction(templateId);
      setArchiveError(result.error);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {archiveError ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {archiveError}
        </p>
      ) : null}

      <section className="shell-card" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Plantillas</h2>

        {templates.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "24px 16px" }}>
            <p style={{ fontWeight: 600 }}>No hay plantillas creadas.</p>
          </div>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {templates.map((template) => (
              <li
                key={template.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: "var(--shell-radius-sm)",
                  border: "1px solid var(--shell-border)",
                }}
              >
                <div>
                  <p style={{ fontSize: 13.5, fontWeight: 600 }}>{template.name}</p>
                  <p style={{ fontSize: 12, color: "var(--shell-text-muted)", marginTop: 2 }}>
                    {template.category ? `${template.category} · ` : ""}
                    {formatDate(template.createdAt)}
                  </p>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    disabled={archivePending}
                    onClick={() => handleArchive(template.id)}
                    style={{
                      fontSize: 11.5,
                      color: "var(--shell-text-subtle)",
                      background: "none",
                      border: "none",
                      cursor: archivePending ? "wait" : "pointer",
                      flexShrink: 0,
                    }}
                  >
                    Archivar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage ? (
        <form
          action={formAction}
          className="shell-card"
          style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}
          noValidate
        >
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Nueva plantilla</h2>

          <div style={fieldWrapStyle}>
            <label htmlFor="template-name" style={authLabelStyle}>
              Nombre
            </label>
            <input
              id="template-name"
              name="name"
              required
              style={{ ...authInputStyle, minHeight: 44 }}
              placeholder="Bienvenida a nuevos miembros"
            />
          </div>

          <div style={fieldWrapStyle}>
            <label htmlFor="template-subject" style={authLabelStyle}>
              Asunto (opcional)
            </label>
            <input id="template-subject" name="subject" style={{ ...authInputStyle, minHeight: 44 }} />
          </div>

          <div style={fieldWrapStyle}>
            <label htmlFor="template-body" style={authLabelStyle}>
              Cuerpo del mensaje
            </label>
            <textarea
              id="template-body"
              name="body"
              required
              rows={6}
              style={{ ...authInputStyle, minHeight: 120, resize: "vertical", fontFamily: "inherit" }}
              placeholder="Hola {{first_name}}, gracias por formar parte de {{church_name}}…"
            />
            <p style={{ fontSize: 12, color: "var(--shell-text-muted)" }}>
              Puedes usar <code>{"{{first_name}}"}</code> y <code>{"{{church_name}}"}</code>.
            </p>
          </div>

          <div style={fieldWrapStyle}>
            <label htmlFor="template-category" style={authLabelStyle}>
              Categoría (opcional)
            </label>
            <input id="template-category" name="category" style={{ ...authInputStyle, minHeight: 44 }} />
          </div>

          {state.error ? (
            <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
              {state.error}
            </p>
          ) : null}

          <button type="submit" disabled={pending} style={{ ...primaryButtonStyle(pending), alignSelf: "flex-start" }}>
            {pending ? "Creando…" : "Crear plantilla"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
