"use client";

import { useActionState, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { crearCampoAction, archivarCampoAction, type CamposState } from "./actions";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import type { CustomFieldDefinition } from "@/server/people/custom-fields-service";

const initialState: CamposState = { error: null };

const TYPE_LABELS: Record<string, string> = {
  text: "Texto",
  number: "Número",
  date: "Fecha",
  boolean: "Sí/No",
  select: "Selección única",
  multi_select: "Selección múltiple",
};

export default function CamposManager({ fields, canManage }: { fields: CustomFieldDefinition[]; canManage: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [fieldType, setFieldType] = useState("text");
  const [state, formAction, pending] = useActionState(crearCampoAction, initialState);
  const [archivePending, startTransition] = useTransition();
  const [archiveError, setArchiveError] = useState<string | null>(null);

  function handleArchive(fieldId: string) {
    startTransition(async () => {
      const result = await archivarCampoAction(fieldId);
      setArchiveError(result.error);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {archiveError ? <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>{archiveError}</p> : null}

      {fields.length === 0 ? (
        <div className="shell-card shell-empty-state">
          <h3>No hay campos personalizados</h3>
          <p>Crea campos adicionales para tu directorio de personas.</p>
        </div>
      ) : (
        <div className="shell-card" style={{ padding: 0 }}>
          <table className="people-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Sensible</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.id}>
                  <td data-label="Nombre">{f.name}</td>
                  <td data-label="Tipo">{TYPE_LABELS[f.fieldType] ?? f.fieldType}</td>
                  <td data-label="Sensible">{f.isSensitive ? "Sí" : "No"}</td>
                  <td data-label="">
                    {canManage ? (
                      <button
                        type="button"
                        disabled={archivePending}
                        onClick={() => handleArchive(f.id)}
                        style={{ fontSize: 11.5, color: "var(--shell-text-subtle)", background: "none", border: "none", cursor: "pointer" }}
                      >
                        Archivar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage ? (
        showForm ? (
          <form action={formAction} className="shell-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }} noValidate>
            <div>
              <label htmlFor="field-name" style={authLabelStyle}>Nombre del campo</label>
              <input id="field-name" name="name" required style={authInputStyle} placeholder="Talla de camiseta" />
            </div>
            <div>
              <label htmlFor="field-type" style={authLabelStyle}>Tipo</label>
              <select id="field-type" name="fieldType" value={fieldType} onChange={(e) => setFieldType(e.target.value)} style={authInputStyle}>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            {fieldType === "select" || fieldType === "multi_select" ? (
              <div>
                <label htmlFor="field-options" style={authLabelStyle}>Opciones (separadas por coma)</label>
                <input id="field-options" name="options" style={authInputStyle} placeholder="S, M, L, XL" />
              </div>
            ) : null}
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
              <input type="checkbox" name="isSensitive" />
              Campo sensible (restringe visibilidad)
            </label>
            {state.error ? <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>{state.error}</p> : null}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={pending} style={{ padding: "8px 16px", borderRadius: "var(--shell-radius-sm)", border: "none", background: "var(--shell-text)", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: pending ? "wait" : "pointer" }}>
                {pending ? "Creando…" : "Crear campo"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={{ padding: "8px 16px", borderRadius: "var(--shell-radius-sm)", border: "1px solid var(--shell-border)", background: "var(--shell-surface)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: "var(--shell-radius-sm)", border: "1px solid var(--shell-border)", background: "var(--shell-surface)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            <Plus size={14} /> Nuevo campo
          </button>
        )
      ) : null}
    </div>
  );
}
