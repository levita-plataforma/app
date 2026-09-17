"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ChipTone } from "@/lib/activities/constants";
import { eligibilityCodeLabel } from "@/lib/assignments/constants";
import type { EquipoResult } from "./actions";

/** Piezas de interfaz compartidas por la pestaña Equipo (prefijo eq-). */

export function EqChip({ tone = "default", children, title }: { tone?: ChipTone; children: ReactNode; title?: string }) {
  return (
    <span className={`serving-chip${tone === "default" ? "" : ` is-${tone}`}`} title={title}>
      {children}
    </span>
  );
}

export function EqMessages({ error, notice }: { error: string | null; notice?: string | null }) {
  return (
    <>
      {error ? (
        <p role="alert" className="eq-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="eq-notice">
          {notice}
        </p>
      ) : null}
    </>
  );
}

export function CodeList({ codes, tone }: { codes: string[]; tone: "danger" | "warning" }) {
  if (codes.length === 0) return null;
  return (
    <ul className={`eq-codes is-${tone}`}>
      {codes.map((code) => (
        <li key={code}>{eligibilityCodeLabel(code)}</li>
      ))}
    </ul>
  );
}

/** Borradores que no se enviaron por bloqueos actuales (siguen en borrador). */
export type BlockedSend = { assignmentId: string; name: string; blocking: string[] };

export function SendBlockedBox({ blocked }: { blocked: BlockedSend[] }) {
  if (blocked.length === 0) return null;
  return (
    <div className="eq-box is-danger" role="alert">
      <strong>
        {blocked.length === 1
          ? "1 asignación no se envió y sigue en borrador:"
          : `${blocked.length} asignaciones no se enviaron y siguen en borrador:`}
      </strong>
      <ul className="eq-blocked-list">
        {blocked.map((b) => (
          <li key={b.assignmentId}>
            <strong>{b.name}</strong>
            {b.blocking.length > 0 ? (
              <CodeList codes={b.blocking} tone="danger" />
            ) : (
              <span className="eq-muted"> · no cumple las condiciones del puesto</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const CONFLICT_MESSAGE = "Los datos han cambiado mientras los veías y ya se han recargado. Revísalos y vuelve a intentarlo.";
const UNEXPECTED_MESSAGE = "No se pudo completar la acción. Inténtalo de nuevo.";

/**
 * Ejecuta una acción de servidor en una transición. Tras cada acción se
 * refresca la ficha; si hubo conflicto de versión, también, y se explica.
 * onSuccess puede devolver un aviso para mostrar o lanzar un error propio.
 */
export function useEquipoAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function run<T>(action: () => Promise<EquipoResult<T>>, onSuccess?: (result: { error: null } & T) => string | null | void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.error !== null) {
          if (result.conflict) {
            setError(/ha cambiado|han cambiado/i.test(result.error) ? CONFLICT_MESSAGE : `${result.error} Se han recargado los datos.`);
            router.refresh();
          } else {
            setError(result.error);
          }
          return;
        }
        const message = onSuccess?.(result as { error: null } & T);
        if (message) setNotice(message);
        router.refresh();
      } catch {
        setError(UNEXPECTED_MESSAGE);
      }
    });
  }

  function clear() {
    setError(null);
    setNotice(null);
  }

  return { pending, error, notice, setError, setNotice, run, clear };
}

/**
 * Botón con confirmación en línea (sin diálogos del navegador). Al abrir, el
 * foco pasa al botón de confirmar; Escape o Cancelar cierran y devuelven el
 * foco al botón que la abrió.
 */
export function EqConfirm({
  label,
  confirmLabel,
  message,
  onConfirm,
  disabled,
  danger = true,
}: {
  label: ReactNode;
  confirmLabel: string;
  message: ReactNode;
  onConfirm: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (asking) {
      confirmRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [asking]);

  function close() {
    returnFocus.current = true;
    setAsking(false);
  }

  if (!asking) {
    return (
      <button
        ref={triggerRef}
        type="button"
        className={`eq-btn is-ghost${danger ? " is-danger-text" : ""}`}
        disabled={disabled}
        aria-haspopup="dialog"
        onClick={() => setAsking(true)}
      >
        {label}
      </button>
    );
  }
  return (
    <div
      className="eq-confirm"
      role="alertdialog"
      aria-label={confirmLabel}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }}
    >
      <p>{message}</p>
      <div className="eq-actions">
        <button
          ref={confirmRef}
          type="button"
          className={`eq-btn ${danger ? "is-danger" : "is-primary"}`}
          disabled={disabled}
          onClick={() => {
            close();
            onConfirm();
          }}
        >
          {confirmLabel}
        </button>
        <button type="button" className="eq-btn" onClick={close}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
