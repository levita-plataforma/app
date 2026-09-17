"use client";

import "./estructura.css";
import { useState } from "react";
import { AlertTriangle, ChevronRight, Plus, UsersRound } from "lucide-react";
import { COVERAGE_INFO, STRUCTURE_ISSUE_LABELS, isActivityEditable } from "@/lib/activities/constants";
import {
  OPERATIONAL_LEVEL_LABELS,
  QUALIFICATION_LEVEL_LABELS,
  REQUIREMENT_TYPE_LABELS,
  STRICTNESS_LABELS,
} from "@/app/(app)/app/servicios/labels";
import type { StructureIssue } from "@/server/activities/activities-service";
import type {
  ActivityArea,
  ActivityPosition,
  ActivityPositionRequirement,
} from "@/server/activities/activity-structure-service";
import {
  addPositionAction,
  removePositionAction,
  removeRequirementAction,
  saveRequirementAction,
  updatePositionAction,
} from "./actions";
import type { CatalogPositionOption, NamedOption } from "./load";
import { IssuesUnavailable } from "./AreasTab";
import { Chip, ConfirmButton, ErrorText, NoticeText, parseIntInput, plural, useRunner } from "./shared";
import type { StructureTabsProps } from "./types";

type RequirementType = ActivityPositionRequirement["requirementType"];
type Strictness = ActivityPositionRequirement["strictness"];
type MinLevel = NonNullable<ActivityPositionRequirement["minLevel"]>;
type OperationalLevel = NonNullable<ActivityPositionRequirement["minOperationalLevel"]>;

const REQUIREMENT_TYPES = Object.keys(REQUIREMENT_TYPE_LABELS) as RequirementType[];
const STRICTNESS_VALUES = Object.keys(STRICTNESS_LABELS) as Strictness[];
const MIN_LEVELS = Object.keys(QUALIFICATION_LEVEL_LABELS) as MinLevel[];
const OPERATIONAL_LEVELS = Object.keys(OPERATIONAL_LEVEL_LABELS) as OperationalLevel[];

type Catalog = StructureTabsProps["data"]["catalog"];

export function PuestosTab({ activity, capabilities, capabilitiesError, data }: StructureTabsProps) {
  const { areas, summary } = data.structure;
  const editable = isActivityEditable(activity.status);

  return (
    <div className="est-stack">
      {data.issuesError ? <IssuesUnavailable /> : null}

      {!capabilities.servingEnabled && !capabilitiesError ? (
        <div className="shell-card est-card">
          <p className="est-muted">
            Los puestos de servicio requieren el módulo <strong>Servicios</strong>. Mientras no esté habilitado, la
            estructura existente se muestra solo en lectura.
          </p>
        </div>
      ) : null}

      {areas.length === 0 ? (
        <div className="shell-card shell-empty-state">
          <UsersRound size={22} aria-hidden />
          <h3>Sin puestos</h3>
          <p>Los puestos se organizan por área. Añade primero un área de servicio en la pestaña Áreas.</p>
        </div>
      ) : (
        <>
          <p className="est-plan-summary">
            <span>
              <strong>{summary.positions}</strong> {summary.positions === 1 ? "puesto" : "puestos"}
            </span>
            <span>
              <strong>{summary.criticalPositions}</strong> {summary.criticalPositions === 1 ? "crítico" : "críticos"}
            </span>
            <span>
              Mínimo total: <strong>{summary.minPeopleTotal}</strong>{" "}
              {summary.minPeopleTotal === 1 ? "persona" : "personas"}
            </span>
            {summary.coverageUnavailable ? (
              <span role="status">Cobertura de personas no disponible ahora mismo</span>
            ) : (
              <>
                <span>
                  Confirmadas: <strong>{summary.assignedPeople}</strong>
                </span>
                {summary.pendingPeople !== null ? (
                  <span>
                    Pendientes: <strong>{summary.pendingPeople}</strong>
                  </span>
                ) : null}
                {summary.proposedPeople !== null ? (
                  <span>
                    Borradores: <strong>{summary.proposedPeople}</strong>
                  </span>
                ) : null}
                <span>
                  Sin cubrir: <strong>{summary.uncoveredPositions}</strong>{" "}
                  {summary.uncoveredPositions === 1 ? "puesto" : "puestos"}
                </span>
              </>
            )}
          </p>
          {areas.map((area) => (
            <AreaPositions
              key={area.id}
              area={area}
              catalog={data.catalog}
              issues={data.issues}
              canManage={
                Boolean(capabilities.managePositionsByArea[area.id]) && editable && capabilities.servingEnabled
              }
            />
          ))}
        </>
      )}
    </div>
  );
}

function AreaPositions({
  area,
  catalog,
  issues,
  canManage,
}: {
  area: ActivityArea;
  catalog: Catalog;
  issues: StructureIssue[];
  canManage: boolean;
}) {
  const used = new Set(area.positions.map((p) => p.servicePositionId).filter(Boolean));
  const catalogOptions = area.serviceAreaId
    ? catalog.positions.filter((p) => p.serviceAreaId === area.serviceAreaId && !used.has(p.id))
    : [];

  return (
    <section className="shell-card est-card est-area-group" aria-labelledby={`est-pos-area-${area.id}`}>
      <div className="est-section-head">
        <h2 id={`est-pos-area-${area.id}`}>{area.areaName}</h2>
        <span className="est-muted">{plural(area.positions.length, "puesto", "puestos")}</span>
      </div>

      {area.positions.length === 0 ? (
        <p className="est-muted">Esta área no tiene puestos en la actividad.</p>
      ) : (
        <ul className="est-list">
          {area.positions.map((position) => (
            <PositionRow
              key={position.id}
              position={position}
              issues={issues.filter((i) => i.activityPositionId === position.id)}
              canManage={canManage}
              catalog={catalog}
            />
          ))}
        </ul>
      )}

      {canManage ? <AddPositionForm areaId={area.id} catalogOptions={catalogOptions} /> : null}
    </section>
  );
}

function snapshotNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function PositionRow({
  position,
  issues,
  canManage,
  catalog,
}: {
  position: ActivityPosition;
  issues: StructureIssue[];
  canManage: boolean;
  catalog: Catalog;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const runner = useRunner();
  const coverage = COVERAGE_INFO[position.coverage];
  const detailsId = `est-pos-${position.id}`;

  const snapshot = position.catalogSnapshot;
  const snapMin = snapshot ? snapshotNumber(snapshot.min_people) : null;
  const snapMax = snapshot ? snapshotNumber(snapshot.max_people) : null;
  const adjusted =
    snapshot !== null &&
    (snapMin !== position.minPeople ||
      snapMax !== position.maxPeople ||
      (snapshot.critical !== undefined && Boolean(snapshot.critical) !== position.critical) ||
      (snapshot.requires_autonomous_person !== undefined &&
        Boolean(snapshot.requires_autonomous_person) !== position.requiresAutonomousPerson));

  return (
    <li className="est-item">
      <div className="est-item-head">
        <button
          type="button"
          className="est-toggle"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((v) => !v)}
          style={{ flex: "1 1 240px", width: "auto" }}
        >
          <ChevronRight size={16} className="est-chevron" aria-hidden />
          <span className="est-stack" style={{ gap: 4, minWidth: 0 }}>
            <span className="est-item-title">{position.name}</span>
            <span className="est-muted">
              mín {position.minPeople} · {position.maxPeople === null ? "sin máximo" : `máx ${position.maxPeople}`}
              {position.requirements.length > 0
                ? ` · ${plural(position.requirements.length, "requisito", "requisitos")}`
                : ""}
            </span>
          </span>
        </button>
        <div className="est-chips">
          <Chip tone="muted">{position.isAdHoc ? "Ad-hoc" : "Catálogo"}</Chip>
          {position.critical ? <Chip tone="danger">Crítico</Chip> : null}
          {position.coverageUnavailable ? (
            <Chip tone="muted" title="No se pudo calcular la cobertura de personas.">
              Cobertura no disponible
            </Chip>
          ) : (
            <>
              <Chip tone={coverage.tone} title="La cobertura cuenta solo las personas confirmadas.">
                {coverage.label} · {position.assignedCount}{" "}
                {position.assignedCount === 1 ? "confirmada" : "confirmadas"}
              </Chip>
              {position.pendingCount !== null && position.pendingCount > 0 ? (
                <Chip tone="warning">
                  {position.pendingCount} {position.pendingCount === 1 ? "pendiente" : "pendientes"}
                </Chip>
              ) : null}
              {position.proposedCount !== null && position.proposedCount > 0 ? (
                <Chip tone="muted">
                  {position.proposedCount} {position.proposedCount === 1 ? "borrador" : "borradores"}
                </Chip>
              ) : null}
            </>
          )}
          {issues.map((issue) => (
            <Chip key={issue.code} tone={issue.severity === "blocking" ? "danger" : "warning"}>
              <AlertTriangle size={12} aria-hidden />
              {STRUCTURE_ISSUE_LABELS[issue.code] ?? issue.code}
            </Chip>
          ))}
        </div>
      </div>

      {expanded ? (
        <div id={detailsId} className="est-details">
          {editing ? (
            <PositionForm
              mode="edit"
              position={position}
              onDone={() => setEditing(false)}
              submit={(input) => updatePositionAction(position.id, input)}
            />
          ) : (
            <>
              <dl className="est-dl">
                <div>
                  <dt>Personas</dt>
                  <dd>
                    mín {position.minPeople} · {position.maxPeople === null ? "sin máximo" : `máx ${position.maxPeople}`}
                  </dd>
                </div>
                <div>
                  <dt>Persona autónoma</dt>
                  <dd>{position.requiresAutonomousPerson ? "Requiere al menos una" : "No requerida"}</dd>
                </div>
                <div>
                  <dt>Equipo</dt>
                  <dd>
                    {position.coverageUnavailable
                      ? "No disponible ahora mismo"
                      : [
                          `${position.assignedCount} ${position.assignedCount === 1 ? "confirmada" : "confirmadas"}`,
                          position.pendingCount !== null
                            ? `${position.pendingCount} ${position.pendingCount === 1 ? "pendiente" : "pendientes"}`
                            : null,
                          position.proposedCount !== null
                            ? `${position.proposedCount} ${position.proposedCount === 1 ? "borrador" : "borradores"}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                  </dd>
                </div>
                {position.notes ? (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <dt>Notas</dt>
                    <dd>{position.notes}</dd>
                  </div>
                ) : null}
              </dl>
              {adjusted ? (
                <p className="est-muted">
                  Ajustado para esta actividad (catálogo: mín {snapMin ?? "—"}, máx{" "}
                  {snapMax === null ? "sin máximo" : snapMax})
                </p>
              ) : null}
              {canManage ? (
                <div className="est-actions">
                  <button type="button" className="est-btn-link" onClick={() => setEditing(true)}>
                    Editar puesto
                  </button>
                  <ConfirmButton
                    label="Retirar puesto"
                    confirmLabel="Retirar"
                    disabled={runner.pending}
                    message={`Se retirará «${position.name}» y sus requisitos de esta actividad. El catálogo no cambia.`}
                    onConfirm={() => runner.run(() => removePositionAction(position.id))}
                  />
                </div>
              ) : null}
              <ErrorText message={runner.error} />
            </>
          )}

          <div className="est-stack" style={{ gap: 8 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600 }}>Requisitos</h3>
            {position.requirements.length === 0 ? (
              <p className="est-muted">Sin requisitos: cualquier persona del área podría servir en este puesto.</p>
            ) : (
              <ul className="est-req-list">
                {position.requirements.map((r) => (
                  <RequirementRow key={r.id} positionId={position.id} requirement={r} canManage={canManage} />
                ))}
              </ul>
            )}
            {canManage ? <AddRequirementForm positionId={position.id} catalog={catalog} /> : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Formularios de puesto
// ---------------------------------------------------------------------------

type PositionSubmitInput = Parameters<typeof updatePositionAction>[1];

function PositionForm({
  mode,
  position,
  catalogOptions = [],
  submit,
  onDone,
}: {
  mode: "add" | "edit";
  position?: ActivityPosition;
  catalogOptions?: CatalogPositionOption[];
  submit: (input: PositionSubmitInput) => Promise<{ error: string | null }>;
  onDone: () => void;
}) {
  const [source, setSource] = useState<"catalog" | "adhoc">(
    mode === "add" && catalogOptions.length > 0 ? "catalog" : "adhoc",
  );
  const [servicePositionId, setServicePositionId] = useState("");
  const [name, setName] = useState(position?.name ?? "");
  const [minPeople, setMinPeople] = useState(String(position?.minPeople ?? 1));
  const [maxPeople, setMaxPeople] = useState(position?.maxPeople === null || !position ? "" : String(position.maxPeople));
  const [critical, setCritical] = useState(position?.critical ?? false);
  const [requiresAutonomous, setRequiresAutonomous] = useState(position?.requiresAutonomousPerson ?? false);
  const [notes, setNotes] = useState(position?.notes ?? "");
  const runner = useRunner();
  const prefix = `est-pf-${position?.id ?? "new"}-${mode}`;

  function selectCatalog(id: string) {
    setServicePositionId(id);
    const option = catalogOptions.find((o) => o.id === id);
    if (option) {
      setMinPeople(String(option.minPeople));
      setMaxPeople(option.maxPeople === null ? "" : String(option.maxPeople));
      setCritical(option.critical);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const min = parseIntInput(minPeople);
    const max = parseIntInput(maxPeople);
    if (min === null || min === undefined || min < 0) {
      runner.setError("El mínimo de personas debe ser un número entero mayor o igual que 0.");
      return;
    }
    if (max === undefined || (max !== null && max < min)) {
      runner.setError("El máximo debe ser un número entero mayor o igual que el mínimo, o quedar vacío (sin máximo).");
      return;
    }
    const input: PositionSubmitInput = {
      minPeople: min,
      maxPeople: max,
      critical,
      requiresAutonomousPerson: requiresAutonomous,
      notes: notes.trim() || null,
    };
    if (mode === "add" && source === "catalog") {
      if (!servicePositionId) {
        runner.setError("Elige un puesto del catálogo.");
        return;
      }
      input.servicePositionId = servicePositionId;
    } else {
      if (!name.trim()) {
        runner.setError("Indica el nombre del puesto.");
        return;
      }
      input.name = name.trim();
    }
    runner.run(() => submit(input), onDone);
  }

  return (
    <form className="est-form" onSubmit={onSubmit} aria-label={mode === "add" ? "Añadir puesto" : "Editar puesto"}>
      {mode === "add" ? (
        <fieldset className="est-fieldset">
          <legend>Origen</legend>
          <label className="est-radio">
            <input
              type="radio"
              name={`${prefix}-source`}
              checked={source === "catalog"}
              disabled={catalogOptions.length === 0}
              onChange={() => setSource("catalog")}
            />
            Del catálogo
          </label>
          <label className="est-radio">
            <input
              type="radio"
              name={`${prefix}-source`}
              checked={source === "adhoc"}
              onChange={() => setSource("adhoc")}
            />
            Ad-hoc (solo esta actividad)
          </label>
        </fieldset>
      ) : null}

      <div className="est-form-grid">
        {mode === "add" && source === "catalog" ? (
          <div className="est-field is-wide">
            <label htmlFor={`${prefix}-catalog`}>Puesto del catálogo</label>
            <select
              id={`${prefix}-catalog`}
              value={servicePositionId}
              onChange={(e) => selectCatalog(e.target.value)}
              required
            >
              <option value="">Selecciona…</option>
              {catalogOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <span className="est-help">Se copian sus requisitos del catálogo; puedes ajustar los valores aquí.</span>
          </div>
        ) : (
          <div className="est-field is-wide">
            <label htmlFor={`${prefix}-name`}>Nombre del puesto</label>
            <input
              id={`${prefix}-name`}
              type="text"
              value={name}
              maxLength={120}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}
        <div className="est-field">
          <label htmlFor={`${prefix}-min`}>Mínimo de personas</label>
          <input
            id={`${prefix}-min`}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={minPeople}
            required
            onChange={(e) => setMinPeople(e.target.value)}
          />
        </div>
        <div className="est-field">
          <label htmlFor={`${prefix}-max`}>Máximo de personas</label>
          <input
            id={`${prefix}-max`}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={maxPeople}
            aria-describedby={`${prefix}-max-help`}
            onChange={(e) => setMaxPeople(e.target.value)}
          />
          <span id={`${prefix}-max-help`} className="est-help">
            Vacío = sin máximo.
          </span>
        </div>
        <div className="est-field is-wide">
          <label className="est-check">
            <input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} />
            Puesto crítico
          </label>
          <label className="est-check">
            <input
              type="checkbox"
              checked={requiresAutonomous}
              onChange={(e) => setRequiresAutonomous(e.target.checked)}
            />
            Requiere al menos una persona autónoma
          </label>
        </div>
        <div className="est-field is-wide">
          <label htmlFor={`${prefix}-notes`}>Notas (opcional)</label>
          <textarea id={`${prefix}-notes`} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <ErrorText message={runner.error} />
      <div className="est-actions">
        <button type="submit" className="est-btn is-primary" disabled={runner.pending}>
          {runner.pending ? "Guardando…" : mode === "add" ? "Añadir puesto" : "Guardar"}
        </button>
        <button type="button" className="est-btn" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function AddPositionForm({ areaId, catalogOptions }: { areaId: string; catalogOptions: CatalogPositionOption[] }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="est-stack" style={{ gap: 6 }}>
        <NoticeText message={notice} />
        <div>
          <button
            type="button"
            className="est-btn"
            onClick={() => {
              setNotice(null);
              setOpen(true);
            }}
          >
            <Plus size={15} aria-hidden />
            Añadir puesto
          </button>
        </div>
      </div>
    );
  }

  return (
    <PositionForm
      mode="add"
      catalogOptions={catalogOptions}
      submit={async (input) => {
        const result = await addPositionAction(areaId, input);
        if (!result.error) setNotice("Puesto añadido.");
        return result;
      }}
      onDone={() => setOpen(false)}
    />
  );
}

// ---------------------------------------------------------------------------
// Requisitos
// ---------------------------------------------------------------------------

function requirementTarget(r: ActivityPositionRequirement): string {
  if (r.requirementType === "minimum_level") {
    return r.minOperationalLevel ? OPERATIONAL_LEVEL_LABELS[r.minOperationalLevel] : "—";
  }
  const name = r.targetName ?? "Elemento no disponible";
  if (r.requirementType === "qualification" && r.minLevel) return `${name} · ${QUALIFICATION_LEVEL_LABELS[r.minLevel]}`;
  return name;
}

function RequirementRow({
  positionId,
  requirement: r,
  canManage,
}: {
  positionId: string;
  requirement: ActivityPositionRequirement;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const runner = useRunner();

  return (
    <li className={`est-req${r.disabled ? " is-disabled" : ""}`}>
      <div className="est-req-row">
        <span className="est-req-text">
          <strong>{REQUIREMENT_TYPE_LABELS[r.requirementType]}:</strong> {requirementTarget(r)}
        </span>
        <span className="est-chips">
          <Chip tone={r.strictness === "required" ? "danger" : "warning"}>{STRICTNESS_LABELS[r.strictness]}</Chip>
          <Chip tone="muted">{r.origin === "inherited" ? "Heredado" : "Añadido"}</Chip>
          {r.overridden ? <Chip tone="warning">Modificado</Chip> : null}
          {r.disabled ? <Chip tone="muted">Desactivado</Chip> : null}
          {r.requirementType !== "minimum_level" && r.requiresCurrentValidity ? (
            <Chip tone="default">Exige vigencia</Chip>
          ) : null}
        </span>
      </div>

      {canManage && !editing ? (
        <div className="est-actions">
          <button type="button" className="est-btn-link" onClick={() => setEditing(true)} disabled={runner.pending}>
            Ajustar
          </button>
          {r.origin === "inherited" ? (
            <button
              type="button"
              className="est-btn-link"
              disabled={runner.pending}
              onClick={() => runner.run(() => saveRequirementAction(positionId, r.id, { disabled: !r.disabled }))}
            >
              {r.disabled ? "Reactivar" : "Desactivar en esta actividad"}
            </button>
          ) : (
            <ConfirmButton
              label="Quitar"
              confirmLabel="Quitar requisito"
              disabled={runner.pending}
              message="Se quitará este requisito añadido del puesto."
              onConfirm={() => runner.run(() => removeRequirementAction(r.id))}
            />
          )}
        </div>
      ) : null}

      {editing ? (
        <RequirementOverrideForm positionId={positionId} requirement={r} onDone={() => setEditing(false)} />
      ) : null}
      <ErrorText message={runner.error} />
    </li>
  );
}

function RequirementOverrideForm({
  positionId,
  requirement: r,
  onDone,
}: {
  positionId: string;
  requirement: ActivityPositionRequirement;
  onDone: () => void;
}) {
  const [strictness, setStrictness] = useState<Strictness>(r.strictness);
  const [minLevel, setMinLevel] = useState<string>(r.minLevel ?? "");
  const [minOperationalLevel, setMinOperationalLevel] = useState<string>(r.minOperationalLevel ?? "");
  const [requiresValidity, setRequiresValidity] = useState(r.requiresCurrentValidity);
  const runner = useRunner();
  const prefix = `est-ro-${r.id}`;

  return (
    <form
      className="est-form"
      aria-label="Ajustar requisito"
      onSubmit={(e) => {
        e.preventDefault();
        if (r.requirementType === "minimum_level" && !minOperationalLevel) {
          runner.setError("Elige el nivel operativo mínimo.");
          return;
        }
        runner.run(
          () =>
            saveRequirementAction(positionId, r.id, {
              strictness,
              ...(r.requirementType === "qualification" ? { minLevel: (minLevel || null) as MinLevel | null } : {}),
              ...(r.requirementType === "minimum_level"
                ? { minOperationalLevel: minOperationalLevel as OperationalLevel }
                : {}),
              ...(r.requirementType !== "minimum_level" ? { requiresCurrentValidity: requiresValidity } : {}),
            }),
          onDone,
        );
      }}
    >
      <div className="est-form-grid">
        <StrictnessSelect id={`${prefix}-strict`} value={strictness} onChange={setStrictness} />
        {r.requirementType === "qualification" ? (
          <MinLevelSelect id={`${prefix}-level`} value={minLevel} onChange={setMinLevel} />
        ) : null}
        {r.requirementType === "minimum_level" ? (
          <OperationalLevelSelect id={`${prefix}-op`} value={minOperationalLevel} onChange={setMinOperationalLevel} />
        ) : null}
        {r.requirementType !== "minimum_level" ? (
          <div className="est-field">
            <label className="est-check">
              <input type="checkbox" checked={requiresValidity} onChange={(e) => setRequiresValidity(e.target.checked)} />
              Exige vigencia
            </label>
          </div>
        ) : null}
      </div>
      <ErrorText message={runner.error} />
      <div className="est-actions">
        <button type="submit" className="est-btn is-primary" disabled={runner.pending}>
          {runner.pending ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" className="est-btn" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function AddRequirementForm({ positionId, catalog }: { positionId: string; catalog: Catalog }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<RequirementType>("qualification");
  const [targetId, setTargetId] = useState("");
  const [strictness, setStrictness] = useState<Strictness>("required");
  const [minLevel, setMinLevel] = useState("");
  const [minOperationalLevel, setMinOperationalLevel] = useState<string>("autonomous");
  const [requiresValidity, setRequiresValidity] = useState(true);
  const runner = useRunner();
  const prefix = `est-ra-${positionId}`;

  if (!open) {
    return (
      <div>
        <button type="button" className="est-btn-link" onClick={() => setOpen(true)}>
          <Plus size={14} aria-hidden />
          Añadir requisito
        </button>
      </div>
    );
  }

  const targets: NamedOption[] = type === "qualification" ? catalog.qualifications : catalog.credentialTypes;

  return (
    <form
      className="est-form"
      aria-label="Añadir requisito"
      onSubmit={(e) => {
        e.preventDefault();
        if (type !== "minimum_level" && !targetId) {
          runner.setError(type === "qualification" ? "Elige una cualificación." : "Elige un tipo de credencial.");
          return;
        }
        runner.run(
          () =>
            saveRequirementAction(positionId, null, {
              requirementType: type,
              strictness,
              qualificationId: type === "qualification" ? targetId : null,
              credentialTypeId: type === "credential" ? targetId : null,
              minLevel: type === "qualification" ? ((minLevel || null) as MinLevel | null) : null,
              minOperationalLevel: type === "minimum_level" ? (minOperationalLevel as OperationalLevel) : null,
              requiresCurrentValidity: type === "minimum_level" ? false : requiresValidity,
            }),
          () => {
            setOpen(false);
            setTargetId("");
            setMinLevel("");
          },
        );
      }}
    >
      <div className="est-form-grid">
        <div className="est-field">
          <label htmlFor={`${prefix}-type`}>Tipo</label>
          <select
            id={`${prefix}-type`}
            value={type}
            onChange={(e) => {
              setType(e.target.value as RequirementType);
              setTargetId("");
            }}
          >
            {REQUIREMENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {REQUIREMENT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        {type !== "minimum_level" ? (
          <div className="est-field">
            <label htmlFor={`${prefix}-target`}>{type === "qualification" ? "Cualificación" : "Tipo de credencial"}</label>
            <select id={`${prefix}-target`} value={targetId} onChange={(e) => setTargetId(e.target.value)} required>
              <option value="">Selecciona…</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {targets.length === 0 ? (
              <span className="est-help">
                {type === "qualification"
                  ? "No hay cualificaciones activas en el catálogo."
                  : "No hay tipos de credencial disponibles para ti."}
              </span>
            ) : null}
          </div>
        ) : (
          <OperationalLevelSelect id={`${prefix}-op`} value={minOperationalLevel} onChange={setMinOperationalLevel} />
        )}
        {type === "qualification" ? <MinLevelSelect id={`${prefix}-level`} value={minLevel} onChange={setMinLevel} /> : null}
        <StrictnessSelect id={`${prefix}-strict`} value={strictness} onChange={setStrictness} />
        {type !== "minimum_level" ? (
          <div className="est-field">
            <label className="est-check">
              <input type="checkbox" checked={requiresValidity} onChange={(e) => setRequiresValidity(e.target.checked)} />
              Exige vigencia
            </label>
          </div>
        ) : null}
      </div>
      <ErrorText message={runner.error} />
      <div className="est-actions">
        <button type="submit" className="est-btn is-primary" disabled={runner.pending}>
          {runner.pending ? "Añadiendo…" : "Añadir requisito"}
        </button>
        <button type="button" className="est-btn" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function StrictnessSelect({ id, value, onChange }: { id: string; value: Strictness; onChange: (v: Strictness) => void }) {
  return (
    <div className="est-field">
      <label htmlFor={id}>Exigencia</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as Strictness)}>
        {STRICTNESS_VALUES.map((v) => (
          <option key={v} value={v}>
            {STRICTNESS_LABELS[v]}
          </option>
        ))}
      </select>
    </div>
  );
}

function MinLevelSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="est-field">
      <label htmlFor={id}>Nivel mínimo</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Cualquiera</option>
        {MIN_LEVELS.map((v) => (
          <option key={v} value={v}>
            {QUALIFICATION_LEVEL_LABELS[v]}
          </option>
        ))}
      </select>
    </div>
  );
}

function OperationalLevelSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="est-field">
      <label htmlFor={id}>Nivel operativo mínimo</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Selecciona…</option>
        {OPERATIONAL_LEVELS.map((v) => (
          <option key={v} value={v}>
            {OPERATIONAL_LEVEL_LABELS[v]}
          </option>
        ))}
      </select>
    </div>
  );
}
