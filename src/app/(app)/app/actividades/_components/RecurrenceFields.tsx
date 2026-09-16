"use client";

import { useState, useTransition } from "react";
import { Eye, Repeat } from "lucide-react";
import { RECURRENCE_LIMITS, WEEKDAY_LABELS, WEEK_OF_MONTH_LABELS } from "@/lib/activities/constants";
import { formatDateLong, formatTime, isoWeekdayOfKey, timeZoneAbbreviation } from "@/lib/activities/time";
import { secondaryButtonStyle } from "@/app/(app)/app/servicios/ui";
import type { PreviewState } from "../actions";
import { monthPartsOfKey, type RecurrenceValues } from "./form-values";

type Props = {
  idPrefix: string;
  value: RecurrenceValues;
  onChange: (next: RecurrenceValues) => void;
  /** Fecha de inicio "YYYY-MM-DD" para los valores automáticos. */
  startDate: string;
  previewAction: (formData: FormData) => Promise<PreviewState>;
  /** Sin interruptor "Repetir" (cambio de regla de una serie). */
  alwaysOn?: boolean;
};

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const WEEKS_OF_MONTH = [1, 2, 3, 4, 5, -1];

export default function RecurrenceFields({ idPrefix, value, onChange, startDate, previewAction, alwaysOn = false }: Props) {
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });
  const [previewPending, startPreview] = useTransition();
  const set = <K extends keyof RecurrenceValues>(key: K, v: RecurrenceValues[K]) => {
    setPreview({ status: "idle" });
    onChange({ ...value, [key]: v });
  };
  const id = (name: string) => `${idPrefix}-rec-${name}`;

  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate);
  const startWeekday = validStart ? isoWeekdayOfKey(startDate) : 1;
  const parts = validStart ? monthPartsOfKey(startDate) : null;
  const effectiveWeekdays = value.weekdays.length > 0 ? value.weekdays : [startWeekday];
  const effectiveMonthDay = value.monthDay || String(parts?.day ?? 1);
  const effectiveWeek = value.weekOfMonth || String(parts?.week ?? 1);
  const effectiveMonthWeekday = value.monthWeekday || String(startWeekday);
  const enabled = alwaysOn || value.enabled;
  const maxInterval = value.frequency === "weekly" ? RECURRENCE_LIMITS.maxWeeklyInterval : RECURRENCE_LIMITS.maxMonthlyInterval;

  function toggleWeekday(day: number) {
    const next = effectiveWeekdays.includes(day)
      ? effectiveWeekdays.filter((d) => d !== day)
      : [...effectiveWeekdays, day].sort((a, b) => a - b);
    set("weekdays", next.length > 0 ? next : [day]);
  }

  function runPreview(form: HTMLFormElement | null) {
    if (!form) return;
    const formData = new FormData(form);
    startPreview(async () => {
      setPreview(await previewAction(formData));
    });
  }

  return (
    <div className="act-form" style={{ gap: 14 }}>
      {alwaysOn ? (
        <input type="hidden" name="rec_enabled" value="on" />
      ) : (
        <label className={`act-check${value.enabled ? " is-checked" : ""}`} style={{ alignSelf: "flex-start" }}>
          <input
            type="checkbox"
            name="rec_enabled"
            checked={value.enabled}
            onChange={(e) => set("enabled", e.target.checked)}
          />
          <Repeat size={14} aria-hidden="true" />
          Repetir
        </label>
      )}

      {enabled ? (
        <>
          <div className="act-grid-2">
            <div className="act-field">
              <label className="act-label" htmlFor={id("frequency")}>
                Frecuencia
              </label>
              <select
                id={id("frequency")}
                className="act-input"
                name="rec_frequency"
                value={value.frequency}
                onChange={(e) => set("frequency", e.target.value === "monthly" ? "monthly" : "weekly")}
              >
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
              </select>
            </div>
            <div className="act-field">
              <label className="act-label" htmlFor={id("interval")}>
                {value.frequency === "weekly" ? "Cada cuántas semanas" : "Cada cuántos meses"}
              </label>
              <input
                id={id("interval")}
                className="act-input"
                type="number"
                name="rec_interval"
                min={1}
                max={maxInterval}
                required
                value={value.interval}
                onChange={(e) => set("interval", e.target.value)}
              />
              <p className="act-hint">
                {Number(value.interval) > 1
                  ? `Cada ${value.interval} ${value.frequency === "weekly" ? "semanas" : "meses"}.`
                  : value.frequency === "weekly"
                    ? "Todas las semanas."
                    : "Todos los meses."}
              </p>
            </div>
          </div>

          {value.frequency === "weekly" ? (
            <fieldset className="act-fieldset">
              <legend>Días de la semana</legend>
              <div className="act-weekdays">
                {WEEKDAYS.map((day) => (
                  <label key={day} className="act-weekday" title={WEEKDAY_LABELS[day].long}>
                    <input
                      type="checkbox"
                      name="rec_weekdays"
                      value={day}
                      checked={effectiveWeekdays.includes(day)}
                      onChange={() => toggleWeekday(day)}
                      aria-label={WEEKDAY_LABELS[day].long}
                    />
                    <span aria-hidden="true">{WEEKDAY_LABELS[day].short}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <fieldset className="act-fieldset">
              <legend>Día del mes</legend>
              <div className="act-radio-row">
                <label className={`act-check${value.monthlyMode === "day_of_month" ? " is-checked" : ""}`}>
                  <input
                    type="radio"
                    name="rec_monthly_mode"
                    value="day_of_month"
                    checked={value.monthlyMode === "day_of_month"}
                    onChange={() => set("monthlyMode", "day_of_month")}
                  />
                  Un día concreto
                </label>
                <label className={`act-check${value.monthlyMode === "nth_weekday" ? " is-checked" : ""}`}>
                  <input
                    type="radio"
                    name="rec_monthly_mode"
                    value="nth_weekday"
                    checked={value.monthlyMode === "nth_weekday"}
                    onChange={() => set("monthlyMode", "nth_weekday")}
                  />
                  Un día de la semana
                </label>
              </div>

              {value.monthlyMode === "day_of_month" ? (
                <div className="act-grid-2">
                  <div className="act-field">
                    <label className="act-label" htmlFor={id("monthDay")}>
                      Día
                    </label>
                    <select
                      id={id("monthDay")}
                      className="act-input"
                      name="rec_month_day"
                      value={effectiveMonthDay}
                      onChange={(e) => set("monthDay", e.target.value)}
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          Día {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  {Number(effectiveMonthDay) > 28 ? (
                    <div className="act-field">
                      <label className="act-label" htmlFor={id("fallback")}>
                        Meses sin ese día
                      </label>
                      <select
                        id={id("fallback")}
                        className="act-input"
                        name="rec_fallback"
                        value={value.fallback}
                        onChange={(e) => set("fallback", e.target.value === "last_day" ? "last_day" : "skip")}
                      >
                        <option value="skip">Omitir meses sin ese día</option>
                        <option value="last_day">Usar el último día del mes</option>
                      </select>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="act-grid-2">
                  <div className="act-field">
                    <label className="act-label" htmlFor={id("week")}>
                      Semana
                    </label>
                    <select
                      id={id("week")}
                      className="act-input"
                      name="rec_week_of_month"
                      value={effectiveWeek}
                      onChange={(e) => set("weekOfMonth", e.target.value)}
                    >
                      {WEEKS_OF_MONTH.map((w) => (
                        <option key={w} value={w}>
                          {WEEK_OF_MONTH_LABELS[w].charAt(0).toUpperCase() + WEEK_OF_MONTH_LABELS[w].slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="act-field">
                    <label className="act-label" htmlFor={id("monthWeekday")}>
                      Día de la semana
                    </label>
                    <select
                      id={id("monthWeekday")}
                      className="act-input"
                      name="rec_month_weekday"
                      value={effectiveMonthWeekday}
                      onChange={(e) => set("monthWeekday", e.target.value)}
                    >
                      {WEEKDAYS.map((d) => (
                        <option key={d} value={d}>
                          {WEEKDAY_LABELS[d].long}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </fieldset>
          )}

          <fieldset className="act-fieldset">
            <legend>Termina</legend>
            <div className="act-radio-row">
              <label className={`act-check${value.endKind === "count" ? " is-checked" : ""}`}>
                <input
                  type="radio"
                  name="rec_end"
                  value="count"
                  checked={value.endKind === "count"}
                  onChange={() => set("endKind", "count")}
                />
                Tras un número de veces
              </label>
              <label className={`act-check${value.endKind === "until" ? " is-checked" : ""}`}>
                <input
                  type="radio"
                  name="rec_end"
                  value="until"
                  checked={value.endKind === "until"}
                  onChange={() => set("endKind", "until")}
                />
                En una fecha
              </label>
            </div>
            {value.endKind === "count" ? (
              <div className="act-field" style={{ maxWidth: 240 }}>
                <label className="act-label" htmlFor={id("count")}>
                  Número de ocurrencias
                </label>
                <input
                  id={id("count")}
                  className="act-input"
                  type="number"
                  name="rec_count"
                  min={1}
                  max={RECURRENCE_LIMITS.maxOccurrences}
                  required
                  value={value.count}
                  onChange={(e) => set("count", e.target.value)}
                />
              </div>
            ) : (
              <div className="act-field" style={{ maxWidth: 240 }}>
                <label className="act-label" htmlFor={id("until")}>
                  Última fecha
                </label>
                <input
                  id={id("until")}
                  className="act-input"
                  type="date"
                  name="rec_until"
                  min={validStart ? startDate : undefined}
                  required
                  value={value.untilDate}
                  onChange={(e) => set("untilDate", e.target.value)}
                />
              </div>
            )}
            <p className="act-hint">
              Máximo {RECURRENCE_LIMITS.maxOccurrences} ocurrencias y 2 años desde la primera fecha. Cada fecha usa la
              hora local indicada, también en los cambios de horario de verano.
            </p>
          </fieldset>

          <div className="act-preview">
            <div>
              <button
                type="button"
                style={secondaryButtonStyle(previewPending)}
                disabled={previewPending}
                onClick={(e) => runPreview(e.currentTarget.form)}
              >
                <Eye size={14} aria-hidden="true" />
                {previewPending ? "Calculando…" : "Vista previa"}
              </button>
            </div>
            <div aria-live="polite">
              {preview.status === "error" ? (
                <p role="alert" className="act-error">
                  {preview.error}
                </p>
              ) : null}
              {preview.status === "ok" ? (
                preview.items.length === 0 ? (
                  <p className="act-hint">La regla no genera ninguna fecha.</p>
                ) : (
                  <>
                    <p className="act-hint">
                      {preview.items.length} ocurrencia{preview.items.length === 1 ? "" : "s"} · zona {preview.timezone} ·
                      máximo {RECURRENCE_LIMITS.maxOccurrences} ocurrencias / 2 años
                    </p>
                    <ol className="act-preview-list">
                      {preview.items.map((item) => (
                        <li key={item.occurrenceDate}>
                          <span>{formatDateLong(item.startsAt, preview.timezone)}</span>
                          <span>
                            {formatTime(item.startsAt, preview.timezone)}–{formatTime(item.endsAt, preview.timezone)}
                            <span className="act-tz">{timeZoneAbbreviation(item.startsAt, preview.timezone)}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </>
                )
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
