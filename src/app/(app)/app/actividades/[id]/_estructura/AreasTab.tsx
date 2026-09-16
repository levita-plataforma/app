"use client";

import "./estructura.css";
import { useState } from "react";
import { AlertTriangle, ChevronRight, Info, Layers, Plus } from "lucide-react";
import {
  AREA_REQUIREMENTS,
  AREA_REQUIREMENT_LABELS,
  SERIES_EDIT_SCOPE_LABELS,
  STRUCTURE_ISSUE_LABELS,
  isActivityEditable,
  type AreaRequirement,
} from "@/lib/activities/constants";
import type { StructureIssue } from "@/server/activities/activities-service";
import type { ActivityArea } from "@/server/activities/activity-structure-service";
import { addAreaAction, applyStructureAction, removeAreaAction, updateAreaAction } from "./actions";
import { Chip, ConfirmButton, ErrorText, NoticeText, plural, useRunner } from "./shared";
import type { StructureTabsProps } from "./types";

const AREA_ISSUE_CODES = new Set([
  "catalog_area_unavailable",
  "area_campus_mismatch",
  "required_area_without_positions",
  "optional_area_without_positions",
]);

/** Describe una incidencia con el nombre del área o puesto afectado. */
function issueText(issue: StructureIssue, areas: ActivityArea[]): string {
  const label = STRUCTURE_ISSUE_LABELS[issue.code] ?? issue.code;
  if (issue.activityPositionId) {
    for (const area of areas) {
      const position = area.positions.find((p) => p.id === issue.activityPositionId);
      if (position) return `${label}: ${position.name} (${area.areaName})`;
    }
  }
  if (issue.activityServiceAreaId) {
    const area = areas.find((a) => a.id === issue.activityServiceAreaId);
    if (area) return `${label}: ${area.areaName}`;
  }
  return label;
}

export function IssuesSummary({ issues, areas }: { issues: StructureIssue[]; areas: ActivityArea[] }) {
  if (issues.length === 0) return null;
  const blocking = issues.filter((i) => i.severity === "blocking");
  const warnings = issues.filter((i) => i.severity !== "blocking");

  return (
    <section
      className={`est-issues${blocking.length > 0 ? " is-blocking" : ""}`}
      aria-label="Incidencias de la estructura"
    >
      {blocking.length > 0 ? (
        <>
          <h3>
            <AlertTriangle size={15} aria-hidden />
            {plural(blocking.length, "incidencia bloquea", "incidencias bloquean")} la publicación
          </h3>
          <ul>
            {blocking.map((issue, i) => (
              <li key={`b-${i}`}>{issueText(issue, areas)}</li>
            ))}
          </ul>
        </>
      ) : null}
      {warnings.length > 0 ? (
        <>
          <h3 className="est-muted">
            <Info size={15} aria-hidden />
            {plural(warnings.length, "aviso", "avisos")}
          </h3>
          <ul>
            {warnings.map((issue, i) => (
              <li key={`w-${i}`} className="is-warning">
                {issueText(issue, areas)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

export function AreasTab({ activity, capabilities, data }: StructureTabsProps) {
  const { areas } = data.structure;
  const editable = isActivityEditable(activity.status);
  const canManage = capabilities.manage && editable && capabilities.servingEnabled;

  return (
    <div className="est-stack">
      <IssuesSummary issues={data.issues} areas={areas} />

      {!capabilities.servingEnabled ? (
        <div className="shell-card est-card">
          <p className="est-muted">
            Las áreas y puestos de servicio requieren el módulo <strong>Servicios</strong>. Pide a quien administra la
            iglesia que lo habilite para preparar la estructura de esta actividad.
          </p>
        </div>
      ) : null}

      {capabilities.manage && !editable ? (
        <p className="est-muted">La actividad está cerrada: su estructura ya no se puede modificar.</p>
      ) : null}

      <section className="shell-card est-card" aria-labelledby="est-areas-title">
        <div className="est-section-head">
          <h2 id="est-areas-title">Áreas de servicio</h2>
          <span className="est-muted">{plural(areas.length, "área", "áreas")}</span>
        </div>

        {areas.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "20px 12px" }}>
            <Layers size={22} aria-hidden />
            <h3>Sin áreas de servicio</h3>
            <p>
              {canManage
                ? "Añade las áreas del catálogo que participan en esta actividad."
                : "Esta actividad todavía no tiene áreas de servicio definidas."}
            </p>
          </div>
        ) : (
          <ul className="est-list">
            {areas.map((area) => (
              <AreaRow
                key={area.id}
                area={area}
                issues={data.issues.filter(
                  (i) => i.activityServiceAreaId === area.id && !i.activityPositionId && AREA_ISSUE_CODES.has(i.code),
                )}
                canManage={canManage}
              />
            ))}
          </ul>
        )}

        {canManage ? <AddAreaForm activityId={activity.id} data={data} /> : null}
      </section>

      {activity.seriesId && capabilities.manage && editable ? <ApplyToSeries activityId={activity.id} /> : null}
    </div>
  );
}

function AreaRow({ area, issues, canManage }: { area: ActivityArea; issues: StructureIssue[]; canManage: boolean }) {
  const [editing, setEditing] = useState(false);
  const [requirement, setRequirement] = useState<AreaRequirement>(area.requirement);
  const [notes, setNotes] = useState(area.notes ?? "");
  const runner = useRunner();
  const formId = `est-area-${area.id}`;

  return (
    <li className="est-item">
      <div className="est-item-head">
        <div className="est-stack" style={{ gap: 6, minWidth: 0 }}>
          <div className="est-item-title">
            {area.areaName}
            <Chip tone={area.requirement === "required" ? "default" : "muted"}>
              {AREA_REQUIREMENT_LABELS[area.requirement]}
            </Chip>
          </div>
          <div className="est-chips">
            <span className="est-muted">{plural(area.positions.length, "puesto", "puestos")}</span>
            {issues.map((issue) => (
              <Chip key={issue.code} tone={issue.severity === "blocking" ? "danger" : "warning"}>
                <AlertTriangle size={12} aria-hidden />
                {STRUCTURE_ISSUE_LABELS[issue.code] ?? issue.code}
              </Chip>
            ))}
          </div>
          {area.notes && !editing ? <p className="est-muted">{area.notes}</p> : null}
        </div>

        {canManage && !editing ? (
          <div className="est-actions">
            <button type="button" className="est-btn-link" onClick={() => setEditing(true)} disabled={runner.pending}>
              Editar
            </button>
            <ConfirmButton
              label="Retirar"
              disabled={runner.pending}
              message={
                area.positions.length > 0
                  ? `Se retirará «${area.areaName}» y sus ${plural(area.positions.length, "puesto", "puestos")} de esta actividad. El catálogo no cambia.`
                  : `Se retirará «${area.areaName}» de esta actividad. El catálogo no cambia.`
              }
              confirmLabel="Retirar área"
              onConfirm={() => runner.run(() => removeAreaAction(area.id))}
            />
          </div>
        ) : null}
      </div>

      {editing ? (
        <form
          className="est-form"
          onSubmit={(e) => {
            e.preventDefault();
            runner.run(
              () => updateAreaAction(area.id, { requirement, notes: notes.trim() || null }),
              () => setEditing(false),
            );
          }}
        >
          <div className="est-form-grid">
            <div className="est-field">
              <label htmlFor={`${formId}-req`}>Participación</label>
              <select
                id={`${formId}-req`}
                value={requirement}
                onChange={(e) => setRequirement(e.target.value as AreaRequirement)}
              >
                {AREA_REQUIREMENTS.map((value) => (
                  <option key={value} value={value}>
                    {AREA_REQUIREMENT_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="est-field is-wide">
              <label htmlFor={`${formId}-notes`}>Notas</label>
              <textarea
                id={`${formId}-notes`}
                value={notes}
                maxLength={1000}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <ErrorText message={runner.error} />
          <div className="est-actions">
            <button type="submit" className="est-btn is-primary" disabled={runner.pending}>
              {runner.pending ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              className="est-btn"
              onClick={() => {
                setEditing(false);
                setRequirement(area.requirement);
                setNotes(area.notes ?? "");
                runner.setError(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <ErrorText message={runner.error} />
      )}
    </li>
  );
}

function AddAreaForm({ activityId, data }: { activityId: string; data: StructureTabsProps["data"] }) {
  const [open, setOpen] = useState(false);
  const [serviceAreaId, setServiceAreaId] = useState("");
  const [requirement, setRequirement] = useState<AreaRequirement>("required");
  const [notes, setNotes] = useState("");
  const [includePositions, setIncludePositions] = useState(true);
  const runner = useRunner();

  const used = new Set(data.structure.areas.map((a) => a.serviceAreaId).filter(Boolean));
  const options = data.catalog.areas.filter((a) => !used.has(a.id));

  if (!open) {
    return (
      <div className="est-stack" style={{ gap: 6 }}>
        <NoticeText message={runner.notice} />
        <div>
          <button type="button" className="est-btn" onClick={() => setOpen(true)}>
            <Plus size={15} aria-hidden />
            Añadir área
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="est-form"
      aria-label="Añadir área de servicio"
      onSubmit={(e) => {
        e.preventDefault();
        if (!serviceAreaId) {
          runner.setError("Elige un área del catálogo.");
          return;
        }
        const areaName = options.find((a) => a.id === serviceAreaId)?.name ?? "Área";
        runner.run(
          () => addAreaAction(activityId, { serviceAreaId, requirement, notes: notes.trim() || null, includePositions }),
          (result) => {
            const parts = [`«${areaName}» añadida.`];
            if (includePositions) {
              parts.push(`${plural(result.positionsAdded, "puesto añadido", "puestos añadidos")}.`);
              if (result.positionsSkipped > 0) {
                parts.push(
                  `${plural(result.positionsSkipped, "puesto omitido", "puestos omitidos")} por ser de otra sede.`,
                );
              }
            }
            runner.setNotice(parts.join(" "));
            setServiceAreaId("");
            setNotes("");
            setRequirement("required");
            setIncludePositions(true);
            setOpen(false);
          },
        );
      }}
    >
      <h3 style={{ fontSize: 13.5, fontWeight: 600 }}>Añadir área</h3>
      {options.length === 0 ? (
        <p className="est-muted">
          {data.catalog.areas.length === 0
            ? "No hay áreas activas del catálogo compatibles con la sede de esta actividad."
            : "Todas las áreas compatibles del catálogo ya están en esta actividad."}
        </p>
      ) : (
        <div className="est-form-grid">
          <div className="est-field">
            <label htmlFor="est-add-area">Área del catálogo</label>
            <select id="est-add-area" value={serviceAreaId} onChange={(e) => setServiceAreaId(e.target.value)} required>
              <option value="">Selecciona…</option>
              {options.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="est-field">
            <label htmlFor="est-add-area-req">Participación</label>
            <select
              id="est-add-area-req"
              value={requirement}
              onChange={(e) => setRequirement(e.target.value as AreaRequirement)}
            >
              {AREA_REQUIREMENTS.map((value) => (
                <option key={value} value={value}>
                  {AREA_REQUIREMENT_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="est-field is-wide">
            <label htmlFor="est-add-area-notes">Notas (opcional)</label>
            <textarea id="est-add-area-notes" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="est-field is-wide">
            <label className="est-check">
              <input
                type="checkbox"
                checked={includePositions}
                onChange={(e) => setIncludePositions(e.target.checked)}
              />
              Añadir sus puestos activos
            </label>
            <span className="est-help">
              Se copian con sus mínimos, máximos y requisitos; los puestos de otra sede se omiten.
            </span>
          </div>
        </div>
      )}
      <ErrorText message={runner.error} />
      <div className="est-actions">
        {options.length > 0 ? (
          <button type="submit" className="est-btn is-primary" disabled={runner.pending}>
            {runner.pending ? "Añadiendo…" : "Añadir área"}
          </button>
        ) : null}
        <button
          type="button"
          className="est-btn"
          onClick={() => {
            setOpen(false);
            runner.setError(null);
          }}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ApplyToSeries({ activityId }: { activityId: string }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"future" | "all">("future");
  const runner = useRunner();

  return (
    <section className="shell-card est-card" aria-labelledby="est-apply-title">
      <h2 id="est-apply-title" style={{ fontSize: 15, fontWeight: 600 }}>
        <button
          type="button"
          className="est-toggle"
          aria-expanded={open}
          aria-controls="est-apply-body"
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronRight size={16} className="est-chevron" aria-hidden />
          Aplicar esta estructura a…
        </button>
      </h2>

      {open ? (
        <div id="est-apply-body" className="est-stack" style={{ gap: 10 }}>
          <p className="est-muted">
            Copia las áreas, puestos, requisitos y el orden del servicio de esta ocurrencia a otras ocurrencias de la
            serie.
          </p>
          <fieldset className="est-fieldset">
            <legend>Ocurrencias</legend>
            <label className="est-radio">
              <input
                type="radio"
                name="est-apply-scope"
                value="future"
                checked={scope === "future"}
                onChange={() => setScope("future")}
              />
              Siguientes ocurrencias
            </label>
            <label className="est-radio">
              <input
                type="radio"
                name="est-apply-scope"
                value="all"
                checked={scope === "all"}
                onChange={() => setScope("all")}
              />
              {SERIES_EDIT_SCOPE_LABELS.all}
            </label>
          </fieldset>
          <div>
            <ConfirmButton
              label="Aplicar estructura…"
              triggerClassName="est-btn"
              danger={false}
              disabled={runner.pending}
              confirmLabel={runner.pending ? "Aplicando…" : "Sí, reemplazar"}
              message={
                <>
                  Se reemplazarán las áreas, puestos, requisitos y el orden del servicio de{" "}
                  {scope === "future" ? "las siguientes ocurrencias" : "todas las ocurrencias de la serie"}. No se tocan
                  las ocurrencias modificadas individualmente (excepciones) ni las pasadas o cerradas.
                </>
              }
              onConfirm={() =>
                runner.run(
                  () => applyStructureAction(activityId, scope),
                  (result) =>
                    runner.setNotice(
                      result.count === 0
                        ? "No había ocurrencias a las que aplicar la estructura."
                        : `Estructura aplicada a ${plural(result.count, "ocurrencia", "ocurrencias")}.`,
                    ),
                )
              }
            />
          </div>
          <ErrorText message={runner.error} />
          <NoticeText message={runner.notice} />
        </div>
      ) : null}
    </section>
  );
}
