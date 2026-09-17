"use client";

import { useState, useTransition } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { marcarTodoLeidoAction } from "./actions";

/** «Marcar todo como leído». Solo actúa sobre los avisos de la iglesia activa. */
export default function MarcarTodoLeido({ unreadCount }: { unreadCount: number }) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; message: string } | null>(null);

  if (unreadCount === 0) return null;

  function marcarTodo() {
    if (isPending) return;
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await marcarTodoLeidoAction();
        if (!result.ok) {
          setFeedback({ kind: "error", message: result.error });
          return;
        }
        const updated = result.updated ?? 0;
        setFeedback({
          kind: "success",
          message:
            updated === 0
              ? "Ya tenías todos los avisos leídos."
              : updated === 1
                ? "Se ha marcado 1 aviso como leído."
                : `Se han marcado ${updated} avisos como leídos.`,
        });
      } catch {
        setFeedback({ kind: "error", message: "No se pudieron marcar tus avisos como leídos. Inténtalo de nuevo." });
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
      {feedback ? (
        <p
          className={`av-feedback is-${feedback.kind}`}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  );
}
