"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import type { Qualification, PersonQualification } from "@/server/serving/qualifications-service";
import { QUALIFICATION_LEVEL_LABELS } from "../labels";
import {
  crearCualificacionAction,
  asignarCualificacionAction,
  archivarCualificacionAction,
  editarCualificacionAction,
  verificarCualificacionAction,
  actualizarVencimientoAction,
  quitarCualificacionPersonaAction,
  type CualificacionesState,
} from "./actions";
import { primaryButtonStyle, secondaryButtonStyle, subtleButtonStyle, fullName, formatDate } from "../ui";

const initialState: CualificacionesState = { error: null };

type PersonOption = { id: string; firstName: string; lastName: string | null };

export default function CualificacionesManager({
  qualifications,
  assignments,
  people,
  canManage,
  showingArchived,
}: {
  qualifications: Qualification[];
  assignments: PersonQualification[];
  people: PersonOption[];
  canManage: boolean;
  showingArchived: boolean;
}) {
  const [createState, createAction, creating] = useActionState(crearCualificacionAction, initialState);
  const [assignState, assignAction, assigning] = useActionState(asignarCualificacionAction, initialState);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<CualificacionesState>) {
    startTransition(async () => {
      const result = await fn();
      setError(result.error);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      ) : null}

      {canManage && !showingArchived ? (
        showForm ? (
          <form
            action={createAction}
            className="shell-card"
            style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}
            noValidate
          >
            <div>
              <label htmlFor="q-name" style={authLabelStyle}>
                Nombre de la cualificación
              </label>
              <input
                id="q-name"
                name="name"
                required
                placeholder="Mesa de sonido"
                style={{ ...authInputStyle, width: "100%" }}
              />
            </div>
            <div>
              <label htmlFor="q-desc" style={authLabelStyle}>
                Descripción
              </label>
              <input id="q-desc" name="description" style={{ ...authInputStyle, width: "100%" }} />
            </div>
            <div>
              <label htmlFor="q-category" style={authLabelStyle}>
                Categoría
              </label>
              <input
                id="q-category"
                name="category"
                placeholder="Técnica"
                style={{ ...authInputStyle, width: "100%" }}
              />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
              <input type="checkbox" name="expiryRequired" /> Requiere fecha de vencimiento
            </label>

            {createState.error ? (
              <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
                {createState.error}
              </p>
            ) : null}

            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={creating} style={primaryButtonStyle(creating)}>
                {creating ? "Creando…" : "Crear cualificación"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={secondaryButtonStyle()}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            style={{ ...primaryButtonStyle(), alignSelf: "flex-start" }}
          >
            <Plus size={14} /> Nueva cualificación
          </button>
        )
      ) : null}

      <div className="shell-card list-card">
        <div className="list-card-header">
          <h2>Catálogo</h2>
        </div>
        {qualifications.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "32px 12px" }}>
            <h3>{showingArchived ? "No hay cualificaciones archivadas" : "Todavía no hay cualificaciones"}</h3>
            <p>
              Una cualificación describe una capacidad verificable (Mesa de sonido, OBS, Primeros
              auxilios). No es un permiso.
            </p>
          </div>
        ) : (
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Cualificación</th>
                  <th>Categoría</th>
                  <th>Personas</th>
                  <th>Vencimiento</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {qualifications.map((q) => (
                  <tr key={q.id}>
                    <td data-label="Cualificación">
                      <span style={{ fontWeight: 600 }}>{q.name}</span>
                      {q.description ? <div className="serving-meta">{q.description}</div> : null}
                    </td>
                    <td data-label="Categoría" className="serving-meta">
                      {q.category ?? "—"}
                    </td>
                    <td data-label="Personas">{q.peopleCount}</td>
                    <td data-label="Vencimiento" className="serving-meta">
                      {q.expiryRequired ? "Obligatorio" : "No aplica"}
                    </td>
                    <td data-label="Estado">
                      <span className={`serving-chip ${q.active ? "is-success" : "is-muted"}`}>
                        {q.archivedAt ? "Archivada" : q.active ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td data-label="">
                      {canManage && !showingArchived ? (
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => editarCualificacionAction(q.id, { active: !q.active }))}
                            style={subtleButtonStyle}
                          >
                            {q.active ? "Desactivar" : "Activar"}
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => archivarCualificacionAction(q.id))}
                            style={subtleButtonStyle}
                          >
                            Archivar
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canManage && qualifications.length > 0 && !showingArchived ? (
        <form action={assignAction} className="shell-card serving-toolbar" style={{ padding: 18 }} noValidate>
          <div style={{ flex: "1 1 160px" }}>
            <label htmlFor="assign-person" style={authLabelStyle}>
              Persona
            </label>
            <select id="assign-person" name="personId" required style={{ ...authInputStyle, width: "100%" }}>
              <option value="">Selecciona…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {fullName(p.firstName, p.lastName)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label htmlFor="assign-qualification" style={authLabelStyle}>
              Cualificación
            </label>
            <select
              id="assign-qualification"
              name="qualificationId"
              required
              style={{ ...authInputStyle, width: "100%" }}
            >
              <option value="">Selecciona…</option>
              {qualifications.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="assign-level" style={authLabelStyle}>
              Nivel
            </label>
            <select id="assign-level" name="level" style={authInputStyle}>
              {Object.entries(QUALIFICATION_LEVEL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="assign-expires" style={authLabelStyle}>
              Vence
            </label>
            <input id="assign-expires" name="expiresAt" type="date" style={authInputStyle} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, paddingBottom: 8 }}>
            <input type="checkbox" name="verified" /> Verificada
          </label>
          {assignState.error ? (
            <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)", width: "100%" }}>
              {assignState.error}
            </p>
          ) : null}
          <button type="submit" disabled={assigning} style={primaryButtonStyle(assigning)}>
            {assigning ? "Asignando…" : "Asignar"}
          </button>
        </form>
      ) : null}

      <div className="shell-card list-card">
        <div className="list-card-header">
          <h2>Personas cualificadas</h2>
        </div>
        {assignments.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "32px 12px" }}>
            <h3>Nadie tiene cualificaciones asignadas todavía</h3>
            <p>Asigna cualificaciones a las personas para que la elegibilidad por puesto funcione.</p>
          </div>
        ) : (
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Cualificación</th>
                  <th>Nivel</th>
                  <th>Verificación</th>
                  <th>Vence</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Persona">
                      <Link
                        href={`/app/personas/${a.personId}`}
                        style={{ fontWeight: 600, color: "var(--shell-text)", textDecoration: "none" }}
                      >
                        {fullName(a.firstName, a.lastName)}
                      </Link>
                    </td>
                    <td data-label="Cualificación">{a.qualificationName}</td>
                    <td data-label="Nivel">
                      <span className="serving-chip is-muted">{QUALIFICATION_LEVEL_LABELS[a.level]}</span>
                    </td>
                    <td data-label="Verificación">
                      <span className={`serving-chip ${a.verified ? "is-success" : "is-warning"}`}>
                        {a.verified ? "Verificada" : "Sin verificar"}
                      </span>
                    </td>
                    <td data-label="Vence">
                      {canManage ? (
                        <input
                          type="date"
                          defaultValue={a.expiresAt ? a.expiresAt.slice(0, 10) : ""}
                          aria-label={`Vencimiento de ${a.qualificationName}`}
                          disabled={pending}
                          onChange={(e) =>
                            run(() =>
                              actualizarVencimientoAction(a.personId, a.qualificationId, e.target.value || null),
                            )
                          }
                          style={{ ...authInputStyle, padding: "5px 8px", fontSize: 12.5 }}
                        />
                      ) : (
                        <span className="serving-meta">{formatDate(a.expiresAt)}</span>
                      )}
                    </td>
                    <td data-label="">
                      {canManage ? (
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {!a.verified ? (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => run(() => verificarCualificacionAction(a.personId, a.qualificationId))}
                              style={subtleButtonStyle}
                            >
                              Verificar
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              run(() => quitarCualificacionPersonaAction(a.personId, a.qualificationId))
                            }
                            style={subtleButtonStyle}
                          >
                            Quitar
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
