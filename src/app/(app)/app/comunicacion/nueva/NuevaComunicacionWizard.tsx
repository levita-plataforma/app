"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import { primaryButtonStyle, secondaryButtonStyle } from "../ui";
import SegmentoRuleBuilder, { getRuleConditions, type SegmentOption, type SegmentRules } from "../segmentos/SegmentoRuleBuilder";
import {
  crearYEnviarAction,
  crearYProgramarAction,
  previsualizarDestinatariosAction,
  nuevaComunicacionInitialState,
  type NuevaComunicacionState,
} from "./actions";
import type {
  CommunicationChannel,
  CommunicationPurpose,
  CommunicationSegment,
  CommunicationTemplate,
  SegmentPreview,
} from "@/server/communications/communications-service";

/**
 * Umbral a partir del cual se exige una confirmación explícita adicional
 * antes de enviar (no programar): evita que un envío masivo salga con un
 * único click accidental.
 */
const LARGE_AUDIENCE_THRESHOLD = 200;

const EMPTY_RULES: SegmentRules = { all: [] };

const EXCLUSION_REASON_LABELS: Record<string, string> = {
  sin_email: "Sin correo registrado",
  opt_out_email: "Ha desactivado los avisos por correo",
};

/**
 * Duplicado a propósito de COMMUNICATION_PURPOSES/COMMUNICATION_PURPOSE_LABELS
 * (communications-service.ts, "server-only"): ese módulo no puede
 * importarse en este componente cliente. "system" se excluye porque es una
 * finalidad reservada a comunicaciones generadas por el propio sistema, no
 * seleccionable a mano.
 */
const SELECTABLE_PURPOSES: Exclude<CommunicationPurpose, "system">[] = [
  "institutional",
  "operational",
  "services",
  "groups",
  "events",
  "discipleship",
  "kids",
  "pastoral",
];

const PURPOSE_LABELS: Record<CommunicationPurpose, string> = {
  institutional: "Institucional",
  operational: "Operativa",
  services: "Servicios",
  groups: "Grupos",
  events: "Eventos",
  discipleship: "Discipulado",
  kids: "Niños",
  pastoral: "Pastoral",
  system: "Sistema",
};

const CHANNEL_OPTIONS: { value: CommunicationChannel; label: string; disabled?: boolean }[] = [
  { value: "email", label: "Correo" },
  { value: "push", label: "Notificación push" },
  { value: "inapp", label: "Aviso en la app" },
];

const UNAVAILABLE_CHANNELS: { label: string }[] = [{ label: "SMS" }, { label: "WhatsApp" }];

type Props = {
  churchId: string;
  templates: CommunicationTemplate[];
  segments: CommunicationSegment[];
  campuses: SegmentOption[];
  tags: SegmentOption[];
  serviceAreas: SegmentOption[];
};

export default function NuevaComunicacionWizard({ churchId, templates, segments, campuses, tags, serviceAreas }: Props) {
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState<CommunicationPurpose>("institutional");
  const [subject, setSubject] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [templateId, setTemplateId] = useState("");

  const [audienceMode, setAudienceMode] = useState<"custom" | "saved">("custom");
  const [savedSegmentId, setSavedSegmentId] = useState("");
  const [rules, setRules] = useState<SegmentRules>(EMPTY_RULES);

  const [channels, setChannels] = useState<CommunicationChannel[]>(["inapp"]);

  const [preview, setPreview] = useState<SegmentPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPending, startPreview] = useTransition();

  const [sendMode, setSendMode] = useState<"now" | "scheduled">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);

  const selectedSegment = useMemo(() => segments.find((s) => s.id === savedSegmentId) ?? null, [segments, savedSegmentId]);

  const effectiveRules: SegmentRules = audienceMode === "saved" ? (selectedSegment?.rules as SegmentRules) ?? EMPTY_RULES : rules;

  function handleTemplateSelect(id: string) {
    setTemplateId(id);
    if (!id) return;
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    if (tpl.subject) setSubject(tpl.subject);
    setBodyTemplate(tpl.body);
  }

  function toggleChannel(channel: CommunicationChannel) {
    setChannels((prev) => (prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]));
  }

  function handlePreview() {
    if (getRuleConditions(effectiveRules).conditions.length === 0 || channels.length === 0) return;
    setPreviewError(null);
    startPreview(async () => {
      const result = await previsualizarDestinatariosAction(churchId, effectiveRules, channels);
      if (result.error) {
        setPreviewError(result.error);
        setPreview(null);
      } else {
        setPreview(result.preview);
        setConfirmSend(false);
      }
    });
  }

  const [sendState, sendFormAction, sendPending] = useActionState<NuevaComunicacionState, FormData>(
    crearYEnviarAction,
    nuevaComunicacionInitialState,
  );
  const [scheduleState, scheduleFormAction, schedulePending] = useActionState<NuevaComunicacionState, FormData>(
    crearYProgramarAction,
    nuevaComunicacionInitialState,
  );

  const isLargeAudience = (preview?.total ?? 0) > LARGE_AUDIENCE_THRESHOLD;
  const state = sendMode === "now" ? sendState : scheduleState;
  const pending = sendMode === "now" ? sendPending : schedulePending;

  function buildFormData(formData: FormData) {
    formData.set("title", title);
    formData.set("purpose", purpose);
    formData.set("subject", subject);
    formData.set("bodyTemplate", bodyTemplate);
    formData.set("templateId", templateId);
    formData.set("segmentId", audienceMode === "saved" ? savedSegmentId : "");
    formData.set("rules", JSON.stringify(effectiveRules));
    formData.set("channels", JSON.stringify(channels));
    if (sendMode === "scheduled") formData.set("scheduledAt", scheduledAt);
    return formData;
  }

  const canSubmit = Boolean(
    title.trim() && bodyTemplate.trim() && getRuleConditions(effectiveRules).conditions.length > 0 && channels.length > 0 &&
      (sendMode === "now" ? true : Boolean(scheduledAt)),
  );

  const needsExtraConfirm = sendMode === "now" && isLargeAudience && !confirmSend;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 1. Contenido */}
      <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>1. Contenido</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="wizard-title" style={authLabelStyle}>
            Título
          </label>
          <input
            id="wizard-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            style={{ ...authInputStyle, minHeight: 44 }}
            placeholder="Aviso de horario especial"
          />
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 200px" }}>
            <label htmlFor="wizard-purpose" style={authLabelStyle}>
              Finalidad
            </label>
            <select
              id="wizard-purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as CommunicationPurpose)}
              style={{ ...authInputStyle, minHeight: 44 }}
            >
              {SELECTABLE_PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {PURPOSE_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          {templates.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 240px" }}>
              <label htmlFor="wizard-template" style={authLabelStyle}>
                Plantilla (opcional)
              </label>
              <select
                id="wizard-template"
                value={templateId}
                onChange={(e) => handleTemplateSelect(e.target.value)}
                style={{ ...authInputStyle, minHeight: 44 }}
              >
                <option value="">Sin plantilla</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="wizard-subject" style={authLabelStyle}>
            Asunto (correo)
          </label>
          <input
            id="wizard-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{ ...authInputStyle, minHeight: 44 }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="wizard-body" style={authLabelStyle}>
            Cuerpo del mensaje
          </label>
          <textarea
            id="wizard-body"
            value={bodyTemplate}
            onChange={(e) => setBodyTemplate(e.target.value)}
            rows={6}
            required
            style={{ ...authInputStyle, width: "100%" }}
            placeholder="Hola {{first_name}}, te escribimos desde {{church_name}}…"
          />
          <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
            Puedes usar los placeholders {"{{first_name}}"} y {"{{church_name}}"}.
          </p>
        </div>
      </section>

      {/* 2. Audiencia */}
      <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>2. Audiencia</p>

        <nav className="serving-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={audienceMode === "custom"}
            onClick={() => setAudienceMode("custom")}
            className="serving-tab"
          >
            Construir segmento
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={audienceMode === "saved"}
            onClick={() => setAudienceMode("saved")}
            className="serving-tab"
            disabled={segments.length === 0}
          >
            Segmento guardado
          </button>
        </nav>

        {audienceMode === "saved" ? (
          segments.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>No hay segmentos guardados todavía.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 320 }}>
              <label htmlFor="wizard-segment" style={authLabelStyle}>
                Segmento
              </label>
              <select
                id="wizard-segment"
                value={savedSegmentId}
                onChange={(e) => setSavedSegmentId(e.target.value)}
                style={{ ...authInputStyle, minHeight: 44 }}
              >
                <option value="">Selecciona un segmento…</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )
        ) : (
          <SegmentoRuleBuilder value={rules} onChange={setRules} campuses={campuses} tags={tags} serviceAreas={serviceAreas} />
        )}
      </section>

      {/* 3. Canales */}
      <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>3. Canales</p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {CHANNEL_OPTIONS.map((opt) => (
            <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, minHeight: 44 }}>
              <input type="checkbox" checked={channels.includes(opt.value)} onChange={() => toggleChannel(opt.value)} />
              {opt.label}
            </label>
          ))}
          {UNAVAILABLE_CHANNELS.map((opt) => (
            <label
              key={opt.label}
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, minHeight: 44, color: "var(--shell-text-subtle)" }}
            >
              <input type="checkbox" disabled />
              {opt.label} · No disponible
            </label>
          ))}
        </div>
      </section>

      {/* Preview de destinatarios */}
      <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>Destinatarios</p>
        <button
          type="button"
          onClick={handlePreview}
          disabled={previewPending || getRuleConditions(effectiveRules).conditions.length === 0 || channels.length === 0}
          style={{ ...secondaryButtonStyle(previewPending), alignSelf: "flex-start" }}
        >
          {previewPending ? "Calculando…" : "Ver destinatarios"}
        </button>

        {previewError ? (
          <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
            {previewError}
          </p>
        ) : null}

        {preview ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ fontSize: 13.5, fontWeight: 600 }}>
              {preview.total} persona{preview.total === 1 ? "" : "s"} coincide{preview.total === 1 ? "" : "n"} con esta
              audiencia
            </p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, color: "var(--shell-text-muted)" }}>
              {channels.map((c) => (
                <span key={c}>
                  {c === "email" ? "Correo" : c === "push" ? "Push" : "En la app"}: {preview.byChannel[c] ?? 0}
                </span>
              ))}
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
        ) : (
          <p style={{ fontSize: 12, color: "var(--shell-text-subtle)" }}>
            Calcula el número de destinatarios antes de enviar o programar.
          </p>
        )}
      </section>

      {/* 5. Envío */}
      <form
        action={(formData) => {
          const data = buildFormData(formData);
          if (sendMode === "now") sendFormAction(data);
          else scheduleFormAction(data);
        }}
        noValidate
        className="shell-card"
        style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}
      >
        <p style={{ fontSize: 13, fontWeight: 600 }}>4. Envío</p>

        <nav className="serving-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={sendMode === "now"}
            onClick={() => setSendMode("now")}
            className="serving-tab"
          >
            Enviar ahora
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sendMode === "scheduled"}
            onClick={() => setSendMode("scheduled")}
            className="serving-tab"
          >
            Programar
          </button>
        </nav>

        {sendMode === "scheduled" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 260 }}>
            <label htmlFor="wizard-scheduled-at" style={authLabelStyle}>
              Fecha y hora de envío
            </label>
            <input
              id="wizard-scheduled-at"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              style={{ ...authInputStyle, minHeight: 44 }}
              required
            />
          </div>
        ) : null}

        {needsExtraConfirm ? (
          <div
            role="alert"
            style={{
              padding: 12,
              borderRadius: "var(--shell-radius-sm)",
              border: "1px solid var(--shell-danger)",
              background: "#fbeaea",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--shell-danger)" }}>
              Esta comunicación se enviará a {preview?.total ?? 0} personas. ¿Confirmas?
            </p>
            <button
              type="button"
              onClick={() => setConfirmSend(true)}
              style={{ ...secondaryButtonStyle(), alignSelf: "flex-start" }}
            >
              Sí, confirmar envío
            </button>
          </div>
        ) : null}

        {state.error ? (
          <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
            {state.error}
          </p>
        ) : null}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="submit"
            disabled={pending || !canSubmit || needsExtraConfirm}
            style={primaryButtonStyle(pending)}
          >
            {pending ? "Enviando…" : sendMode === "now" ? "Enviar ahora" : "Programar"}
          </button>
          <Link href="/app/comunicacion" style={secondaryButtonStyle()}>
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
