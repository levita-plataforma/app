"use client";

import { useTransition } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { marcarTodoLeidoAction } from "./actions";
import { anunciarEnAvisos } from "./EstadoAvisos";

/**
 * «Marcar todo como leído». Solo actúa sobre los avisos de la iglesia activa.
 *
 * Al terminar bien no queda nada sin leer, así que este botón desaparece: el
 * resultado no se muestra aquí, sino en la región de estado de la bandeja
 * (EstadoAvisos), que sigue montada y se lleva el foco a la pestaña «Sin
 * leer». Un error sí deja el botón en su sitio, y el foco no se mueve.
 */
export default function MarcarTodoLeido({ unreadCount }: { unreadCount: number }) {
  const [isPending, startTransition] = useTransition();

  if (unreadCount === 0) return null;

  function marcarTodo() {
    if (isPending) return;
    startTransition(async () => {
      try {
        const result = await marcarTodoLeidoAction();
        if (!result.ok) {
          anunciarEnAvisos("error", result.error);
          return;
        }
        const updated = result.updated ?? 0;
        anunciarEnAvisos(
          "success",
          updated === 0
            ? "Ya tenías todos los avisos leídos."
            : updated === 1
              ? "Se ha marcado 1 aviso como leído."
              : `Se han marcado ${updated} avisos como leídos.`,
          true,
        );
      } catch {
        anunciarEnAvisos("error", "No se pudieron marcar tus avisos como leídos. Inténtalo de nuevo.");
      }
    });
  }

  return (
    <div className="av-toolbar-action">
      <button
        type="button"
        className="av-btn is-primary"
        onClick={marcarTodo}
        disabled={isPending}
        aria-busy={isPending}
      >
        {isPending ? (
          <Loader2 size={14} className="av-spin" aria-hidden="true" />
        ) : (
          <CheckCheck size={14} aria-hidden="true" />
        )}
        {isPending ? "Marcando…" : "Marcar todo como leído"}
      </button>
    </div>
  );
}
