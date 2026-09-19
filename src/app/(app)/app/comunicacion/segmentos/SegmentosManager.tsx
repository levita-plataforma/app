"use client";

import { useActionState, useState, useTransition } from "react";
import {
  crearSegmentoAction,
  archivarSegmentoAction,
  previsualizarSegmentoAction,
  type SegmentosState,
} from "./actions";
import SegmentoRuleBuilder, { getRuleConditions, type SegmentRules, type SegmentOption } from "./SegmentoRuleBuilder";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import { primaryButtonStyle, secondaryButtonStyle } from "../ui";
import type { CommunicationSegment, SegmentPreview } from "@/server/communications/communications-service";

const initialState: SegmentosState = { error: null };
const EMPTY_RULES: SegmentRules = { all: [] };

const fieldWrapStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };

const EXCLUSION_REASON_LABELS: Record<string, string> = {
  sin_email: "Sin correo registrado",
  sin_push: "Sin dispositivo con notificaciones push",
  preferencia_desactivada: "Canal desactivado en sus preferencias",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("es-ES");
}

function countSegmentConditions(rules: CommunicationSegment["rules"]): number {
  return "any" in rules && rules.any ? rules.any.length : rules.all?.length ?? 0;
}

export default function SegmentosManager({
  churchId,
  segments,
  canManage,
  campuses,
  tags,
  serviceAreas,
}: {
  churchId: string;
  segments: CommunicationSegment[];
  canManage: boolean;
  campuses: SegmentOption[];
  tags: SegmentOption[];
  serviceAreas: SegmentOption[];
}) {
  const [state, formAction, pending] = useActionState(crearSegmentoAction, initialState);
  const [archivePending, startTransition] = useTransition();
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [rules, setRules] = useState<SegmentRules>(EMPTY_RULES);
  const [preview, setPreview] = useState<SegmentPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPending, startPreview] = useTransition();

  function handleArchive(segmentId: string) {
    startTransition(async () => {
      const result = await archivarSegmentoAction(segmentId);
      setArchiveError(result.error);
    });
  }

  function handlePreview() {
    setPreviewError(null);
    startPreview(async () => {
      const result = await previsualizarSegmentoAction(churchId, rules, ["email", "push", "inapp"]);
      if (result.error) {
        setPreviewError(result.error);
        setPreview(null);
      } else {
        setPreview(result.preview);
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {archiveError ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {archiveError}
        </p>
      ) : null}

      <section className="shell-card" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Segmentos</h2>

        {segments.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "24px 16px" }}>
            <p style={{ fontWeight: 600 }}>No hay segmentos creados.</p>
          </div>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {segments.map((segment) => (
              <li
                key={segment.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: "var(--shell-radius-sm)",
                  border: "1px solid var(--shell-border)",
                }}
              >
                <div>
                  <p style={{ fontSize: 13.5, fontWeight: 600 }}>{segment.name}</p>
                  <p style={{ fontSize: 12, color: "var(--shell-text-muted)", marginTop: 2 }}>
                    {segment.description ? `${segment.description} · ` : ""}
                    {countSegmentConditions(segment.rules)} condición
                    {countSegmentConditions(segment.rules) === 1 ? "" : "es"} ·{" "}
                    {formatDate(segment.createdAt)}
                  </p>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    disabled={archivePending}
                    onClick={() => handleArchive(segment.id)}
                    style={{
                      fontSize: 11.5,
                      color: "var(--shell-text-subtle)",
                      background: "none",
                      border: "none",
                      cursor: archivePending ? "wait" : "pointer",
                      flexShrink: 0,
                    }}
                  >
                    Archivar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage ? (
        <form
          action={(formData) => {
            formData.set("rules", JSON.stringify(rules));
            formAction(formData);
          }}
          className="shell-card"
          style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}
          noValidate
        >
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Nuevo segmento</h2>

          <div style={fieldWrapStyle}>
            <label htmlFor="segment-name" style={authLabelStyle}>
              Nombre
            </label>
            <input
              id="segment-name"
              name="name"
              required
              style={{ ...authInputStyle, minHeight: 44 }}
              placeholder="Miembros de la sede norte"
            />
          </div>

          <div style={fieldWrapStyle}>
            <label htmlFor="segment-description" style={authLabelStyle}>
              Descripción (opcional)
            </label>
            <input id="segment-description" name="description" style={{ ...authInputStyle, minHeight: 44 }} />
          </div>

          <div style={fieldWrapStyle}>
            <span style={authLabelStyle}>Condiciones</span>
            <SegmentoRuleBuilder value={rules} onChange={setRules} campuses={campuses} tags={tags} serviceAreas={serviceAreas} />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewPending || getRuleConditions(rules).conditions.length === 0}
              style={secondaryButtonStyle(previewPending)}
            >
              {previewPending ? "Calculando…" : "Ver destinatarios estimados"}
            </button>
          </div>

          {previewError ? (
            <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
              {previewError}
            </p>
          ) : null}

          {preview ? (
            <div
              className="shell-card"
              style={{ padding: 16, background: "var(--shell-bg)", display: "flex", flexDirection: "column", gap: 8 }}
            >
              <p style={{ fontSize: 13.5, fontWeight: 600 }}>
                {preview.total} persona{preview.total === 1 ? "" : "s"} coincide{preview.total === 1 ? "" : "n"} con este
                segmento
              </p>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, color: "var(--shell-text-muted)" }}>
                <span>Correo: {preview.byChannel.email ?? 0}</span>
                <span>Push: {preview.byChannel.push ?? 0}</span>
                <span>En la app: {preview.byChannel.inapp ?? 0}</span>
              </div>
              {preview.excluded.length > 0 ? (
                <div style={{ fontSize: 12, color: "var(--shell-text-subtle)" }}>
                  <p style={{ fontWeight: 600, marginBottom: 4 }}>Excluidos:</p>
                  <ul style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {preview.excluded.map((e) => (
                      <li key={e.reason}>
                        {EXCLUSION_REASON_LABELS[e.reason] ?? e.reason}: {e.count}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {state.error ? (
            <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
              {state.error}
            </p>
          ) : null}

          <button type="submit" disabled={pending} style={{ ...primaryButtonStyle(pending), alignSelf: "flex-start" }}>
            {pending ? "Creando…" : "Crear segmento"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
