"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { COHORT_STATUSES, COHORT_STATUS_INFO, COURSE_STATUS_INFO } from "@/lib/discipleship/constants";
import type { CohortItem, CourseItem } from "@/server/discipleship/discipleship-service";
import { crearCohorteAction, guardarCohorteAction, type CursoState } from "./actions";
import {
  CHIP_CLASS,
  cardStyle,
  fieldStyle,
  formatDate,
  formatRatio,
  inputStyle,
  labelStyle,
  primaryButtonStyle,
  sectionTitleStyle,
  selectStyle,
  subtleButtonStyle,
} from "../../ui";

export type CampusOption = { id: string; name: string };

export default function CursoFicha({
  course,
  cohorts,
  campuses,
  canCreateCohort,
  canManage,
}: {
  course: CourseItem;
  cohorts: CohortItem[];
  campuses: CampusOption[];
  canCreateCohort: boolean;
  canManage: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CohortItem | null>(null);

  const statusInfo = COURSE_STATUS_INFO[course.status];

  function run(action: () => Promise<CursoState>, onDone: () => void) {
    startTransition(async () => {
      const result = await action();
      setError(result.error);
      if (!result.error) onDone();
    });
  }

  return (
    <>
      <section
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
      >
        <div>
          <Link
            href="/app/discipulado/cursos"
            style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}
          >
            ← Cursos
          </Link>
          <h1 style={{ fontSize: 21, fontWeight: 600, marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
            {course.name}
            <span className={CHIP_CLASS[statusInfo.tone]}>{statusInfo.label}</span>
          </h1>
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 2 }}>
            {course.sessionCount ? `${course.sessionCount} sesiones previstas · ` : ""}
            Umbral de asistencia sugerido: {formatRatio(course.completionAttendanceRatio)}
          </p>
        </div>
        {canCreateCohort ? (
          <button type="button" style={primaryButtonStyle()} onClick={() => setCreating((value) => !value)}>
            <Plus size={14} /> Nueva cohorte
          </button>
        ) : null}
      </section>

      {course.description ? (
        <div className="shell-card" style={{ padding: 18 }}>
          <p style={{ fontSize: 13 }}>{course.description}</p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      ) : null}

      {creating ? (
        <CohorteForm
          campuses={campuses}
          title="Nueva cohorte"
          pending={pending}
          onCancel={() => setCreating(false)}
          onSubmit={(formData) => run(() => crearCohorteAction(course.id, formData), () => setCreating(false))}
        />
      ) : null}

      {editing ? (
        <CohorteForm
          campuses={campuses}
          cohort={editing}
          title={`Editar «${editing.name}»`}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSubmit={(formData) =>
            run(() => guardarCohorteAction(course.id, editing.id, formData), () => setEditing(null))
          }
        />
      ) : null}

      <div className="shell-card list-card">
        {cohorts.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "40px 24px" }}>
            <h3>Este curso todavía no tiene cohortes</h3>
            <p>Una cohorte es una edición concreta: sus fechas, su sede y la gente que la cursa.</p>
          </div>
        ) : (
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Cohorte</th>
                  <th>Estado</th>
                  <th>Sede</th>
                  <th>Fechas</th>
                  <th>Matriculadas</th>
                  <th>Plazas pedidas</th>
                  {canManage ? <th aria-label="Acciones" /> : null}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((cohort) => {
                  const info = COHORT_STATUS_INFO[cohort.status];
                  return (
                    <tr key={cohort.id} className={cohort.archivedAt ? "is-archived" : undefined}>
                      <td data-label="Cohorte" style={{ fontWeight: 600 }}>
                        <Link
                          href={`/app/discipulado/cohortes/${cohort.id}`}
                          style={{ color: "var(--shell-text)", textDecoration: "none" }}
                        >
                          {cohort.name}
                        </Link>
                      </td>
                      <td data-label="Estado">
                        <span className={CHIP_CLASS[info.tone]}>{info.label}</span>
                      </td>
                      <td data-label="Sede" className="serving-meta">
                        {cohort.campusName ?? "Toda la iglesia"}
                      </td>
                      <td data-label="Fechas" className="serving-meta">
                        {formatDate(cohort.startsOn)} – {formatDate(cohort.endsOn)}
                      </td>
                      <td data-label="Matriculadas">
                        {cohort.capacity === null
                          ? cohort.enrolledCount
                          : `${cohort.enrolledCount}/${cohort.capacity}`}
                      </td>
                      <td data-label="Plazas pedidas" className="serving-meta">
                        {cohort.allowsRequests ? cohort.requestedCount : "No admite"}
                      </td>
                      {canManage ? (
                        <td data-label="">
                          <button type="button" style={subtleButtonStyle} onClick={() => setEditing(cohort)}>
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
    </>
  );
}

function CohorteForm({
  campuses,
  cohort,
  title,
  pending,
  onCancel,
  onSubmit,
}: {
  campuses: CampusOption[];
  cohort?: CohortItem;
  title: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  return (
    <form className="shell-card" style={cardStyle} action={onSubmit} noValidate>
      <h2 style={sectionTitleStyle}>{title}</h2>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <div style={{ ...fieldStyle, flex: "1 1 260px" }}>
          <label htmlFor="cohorte-nombre" style={labelStyle}>
            Nombre
          </label>
          <input
            id="cohorte-nombre"
            name="name"
            defaultValue={cohort?.name ?? ""}
            required
            maxLength={120}
            style={inputStyle}
            placeholder="Otoño 2026"
          />
        </div>
        <div style={fieldStyle}>
          <label htmlFor="cohorte-estado" style={labelStyle}>
            Estado
          </label>
          <select id="cohorte-estado" name="status" defaultValue={cohort?.status ?? "planned"} style={selectStyle}>
            {COHORT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {COHORT_STATUS_INFO[status].label}
              </option>
            ))}
          </select>
        </div>
        <div style={fieldStyle}>
          <label htmlFor="cohorte-sede" style={labelStyle}>
            Sede
          </label>
          <select id="cohorte-sede" name="campusId" defaultValue={cohort?.campusId ?? ""} style={selectStyle}>
            <option value="">Toda la iglesia</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <div style={fieldStyle}>
          <label htmlFor="cohorte-inicio" style={labelStyle}>
            Empieza
          </label>
          <input id="cohorte-inicio" name="startsOn" type="date" defaultValue={cohort?.startsOn ?? ""} style={inputStyle} />
        </div>
        <div style={fieldStyle}>
          <label htmlFor="cohorte-fin" style={labelStyle}>
            Termina
          </label>
          <input id="cohorte-fin" name="endsOn" type="date" defaultValue={cohort?.endsOn ?? ""} style={inputStyle} />
        </div>
        <div style={fieldStyle}>
          <label htmlFor="cohorte-aforo" style={labelStyle}>
            Plazas
          </label>
          <input
            id="cohorte-aforo"
            name="capacity"
            type="number"
            min={1}
            step={1}
            defaultValue={cohort?.capacity ?? ""}
            style={inputStyle}
          />
        </div>
        <div style={{ ...fieldStyle, justifyContent: "flex-end" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
            <input type="checkbox" name="allowsRequests" defaultChecked={cohort?.allowsRequests ?? true} /> Admite que
            se pida plaza
          </label>
        </div>
      </div>

      <div style={{ ...fieldStyle, flex: "1 1 100%" }}>
        <label htmlFor="cohorte-notas" style={labelStyle}>
          Notas
        </label>
        <textarea
          id="cohorte-notas"
          name="notes"
          rows={2}
          maxLength={1000}
          defaultValue={cohort?.notes ?? ""}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
          {pending ? "Guardando…" : cohort ? "Guardar cambios" : "Crear cohorte"}
        </button>
        <button type="button" style={subtleButtonStyle} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
