"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { LEARNING_PATH_STATUSES, LEARNING_PATH_STATUS_INFO } from "@/lib/discipleship/constants";
import type { LearningPathItem } from "@/server/discipleship/learning-paths-service";
import { guardarItinerarioAction, type ItinerariosState } from "./actions";
import {
  CHIP_CLASS,
  cardStyle,
  fieldStyle,
  inputStyle,
  labelStyle,
  primaryButtonStyle,
  sectionTitleStyle,
  selectStyle,
  subtleButtonStyle,
} from "../ui";

const initialState: ItinerariosState = { error: null };

export default function ItinerariosManager({
  paths,
  canManage,
}: {
  paths: LearningPathItem[];
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(guardarItinerarioAction, initialState);
  const [editing, setEditing] = useState<LearningPathItem | null>(null);

  return (
    <>
      <div className="shell-card list-card">
        {paths.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "40px 24px" }}>
            <h3>Todavía no hay itinerarios</h3>
            <p>Un itinerario ordena los pasos del camino de una persona: nuevos creyentes, bautismo, membresía…</p>
          </div>
        ) : (
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Itinerario</th>
                  <th>Estado</th>
                  <th>Pasos</th>
                  {canManage ? <th aria-label="Acciones" /> : null}
                </tr>
              </thead>
              <tbody>
                {paths.map((path) => {
                  const info = LEARNING_PATH_STATUS_INFO[path.status];
                  return (
                    <tr key={path.id} className={path.archivedAt ? "is-archived" : undefined}>
                      <td data-label="Itinerario" style={{ fontWeight: 600 }}>
                        <Link
                          href={`/app/discipulado/itinerarios/${path.id}`}
                          style={{ color: "var(--shell-text)", textDecoration: "none" }}
                        >
                          {path.name}
                        </Link>
                        {path.description ? (
                          <span style={{ display: "block", fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
                            {path.description}
                          </span>
                        ) : null}
                      </td>
                      <td data-label="Estado">
                        <span className={CHIP_CLASS[info.tone]}>{info.label}</span>
                      </td>
                      <td data-label="Pasos" className="serving-meta">
                        {path.stepCount}
                      </td>
                      {canManage ? (
                        <td data-label="">
                          <button type="button" style={subtleButtonStyle} onClick={() => setEditing(path)}>
                            Editar
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canManage ? (
        <form action={formAction} className="shell-card" style={cardStyle} noValidate>
          <h2 style={sectionTitleStyle}>{editing ? `Editar «${editing.name}»` : "Nuevo itinerario"}</h2>
          <input type="hidden" name="id" value={editing?.id ?? ""} />

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            <div style={{ ...fieldStyle, flex: "1 1 280px" }}>
              <label htmlFor="itinerario-nombre" style={labelStyle}>
                Nombre
              </label>
              <input
                id="itinerario-nombre"
                name="name"
                key={`nombre-${editing?.id ?? "nuevo"}`}
                defaultValue={editing?.name ?? ""}
                required
                maxLength={120}
                style={inputStyle}
                placeholder="Primeros pasos"
              />
            </div>
            <div style={fieldStyle}>
              <label htmlFor="itinerario-estado" style={labelStyle}>
                Estado
              </label>
              <select
                id="itinerario-estado"
                name="status"
                key={`estado-${editing?.id ?? "nuevo"}`}
                defaultValue={editing?.status ?? "draft"}
                style={selectStyle}
              >
                {LEARNING_PATH_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {LEARNING_PATH_STATUS_INFO[status].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ ...fieldStyle, flex: "1 1 100%" }}>
            <label htmlFor="itinerario-descripcion" style={labelStyle}>
              Descripción
            </label>
            <textarea
              id="itinerario-descripcion"
              name="description"
              key={`desc-${editing?.id ?? "nuevo"}`}
              rows={3}
              maxLength={2000}
              defaultValue={editing?.description ?? ""}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </div>

          {state.error ? (
            <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
              {state.error}
            </p>
          ) : null}

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
              {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear itinerario"}
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
