"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import {
  COURSE_STATUSES,
  COURSE_STATUS_INFO,
  DEFAULT_COMPLETION_ATTENDANCE_RATIO,
} from "@/lib/discipleship/constants";
import type { CourseItem } from "@/server/discipleship/discipleship-service";
import { archivarCursoAction, guardarCursoAction, type CursosState } from "./actions";
import {
  CHIP_CLASS,
  cardStyle,
  dangerButtonStyle,
  fieldStyle,
  formatRatio,
  inputStyle,
  labelStyle,
  primaryButtonStyle,
  sectionTitleStyle,
  selectStyle,
  subtleButtonStyle,
} from "../ui";

const initialState: CursosState = { error: null };

export default function CursosManager({
  courses,
  canCreate,
  canManage,
}: {
  courses: CourseItem[];
  canCreate: boolean;
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(guardarCursoAction, initialState);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [editing, setEditing] = useState<CourseItem | null>(null);

  function toggleArchived(course: CourseItem) {
    startTransition(async () => {
      const result = await archivarCursoAction(course.id, course.archivedAt === null);
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
        {courses.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "40px 24px" }}>
            <h3>Todavía no hay cursos</h3>
            <p>Un curso describe la formación; cada edición concreta es una cohorte con sus fechas y su gente.</p>
          </div>
        ) : (
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Curso</th>
                  <th>Estado</th>
                  <th>Sesiones</th>
                  <th>Umbral sugerido</th>
                  <th>Cohortes</th>
                  {canManage ? <th aria-label="Acciones" /> : null}
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => {
                  const info = COURSE_STATUS_INFO[course.status];
                  return (
                    <tr key={course.id} className={course.archivedAt ? "is-archived" : undefined}>
                      <td data-label="Curso" style={{ fontWeight: 600 }}>
                        <Link
                          href={`/app/discipulado/cursos/${course.id}`}
                          style={{ color: "var(--shell-text)", textDecoration: "none" }}
                        >
                          {course.name}
                        </Link>
                        {course.description ? (
                          <span style={{ display: "block", fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
                            {course.description}
                          </span>
                        ) : null}
                      </td>
                      <td data-label="Estado">
                        <span className={CHIP_CLASS[info.tone]}>{info.label}</span>
                      </td>
                      <td data-label="Sesiones" className="serving-meta">
                        {course.sessionCount ?? "—"}
                      </td>
                      <td data-label="Umbral sugerido" className="serving-meta">
                        {formatRatio(course.completionAttendanceRatio)}
                      </td>
                      <td data-label="Cohortes" className="serving-meta">
                        {course.cohortCount}
                      </td>
                      {canManage ? (
                        <td data-label="">
                          <div style={{ display: "flex", gap: 10 }}>
                            <button type="button" style={subtleButtonStyle} onClick={() => setEditing(course)}>
                              Editar
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              style={course.archivedAt ? subtleButtonStyle : dangerButtonStyle}
                              onClick={() => toggleArchived(course)}
                            >
                              {course.archivedAt ? "Restaurar" : "Archivar"}
                            </button>
                          </div>
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

      {canCreate || canManage ? (
        <form action={formAction} className="shell-card" style={cardStyle} noValidate>
          <h2 style={sectionTitleStyle}>{editing ? `Editar «${editing.name}»` : "Nuevo curso"}</h2>
          <input type="hidden" name="id" value={editing?.id ?? ""} />

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            <div style={{ ...fieldStyle, flex: "1 1 280px" }}>
              <label htmlFor="curso-nombre" style={labelStyle}>
                Nombre
              </label>
              <input
                id="curso-nombre"
                name="name"
                key={`nombre-${editing?.id ?? "nuevo"}`}
                defaultValue={editing?.name ?? ""}
                required
                maxLength={120}
                style={inputStyle}
                placeholder="Fundamentos de la fe"
              />
            </div>
            <div style={fieldStyle}>
              <label htmlFor="curso-estado" style={labelStyle}>
                Estado
              </label>
              <select
                id="curso-estado"
                name="status"
                key={`estado-${editing?.id ?? "nuevo"}`}
                defaultValue={editing?.status ?? "draft"}
                style={selectStyle}
              >
                {COURSE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {COURSE_STATUS_INFO[status].label}
                  </option>
                ))}
              </select>
            </div>
            <div style={fieldStyle}>
              <label htmlFor="curso-sesiones" style={labelStyle}>
                Sesiones previstas
              </label>
              <input
                id="curso-sesiones"
                name="sessionCount"
                key={`sesiones-${editing?.id ?? "nuevo"}`}
                type="number"
                min={1}
                step={1}
                defaultValue={editing?.sessionCount ?? ""}
                style={inputStyle}
              />
            </div>
            <div style={fieldStyle}>
              <label htmlFor="curso-umbral" style={labelStyle}>
                Umbral de asistencia (%)
              </label>
              <input
                id="curso-umbral"
                name="completionAttendanceRatio"
                key={`umbral-${editing?.id ?? "nuevo"}`}
                type="number"
                min={0}
                max={100}
                step={1}
                defaultValue={Math.round(
                  (editing?.completionAttendanceRatio ?? DEFAULT_COMPLETION_ATTENDANCE_RATIO) * 100,
                )}
                style={inputStyle}
              />
              <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)", marginTop: 4 }}>
                Solo alimenta la sugerencia de finalización: quien da un curso por terminado es siempre el responsable.
              </p>
            </div>
          </div>

          <div style={{ ...fieldStyle, flex: "1 1 100%" }}>
            <label htmlFor="curso-descripcion" style={labelStyle}>
              Descripción
            </label>
            <textarea
              id="curso-descripcion"
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
              {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear curso"}
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
