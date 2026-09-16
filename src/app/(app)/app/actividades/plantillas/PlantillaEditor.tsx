"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import type {
  ActivityTemplateDetail,
  TemplateInput,
} from "@/server/activities/activity-templates-service";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_INFO,
  ACTIVITY_VISIBILITIES,
  AREA_REQUIREMENTS,
  AREA_REQUIREMENT_LABELS,
  PLAN_ITEM_TYPES,
  PLAN_ITEM_TYPE_LABELS,
  SCHEDULE_KINDS,
  SCHEDULE_KIND_LABELS,
  VISIBILITY_INFO,
  type ActivityType,
  type ActivityVisibility,
  type AreaRequirement,
  type PlanItemType,
  type ScheduleKind,
} from "@/lib/activities/constants";
import { computePlanTimeline, moveItem } from "@/lib/activities/planning";
import { formatDuration } from "@/lib/activities/time";
import { primaryButtonStyle, secondaryButtonStyle } from "../../servicios/ui";
import { guardarPlantillaAction } from "./actions";
import type { EditorCatalogPosition, TemplateEditorData } from "./editor-data";

type PositionState = {
  key: string;
  servicePositionId: string | null;
  name: string;
  description: string;
  critical: boolean;
  minPeople: string;
  maxPeople: string;
  requiresAutonomousPerson: boolean;
};

type AreaState = {
  key: string;
  serviceAreaId: string;
  areaName: string;
  requirement: AreaRequirement;
  notes: string;
  positions: PositionState[];
};

type PlanState = {
  key: string;
  itemType: PlanItemType;
  title: string;
  durationMinutes: string;
  startOffsetMinutes: string;
  responsibleText: string;
  notes: string;
};

type FormState = {
  name: string;
  type: ActivityType;
  campusId: string;
  defaultTitle: string;
  scheduleKind: ScheduleKind;
  defaultLocalStartTime: string;
  defaultDurationMinutes: string;
  description: string;
  visibility: ActivityVisibility;
  locationText: string;
  notes: string;
  active: boolean;
  sortOrder: string;
};

const inputStyle: React.CSSProperties = { ...authInputStyle, width: "100%" };

/** Clave local de React (solo en manejadores; no requiere contexto seguro). */
function newKey(): string {
  return `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function numText(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/** "" → null; entero → número; otra cosa → NaN (inválido). */
function parseInteger(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isInteger(n) ? n : Number.NaN;
}

function isCompatibleCampus(templateCampusId: string, itemCampusId: string | null): boolean {
  return templateCampusId === "" || itemCampusId === null || itemCampusId === templateCampusId;
}

function signedMinutes(minutes: number): string {
  return minutes < 0 ? formatDuration(minutes) : `+${formatDuration(minutes)}`;
}

function positionErrors(p: PositionState): string | null {
  const min = parseInteger(p.minPeople);
  const max = parseInteger(p.maxPeople);
  if (!p.servicePositionId && p.name.trim() === "") return "Indica el nombre del puesto.";
  if (min === null || Number.isNaN(min) || min < 0 || min > 500) return "El mínimo debe ser un número entero entre 0 y 500.";
  if (max !== null && (Number.isNaN(max) || max < 1 || max > 500)) return "El máximo debe ser un entero entre 1 y 500, o quedar vacío.";
  if (max !== null && max < min) return "El máximo no puede ser menor que el mínimo.";
  return null;
}

function planItemErrors(item: PlanState): string | null {
  const duration = parseInteger(item.durationMinutes);
  const offset = parseInteger(item.startOffsetMinutes);
  if (item.title.trim() === "") return "Indica el título del bloque.";
  if (duration !== null && (Number.isNaN(duration) || duration < 0 || duration > 1440)) {
    return "La duración debe estar entre 0 y 1440 minutos.";
  }
  if (offset !== null && (Number.isNaN(offset) || offset < -1440 || offset > 4320)) {
    return "El desfase debe estar entre -1440 y 4320 minutos.";
  }
  return null;
}

function initialForm(template: ActivityTemplateDetail | null, data: TemplateEditorData): FormState {
  if (!template) {
    return {
      name: "",
      type: "service",
      campusId: data.allowChurchScope ? "" : (data.campuses[0]?.id ?? ""),
      defaultTitle: "",
      scheduleKind: "timed",
      defaultLocalStartTime: "",
      defaultDurationMinutes: String(ACTIVITY_TYPE_INFO.service.defaultDurationMinutes),
      description: "",
      visibility: "members",
      locationText: "",
      notes: "",
      active: true,
      sortOrder: "0",
    };
  }
  return {
    name: template.name,
    type: template.type,
    campusId: template.campusId ?? "",
    defaultTitle: template.defaultTitle ?? "",
    scheduleKind: template.scheduleKind,
    defaultLocalStartTime: template.defaultLocalStartTime ?? "",
    defaultDurationMinutes: numText(template.defaultDurationMinutes),
    description: template.description ?? "",
    visibility: template.visibility,
    locationText: template.locationText ?? "",
    notes: template.notes ?? "",
    active: template.active,
    sortOrder: String(template.sortOrder),
  };
}

export default function PlantillaEditor({
  template,
  canEdit,
  data,
}: {
  template: ActivityTemplateDetail | null;
  canEdit: boolean;
  data: TemplateEditorData;
}) {
  const [form, setForm] = useState<FormState>(() => initialForm(template, data));
  const [areas, setAreas] = useState<AreaState[]>(() =>
    (template?.areas ?? []).map((a, i) => ({
      key: `area-${i}`,
      serviceAreaId: a.serviceAreaId,
      areaName: a.areaName,
      requirement: a.requirement,
      notes: a.notes ?? "",
      positions: a.positions.map((p, j) => ({
        key: `pos-${i}-${j}`,
        servicePositionId: p.servicePositionId,
        name: p.name,
        description: p.description ?? "",
        critical: p.critical,
        minPeople: String(p.minPeople),
        maxPeople: numText(p.maxPeople),
        requiresAutonomousPerson: p.requiresAutonomousPerson,
      })),
    })),
  );
  const [planItems, setPlanItems] = useState<PlanState[]>(() =>
    (template?.planItems ?? []).map((p, i) => ({
      key: `plan-${i}`,
      itemType: p.itemType,
      title: p.title,
      durationMinutes: numText(p.durationMinutes),
      startOffsetMinutes: numText(p.startOffsetMinutes),
      responsibleText: p.responsibleText ?? "",
      notes: p.notes ?? "",
    })),
  );
  const [newAreaId, setNewAreaId] = useState("");
  const [newAreaRequirement, setNewAreaRequirement] = useState<AreaRequirement>("required");
  const [newPositionFor, setNewPositionFor] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const catalogAreaById = useMemo(() => new Map(data.catalog.areas.map((a) => [a.id, a])), [data.catalog.areas]);
  const catalogPositionsByArea = useMemo(() => {
    const map = new Map<string, EditorCatalogPosition[]>();
    for (const p of data.catalog.positions) {
      const list = map.get(p.serviceAreaId) ?? [];
      list.push(p);
      map.set(p.serviceAreaId, list);
    }
    return map;
  }, [data.catalog.positions]);

  const typeInfo = ACTIVITY_TYPE_INFO[form.type];
  const flexible = form.scheduleKind === "flexible";
  const defaultDuration = parseInteger(form.defaultDurationMinutes);
  const validDefaultDuration = defaultDuration !== null && !Number.isNaN(defaultDuration) ? defaultDuration : null;

  const timeline = useMemo(
    () =>
      computePlanTimeline(
        planItems.map((item) => {
          const duration = parseInteger(item.durationMinutes);
          const offset = parseInteger(item.startOffsetMinutes);
          return {
            id: item.key,
            durationMinutes: duration !== null && !Number.isNaN(duration) ? duration : null,
            startOffsetMinutes: offset !== null && !Number.isNaN(offset) ? offset : null,
          };
        }),
        validDefaultDuration,
      ),
    [planItems, validDefaultDuration],
  );

  const addedAreaIds = new Set(areas.map((a) => a.serviceAreaId));
  const availableAreas = data.catalog.areas.filter(
    (a) => !addedAreaIds.has(a.id) && isCompatibleCampus(form.campusId, a.campusId),
  );

  function touched() {
    setSaved(false);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    touched();
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function changeType(type: ActivityType) {
    touched();
    setForm((prev) => {
      const next: FormState = { ...prev, type };
      if (!ACTIVITY_TYPE_INFO[type].allowsFlexibleSchedule) next.scheduleKind = "timed";
      // Si la duración seguía siendo la sugerida por el tipo anterior, se sugiere la del nuevo.
      if (prev.defaultDurationMinutes === String(ACTIVITY_TYPE_INFO[prev.type].defaultDurationMinutes)) {
        next.defaultDurationMinutes = String(ACTIVITY_TYPE_INFO[type].defaultDurationMinutes);
      }
      return next;
    });
  }

  function updateArea(key: string, patch: Partial<AreaState>) {
    touched();
    setAreas((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }

  function moveArea(index: number, delta: number) {
    touched();
    setAreas((prev) => moveItem(prev, index, index + delta));
  }

  function removeArea(key: string) {
    touched();
    setAreas((prev) => prev.filter((a) => a.key !== key));
  }

  function addArea() {
    const catalogArea = catalogAreaById.get(newAreaId);
    if (!catalogArea) return;
    touched();
    setAreas((prev) => [
      ...prev,
      {
        key: newKey(),
        serviceAreaId: catalogArea.id,
        areaName: catalogArea.name,
        requirement: newAreaRequirement,
        notes: "",
        positions: [],
      },
    ]);
    setNewAreaId("");
  }

  function updatePosition(areaKey: string, positionKey: string, patch: Partial<PositionState>) {
    touched();
    setAreas((prev) =>
      prev.map((a) =>
        a.key === areaKey
          ? { ...a, positions: a.positions.map((p) => (p.key === positionKey ? { ...p, ...patch } : p)) }
          : a,
      ),
    );
  }

  function movePosition(areaKey: string, index: number, delta: number) {
    touched();
    setAreas((prev) =>
      prev.map((a) => (a.key === areaKey ? { ...a, positions: moveItem(a.positions, index, index + delta) } : a)),
    );
  }

  function removePosition(areaKey: string, positionKey: string) {
    touched();
    setAreas((prev) =>
      prev.map((a) => (a.key === areaKey ? { ...a, positions: a.positions.filter((p) => p.key !== positionKey) } : a)),
    );
  }

  function addPosition(area: AreaState) {
    const selected = newPositionFor[area.key] ?? "";
    if (!selected) return;
    let position: PositionState;
    if (selected === "__adhoc") {
      position = {
        key: newKey(),
        servicePositionId: null,
        name: "",
        description: "",
        critical: false,
        minPeople: "1",
        maxPeople: "",
        requiresAutonomousPerson: false,
      };
    } else {
      const catalog = data.catalog.positions.find((p) => p.id === selected);
      if (!catalog) return;
      position = {
        key: newKey(),
        servicePositionId: catalog.id,
        name: catalog.name,
        description: catalog.description ?? "",
        critical: catalog.critical,
        minPeople: String(catalog.minPeople),
        maxPeople: numText(catalog.maxPeople),
        requiresAutonomousPerson: catalog.requiresAutonomousPerson,
      };
    }
    touched();
    setAreas((prev) => prev.map((a) => (a.key === area.key ? { ...a, positions: [...a.positions, position] } : a)));
    setNewPositionFor((prev) => ({ ...prev, [area.key]: "" }));
  }

  function updatePlanItem(key: string, patch: Partial<PlanState>) {
    touched();
    setPlanItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function movePlanItem(index: number, delta: number) {
    touched();
    setPlanItems((prev) => moveItem(prev, index, index + delta));
  }

  function removePlanItem(key: string) {
    touched();
    setPlanItems((prev) => prev.filter((item) => item.key !== key));
  }

  function addPlanItem() {
    touched();
    setPlanItems((prev) => [
      ...prev,
      {
        key: newKey(),
        itemType: "custom",
        title: "",
        durationMinutes: "",
        startOffsetMinutes: "",
        responsibleText: "",
        notes: "",
      },
    ]);
  }

  function collectErrors(): string[] {
    const errors: string[] = [];
    if (form.name.trim() === "") errors.push("La plantilla necesita un nombre.");
    if (flexible && !typeInfo.allowsFlexibleSchedule) errors.push("Solo las tareas pueden no tener hora fija.");
    if (!flexible && form.defaultLocalStartTime !== "" && !/^\d{2}:\d{2}$/.test(form.defaultLocalStartTime)) {
      errors.push("La hora de inicio debe tener el formato HH:MM.");
    }
    const duration = parseInteger(form.defaultDurationMinutes);
    if (duration !== null && (Number.isNaN(duration) || duration < 1 || duration > 89280)) {
      errors.push("La duración por defecto debe ser un número entero de minutos mayor que 0.");
    }
    if (parseInteger(form.sortOrder) === null || Number.isNaN(parseInteger(form.sortOrder))) {
      errors.push("El orden debe ser un número entero.");
    }
    for (const area of areas) {
      if (!data.servingEnabled) break;
      area.positions.forEach((p, i) => {
        const message = positionErrors(p);
        if (message) errors.push(`${area.areaName || "Área"}, puesto ${i + 1}: ${message}`);
      });
    }
    planItems.forEach((item, i) => {
      const message = planItemErrors(item);
      if (message) errors.push(`Bloque ${i + 1} del plan: ${message}`);
    });
    return errors;
  }

  function buildInput(): TemplateInput {
    return {
      name: form.name,
      type: form.type,
      campusId: form.campusId || null,
      defaultTitle: form.defaultTitle,
      scheduleKind: typeInfo.allowsFlexibleSchedule ? form.scheduleKind : "timed",
      defaultLocalStartTime: flexible ? null : form.defaultLocalStartTime || null,
      defaultDurationMinutes: parseInteger(form.defaultDurationMinutes),
      description: form.description,
      visibility: form.visibility,
      locationText: form.locationText,
      notes: form.notes,
      active: form.active,
      sortOrder: parseInteger(form.sortOrder) ?? 0,
      // Sin módulo Servicios no se envían áreas (la base de datos lo rechazaría).
      areas: data.servingEnabled
        ? areas.map((a) => ({
            serviceAreaId: a.serviceAreaId,
            requirement: a.requirement,
            notes: a.notes,
            positions: a.positions.map((p) => ({
              servicePositionId: p.servicePositionId,
              name: p.name,
              description: p.description,
              critical: p.critical,
              minPeople: parseInteger(p.minPeople) ?? 0,
              maxPeople: parseInteger(p.maxPeople),
              requiresAutonomousPerson: p.requiresAutonomousPerson,
            })),
          }))
        : [],
      planItems: planItems.map((item) => ({
        itemType: item.itemType,
        title: item.title,
        durationMinutes: parseInteger(item.durationMinutes),
        startOffsetMinutes: parseInteger(item.startOffsetMinutes),
        responsibleText: item.responsibleText,
        notes: item.notes,
      })),
    };
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    const errors = collectErrors();
    setValidation(errors);
    setError(null);
    setSaved(false);
    if (errors.length > 0) return;
    const input = buildInput();
    startTransition(async () => {
      const result = await guardarPlantillaAction(template?.id ?? null, input);
      if (!result) return;
      if (result.error) {
        setError(result.error);
        return;
      }
      setSaved(true);
    });
  }

  const campusSelectable = data.allowChurchScope || data.campuses.length > 0;

  return (
    <form className="tpl-editor" onSubmit={save} noValidate>
      <section className="tpl-header">
        <div>
          <p className="serving-meta">
            <Link href="/app/actividades/plantillas" style={{ color: "var(--shell-text-muted)" }}>
              Plantillas de actividad
            </Link>{" "}
            / {template ? "Editar" : "Nueva"}
          </p>
          <h1 style={{ marginTop: 4 }}>{template ? template.name : "Nueva plantilla"}</h1>
          <div className="tpl-chips" style={{ marginTop: 8 }}>
            <span className="serving-chip tpl-type-chip">{typeInfo.label}</span>
            {template?.archivedAt ? <span className="serving-chip is-muted">Archivada</span> : null}
            {template && !template.archivedAt ? (
              <span className={`serving-chip ${template.active ? "is-success" : "is-warning"}`}>
                {template.active ? "Activa" : "Inactiva"}
              </span>
            ) : null}
          </div>
        </div>
        <div className="tpl-actions">
          <Link href="/app/actividades/plantillas" className="tpl-btn" style={secondaryButtonStyle()}>
            Volver
          </Link>
        </div>
      </section>

      <p className="tpl-note">
        Las actividades creadas con esta plantilla copian su estructura; cambiarla después no modifica actividades ya
        creadas.
      </p>

      {!canEdit ? (
        <p role="status" className="shell-card tpl-note" style={{ padding: 14 }}>
          Estás viendo esta plantilla en modo lectura: no tienes permiso para gestionar plantillas en su ámbito.
        </p>
      ) : null}

      <fieldset className="tpl-fieldset" disabled={!canEdit || pending}>
        {/* Datos generales ------------------------------------------------ */}
        <section className="shell-card tpl-section" aria-labelledby="tpl-general">
          <div className="tpl-section-head">
            <h2 id="tpl-general">Datos generales</h2>
          </div>
          <div className="tpl-form-grid">
            <div className="tpl-field is-wide">
              <label htmlFor="tpl-name" style={authLabelStyle}>
                Nombre de la plantilla
              </label>
              <input
                id="tpl-name"
                value={form.name}
                maxLength={120}
                required
                placeholder="Culto domingo 11:00"
                aria-invalid={validation.length > 0 && form.name.trim() === ""}
                onChange={(e) => setField("name", e.target.value)}
                style={inputStyle}
              />
            </div>

            <div className="tpl-field">
              <label htmlFor="tpl-type" style={authLabelStyle}>
                Tipo de actividad
              </label>
              <select
                id="tpl-type"
                value={form.type}
                onChange={(e) => changeType(e.target.value as ActivityType)}
                style={inputStyle}
              >
                {ACTIVITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ACTIVITY_TYPE_INFO[type].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="tpl-field">
              <label htmlFor="tpl-campus" style={authLabelStyle}>
                Sede
              </label>
              {campusSelectable ? (
                <select
                  id="tpl-campus"
                  value={form.campusId}
                  onChange={(e) => setField("campusId", e.target.value)}
                  style={inputStyle}
                >
                  {data.allowChurchScope || form.campusId === "" ? (
                    <option value="" disabled={!data.allowChurchScope}>
                      Toda la iglesia
                    </option>
                  ) : null}
                  {data.campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input id="tpl-campus" value="Toda la iglesia" readOnly style={inputStyle} />
              )}
              <span className="tpl-hint">Limita en qué sede se puede usar y qué áreas del catálogo admite.</span>
            </div>

            <div className="tpl-field">
              <label htmlFor="tpl-title" style={authLabelStyle}>
                Título por defecto
              </label>
              <input
                id="tpl-title"
                value={form.defaultTitle}
                maxLength={200}
                placeholder="Título que tendrá la actividad"
                onChange={(e) => setField("defaultTitle", e.target.value)}
                style={inputStyle}
              />
            </div>

            <div className="tpl-field">
              <label htmlFor="tpl-schedule" style={authLabelStyle}>
                Horario
              </label>
              <select
                id="tpl-schedule"
                value={form.scheduleKind}
                onChange={(e) => setField("scheduleKind", e.target.value as ScheduleKind)}
                style={inputStyle}
              >
                {SCHEDULE_KINDS.filter((k) => k === "timed" || typeInfo.allowsFlexibleSchedule).map((k) => (
                  <option key={k} value={k}>
                    {SCHEDULE_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
              {!typeInfo.allowsFlexibleSchedule ? (
                <span className="tpl-hint">Solo las tareas pueden quedar sin hora fija.</span>
              ) : null}
            </div>

            <div className="tpl-field">
              <label htmlFor="tpl-start" style={authLabelStyle}>
                Hora de inicio habitual
              </label>
              <input
                id="tpl-start"
                type="time"
                value={flexible ? "" : form.defaultLocalStartTime}
                disabled={flexible}
                onChange={(e) => setField("defaultLocalStartTime", e.target.value)}
                style={inputStyle}
              />
              <span className="tpl-hint">
                {flexible ? "Sin hora fija: la tarea no tiene horario." : "Hora local de la sede. Opcional."}
              </span>
            </div>

            <div className="tpl-field">
              <label htmlFor="tpl-duration" style={authLabelStyle}>
                Duración (minutos)
              </label>
              <input
                id="tpl-duration"
                type="number"
                inputMode="numeric"
                min={1}
                max={89280}
                step={1}
                value={form.defaultDurationMinutes}
                onChange={(e) => setField("defaultDurationMinutes", e.target.value)}
                style={inputStyle}
              />
              <span className="tpl-hint">
                {validDefaultDuration !== null ? formatDuration(validDefaultDuration) : "Sin duración por defecto."}
              </span>
            </div>

            <div className="tpl-field is-wide">
              <label htmlFor="tpl-description" style={authLabelStyle}>
                Descripción
              </label>
              <textarea
                id="tpl-description"
                value={form.description}
                maxLength={2000}
                rows={3}
                onChange={(e) => setField("description", e.target.value)}
                style={inputStyle}
              />
            </div>

            <div className="tpl-field">
              <label htmlFor="tpl-visibility" style={authLabelStyle}>
                Visibilidad
              </label>
              <select
                id="tpl-visibility"
                value={form.visibility}
                aria-describedby="tpl-visibility-hint"
                onChange={(e) => setField("visibility", e.target.value as ActivityVisibility)}
                style={inputStyle}
              >
                {ACTIVITY_VISIBILITIES.map((v) => (
                  <option key={v} value={v}>
                    {VISIBILITY_INFO[v].label}
                  </option>
                ))}
              </select>
              <span id="tpl-visibility-hint" className="tpl-hint">
                {VISIBILITY_INFO[form.visibility].description}
              </span>
            </div>

            <div className="tpl-field">
              <label htmlFor="tpl-location" style={authLabelStyle}>
                Lugar
              </label>
              <input
                id="tpl-location"
                value={form.locationText}
                maxLength={200}
                placeholder="Auditorio principal"
                onChange={(e) => setField("locationText", e.target.value)}
                style={inputStyle}
              />
            </div>

            <div className="tpl-field is-wide">
              <label htmlFor="tpl-notes" style={authLabelStyle}>
                Notas internas
              </label>
              <textarea
                id="tpl-notes"
                value={form.notes}
                maxLength={4000}
                rows={2}
                onChange={(e) => setField("notes", e.target.value)}
                style={inputStyle}
              />
              <span className="tpl-hint">Solo visibles para quienes gestionan la actividad.</span>
            </div>

            <div className="tpl-field">
              <label htmlFor="tpl-sort" style={authLabelStyle}>
                Orden en el listado
              </label>
              <input
                id="tpl-sort"
                type="number"
                inputMode="numeric"
                step={1}
                value={form.sortOrder}
                onChange={(e) => setField("sortOrder", e.target.value)}
                style={inputStyle}
              />
            </div>

            <div className="tpl-field" style={{ justifyContent: "flex-end" }}>
              <label className="tpl-check">
                <input type="checkbox" checked={form.active} onChange={(e) => setField("active", e.target.checked)} />
                Activa (se ofrece al crear actividades)
              </label>
            </div>
          </div>
        </section>

        {/* Áreas y puestos ------------------------------------------------ */}
        <section className="shell-card tpl-section" aria-labelledby="tpl-areas">
          <div className="tpl-section-head">
            <div>
              <h2 id="tpl-areas">Áreas de servicio y puestos</h2>
              <p className="tpl-hint">
                Qué áreas intervienen y cuántas personas necesita cada puesto. No incluye asignaciones de personas.
              </p>
            </div>
          </div>

          {!data.servingEnabled ? (
            <div className="shell-empty-state" style={{ padding: "20px 12px" }}>
              <h3>El módulo Servicios no está activo</h3>
              <p>
                Las áreas y puestos proceden del catálogo de Servicios. Actívalo desde Configuración para añadirlos a
                la plantilla.
              </p>
              {areas.length > 0 ? (
                <p className="tpl-hint is-warning">
                  Esta plantilla tenía áreas definidas; al guardar sin el módulo activo no se conservarán.
                </p>
              ) : null}
            </div>
          ) : (
            <>
              {areas.length === 0 ? (
                <p className="tpl-note">
                  {typeInfo.suggestsServiceStructure
                    ? `Para un ${typeInfo.label.toLowerCase()} suele ser útil definir las áreas que intervienen.`
                    : "Esta plantilla aún no tiene áreas de servicio."}
                </p>
              ) : (
                <ol className="tpl-list">
                  {areas.map((area, areaIndex) => {
                    const catalogArea = catalogAreaById.get(area.serviceAreaId);
                    const unavailable = !catalogArea;
                    const mismatch = catalogArea ? !isCompatibleCampus(form.campusId, catalogArea.campusId) : false;
                    const addedPositionIds = new Set(area.positions.map((p) => p.servicePositionId).filter(Boolean));
                    const positionOptions = (catalogPositionsByArea.get(area.serviceAreaId) ?? []).filter(
                      (p) => !addedPositionIds.has(p.id) && isCompatibleCampus(form.campusId, p.campusId),
                    );
                    const areaLabel = area.areaName || catalogArea?.name || "Área";
                    return (
                      <li key={area.key} className="tpl-item">
                        <div className="tpl-item-head">
                          <p className="tpl-item-title">
                            <span className="tpl-order">{areaIndex + 1}.</span>
                            {areaLabel}
                            {unavailable ? (
                              <span className="serving-chip is-danger">No disponible en el catálogo</span>
                            ) : null}
                            {mismatch ? <span className="serving-chip is-warning">Otra sede</span> : null}
                          </p>
                          <div className="tpl-tools">
                            <button
                              type="button"
                              className="tpl-icon-btn"
                              onClick={() => moveArea(areaIndex, -1)}
                              disabled={areaIndex === 0}
                              aria-label={`Subir ${areaLabel}`}
                            >
                              <ArrowUp aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="tpl-icon-btn"
                              onClick={() => moveArea(areaIndex, 1)}
                              disabled={areaIndex === areas.length - 1}
                              aria-label={`Bajar ${areaLabel}`}
                            >
                              <ArrowDown aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="tpl-icon-btn is-danger"
                              onClick={() => removeArea(area.key)}
                              aria-label={`Quitar ${areaLabel}`}
                            >
                              <Trash2 aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                        {unavailable || mismatch ? (
                          <p className="tpl-hint is-warning">
                            {unavailable
                              ? "El área ya no está activa en el catálogo de Servicios. Quítala para poder guardar."
                              : "El área pertenece a otra sede distinta de la de la plantilla. Cambia la sede o quítala."}
                          </p>
                        ) : null}

                        <div className="tpl-form-grid">
                          <div className="tpl-field">
                            <label htmlFor={`${area.key}-req`} style={authLabelStyle}>
                              Requisito
                            </label>
                            <select
                              id={`${area.key}-req`}
                              value={area.requirement}
                              onChange={(e) => updateArea(area.key, { requirement: e.target.value as AreaRequirement })}
                              style={inputStyle}
                            >
                              {AREA_REQUIREMENTS.map((r) => (
                                <option key={r} value={r}>
                                  {AREA_REQUIREMENT_LABELS[r]}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="tpl-field">
                            <label htmlFor={`${area.key}-notes`} style={authLabelStyle}>
                              Notas del área
                            </label>
                            <input
                              id={`${area.key}-notes`}
                              value={area.notes}
                              maxLength={1000}
                              onChange={(e) => updateArea(area.key, { notes: e.target.value })}
                              style={inputStyle}
                            />
                          </div>
                        </div>

                        <div className="tpl-positions">
                          {area.positions.length === 0 ? (
                            <p className="tpl-hint">
                              {area.requirement === "required"
                                ? "Área obligatoria sin puestos: añade al menos uno."
                                : "Sin puestos todavía."}
                            </p>
                          ) : (
                            area.positions.map((p, positionIndex) => {
                              const baseId = `${area.key}-${p.key}`;
                              const problem = validation.length > 0 ? positionErrors(p) : null;
                              const positionLabel = p.name || `Puesto ${positionIndex + 1}`;
                              return (
                                <div key={p.key} className="tpl-position">
                                  <div className="tpl-field">
                                    <label htmlFor={`${baseId}-name`} style={authLabelStyle}>
                                      Puesto{" "}
                                      {p.servicePositionId ? (
                                        <span className="serving-chip" style={{ marginLeft: 4 }}>
                                          Catálogo
                                        </span>
                                      ) : (
                                        <span className="serving-chip is-muted" style={{ marginLeft: 4 }}>
                                          Propio
                                        </span>
                                      )}
                                    </label>
                                    <input
                                      id={`${baseId}-name`}
                                      value={p.name}
                                      maxLength={120}
                                      readOnly={Boolean(p.servicePositionId)}
                                      placeholder="Nombre del puesto"
                                      onChange={(e) => updatePosition(area.key, p.key, { name: e.target.value })}
                                      style={inputStyle}
                                    />
                                  </div>
                                  <div className="tpl-field">
                                    <label htmlFor={`${baseId}-min`} style={authLabelStyle}>
                                      Mínimo
                                    </label>
                                    <input
                                      id={`${baseId}-min`}
                                      type="number"
                                      inputMode="numeric"
                                      min={0}
                                      max={500}
                                      step={1}
                                      value={p.minPeople}
                                      aria-invalid={Boolean(problem)}
                                      onChange={(e) => updatePosition(area.key, p.key, { minPeople: e.target.value })}
                                      style={inputStyle}
                                    />
                                  </div>
                                  <div className="tpl-field">
                                    <label htmlFor={`${baseId}-max`} style={authLabelStyle}>
                                      Máximo
                                    </label>
                                    <input
                                      id={`${baseId}-max`}
                                      type="number"
                                      inputMode="numeric"
                                      min={1}
                                      max={500}
                                      step={1}
                                      value={p.maxPeople}
                                      placeholder="Sin límite"
                                      aria-invalid={Boolean(problem)}
                                      onChange={(e) => updatePosition(area.key, p.key, { maxPeople: e.target.value })}
                                      style={inputStyle}
                                    />
                                  </div>
                                  <div className="tpl-tools">
                                    <button
                                      type="button"
                                      className="tpl-icon-btn"
                                      onClick={() => movePosition(area.key, positionIndex, -1)}
                                      disabled={positionIndex === 0}
                                      aria-label={`Subir ${positionLabel}`}
                                    >
                                      <ArrowUp aria-hidden="true" />
                                    </button>
                                    <button
                                      type="button"
                                      className="tpl-icon-btn"
                                      onClick={() => movePosition(area.key, positionIndex, 1)}
                                      disabled={positionIndex === area.positions.length - 1}
                                      aria-label={`Bajar ${positionLabel}`}
                                    >
                                      <ArrowDown aria-hidden="true" />
                                    </button>
                                    <button
                                      type="button"
                                      className="tpl-icon-btn is-danger"
                                      onClick={() => removePosition(area.key, p.key)}
                                      aria-label={`Quitar ${positionLabel}`}
                                    >
                                      <Trash2 aria-hidden="true" />
                                    </button>
                                  </div>
                                  <div className="tpl-position-flags">
                                    <label className="tpl-check">
                                      <input
                                        type="checkbox"
                                        checked={p.critical}
                                        onChange={(e) => updatePosition(area.key, p.key, { critical: e.target.checked })}
                                      />
                                      Crítico
                                    </label>
                                    <label className="tpl-check">
                                      <input
                                        type="checkbox"
                                        checked={p.requiresAutonomousPerson}
                                        onChange={(e) =>
                                          updatePosition(area.key, p.key, { requiresAutonomousPerson: e.target.checked })
                                        }
                                      />
                                      Requiere persona autónoma
                                    </label>
                                    {problem ? (
                                      <span role="alert" className="tpl-error" style={{ flexBasis: "100%" }}>
                                        {problem}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })
                          )}

                          <div className="tpl-add-row">
                            <div className="tpl-field">
                              <label htmlFor={`${area.key}-add-pos`} style={authLabelStyle}>
                                Añadir puesto
                              </label>
                              <select
                                id={`${area.key}-add-pos`}
                                value={newPositionFor[area.key] ?? ""}
                                onChange={(e) => setNewPositionFor((prev) => ({ ...prev, [area.key]: e.target.value }))}
                                style={inputStyle}
                              >
                                <option value="">Elige un puesto…</option>
                                {positionOptions.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                                <option value="__adhoc">Puesto propio (solo en esta plantilla)</option>
                              </select>
                            </div>
                            <button
                              type="button"
                              className="tpl-btn"
                              style={secondaryButtonStyle()}
                              disabled={!newPositionFor[area.key]}
                              onClick={() => addPosition(area)}
                            >
                              <Plus size={14} aria-hidden="true" /> Añadir
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}

              {data.catalog.areas.length === 0 ? (
                <p className="tpl-note">
                  No hay áreas activas en el catálogo.{" "}
                  <Link href="/app/servicios/areas" style={{ color: "var(--shell-brand)" }}>
                    Crear áreas de servicio
                  </Link>
                </p>
              ) : (
                <div className="tpl-add-row">
                  <div className="tpl-field">
                    <label htmlFor="tpl-add-area" style={authLabelStyle}>
                      Añadir área
                    </label>
                    <select
                      id="tpl-add-area"
                      value={newAreaId}
                      onChange={(e) => setNewAreaId(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">
                        {availableAreas.length === 0 ? "No quedan áreas compatibles" : "Elige un área…"}
                      </option>
                      {availableAreas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="tpl-field" style={{ flex: "0 1 160px" }}>
                    <label htmlFor="tpl-add-area-req" style={authLabelStyle}>
                      Requisito
                    </label>
                    <select
                      id="tpl-add-area-req"
                      value={newAreaRequirement}
                      onChange={(e) => setNewAreaRequirement(e.target.value as AreaRequirement)}
                      style={inputStyle}
                    >
                      {AREA_REQUIREMENTS.map((r) => (
                        <option key={r} value={r}>
                          {AREA_REQUIREMENT_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    className="tpl-btn"
                    style={secondaryButtonStyle()}
                    disabled={!newAreaId}
                    onClick={addArea}
                  >
                    <Plus size={14} aria-hidden="true" /> Añadir área
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Orden del servicio --------------------------------------------- */}
        <section className="shell-card tpl-section" aria-labelledby="tpl-plan">
          <div className="tpl-section-head">
            <div>
              <h2 id="tpl-plan">Orden del servicio</h2>
              <p className="tpl-hint">
                Bloques en orden. Si no indicas desfase, cada bloque empieza cuando termina el anterior; un desfase
                negativo significa antes del inicio.
              </p>
            </div>
          </div>

          {planItems.length > 0 ? (
            <div className="tpl-timeline" aria-live="polite">
              <span>
                Duración total de bloques: <strong>{formatDuration(timeline.totalDurationMinutes)}</strong>
              </span>
              <span>
                Termina en: <strong>{signedMinutes(timeline.endMinute)}</strong>
              </span>
              {validDefaultDuration !== null ? (
                <span>
                  Duración de la actividad: <strong>{formatDuration(validDefaultDuration)}</strong>
                </span>
              ) : null}
              {timeline.exceedsActivity ? (
                <span className="serving-chip is-warning">El plan dura más que la duración por defecto</span>
              ) : null}
            </div>
          ) : (
            <p className="tpl-note">Aún no hay bloques. Añade, por ejemplo, alabanza, predicación o avisos.</p>
          )}

          {planItems.length > 0 ? (
            <ol className="tpl-list">
              {planItems.map((item, index) => {
                const entry = timeline.entries[index];
                const problem = validation.length > 0 ? planItemErrors(item) : null;
                const itemLabel = item.title || `Bloque ${index + 1}`;
                return (
                  <li key={item.key} className="tpl-item">
                    <div className="tpl-item-head">
                      <p className="tpl-item-title">
                        <span className="tpl-order">{index + 1}.</span>
                        {itemLabel}
                        {entry ? (
                          <span className="serving-meta">
                            {signedMinutes(entry.startMinute)} → {signedMinutes(entry.endMinute)}
                          </span>
                        ) : null}
                        {entry?.overlapsPrevious ? (
                          <span className="serving-chip is-warning">Se solapa con el anterior</span>
                        ) : null}
                      </p>
                      <div className="tpl-tools">
                        <button
                          type="button"
                          className="tpl-icon-btn"
                          onClick={() => movePlanItem(index, -1)}
                          disabled={index === 0}
                          aria-label={`Subir ${itemLabel}`}
                        >
                          <ArrowUp aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="tpl-icon-btn"
                          onClick={() => movePlanItem(index, 1)}
                          disabled={index === planItems.length - 1}
                          aria-label={`Bajar ${itemLabel}`}
                        >
                          <ArrowDown aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="tpl-icon-btn is-danger"
                          onClick={() => removePlanItem(item.key)}
                          aria-label={`Quitar ${itemLabel}`}
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div className="tpl-plan-item">
                      <div className="tpl-field">
                        <label htmlFor={`${item.key}-type`} style={authLabelStyle}>
                          Tipo
                        </label>
                        <select
                          id={`${item.key}-type`}
                          value={item.itemType}
                          onChange={(e) => updatePlanItem(item.key, { itemType: e.target.value as PlanItemType })}
                          style={inputStyle}
                        >
                          {PLAN_ITEM_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {PLAN_ITEM_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="tpl-field">
                        <label htmlFor={`${item.key}-title`} style={authLabelStyle}>
                          Título
                        </label>
                        <input
                          id={`${item.key}-title`}
                          value={item.title}
                          maxLength={200}
                          aria-invalid={Boolean(problem) && item.title.trim() === ""}
                          onChange={(e) => updatePlanItem(item.key, { title: e.target.value })}
                          style={inputStyle}
                        />
                      </div>
                      <div className="tpl-field">
                        <label htmlFor={`${item.key}-duration`} style={authLabelStyle}>
                          Duración (min)
                        </label>
                        <input
                          id={`${item.key}-duration`}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={1440}
                          step={1}
                          value={item.durationMinutes}
                          onChange={(e) => updatePlanItem(item.key, { durationMinutes: e.target.value })}
                          style={inputStyle}
                        />
                      </div>
                      <div className="tpl-field">
                        <label htmlFor={`${item.key}-offset`} style={authLabelStyle}>
                          Desfase (min)
                        </label>
                        <input
                          id={`${item.key}-offset`}
                          type="number"
                          inputMode="numeric"
                          min={-1440}
                          max={4320}
                          step={1}
                          value={item.startOffsetMinutes}
                          placeholder="Automático"
                          onChange={(e) => updatePlanItem(item.key, { startOffsetMinutes: e.target.value })}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    <div className="tpl-form-grid">
                      <div className="tpl-field">
                        <label htmlFor={`${item.key}-responsible`} style={authLabelStyle}>
                          Responsable
                        </label>
                        <input
                          id={`${item.key}-responsible`}
                          value={item.responsibleText}
                          maxLength={200}
                          placeholder="Texto libre, p. ej. «Equipo de alabanza»"
                          onChange={(e) => updatePlanItem(item.key, { responsibleText: e.target.value })}
                          style={inputStyle}
                        />
                      </div>
                      <div className="tpl-field">
                        <label htmlFor={`${item.key}-notes`} style={authLabelStyle}>
                          Notas
                        </label>
                        <input
                          id={`${item.key}-notes`}
                          value={item.notes}
                          maxLength={2000}
                          onChange={(e) => updatePlanItem(item.key, { notes: e.target.value })}
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    {problem ? (
                      <p role="alert" className="tpl-error">
                        {problem}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          ) : null}

          <button
            type="button"
            className="tpl-btn"
            style={{ ...secondaryButtonStyle(), alignSelf: "flex-start" }}
            onClick={addPlanItem}
          >
            <Plus size={14} aria-hidden="true" /> Añadir bloque
          </button>
        </section>
      </fieldset>

      {canEdit ? (
        <div className="tpl-sticky-bar">
          <div aria-live="polite">
            {validation.length > 0 ? (
              <div role="alert" className="tpl-error">
                <strong>Revisa la plantilla:</strong>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {validation.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            ) : error ? (
              <p role="alert" className="tpl-error">
                {error} No se ha guardado ningún cambio.
              </p>
            ) : saved ? (
              <p role="status" className="tpl-success">
                Cambios guardados.
              </p>
            ) : (
              <p className="tpl-hint">Se guarda la plantilla completa: datos, áreas, puestos y orden del servicio.</p>
            )}
          </div>
          <button type="submit" disabled={pending} className="tpl-btn" style={primaryButtonStyle(pending)}>
            <Save size={14} aria-hidden="true" />
            {pending ? "Guardando…" : template ? "Guardar cambios" : "Crear plantilla"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
