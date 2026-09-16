"use client";

import { AlertTriangle, History, Lock } from "lucide-react";
import { formatDateShort, formatTime } from "@/lib/activities/time";
import type { ActivityHistoryEntry } from "@/server/activities/activities-service";
import { ACTIVITY_STATUS_INFO, isActivityStatus } from "@/lib/activities/constants";
import { HISTORY_ACTION_LABELS } from "../../_components/describe";
import type { HistoryData } from "./ActivityFicha";

/** Autor visible: "Sistema" solo si no hay persona; si la RLS la oculta, "Persona no visible". */
function actorLabel(entry: ActivityHistoryEntry): string {
  if (entry.actorPersonId === null) return "Sistema";
  return entry.actorName || "Persona no visible";
}

function detail(entry: ActivityHistoryEntry): string | null {
  const m = entry.metadata;
  if (typeof m.from === "string" && typeof m.to === "string" && isActivityStatus(m.from) && isActivityStatus(m.to)) {
    return `${ACTIVITY_STATUS_INFO[m.from].label} → ${ACTIVITY_STATUS_INFO[m.to].label}`;
  }
  if (m.scope === "series_rule") return "Cambio de repetición de la serie";
  if (m.scope === "future") return "Esta y las siguientes ocurrencias";
  if (m.scope === "all") return "Toda la serie";
  return null;
}

export default function HistorialTab({
  history,
  timezone,
}: {
  history: HistoryData;
  timezone: string;
}) {
  if (!history.canRead) {
    return (
      <div className="shell-card shell-empty-state" style={{ marginTop: 16 }}>
        <Lock size={18} aria-hidden="true" />
        <h3>Historial no disponible</h3>
        <p>Consultar el historial de cambios requiere permiso de auditoría.</p>
      </div>
    );
  }

  if (history.error) {
    return (
      <div className="shell-card shell-empty-state" role="alert" style={{ marginTop: 16 }}>
        <AlertTriangle size={18} aria-hidden="true" />
        <h3>No se pudo cargar el historial</h3>
        <p>Recarga la página para intentarlo de nuevo.</p>
      </div>
    );
  }

  if (history.entries.length === 0) {
    return (
      <div className="shell-card shell-empty-state" style={{ marginTop: 16 }}>
        <History size={18} aria-hidden="true" />
        <h3>Sin registros</h3>
        <p>Todavía no hay cambios registrados para esta actividad.</p>
      </div>
    );
  }

  return (
    <section className="shell-card list-card" style={{ marginTop: 16 }}>
      <div className="list-card-header">
        <h2>Historial</h2>
      </div>
      <ul className="act-list">
        {history.entries.map((entry) => {
          const extra = detail(entry);
          return (
            <li key={entry.id}>
              <span>
                <strong style={{ fontWeight: 600 }}>{HISTORY_ACTION_LABELS[entry.action] ?? entry.action}</strong>
                {extra ? <span className="serving-meta"> · {extra}</span> : null}
                <span className="serving-meta"> · {actorLabel(entry)}</span>
              </span>
              <time dateTime={entry.createdAt} className="serving-meta">
                {formatDateShort(entry.createdAt, timezone)} {formatTime(entry.createdAt, timezone)}
              </time>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
