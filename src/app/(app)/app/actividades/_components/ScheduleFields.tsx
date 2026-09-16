"use client";

import { SCHEDULE_KIND_LABELS } from "@/lib/activities/constants";
import type { ScheduleValues } from "./form-values";

type Props = {
  idPrefix: string;
  value: ScheduleValues;
  onChange: (next: ScheduleValues) => void;
  flexibleAllowed: boolean;
  /** Solo hora y duración (edición de serie: sin fechas). */
  timeOnly?: boolean;
};

/**
 * Horario de una actividad. Envía valores LOCALES (fecha, hora, duración);
 * la base de datos los convierte a instantes en la zona de la actividad.
 */
export default function ScheduleFields({ idPrefix, value, onChange, flexibleAllowed, timeOnly = false }: Props) {
  const set = <K extends keyof ScheduleValues>(key: K, v: ScheduleValues[K]) => onChange({ ...value, [key]: v });
  const id = (name: string) => `${idPrefix}-${name}`;
  const kind = flexibleAllowed ? value.scheduleKind : "timed";

  if (timeOnly) {
    return (
      <div className="act-grid-2">
        <div className="act-field">
          <label className="act-label" htmlFor={id("startTime")}>
            Hora de inicio
          </label>
          <input
            id={id("startTime")}
            className="act-input"
            type="time"
            name="startTime"
            required
            value={value.startTime}
            onChange={(e) => set("startTime", e.target.value)}
          />
        </div>
        <div className="act-field">
          <label className="act-label" htmlFor={id("duration")}>
            Duración (minutos)
          </label>
          <input
            id={id("duration")}
            className="act-input"
            type="number"
            min={1}
            name="durationMinutes"
            required
            value={value.durationMinutes}
            onChange={(e) => set("durationMinutes", e.target.value)}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <fieldset className="act-fieldset">
        <legend>Horario</legend>
        <div className="act-radio-row">
          {(["timed", "flexible"] as const).map((k) => {
            const disabled = k === "flexible" && !flexibleAllowed;
            return (
              <label key={k} className={`act-check${kind === k ? " is-checked" : ""}${disabled ? " is-disabled" : ""}`}>
                <input
                  type="radio"
                  name="scheduleKind"
                  value={k}
                  checked={kind === k}
                  disabled={disabled}
                  onChange={() => set("scheduleKind", k)}
                />
                {SCHEDULE_KIND_LABELS[k]}
              </label>
            );
          })}
        </div>
        <p className="act-hint">
          {flexibleAllowed
            ? "Las tareas pueden no tener hora fija: se muestran aparte, con una ventana opcional de fechas."
            : "Solo las tareas pueden no tener hora fija."}
        </p>
      </fieldset>

      {kind === "flexible" ? (
        <div className="act-grid-2">
          <div className="act-field">
            <label className="act-label" htmlFor={id("windowStart")}>
              Desde (opcional)
            </label>
            <input
              id={id("windowStart")}
              className="act-input"
              type="date"
              name="windowStart"
              value={value.windowStart}
              onChange={(e) => set("windowStart", e.target.value)}
            />
          </div>
          <div className="act-field">
            <label className="act-label" htmlFor={id("windowEnd")}>
              Hasta (opcional)
            </label>
            <input
              id={id("windowEnd")}
              className="act-input"
              type="date"
              name="windowEnd"
              min={value.windowStart || undefined}
              value={value.windowEnd}
              onChange={(e) => set("windowEnd", e.target.value)}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="act-grid-2">
            <div className="act-field">
              <label className="act-label" htmlFor={id("startDate")}>
                Fecha
              </label>
              <input
                id={id("startDate")}
                className="act-input"
                type="date"
                name="startDate"
                required
                value={value.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </div>
            <div className="act-field">
              <label className="act-label" htmlFor={id("startTime")}>
                Hora de inicio
              </label>
              <input
                id={id("startTime")}
                className="act-input"
                type="time"
                name="startTime"
                required
                value={value.startTime}
                onChange={(e) => set("startTime", e.target.value)}
              />
            </div>
          </div>

          <fieldset className="act-fieldset">
            <legend>Fin</legend>
            <div className="act-radio-row">
              <label className={`act-check${value.endMode === "duration" ? " is-checked" : ""}`}>
                <input
                  type="radio"
                  name="endMode"
                  value="duration"
                  checked={value.endMode === "duration"}
                  onChange={() => set("endMode", "duration")}
                />
                Duración
              </label>
              <label className={`act-check${value.endMode === "end" ? " is-checked" : ""}`}>
                <input
                  type="radio"
                  name="endMode"
                  value="end"
                  checked={value.endMode === "end"}
                  onChange={() => set("endMode", "end")}
                />
                Hora de fin
              </label>
            </div>
          </fieldset>

          {value.endMode === "duration" ? (
            <div className="act-field" style={{ maxWidth: 240 }}>
              <label className="act-label" htmlFor={id("duration")}>
                Duración (minutos)
              </label>
              <input
                id={id("duration")}
                className="act-input"
                type="number"
                min={1}
                step={5}
                name="durationMinutes"
                required
                value={value.durationMinutes}
                onChange={(e) => set("durationMinutes", e.target.value)}
              />
            </div>
          ) : (
            <div className="act-grid-2">
              <div className="act-field">
                <label className="act-label" htmlFor={id("endDate")}>
                  Fecha de fin
                </label>
                <input
                  id={id("endDate")}
                  className="act-input"
                  type="date"
                  name="endDate"
                  min={value.startDate || undefined}
                  value={value.endDate || value.startDate}
                  onChange={(e) => set("endDate", e.target.value)}
                />
              </div>
              <div className="act-field">
                <label className="act-label" htmlFor={id("endTime")}>
                  Hora de fin
                </label>
                <input
                  id={id("endTime")}
                  className="act-input"
                  type="time"
                  name="endTime"
                  required
                  value={value.endTime}
                  onChange={(e) => set("endTime", e.target.value)}
                />
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
