"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { LayoutTemplate } from "lucide-react";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_INFO,
  ACTIVITY_VISIBILITIES,
  VISIBILITY_INFO,
  type ActivityType,
  type ActivityVisibility,
  type ScheduleKind,
} from "@/lib/activities/constants";
import { formatDuration } from "@/lib/activities/time";
import { primaryButtonStyle, secondaryButtonStyle } from "@/app/(app)/app/servicios/ui";
import { createActivityAction, previewRecurrenceAction, type CreateActivityState } from "../actions";
import ScheduleFields from "../_components/ScheduleFields";
import TimezoneField from "../_components/TimezoneField";
import RecurrenceFields from "../_components/RecurrenceFields";
import { EMPTY_RECURRENCE, type RecurrenceValues, type ScheduleValues } from "../_components/form-values";

export type TemplateOption = {
  id: string;
  name: string;
  type: ActivityType;
  campusId: string | null;
  campusName: string | null;
  scheduleKind: ScheduleKind;
  defaultLocalStartTime: string | null;
  defaultDurationMinutes: number | null;
  areaCount: number;
  positionCount: number;
  planItemCount: number;
  defaultTitle: string | null;
  visibility: ActivityVisibility | null;
  locationText: string | null;
  description: string | null;
};

type Props = {
  campuses: { id: string; name: string; timezone: string | null }[];
  allowChurch: boolean;
  churchTimezone: string;
  templates: TemplateOption[];
  people: { id: string; name: string }[];
  todayKey: string;
  initialTemplateId: string | null;
  initialType: ActivityType | null;
};

type Values = {
  mode: "scratch" | "template";
  templateId: string;
  type: ActivityType;
  title: string;
  description: string;
  campusId: string;
  schedule: ScheduleValues;
  tzOverride: string;
  visibility: ActivityVisibility;
  locationText: string;
  organizerPersonId: string;
  adminNotes: string;
  recurrence: RecurrenceValues;
};

function initialValues(props: Props): Values {
  const type = props.initialType ?? "service";
  const base: Values = {
    mode: "scratch",
    templateId: "",
    type,
    title: "",
    description: "",
    campusId: props.allowChurch ? "" : (props.campuses[0]?.id ?? ""),
    schedule: {
      scheduleKind: "timed",
      startDate: props.todayKey,
      startTime: "10:00",
      endMode: "duration",
      endDate: "",
      endTime: "",
      durationMinutes: String(ACTIVITY_TYPE_INFO[type].defaultDurationMinutes),
      windowStart: "",
      windowEnd: "",
    },
    tzOverride: "",
    visibility: "members",
    locationText: "",
    organizerPersonId: "",
    adminNotes: "",
    recurrence: EMPTY_RECURRENCE,
  };
  const template = props.templates.find((t) => t.id === props.initialTemplateId);
  return template ? applyTemplate(base, template, props) : base;
}

function applyTemplate(values: Values, t: TemplateOption, props: Props): Values {
  const campusAllowed = t.campusId === null || props.campuses.some((c) => c.id === t.campusId);
  return {
    ...values,
    mode: "template",
    templateId: t.id,
    type: t.type,
    title: t.defaultTitle ?? t.name,
    description: t.description ?? values.description,
    campusId: t.campusId && campusAllowed ? t.campusId : values.campusId,
    visibility: t.visibility ?? values.visibility,
    locationText: t.locationText ?? values.locationText,
    schedule: {
      ...values.schedule,
      scheduleKind: t.type === "task" ? t.scheduleKind : "timed",
      startTime: t.defaultLocalStartTime ?? values.schedule.startTime,
      endMode: "duration",
      durationMinutes: String(t.defaultDurationMinutes ?? ACTIVITY_TYPE_INFO[t.type].defaultDurationMinutes),
    },
  };
}

function templateLabel(t: TemplateOption): string {
  const parts = [
    t.name,
    ACTIVITY_TYPE_INFO[t.type].label,
    t.campusName ?? "Toda la iglesia",
    `${t.areaCount} área${t.areaCount === 1 ? "" : "s"}`,
  ];
  if (t.defaultDurationMinutes) parts.push(formatDuration(t.defaultDurationMinutes));
  return parts.join(" · ");
}

export default function NuevaActividadForm(props: Props) {
  const { campuses, allowChurch, churchTimezone, templates, people } = props;
  const [values, setValues] = useState<Values>(() => initialValues(props));
  const requestIdRef = useRef<string | null>(null);

  const [state, formAction, pending] = useActionState<CreateActivityState, FormData>(async (prev, formData) => {
    // Un requestId por formulario montado: reintentos y dobles envíos no duplican.
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    formData.set("requestId", requestIdRef.current);
    return createActivityAction(prev, formData);
  }, { error: null });

  const set = <K extends keyof Values>(key: K, v: Values[K]) => setValues((prev) => ({ ...prev, [key]: v }));

  const selectedTemplate = templates.find((t) => t.id === values.templateId) ?? null;
  const flexibleAllowed = ACTIVITY_TYPE_INFO[values.type].allowsFlexibleSchedule;
  const isTimed = !flexibleAllowed || values.schedule.scheduleKind === "timed";
  const campus = campuses.find((c) => c.id === values.campusId) ?? null;
  const resolvedTz = campus?.timezone?.trim() || churchTimezone;
  const resolvedHint = campus?.timezone?.trim()
    ? `Zona de la sede ${campus.name}.`
    : campus
      ? "La sede no tiene zona propia: se usa la de la iglesia."
      : "Zona de la iglesia.";
  const templateCampusMismatch =
    values.mode === "template" && selectedTemplate?.campusId && selectedTemplate.campusId !== values.campusId;

  function changeType(type: ActivityType) {
    setValues((prev) => {
      const prevDefault = String(ACTIVITY_TYPE_INFO[prev.type].defaultDurationMinutes);
      const schedule = { ...prev.schedule };
      if (!ACTIVITY_TYPE_INFO[type].allowsFlexibleSchedule) schedule.scheduleKind = "timed";
      if (prev.mode === "scratch" && schedule.durationMinutes === prevDefault) {
        schedule.durationMinutes = String(ACTIVITY_TYPE_INFO[type].defaultDurationMinutes);
      }
      return { ...prev, type, schedule };
    });
  }

  function changeMode(mode: Values["mode"]) {
    if (mode === "scratch") {
      setValues((prev) => ({ ...prev, mode, templateId: "" }));
    } else {
      setValues((prev) => ({ ...prev, mode }));
    }
  }

  function chooseTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    setValues((prev) => (template ? applyTemplate(prev, template, props) : { ...prev, templateId: "" }));
  }

  return (
    <form action={formAction} className="act-form">
      <input type="hidden" name="templateId" value={values.mode === "template" ? values.templateId : ""} />

      {state.error ? (
        <div role="alert" className="act-notice is-danger">
          {state.error}
        </div>
      ) : null}

      <section className="shell-card act-form-section">
        <h2>Punto de partida</h2>
        <div className="act-radio-row" role="radiogroup" aria-label="Punto de partida">
          <label className={`act-check${values.mode === "scratch" ? " is-checked" : ""}`}>
            <input
              type="radio"
              name="startMode"
              value="scratch"
              checked={values.mode === "scratch"}
              onChange={() => changeMode("scratch")}
            />
            Desde cero
          </label>
          <label className={`act-check${values.mode === "template" ? " is-checked" : ""}${templates.length === 0 ? " is-disabled" : ""}`}>
            <input
              type="radio"
              name="startMode"
              value="template"
              checked={values.mode === "template"}
              disabled={templates.length === 0}
              onChange={() => changeMode("template")}
            />
            <LayoutTemplate size={14} aria-hidden="true" />
            Desde plantilla
          </label>
        </div>
        {templates.length === 0 ? (
          <p className="act-hint">
            No hay plantillas activas disponibles. <Link href="/app/actividades/plantillas">Gestionar plantillas</Link>
          </p>
        ) : null}

        {values.mode === "template" ? (
          <div className="act-field">
            <label className="act-label" htmlFor="new-template">
              Plantilla
            </label>
            <select
              id="new-template"
              className="act-input"
              value={values.templateId}
              required
              onChange={(e) => chooseTemplate(e.target.value)}
            >
              <option value="">Elige una plantilla…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {templateLabel(t)}
                </option>
              ))}
            </select>
            {selectedTemplate ? (
              <p className="act-hint">
                Copia {selectedTemplate.areaCount} área{selectedTemplate.areaCount === 1 ? "" : "s"},{" "}
                {selectedTemplate.positionCount} puesto{selectedTemplate.positionCount === 1 ? "" : "s"} y{" "}
                {selectedTemplate.planItemCount} bloque{selectedTemplate.planItemCount === 1 ? "" : "s"} del orden. Los
                datos precargados se pueden cambiar; editar la plantilla después no altera esta actividad.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="shell-card act-form-section">
        <h2>Datos generales</h2>
        <div className="act-grid-2">
          <div className="act-field">
            <label className="act-label" htmlFor="new-type">
              Tipo
            </label>
            <select
              id="new-type"
              className="act-input"
              name="type"
              value={values.type}
              onChange={(e) => changeType(e.target.value as ActivityType)}
            >
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACTIVITY_TYPE_INFO[t].label}
                </option>
              ))}
            </select>
          </div>
          <div className="act-field">
            <label className="act-label" htmlFor="new-campus">
              Sede
            </label>
            <select
              id="new-campus"
              className="act-input"
              name="campusId"
              value={values.campusId}
              onChange={(e) => set("campusId", e.target.value)}
            >
              {allowChurch ? <option value="">Toda la iglesia</option> : null}
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {templateCampusMismatch ? (
              <p className="act-error">
                La plantilla es de la sede {selectedTemplate?.campusName}: la actividad debe crearse en esa sede.
              </p>
            ) : null}
          </div>
        </div>
        <div className="act-field">
          <label className="act-label" htmlFor="new-title">
            Título
          </label>
          <input
            id="new-title"
            className="act-input"
            name="title"
            required
            maxLength={200}
            value={values.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </div>
        <div className="act-field">
          <label className="act-label" htmlFor="new-description">
            Descripción
          </label>
          <textarea
            id="new-description"
            className="act-input"
            name="description"
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
      </section>

      <section className="shell-card act-form-section">
        <h2>Fecha y hora</h2>
        <ScheduleFields
          idPrefix="new"
          value={values.schedule}
          onChange={(schedule) => set("schedule", schedule)}
          flexibleAllowed={flexibleAllowed}
        />
        <TimezoneField
          idPrefix="new"
          resolved={resolvedTz}
          resolvedHint={resolvedHint}
          override={values.tzOverride}
          onOverrideChange={(v) => set("tzOverride", v)}
        />
      </section>

      {isTimed ? (
        <section className="shell-card act-form-section">
          <h2>Repetición</h2>
          <RecurrenceFields
            idPrefix="new"
            value={values.recurrence}
            onChange={(recurrence) => set("recurrence", recurrence)}
            startDate={values.schedule.startDate}
            previewAction={previewRecurrenceAction}
          />
        </section>
      ) : null}

      <section className="shell-card act-form-section">
        <h2>Visibilidad y organización</h2>
        <div className="act-grid-2">
          <div className="act-field">
            <label className="act-label" htmlFor="new-visibility">
              Visibilidad
            </label>
            <select
              id="new-visibility"
              className="act-input"
              name="visibility"
              value={values.visibility}
              onChange={(e) => set("visibility", e.target.value as ActivityVisibility)}
              aria-describedby="new-visibility-hint"
            >
              {ACTIVITY_VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {VISIBILITY_INFO[v].label}
                </option>
              ))}
            </select>
            <p id="new-visibility-hint" className="act-hint">
              {VISIBILITY_INFO[values.visibility].description}
            </p>
          </div>
          <div className="act-field">
            <label className="act-label" htmlFor="new-organizer">
              Responsable
            </label>
            <select
              id="new-organizer"
              className="act-input"
              name="organizerPersonId"
              value={values.organizerPersonId}
              onChange={(e) => set("organizerPersonId", e.target.value)}
            >
              <option value="">Sin responsable</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="act-field">
          <label className="act-label" htmlFor="new-location">
            Lugar
          </label>
          <input
            id="new-location"
            className="act-input"
            name="locationText"
            maxLength={300}
            value={values.locationText}
            onChange={(e) => set("locationText", e.target.value)}
          />
        </div>
        <div className="act-field">
          <label className="act-label" htmlFor="new-notes">
            Notas administrativas (no visibles para miembros)
          </label>
          <textarea
            id="new-notes"
            className="act-input"
            name="adminNotes"
            value={values.adminNotes}
            onChange={(e) => set("adminNotes", e.target.value)}
          />
        </div>
      </section>

      <div className="act-actions">
        <button
          type="submit"
          style={primaryButtonStyle(pending)}
          disabled={pending || Boolean(templateCampusMismatch) || (values.mode === "template" && !values.templateId)}
        >
          {pending ? "Creando…" : values.recurrence.enabled && isTimed ? "Crear serie" : "Crear actividad"}
        </button>
        <Link href="/app/actividades" style={secondaryButtonStyle()}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
