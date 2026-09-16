"use client";

import { useActionState, useState } from "react";
import { Lock } from "lucide-react";
import { isActivityEditable } from "@/lib/activities/constants";
import type { ActivityCapabilities, ActivityDetail } from "@/server/activities/activities-service";
import { primaryButtonStyle } from "@/app/(app)/app/servicios/ui";
import { saveAdminNotesAction, type FichaActionState } from "../actions";

export default function NotasTab({
  activity,
  capabilities,
}: {
  activity: ActivityDetail;
  capabilities: ActivityCapabilities;
}) {
  const [notes, setNotes] = useState(activity.adminNotes ?? "");
  const [state, formAction, pending] = useActionState<FichaActionState, FormData>(
    (prev, formData) => saveAdminNotesAction(activity.id, prev, formData),
    { error: null },
  );

  if (!capabilities.readAdminNotes) {
    return (
      <div className="shell-card shell-empty-state" style={{ marginTop: 16 }}>
        <Lock size={18} aria-hidden="true" />
        <h3>Notas restringidas</h3>
        <p>Las notas administrativas solo las ven quienes gestionan esta actividad.</p>
      </div>
    );
  }

  const canEdit = capabilities.manage && isActivityEditable(activity.status);

  return (
    <section className="shell-card act-form-section" style={{ marginTop: 16 }}>
      <h2>Notas administrativas</h2>
      <p className="act-hint">No visibles para miembros ni para la audiencia de la actividad.</p>
      {canEdit ? (
        <form action={formAction} className="act-form" style={{ gap: 10 }}>
          {/* Solo se guardan si cambiaron respecto a lo leído (ver saveAdminNotesAction). */}
          <input type="hidden" name="adminNotesDirty" value={notes !== (activity.adminNotes ?? "") ? "1" : "0"} />
          <div className="act-field">
            <label className="act-label" htmlFor="notes-admin">
              Notas administrativas (no visibles para miembros)
            </label>
            <textarea
              id="notes-admin"
              className="act-input"
              name="adminNotes"
              rows={8}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {state.error ? (
            <p role="alert" className="act-error">
              {state.error}
            </p>
          ) : state.message ? (
            <p role="status" className="act-success">
              {state.message}
            </p>
          ) : null}
          <div>
            <button type="submit" style={primaryButtonStyle(pending)} disabled={pending}>
              {pending ? "Guardando…" : "Guardar notas"}
            </button>
          </div>
        </form>
      ) : activity.adminNotes ? (
        <p className="act-pre">{activity.adminNotes}</p>
      ) : (
        <p className="serving-meta">Sin notas.</p>
      )}
    </section>
  );
}
