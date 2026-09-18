"use client";

import { useActionState, useState, useTransition } from "react";
import type { GroupTypeItem } from "@/server/groups/groups-service";
import { archivarTipoAction, guardarTipoAction, type TiposState } from "./actions";
import {
  cardStyle,
  dangerButtonStyle,
  fieldStyle,
  inputStyle,
  labelStyle,
  primaryButtonStyle,
  sectionTitleStyle,
  subtleButtonStyle,
} from "../ui";

const initialState: TiposState = { error: null };

export default function TiposManager({ types, canManage }: { types: GroupTypeItem[]; canManage: boolean }) {
  const [state, formAction, pending] = useActionState(guardarTipoAction, initialState);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [editing, setEditing] = useState<GroupTypeItem | null>(null);

  function toggleArchived(type: GroupTypeItem) {
    startTransition(async () => {
      const result = await archivarTipoAction(type.id, type.archivedAt === null);
      setArchiveError(result.error);
    });
  }

  return (
    <>
      {archiveError ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {archiveError}
        </p>
      ) : null}

      <div className="shell-card list-card">
        {types.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "40px 24px" }}>
            <h3>Todavía no hay tipos de grupo</h3>
            <p>Los tipos sirven para clasificar: célula, ministerio de vida, grupo de estudio…</p>
          </div>
        ) : (
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Clave</th>
                  <th>Descripción</th>
                  <th>Orden</th>
                  {canManage ? <th aria-label="Acciones" /> : null}
                </tr>
              </thead>
              <tbody>
                {types.map((type) => (
                  <tr key={type.id} className={type.archivedAt ? "is-archived" : undefined}>
                    <td data-label="Tipo" style={{ fontWeight: 600 }}>
                      {type.name}
                      {type.archivedAt ? (
                        <span className="serving-chip is-muted" style={{ marginLeft: 6 }}>
                          Archivado
                        </span>
                      ) : null}
                    </td>
                    <td data-label="Clave" className="serving-meta">
                      {type.key}
                    </td>
                    <td data-label="Descripción" className="serving-meta">
                      {type.description ?? "—"}
                    </td>
                    <td data-label="Orden" className="serving-meta">
                      {type.sortOrder}
                    </td>
                    {canManage ? (
                      <td data-label="">
                        <div style={{ display: "flex", gap: 10 }}>
                          <button type="button" style={subtleButtonStyle} onClick={() => setEditing(type)}>
                            Editar
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            style={type.archivedAt ? subtleButtonStyle : dangerButtonStyle}
                            onClick={() => toggleArchived(type)}
                          >
                            {type.archivedAt ? "Restaurar" : "Archivar"}
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canManage ? (
        <form action={formAction} className="shell-card" style={cardStyle} noValidate>
          <h2 style={sectionTitleStyle}>{editing ? `Editar «${editing.name}»` : "Nuevo tipo de grupo"}</h2>
          <input type="hidden" name="id" value={editing?.id ?? ""} />

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            <div style={fieldStyle}>
              <label htmlFor="tipo-nombre" style={labelStyle}>
                Nombre
              </label>
              <input
                id="tipo-nombre"
                name="name"
                key={`nombre-${editing?.id ?? "nuevo"}`}
                defaultValue={editing?.name ?? ""}
                required
                maxLength={80}
                style={inputStyle}
                placeholder="Célula"
              />
            </div>
            {!editing ? (
              <div style={fieldStyle}>
                <label htmlFor="tipo-clave" style={labelStyle}>
                  Clave
                </label>
                <input
                  id="tipo-clave"
                  name="key"
                  required
                  maxLength={40}
                  pattern="[a-z0-9_\-]+"
                  style={inputStyle}
                  placeholder="celula"
                />
                <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)", marginTop: 4 }}>
                  Identifica el tipo dentro de la iglesia y no se puede cambiar después.
                </p>
              </div>
            ) : null}
            <div style={fieldStyle}>
              <label htmlFor="tipo-orden" style={labelStyle}>
                Orden
              </label>
              <input
                id="tipo-orden"
                name="sortOrder"
                key={`orden-${editing?.id ?? "nuevo"}`}
                type="number"
                min={0}
                step={1}
                defaultValue={editing?.sortOrder ?? 0}
                style={inputStyle}
              />
            </div>
            <div style={{ ...fieldStyle, flex: "1 1 320px" }}>
              <label htmlFor="tipo-descripcion" style={labelStyle}>
                Descripción
              </label>
              <input
                id="tipo-descripcion"
                name="description"
                key={`desc-${editing?.id ?? "nuevo"}`}
                defaultValue={editing?.description ?? ""}
                maxLength={300}
                style={inputStyle}
              />
            </div>
          </div>

          {state.error ? (
            <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
              {state.error}
            </p>
          ) : null}

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
              {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear tipo"}
            </button>
            {editing ? (
              <button type="button" style={subtleButtonStyle} onClick={() => setEditing(null)}>
                Cancelar
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
    </>
  );
}
