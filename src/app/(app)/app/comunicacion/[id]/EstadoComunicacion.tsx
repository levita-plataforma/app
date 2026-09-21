"use client";

import { useState, useTransition } from "react";
import { secondaryButtonStyle } from "../ui";
import { cancelarComunicacionAction, recuperarComunicacionAction } from "./actions";
import type {
  CommunicationDetail,
  CommunicationMetrics,
  CommunicationStatus,
} from "@/server/communications/communications-service";

export type NameLookup = {
  campuses: Record<string, string>;
  tags: Record<string, string>;
  serviceAreas: Record<string, string>;
};

export type AuditEntry = {
  id: string;
  action: string;
  created_at: string;
  metadata: Record<string, unknown>;
  actor_person_id: string | null;
};

const STATUS_LABELS: Record<CommunicationStatus, string> = {
  draft: "Borrador",
  scheduled: "Programada",
  processing: "Procesando",
  queued: "En cola, sin enviar",
  sent: "Enviada",
  partially_sent: "Enviada parcialmente",
  failed: "Fallida",
  failed_to_process: "No se pudo preparar",
  cancelled: "Cancelada",
};

const STATUS_CHIP_CLASS: Record<CommunicationStatus, string> = {
  draft: "is-muted",
  scheduled: "is-info",
  processing: "is-warning",
  // En cola no se pinta como exito: el correo no ha salido, y no saldra
  // mientras el transporte externo siga desactivado.
  queued: "is-warning",
  sent: "is-success",
  partially_sent: "is-partial",
  failed: "is-danger",
  failed_to_process: "is-danger",
  cancelled: "is-muted",
};

const PURPOSE_LABELS: Record<string, string> = {
  institutional: "Institucional",
  operational: "Operativa",
};

const CHANNEL_LABELS: Record<string, string> = {
  email: "Correo",
  push: "Notificación push",
  inapp: "En la app",
};

const OPERATOR_LABELS: Record<string, string> = {
  eq: "es",
  in: "es uno de",
  contains: "incluye",
  contains_any: "incluye alguna de",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "communication.created": "Comunicación creada",
  "communication.materialized": "Destinatarios materializados",
  "communication.sent": "Comunicación enviada",
  "communication.scheduled": "Comunicación programada",
  "communication.cancelled": "Comunicación cancelada",
  "communication.reset": "Devuelta a borrador para corregirla",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

function describeCondition(field: string, op: string, value: unknown, lookup: NameLookup): string {
  const values = Array.isArray(value) ? value : [value];

  function resolveOne(v: unknown): string {
    if (typeof v !== "string") return String(v);
    if (field === "campus_id") return lookup.campuses[v] ?? v;
    if (field === "tags") return lookup.tags[v] ?? v;
    if (field === "service_area_id") return lookup.serviceAreas[v] ?? v;
    if (field === "relationship") return RELATIONSHIP_LABELS[v] ?? v;
    if (field === "channel_available") return CHANNEL_LABELS[v] ?? v;
    return v;
  }

  const label = FIELD_LABELS[field] ?? field;
  const opLabel = OPERATOR_LABELS[op] ?? op;
  const resolvedValues = values.map(resolveOne).join(" o ");

  return `${label} ${opLabel} ${resolvedValues}`;
}

const FIELD_LABELS: Record<string, string> = {
  campus_id: "Sede",
  tags: "Etiqueta",
  relationship: "Relación",
  service_area_id: "Área de servicio",
  channel_available: "Canal disponible",
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  visitor: "Visitante",
  connected: "Conectado",
  member: "Miembro",
  server: "Voluntario",
  leader: "Líder",
  external: "Externo",
  inactive: "Inactivo",
};

export default function EstadoComunicacion({
  communication,
  creatorName,
  nameLookup,
  metrics,
  canReadMetrics,
  canSchedule,
  auditEntries,
}: {
  communication: CommunicationDetail;
  creatorName: string | null;
  nameLookup: NameLookup;
  metrics: CommunicationMetrics | null;
  canReadMetrics: boolean;
  canSchedule: boolean;
  auditEntries: AuditEntry[];
}) {
  const [cancelPending, startCancel] = useTransition();
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [resetPending, startReset] = useTransition();
  const [resetError, setResetError] = useState<string | null>(null);

  const canCancel = canSchedule && (communication.status === "draft" || communication.status === "scheduled");
  const canReset = canSchedule && communication.status === "failed_to_process";

  function handleCancel() {
    setCancelError(null);
    startCancel(async () => {
      const result = await cancelarComunicacionAction(communication.id);
      if (result.error) setCancelError(result.error);
    });
  }

  function handleReset() {
    setResetError(null);
    startReset(async () => {
      const result = await recuperarComunicacionAction(communication.id);
      if (result.error) setResetError(result.error);
    });
  }

  const snapshot = communication.segmentRulesSnapshot;
  const segmentMode = snapshot && "any" in snapshot && snapshot.any ? "any" : "all";
  const conditions = snapshot ? (segmentMode === "any" ? snapshot.any ?? [] : snapshot.all ?? []) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 21, fontWeight: 600 }}>{communication.title}</h1>
          <span className={`serving-chip ${STATUS_CHIP_CLASS[communication.status]}`}>
            {STATUS_LABELS[communication.status]}
          </span>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 4 }}>
          {PURPOSE_LABELS[communication.purpose] ?? communication.purpose} · Creado el {formatDateTime(communication.createdAt)}
          {creatorName ? ` por ${creatorName}` : ""}
        </p>
      </section>

      {cancelError ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {cancelError}
        </p>
      ) : null}

      {/*
        Una comunicación que no se pudo preparar no llegó a nadie y ya no está en
        la cola, así que no bloquea a las demás. Lo que hace falta es que quien la
        escribió vea por qué y pueda corregirla: sin esto, el estado sería un
        callejón sin salida.
      */}
      {communication.status === "failed_to_process" ? (
        <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--shell-danger)" }}>
            No se pudieron calcular los destinatarios
          </p>
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
            No se ha enviado a nadie y no ha bloqueado al resto de comunicaciones. Casi siempre es una condición de
            audiencia que apunta a un campo que ya no existe.
          </p>
          {communication.processingError ? (
            <p style={{ fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
              {communication.processingError}
            </p>
          ) : null}
          {canReset ? (
            <div>
              <button type="button" onClick={handleReset} disabled={resetPending} style={secondaryButtonStyle(resetPending)}>
                {resetPending ? "Devolviendo a borrador…" : "Devolver a borrador para corregirla"}
              </button>
              <p style={{ fontSize: 11.5, color: "var(--shell-text-muted)", marginTop: 6 }}>
                Corrige la audiencia antes de volver a programarla: si no, acabará igual.
              </p>
            </div>
          ) : null}
          {resetError ? (
            <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
              {resetError}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>Contenido</p>
        {communication.subject ? (
          <div>
            <p style={{ fontSize: 11.5, fontWeight: 600, color: "var(--shell-text-muted)" }}>Asunto</p>
            <p style={{ fontSize: 13.5 }}>{communication.subject}</p>
          </div>
        ) : null}
        <div>
          <p style={{ fontSize: 11.5, fontWeight: 600, color: "var(--shell-text-muted)" }}>Cuerpo (plantilla)</p>
          <p style={{ fontSize: 13.5, whiteSpace: "pre-wrap" }}>{communication.bodyTemplate}</p>
        </div>
      </section>

      <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>Audiencia</p>
        {conditions.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>Sin condiciones registradas.</p>
        ) : (
          <>
            {conditions.length > 1 ? (
              <p style={{ fontSize: 11.5, color: "var(--shell-text-muted)" }}>
                {segmentMode === "any" ? "Cumple alguna condición (O)" : "Cumple todas las condiciones (Y)"}
              </p>
            ) : null}
            <ul style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {conditions.map((c, i) => (
                <li key={i} style={{ fontSize: 12.5 }}>
                  {describeCondition(c.field, c.op, c.value, nameLookup)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>Canales</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {communication.channels.map((c) => (
            <span key={c} className="serving-chip is-muted">
              {CHANNEL_LABELS[c] ?? c}
            </span>
          ))}
        </div>
        {communication.channels.some((c) => c === "email" || c === "push") ? (
          <p style={{ fontSize: 11.5, color: "var(--shell-text-muted)" }}>
            Correo y notificación push quedan en cola: todavía no hay proveedor externo conectado, no se entregan
            fuera de LEVITA.
          </p>
        ) : null}
      </section>

      {communication.scheduledAt ? (
        <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontSize: 13, fontWeight: 600 }}>Programación</p>
          <p style={{ fontSize: 13.5 }}>{formatDateTime(communication.scheduledAt)}</p>
        </section>
      ) : null}

      <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>Métricas de entrega</p>
        {!canReadMetrics ? (
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>No tienes permiso para ver métricas de entrega.</p>
        ) : !communication.materializedAt ? (
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
            Todavía no se han materializado destinatarios para esta comunicación.
          </p>
        ) : !metrics ? (
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>No se pudieron cargar las métricas.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 13.5, fontWeight: 600 }}>{metrics.total} destinatario{metrics.total === 1 ? "" : "s"} en total</p>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {communication.channels.map((channel) => {
                const byStatus = metrics.byChannel[channel] ?? {};
                const entries = Object.entries(byStatus);
                return (
                  <div key={channel} style={{ minWidth: 140 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{CHANNEL_LABELS[channel] ?? channel}</p>
                    {entries.length === 0 ? (
                      <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)" }}>Sin datos</p>
                    ) : (
                      <ul style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {entries.map(([status, count]) => (
                          <li key={status} style={{ fontSize: 11.5, color: "var(--shell-text-muted)" }}>
                            {status}: {count}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {canCancel ? (
        <div>
          <button type="button" onClick={handleCancel} disabled={cancelPending} style={secondaryButtonStyle(cancelPending)}>
            {cancelPending ? "Cancelando…" : "Cancelar comunicación"}
          </button>
        </div>
      ) : null}

      {auditEntries.length > 0 ? (
        <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 600 }}>Historial</p>
          <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {auditEntries.map((entry) => (
              <li key={entry.id} style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span>{AUDIT_ACTION_LABELS[entry.action] ?? entry.action}</span>
                <span style={{ color: "var(--shell-text-muted)" }}>{formatDateTime(entry.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
