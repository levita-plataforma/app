"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { marcarAvisoLeidoAction } from "./actions";

/**
 * Acciones de un aviso: abrir su destino y marcarlo como leído.
 *
 * Abrir el enlace también lo marca como leído. La navegación no espera a la
 * acción: si falla, el aviso sigue sin leer y se puede marcar a mano.
 */
export default function AvisoAcciones({
  notificationId,
  href,
  linkLabel,
  title,
  unread,
}: {
  notificationId: string;
  href: string | null;
  linkLabel: string | null;
  /** Título del aviso: da contexto al nombre accesible de cada control. */
  title: string;
  unread: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [marked, setMarked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stillUnread = unread && !marked;

  function marcarLeido() {
    if (isPending || !stillUnread) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await marcarAvisoLeidoAction(notificationId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMarked(true);
      } catch {
        setError("No se pudo marcar el aviso como leído. Inténtalo de nuevo.");
      }
    });
  }

  return (
    <div className="av-item-actions">
      {href && linkLabel ? (
        <Link href={href} className="av-open" onClick={marcarLeido}>
          {linkLabel}
          <span className="sr-only">: {title}</span>
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      ) : null}

      {stillUnread ? (
        <button
          type="button"
          className="av-btn"
          onClick={marcarLeido}
          disabled={isPending}
          aria-busy={isPending}
        >
          {isPending ? (
            <Loader2 size={14} className="av-spin" aria-hidden="true" />
          ) : (
            <Check size={14} aria-hidden="true" />
          )}
          {isPending ? "Marcando…" : "Marcar como leído"}
          <span className="sr-only">: {title}</span>
        </button>
      ) : (
        <span className="av-read-flag">Leído</span>
      )}

      {error ? (
        <p className="av-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
