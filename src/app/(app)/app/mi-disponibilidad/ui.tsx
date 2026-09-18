"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { DisponibilidadResult } from "./actions";

/** Piezas de interfaz compartidas por «Mi disponibilidad» (prefijo dp-). */

const UNEXPECTED_MESSAGE = "No se pudo completar la acción. Inténtalo de nuevo.";

/**
 * Ejecuta una acción de servidor en una transición y deja un único punto para
 * el error, el aviso de éxito y el estado de ocupado (que los botones usan en
 * `aria-busy`). Tras cada acción correcta se refresca la pantalla.
 */
export function useDisponibilidadAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function run(action: () => Promise<DisponibilidadResult>, successMessage?: string, onSuccess?: () => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onSuccess?.();
        if (successMessage) setNotice(successMessage);
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

export function DpMessages({ error, notice }: { error: string | null; notice: string | null }) {
  return (
    // role="alert" y role="status" ya son regiones dinámicas; el contenedor no
    // lleva aria-live para no anunciar dos veces lo mismo.
    <div className="dp-messages">
      {error ? (
        <p role="alert" className="dp-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="dp-notice">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Borrado con confirmación en línea (sin `confirm()` del navegador). Al abrir,
 * el foco pasa al botón de confirmar; Escape o «Cancelar» cierran y devuelven
 * el foco al botón que la abrió.
 */
export function DpConfirmDelete({
  label,
  confirmLabel,
  message,
  onConfirm,
  busy,
}: {
  label: string;
  confirmLabel: string;
  message: ReactNode;
  onConfirm: () => void;
  busy: boolean;
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
        className="dp-btn is-ghost is-danger-text"
        aria-haspopup="dialog"
        aria-busy={busy}
        disabled={busy}
        onClick={() => setAsking(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      className="dp-confirm"
      role="alertdialog"
      aria-label={confirmLabel}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      }}
    >
      <p>{message}</p>
      <div className="dp-actions">
        <button
          ref={confirmRef}
          type="button"
          className="dp-btn is-danger"
          aria-busy={busy}
          disabled={busy}
          onClick={() => {
            close();
            onConfirm();
          }}
        >
          {confirmLabel}
        </button>
        <button type="button" className="dp-btn" onClick={close}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
