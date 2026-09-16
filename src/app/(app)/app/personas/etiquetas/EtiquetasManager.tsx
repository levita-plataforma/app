"use client";

import { useActionState, useState, useTransition } from "react";
import { crearEtiquetaAction, archivarEtiquetaAction, type EtiquetasState } from "./actions";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import type { Tag } from "@/server/people/tags-service";

const initialState: EtiquetasState = { error: null };

export default function EtiquetasManager({ tags, canManage }: { tags: Tag[]; canManage: boolean }) {
  const [state, formAction, pending] = useActionState(crearEtiquetaAction, initialState);
  const [archivePending, startTransition] = useTransition();
  const [archiveError, setArchiveError] = useState<string | null>(null);

  function handleArchive(tagId: string) {
    startTransition(async () => {
      const result = await archivarEtiquetaAction(tagId);
      setArchiveError(result.error);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {archiveError ? <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>{archiveError}</p> : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {tags.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--shell-text-muted)" }}>Todavía no hay etiquetas.</p>
        ) : (
          tags.map((tag) => (
            <div
              key={tag.id}
              className="shell-card"
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px" }}
            >
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: tag.color ?? "var(--shell-brand)" }} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{tag.name}</span>
              {canManage ? (
                <button
                  type="button"
                  disabled={archivePending}
                  onClick={() => handleArchive(tag.id)}
                  style={{ fontSize: 11.5, color: "var(--shell-text-subtle)", background: "none", border: "none", cursor: "pointer" }}
                >
                  Archivar
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      {canManage ? (
        <form action={formAction} className="shell-card" style={{ padding: 18, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }} noValidate>
          <div>
            <label htmlFor="tag-name" style={authLabelStyle}>Nueva etiqueta</label>
            <input id="tag-name" name="name" required style={authInputStyle} placeholder="Nuevos" />
          </div>
          <div>
            <label htmlFor="tag-color" style={authLabelStyle}>Color</label>
            <input id="tag-color" name="color" type="color" defaultValue="#c89b4a" style={{ ...authInputStyle, height: 38, padding: 4, width: 60 }} />
          </div>
          {state.error ? <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>{state.error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            style={{ padding: "9px 18px", borderRadius: "var(--shell-radius-sm)", border: "none", background: "var(--shell-brand)", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: pending ? "wait" : "pointer" }}
          >
            {pending ? "Creando…" : "Crear etiqueta"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
