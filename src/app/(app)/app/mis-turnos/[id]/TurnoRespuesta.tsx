"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Repeat, X } from "lucide-react";
import { eligibilityCodeLabel } from "@/lib/assignments/constants";
import { requestSubstitutionAction, respondTurnoAction, type TurnoActionResult } from "../actions";

export type TurnoRespuestaMode = "pending" | "accepted" | "declined" | "readonly";

type Busy = "accepted" | "declined" | "note" | "substitution" | null;
type Feedback =
  | { kind: "error"; message: string; blocking?: string[]; conflict?: boolean }
  | { kind: "success"; message: string }
  | null;

const NOTE_MAX = 1000;

export default function TurnoRespuesta({
  assignmentId,
  version,
  mode,
  readOnlyReason,
  note,
  positionName,
  hasOpenSubstitution,
}: {
  assignmentId: string;
  version: number;
  mode: TurnoRespuestaMode;
  readOnlyReason: string | null;
  note: string | null;
  positionName: string;
  hasOpenSubstitution: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<Busy>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [noteDraft, setNoteDraft] = useState(note ?? "");
  const [confirmingSubstitution, setConfirmingSubstitution] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const substitutionButtonRef = useRef<HTMLButtonElement>(null);
  const noteId = useId();
  const noteHintId = useId();

  const savedNote = note ?? "";
  const noteDirty = noteDraft.trim() !== savedNote.trim();
  const disabled = isPending;

  useEffect(() => {
    if (confirmingSubstitution) confirmButtonRef.current?.focus();
  }, [confirmingSubstitution]);

  function handleFailure(result: Extract<TurnoActionResult, { ok: false }>) {
    if (result.conflict) {
      setFeedback({
        kind: "error",
        conflict: true,
        message: "El turno cambió mientras lo veías. Hemos cargado la versión actual: revísala y vuelve a intentarlo.",
      });
      router.refresh();
      return;
    }
    setFeedback({ kind: "error", message: result.error, blocking: result.blocking });
  }

  function respond(response: "accepted" | "declined", action: Exclude<Busy, null | "substitution">) {
    if (isPending) return;
    setBusy(action);
    setFeedback(null);
    const noteArg = noteDirty ? noteDraft.trim() : undefined;
    startTransition(async () => {
      try {
        const result = await respondTurnoAction(assignmentId, response, version, noteArg);
        if (!result.ok) {
          handleFailure(result);
          return;
        }
        let message: string;
        if (action === "note") message = "Nota guardada.";
        else if (result.replayed) message = noteArg !== undefined ? "Nota guardada; tu respuesta no ha cambiado." : "Tu respuesta ya estaba registrada.";
        else if (response === "accepted") message = "Has aceptado el turno. ¡Gracias!";
        else message = "Has indicado que no puedes servir. Quien coordina el puesto verá tu respuesta.";
        setFeedback({ kind: "success", message });
      } catch {
        setFeedback({ kind: "error", message: "No se pudo guardar tu respuesta. Comprueba tu conexión e inténtalo de nuevo." });
      } finally {
        setBusy(null);
      }
    });
  }

  function requestSubstitution() {
    if (isPending) return;
    setBusy("substitution");
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await requestSubstitutionAction(assignmentId);
        if (!result.ok) {
          handleFailure(result);
          return;
        }
        setConfirmingSubstitution(false);
        setFeedback({
          kind: "success",
          message: result.replayed
            ? "Ya había una solicitud de sustitución abierta para este turno."
            : "Solicitud enviada. Sigues en el turno hasta que otra persona lo acepte.",
        });
      } catch {
        setFeedback({ kind: "error", message: "No se pudo solicitar la sustitución. Inténtalo de nuevo." });
      } finally {
        setBusy(null);
      }
    });
  }

  const feedbackBlock =
    feedback?.kind === "error" ? (
      <div className="mt-feedback is-error" role="alert">
        <p>{feedback.message}</p>
        {feedback.blocking && feedback.blocking.length > 0 ? (
          <>
            <ul className="mt-reasons">
              {feedback.blocking.map((code) => (
                <li key={code}>{eligibilityCodeLabel(code)}</li>
              ))}
            </ul>
            <p>
              Habla con quien coordina el puesto de <strong>{positionName}</strong> para resolverlo.
            </p>
          </>
        ) : null}
      </div>
    ) : feedback?.kind === "success" ? (
      <p className="mt-feedback is-success" role="status">
        {feedback.message}
      </p>
    ) : null;

  if (mode === "readonly") {
    return (
      <div className="mt-response">
        {readOnlyReason ? <p className="mt-readonly">{readOnlyReason}</p> : null}
        {savedNote ? (
          <div className="mt-note-readonly">
            <p className="mt-label">Tu nota privada</p>
            <p>{savedNote}</p>
          </div>
        ) : null}
        {feedbackBlock}
      </div>
    );
  }

  const spinner = <Loader2 size={14} className="mt-spin" aria-hidden="true" />;

  return (
    <div className="mt-response">
      {mode === "pending" ? (
        <p className="mt-lead">¿Puedes servir en este turno?</p>
      ) : mode === "declined" ? (
        <p className="mt-lead">Indicaste que no puedes servir. Si ahora puedes, avísalo mientras quede hueco.</p>
      ) : (
        <p className="mt-lead">Has confirmado este turno.</p>
      )}

      <div className="mt-field">
        <label htmlFor={noteId} className="mt-label">
          Nota privada (opcional)
        </label>
        <textarea
          id={noteId}
          className="mt-textarea"
          value={noteDraft}
          maxLength={NOTE_MAX}
          rows={3}
          disabled={disabled}
          aria-describedby={noteHintId}
          onChange={(event) => setNoteDraft(event.target.value)}
        />
        <p id={noteHintId} className="mt-hint">
          Solo la verás tú; no se muestra a quien coordina. {noteDraft.length}/{NOTE_MAX}
          {mode === "pending" ? " Se guarda al responder." : ""}
        </p>
      </div>

      <div className="mt-button-row">
        {mode === "pending" ? (
          <>
            <button
              type="button"
              className="mt-btn is-primary"
              disabled={disabled}
              aria-busy={busy === "accepted"}
              onClick={() => respond("accepted", "accepted")}
            >
              {busy === "accepted" ? spinner : <Check size={14} aria-hidden="true" />}
              {busy === "accepted" ? "Guardando…" : "Aceptar"}
            </button>
            <button
              type="button"
              className="mt-btn is-secondary"
              disabled={disabled}
              aria-busy={busy === "declined"}
              onClick={() => respond("declined", "declined")}
            >
              {busy === "declined" ? spinner : <X size={14} aria-hidden="true" />}
              {busy === "declined" ? "Guardando…" : "No puedo"}
            </button>
          </>
        ) : null}

        {mode === "declined" ? (
          <>
            <button
              type="button"
              className="mt-btn is-primary"
              disabled={disabled}
              aria-busy={busy === "accepted"}
              onClick={() => respond("accepted", "accepted")}
            >
              {busy === "accepted" ? spinner : <Check size={14} aria-hidden="true" />}
              {busy === "accepted" ? "Guardando…" : "Puedo servir"}
            </button>
            <button
              type="button"
              className="mt-btn is-secondary"
              disabled={disabled || !noteDirty}
              aria-busy={busy === "note"}
              onClick={() => respond("declined", "note")}
            >
              {busy === "note" ? spinner : null}
              {busy === "note" ? "Guardando…" : "Guardar nota"}
            </button>
          </>
        ) : null}

        {mode === "accepted" ? (
          <button
            type="button"
            className="mt-btn is-secondary"
            disabled={disabled || !noteDirty}
            aria-busy={busy === "note"}
            onClick={() => respond("accepted", "note")}
          >
            {busy === "note" ? spinner : null}
            {busy === "note" ? "Guardando…" : "Guardar nota"}
          </button>
        ) : null}
      </div>

      {feedbackBlock}

      {mode === "accepted" && !hasOpenSubstitution ? (
        <div className="mt-substitution">
          {confirmingSubstitution ? (
            <div className="mt-confirm" role="group" aria-labelledby={`${noteId}-sub-title`}>
              <p id={`${noteId}-sub-title`} className="mt-confirm-title">
                ¿Pedir una sustitución?
              </p>
              <p className="mt-hint">
                Quien coordina el puesto buscará a otra persona. <strong>Sigues en el turno</strong> hasta que alguien
                acepte sustituirte; hasta entonces cuenta contigo.
              </p>
              <div className="mt-button-row">
                <button
                  ref={confirmButtonRef}
                  type="button"
                  className="mt-btn is-primary"
                  disabled={disabled}
                  aria-busy={busy === "substitution"}
                  onClick={requestSubstitution}
                >
                  {busy === "substitution" ? spinner : <Repeat size={14} aria-hidden="true" />}
                  {busy === "substitution" ? "Enviando…" : "Sí, pedir sustitución"}
                </button>
                <button
                  type="button"
                  className="mt-btn is-secondary"
                  disabled={disabled}
                  onClick={() => {
                    setConfirmingSubstitution(false);
                    requestAnimationFrame(() => substitutionButtonRef.current?.focus());
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-hint">¿Ya no puedes servir? No se puede rechazar un turno aceptado, pero puedes pedir que te sustituyan.</p>
              <button
                ref={substitutionButtonRef}
                type="button"
                className="mt-btn is-secondary"
                disabled={disabled}
                onClick={() => {
                  setFeedback(null);
                  setConfirmingSubstitution(true);
                }}
              >
                <Repeat size={14} aria-hidden="true" /> Pedir sustitución
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
