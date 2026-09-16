"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { ChipTone } from "@/lib/activities/constants";

/** Utilidades de UI compartidas por las pestañas de estructura. */

export function Chip({ tone = "default", children, title }: { tone?: ChipTone; children: ReactNode; title?: string }) {
  const toneClass = tone === "default" ? "" : ` is-${tone}`;
  return (
    <span className={`serving-chip${toneClass}`} title={title}>
      {children}
    </span>
  );
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="est-error">
      {message}
    </p>
  );
}

export function NoticeText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="est-notice">
      {message}
    </p>
  );
}

/** Ejecuta acciones de servidor en una transición y guarda error/aviso. */
export function useRunner() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function run<T extends { error: string | null }>(action: () => Promise<T>, onSuccess?: (result: T) => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.error) {
          setError(result.error);
          return;
        }
        onSuccess?.(result);
      } catch {
        setError("No se pudo completar la acción. Inténtalo de nuevo.");
      }
    });
  }

  return { pending, error, notice, setError, setNotice, run };
}

/**
 * Botón con confirmación en línea (sin diálogos del navegador): el primer
 * clic muestra el mensaje y los botones Confirmar/Cancelar.
 */
export function ConfirmButton({
  label,
  confirmLabel = "Confirmar",
  message,
  onConfirm,
  disabled,
  danger = true,
  triggerClassName,
  triggerAriaLabel,
}: {
  label: ReactNode;
  confirmLabel?: string;
  message: ReactNode;
  onConfirm: () => void;
  disabled?: boolean;
  danger?: boolean;
  triggerClassName?: string;
  triggerAriaLabel?: string;
}) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        aria-label={triggerAriaLabel}
        className={triggerClassName ?? `est-btn-link${danger ? " is-danger" : ""}`}
        disabled={disabled}
        onClick={() => setAsking(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="est-confirm" role="group" aria-label="Confirmación">
      <p>{message}</p>
      <div className="est-actions">
        <button
          type="button"
          className={`est-btn${danger ? " is-danger" : " is-primary"}`}
          disabled={disabled}
          onClick={() => {
            setAsking(false);
            onConfirm();
          }}
        >
          {confirmLabel}
        </button>
        <button type="button" className="est-btn" onClick={() => setAsking(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Entero de un input; "" → null. NaN → undefined (valor inválido). */
export function parseIntInput(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!/^-?\d+$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
