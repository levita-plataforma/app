"use client";

import { useActionState, useState } from "react";
import type { ActivityDetail, ActivitySeriesInfo } from "@/server/activities/activities-service";
import { primaryButtonStyle, secondaryButtonStyle } from "@/app/(app)/app/servicios/ui";
import RecurrenceFields from "../../_components/RecurrenceFields";
import { formatDateKey } from "../../_components/describe";
import type { RecurrenceValues } from "../../_components/form-values";
import { previewRecurrenceAction } from "../../actions";
import { changeSeriesRuleAction, type FichaActionState } from "../actions";

type Props = {
  activity: ActivityDetail & { series: ActivitySeriesInfo };
  onCancel: () => void;
  onSaved: (message: string) => void;
};

function initialRule(series: ActivitySeriesInfo): RecurrenceValues {
  return {
    enabled: true,
    frequency: series.frequency,
    interval: String(series.intervalCount || 1),
    weekdays: series.weekdays ?? [],
    monthlyMode: series.monthlyMode ?? "day_of_month",
    monthDay: series.monthDay ? String(series.monthDay) : "",
    fallback: series.monthDayFallback,
    weekOfMonth: series.weekOfMonth ? String(series.weekOfMonth) : "",
    monthWeekday: series.monthWeekday ? String(series.monthWeekday) : "",
    endKind: series.untilDate ? "until" : "count",
    untilDate: series.untilDate ?? "",
    count: String(series.occurrenceCount ?? 10),
  };
}

/** Cambia la regla de repetición a partir de esta ocurrencia. */
export default function SeriesRuleForm({ activity, onCancel, onSaved }: Props) {
  const { series } = activity;
  const [rule, setRule] = useState<RecurrenceValues>(() => initialRule(series));
  const startDate = activity.occurrenceDate ?? series.startsOn;

  const [state, formAction, pending] = useActionState<FichaActionState, FormData>(async (prev, formData) => {
    const result = await changeSeriesRuleAction(activity.id, prev, formData);
    if (!result.error) onSaved(result.message ?? "Repetición actualizada.");
    return result;
  }, { error: null });

  return (
    <form action={formAction} className="shell-card act-form-section" aria-label="Cambiar repetición">
      <h2>Cambiar repetición</h2>
      <div className="act-notice is-info">
        <div>
          La nueva regla se aplica desde esta ocurrencia ({formatDateKey(startDate)}) a las {series.localStartTime} (
          {series.timezone}). El número de ocurrencias se cuenta desde esta fecha.
          <ul>
            <li>Se crean las fechas nuevas copiando la estructura de esta ocurrencia.</li>
            <li>Las excepciones, las ocurrencias pasadas y las completadas o canceladas se conservan.</li>
            <li>Los borradores y planificadas que ya no encajen se eliminan; las publicadas se cancelan.</li>
          </ul>
        </div>
      </div>

      {/* Contexto para la vista previa (misma hora local y duración de la serie). */}
      <input type="hidden" name="scheduleKind" value="timed" />
      <input type="hidden" name="startDate" value={startDate} />
      <input type="hidden" name="startTime" value={series.localStartTime} />
      <input type="hidden" name="endMode" value="duration" />
      <input type="hidden" name="durationMinutes" value={series.durationMinutes} />
      <input type="hidden" name="timezone" value={series.timezone} />

      <RecurrenceFields
        idPrefix="rule"
        value={rule}
        onChange={setRule}
        startDate={startDate}
        previewAction={previewRecurrenceAction}
        alwaysOn
      />

      {state.error ? (
        <p role="alert" className="act-error">
          {state.error}
        </p>
      ) : null}

      <div className="act-actions">
        <button type="submit" style={primaryButtonStyle(pending)} disabled={pending}>
          {pending ? "Aplicando…" : "Aplicar nueva repetición"}
        </button>
        <button type="button" style={secondaryButtonStyle()} disabled={pending} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
