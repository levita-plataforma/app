"use client";

import { useActionState, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { localDateKey, localTimeValue } from "@/lib/activities/time";
import type { ActivityDetail } from "@/server/activities/activities-service";
import { primaryButtonStyle, secondaryButtonStyle } from "@/app/(app)/app/servicios/ui";
import { duplicateActivityAction, type FichaActionState } from "../actions";

export default function DuplicateForm({ activity }: { activity: ActivityDetail }) {
  const [open, setOpen] = useState(false);
  const requestIdRef = useRef<string | null>(null);
  const [state, formAction, pending] = useActionState<FichaActionState, FormData>(async (prev, formData) => {
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    formData.set("requestId", requestIdRef.current);
    return duplicateActivityAction(activity.id, prev, formData);
  }, { error: null });

  const timed = activity.scheduleKind === "timed" && activity.startsAt;

  if (!open) {
    return (
      <div>
        <button type="button" style={secondaryButtonStyle()} onClick={() => setOpen(true)} aria-expanded={false}>
          <Copy size={14} aria-hidden="true" /> Duplicar
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="act-dialog" aria-label="Duplicar actividad">
      <p style={{ fontSize: 13, fontWeight: 600 }}>Duplicar como nuevo borrador</p>
      <p className="act-hint">
        Se copian los datos, la estructura y el orden. No se copian el estado, la cancelación ni el historial.
      </p>
      <div className="act-grid-3">
        <div className="act-field">
          <label className="act-label" htmlFor="dup-title">
            Título
          </label>
          <input id="dup-title" className="act-input" name="title" defaultValue={activity.title} maxLength={200} />
        </div>
        {timed ? (
          <>
            <div className="act-field">
              <label className="act-label" htmlFor="dup-date">
                Fecha
              </label>
              <input
                id="dup-date"
                className="act-input"
                type="date"
                name="newDate"
                defaultValue={localDateKey(activity.startsAt!, activity.timezone)}
              />
            </div>
            <div className="act-field">
              <label className="act-label" htmlFor="dup-time">
                Hora de inicio
              </label>
              <input
                id="dup-time"
                className="act-input"
                type="time"
                name="newTime"
                defaultValue={localTimeValue(activity.startsAt!, activity.timezone)}
              />
            </div>
          </>
        ) : null}
      </div>
      {timed ? (
        <p className="act-hint">
          Fecha y hora locales en {activity.timezone}. Se mantiene la duración del original.
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="act-error">
          {state.error}
        </p>
      ) : null}
      <div className="act-actions">
        <button type="submit" style={primaryButtonStyle(pending)} disabled={pending}>
          {pending ? "Duplicando…" : "Duplicar"}
        </button>
        <button type="button" style={secondaryButtonStyle()} disabled={pending} onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
