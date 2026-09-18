"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2 } from "lucide-react";
import { marcarAvisoLeidoAction } from "./actions";
import { anunciarEnAvisos } from "./EstadoAvisos";

/**
 * Acciones de un aviso: abrir su destino y marcarlo como leído.
 *
 * Abrir el enlace también lo marca como leído. La navegación no espera a la
 * acción: si falla, el aviso sigue sin leer y se puede marcar a mano.
 *
 * Marcarlo desde el botón se lo lleva por delante: en la pestaña «Sin leer»
 * la fila entera desaparece de la lista y en «Todos» el botón deja paso a
 * «Leído». Por eso el resultado se anuncia en la región de estado de la
 * bandeja, que no se desmonta, y el foco vuelve a la pestaña «Sin leer». El
 * error sí se queda aquí: la fila sigue en su sitio, con su botón.
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

  /** `anunciar` es falso al abrir el enlace: ahí la navegación es la respuesta. */
  function marcarLeido(anunciar: boolean) {
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
        if (anunciar) anunciarEnAvisos("success", `Aviso marcado como leído: ${title}`, true);
      } catch {
        setError("No se pudo marcar el aviso como leído. Inténtalo de nuevo.");
      }
    });
  }

  return (
    <div className="av-item-actions">
      {href && linkLabel ? (
        <Link href={href} className="av-open" onClick={() => marcarLeido(false)}>
          {linkLabel}
          <span className="sr-only">: {title}</span>
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      ) : null}

      {stillUnread ? (
        <button
          type="button"
          className="av-btn"
          onClick={() => marcarLeido(true)}
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
