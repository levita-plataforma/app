"use client";

import { useActionState, useState } from "react";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_INFO,
  ACTIVITY_VISIBILITIES,
  SERIES_EDIT_SCOPES,
  SERIES_EDIT_SCOPE_LABELS,
  VISIBILITY_INFO,
  type ActivityType,
  type ActivityVisibility,
  type SeriesEditScope,
} from "@/lib/activities/constants";
import { durationMinutes, localDateKey, localTimeValue } from "@/lib/activities/time";
import type { ActivityDetail } from "@/server/activities/activities-service";
import { primaryButtonStyle, secondaryButtonStyle } from "@/app/(app)/app/servicios/ui";
import ScheduleFields from "../../_components/ScheduleFields";
import TimezoneField from "../../_components/TimezoneField";
import type { ScheduleValues } from "../../_components/form-values";
import { updateActivityAction, type FichaActionState } from "../actions";
import type { CampusOption } from "./ActivityFicha";

type Props = {
  activity: ActivityDetail;
  campuses: CampusOption[];
  churchTimezone: string;
  people: { id: string; name: string }[];
  canReadAdminNotes: boolean;
  onCancel: () => void;
  onSaved: (message: string) => void;
};

function initialSchedule(a: ActivityDetail): ScheduleValues {
  const tz = a.timezone;
  const minutes = durationMinutes(a.startsAt, a.endsAt);
  return {
    scheduleKind: a.scheduleKind,
    startDate: a.scheduleKind === "timed" && a.startsAt ? localDateKey(a.startsAt, tz) : "",
    startTime: a.scheduleKind === "timed" && a.startsAt ? localTimeValue(a.startsAt, tz) : "10:00",
    endMode: "duration",
    endDate: a.scheduleKind === "timed" && a.endsAt ? localDateKey(a.endsAt, tz) : "",
    endTime: a.scheduleKind === "timed" && a.endsAt ? localTimeValue(a.endsAt, tz) : "",
    durationMinutes:
      a.scheduleKind === "timed" && minutes !== null ? String(minutes) : String(ACTIVITY_TYPE_INFO[a.type].defaultDurationMinutes),
    windowStart: a.scheduleKind === "flexible" && a.startsAt ? localDateKey(a.startsAt, tz) : "",
    windowEnd: a.scheduleKind === "flexible" && a.endsAt ? localDateKey(a.endsAt, tz) : "",
  };
}

export default function EditActivityForm({
  activity,
  campuses,
  churchTimezone,
  people,
  canReadAdminNotes,
  onCancel,
  onSaved,
}: Props) {
  const [original] = useState(() => initialSchedule(activity));
  const [scope, setScope] = useState<SeriesEditScope>("this");
  const [type, setType] = useState<ActivityType>(activity.type);
  const [campusId, setCampusId] = useState(activity.campusId ?? "");
  const [visibility, setVisibility] = useState<ActivityVisibility>(activity.visibility);
  const [schedule, setSchedule] = useState<ScheduleValues>(original);
  const [tzOverride, setTzOverride] = useState("");
  // Campos controlados: React restablece los no controlados al terminar la acción.
  const [fields, setFields] = useState({
    title: activity.title,
    description: activity.description ?? "",
    organizerPersonId: activity.organizerPersonId ?? "",
    locationText: activity.locationText ?? "",
    adminNotes: activity.adminNotes ?? "",
  });
  const setField = (key: keyof typeof fields, value: string) => setFields((prev) => ({ ...prev, [key]: value }));

  const [state, formAction, pending] = useActionState<FichaActionState, FormData>(async (prev, formData) => {
    const result = await updateActivityAction(activity.id, prev, formData);
    if (!result.error) onSaved(result.message ?? "Cambios guardados.");
    return result;
  }, { error: null });

  const inSeries = Boolean(activity.seriesId);
  const seriesScope = inSeries && scope !== "this";
  const flexibleAllowed = ACTIVITY_TYPE_INFO[type].allowsFlexibleSchedule && !inSeries;
  const campusChanged = campusId !== (activity.campusId ?? "");
  const scheduleDirty =
    JSON.stringify(schedule) !== JSON.stringify(original) || tzOverride.trim() !== "" || campusChanged;
  const campus = campuses.find((c) => c.id === campusId) ?? null;
  const resolvedTz = campusChanged ? campus?.timezone?.trim() || churchTimezone : activity.timezone;
  const resolvedHint = campusChanged
    ? "Al cambiar de sede se usará la zona de la nueva sede (o la de la iglesia), manteniendo la hora local."
    : "Zona actual de la actividad.";

  function changeType(next: ActivityType) {
    setType(next);
    if (!ACTIVITY_TYPE_INFO[next].allowsFlexibleSchedule && schedule.scheduleKind === "flexible") {
      setSchedule({ ...schedule, scheduleKind: "timed" });
    }
  }

  return (
    <form action={formAction} className="shell-card act-form-section" aria-label="Editar actividad">
      <h2>Editar actividad</h2>
      <input type="hidden" name="scheduleDirty" value={!seriesScope && scheduleDirty ? "1" : "0"} />
      {/* Sede, responsable y notas solo se envían si cambian (ver updateActivityAction). */}
      <input type="hidden" name="originalCampusId" value={activity.campusId ?? ""} />
      <input type="hidden" name="originalOrganizerPersonId" value={activity.organizerPersonId ?? ""} />
      <input type="hidden" name="adminNotesDirty" value={fields.adminNotes !== (activity.adminNotes ?? "") ? "1" : "0"} />
      <input
        type="hidden"
        name="timeDirty"
        value={schedule.startTime !== original.startTime || schedule.durationMinutes !== original.durationMinutes ? "1" : "0"}
      />

      {inSeries ? (
        <fieldset className="act-fieldset">
          <legend>¿Qué quieres modificar?</legend>
          <div className="act-radio-row">
            {SERIES_EDIT_SCOPES.map((s) => (
              <label key={s} className={`act-check${scope === s ? " is-checked" : ""}`}>
                <input type="radio" name="scope" value={s} checked={scope === s} onChange={() => setScope(s)} />
                {SERIES_EDIT_SCOPE_LABELS[s]}
              </label>
            ))}
          </div>
          <p className="act-hint">
            {scope === "this"
              ? "Solo cambia esta ocurrencia; quedará marcada como excepción y no recibirá cambios de la serie."
              : "Se aplica a las ocurrencias editables de la serie (no a excepciones, pasadas ni cerradas). La fecha, la zona horaria y las notas solo se cambian ocurrencia a ocurrencia."}
          </p>
        </fieldset>
      ) : null}

      <div className="act-grid-2">
        <div className="act-field">
          <label className="act-label" htmlFor="edit-type">
            Tipo
          </label>
          <select
            id="edit-type"
            className="act-input"
            name="type"
            value={type}
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
          <label className="act-label" htmlFor="edit-campus">
            Sede
          </label>
          <select
            id="edit-campus"
            className="act-input"
            name="campusId"
            value={campusId}
            onChange={(e) => setCampusId(e.target.value)}
          >
            <option value="">Toda la iglesia</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.archived ? `${c.name} (archivada)` : c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="act-field">
        <label className="act-label" htmlFor="edit-title">
          Título
        </label>
        <input id="edit-title" className="act-input" name="title" required maxLength={200} value={fields.title} onChange={(e) => setField("title", e.target.value)} />
      </div>
      <div className="act-field">
        <label className="act-label" htmlFor="edit-description">
          Descripción
        </label>
        <textarea id="edit-description" className="act-input" name="description" value={fields.description} onChange={(e) => setField("description", e.target.value)} />
      </div>

      {seriesScope ? (
        <ScheduleFields idPrefix="edit" value={schedule} onChange={setSchedule} flexibleAllowed={false} timeOnly />
      ) : (
        <>
          <ScheduleFields idPrefix="edit" value={schedule} onChange={setSchedule} flexibleAllowed={flexibleAllowed} />
          <TimezoneField
            idPrefix="edit"
            resolved={resolvedTz}
            resolvedHint={resolvedHint}
            override={tzOverride}
            onOverrideChange={setTzOverride}
          />
        </>
      )}

      <div className="act-grid-2">
        <div className="act-field">
          <label className="act-label" htmlFor="edit-visibility">
            Visibilidad
          </label>
          <select
            id="edit-visibility"
            className="act-input"
            name="visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as ActivityVisibility)}
          >
            {ACTIVITY_VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {VISIBILITY_INFO[v].label}
              </option>
            ))}
          </select>
          <p className="act-hint">{VISIBILITY_INFO[visibility].description}</p>
        </div>
        <div className="act-field">
          <label className="act-label" htmlFor="edit-organizer">
            Responsable
          </label>
          <select
            id="edit-organizer"
            className="act-input"
            name="organizerPersonId"
            value={fields.organizerPersonId}
            onChange={(e) => setField("organizerPersonId", e.target.value)}
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
        <label className="act-label" htmlFor="edit-location">
          Lugar
        </label>
        <input
          id="edit-location"
          className="act-input"
          name="locationText"
          maxLength={300}
          value={fields.locationText}
          onChange={(e) => setField("locationText", e.target.value)}
        />
      </div>

      {!seriesScope && canReadAdminNotes ? (
        <div className="act-field">
          <label className="act-label" htmlFor="edit-notes">
            Notas administrativas (no visibles para miembros)
          </label>
          <textarea id="edit-notes" className="act-input" name="adminNotes" value={fields.adminNotes} onChange={(e) => setField("adminNotes", e.target.value)} />
        </div>
      ) : null}

      {state.error ? (
        <p role="alert" className="act-error">
          {state.error}
        </p>
      ) : null}

      <div className="act-actions">
        <button type="submit" style={primaryButtonStyle(pending)} disabled={pending}>
          {pending ? "Guardando…" : seriesScope ? `Guardar (${SERIES_EDIT_SCOPE_LABELS[scope].toLowerCase()})` : "Guardar"}
        </button>
        <button type="button" style={secondaryButtonStyle()} disabled={pending} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
