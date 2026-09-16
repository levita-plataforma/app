"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { availableTransitions, type TransitionAction } from "@/lib/activities/constants";
import type { ActivityCapabilities, ActivityDetail } from "@/server/activities/activities-service";
import { primaryButtonStyle, secondaryButtonStyle } from "@/app/(app)/app/servicios/ui";
import { transitionActivityAction } from "../actions";

type Props = {
  activity: ActivityDetail;
  capabilities: ActivityCapabilities;
  blockingIssues: number;
  onShowIssues: () => void;
};

const dangerButtonStyle = (pending: boolean): React.CSSProperties => ({
  ...secondaryButtonStyle(pending),
  color: "var(--shell-danger)",
});

export default function StatusActions({ activity, capabilities, blockingIssues, onShowIssues }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<TransitionAction | null>(null);
  const [reason, setReason] = useState("");

  const actions = availableTransitions(activity.status, activity.statusBeforeArchive).filter(
    (a) => capabilities[a.capability],
  );
  if (actions.length === 0) return null;

  function run(action: TransitionAction, withReason?: string) {
    setError(null);
    startTransition(async () => {
      const result = await transitionActivityAction(activity.id, action.to, withReason ?? null);
      if (result.error) {
        setError(result.error);
      } else {
        setConfirming(null);
        setReason("");
      }
    });
  }

  function onClick(action: TransitionAction) {
    if (action.asksReason || action.destructive) {
      setConfirming(action);
      setError(null);
      return;
    }
    run(action);
  }

  return (
    <div className="act-form" style={{ gap: 10 }}>
      <div className="act-actions">
        {actions.map((action) => (
          <button
            key={`${action.to}-${action.label}`}
            type="button"
            disabled={pending}
            onClick={() => onClick(action)}
            style={
              action.to === "published" && action.label === "Publicar"
                ? primaryButtonStyle(pending)
                : action.destructive
                  ? dangerButtonStyle(pending)
                  : secondaryButtonStyle(pending)
            }
            aria-expanded={action.asksReason || action.destructive ? confirming?.to === action.to : undefined}
          >
            {action.label}
          </button>
        ))}
      </div>

      {blockingIssues > 0 && actions.some((a) => a.to === "published" && a.label === "Publicar") ? (
        <p className="act-hint" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <AlertTriangle size={13} aria-hidden="true" style={{ color: "var(--shell-danger)" }} />
          No se puede publicar: hay {blockingIssues} incidencia{blockingIssues === 1 ? "" : "s"} bloqueante
          {blockingIssues === 1 ? "" : "s"} en la estructura.{" "}
          <button type="button" className="act-link-button" onClick={onShowIssues}>
            Ver incidencias
          </button>
        </p>
      ) : null}

      {confirming ? (
        <div className="act-dialog" role="group" aria-label={`Confirmar: ${confirming.label}`}>
          {confirming.asksReason ? (
            <div className="act-field">
              <label className="act-label" htmlFor="act-cancel-reason">
                Motivo de la cancelación (opcional)
              </label>
              <textarea
                id="act-cancel-reason"
                className="act-input"
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="act-hint">
                {reason.length}/500. La actividad se conserva en el histórico y podrá reactivarse como borrador.
              </p>
            </div>
          ) : (
            <p style={{ fontSize: 13 }}>
              {confirming.to === "archived"
                ? "La actividad se ocultará de los listados por defecto. Podrás desarchivarla después."
                : `¿Confirmas «${confirming.label}»?`}
            </p>
          )}
          <div className="act-actions">
            <button
              type="button"
              disabled={pending}
              style={dangerButtonStyle(pending)}
              onClick={() => run(confirming, confirming.asksReason ? reason.trim() || undefined : undefined)}
            >
              {pending ? "Aplicando…" : `Sí, ${confirming.label.toLowerCase()}`}
            </button>
            <button type="button" disabled={pending} style={secondaryButtonStyle()} onClick={() => setConfirming(null)}>
              No, volver
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="act-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
