"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { crearFamiliaAction, archivarFamiliaAction, type FamiliasState } from "./actions";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import type { Household } from "@/server/people/households-service";

const initialState: FamiliasState = { error: null };

export default function FamiliasManager({ households, canManage }: { households: Household[]; canManage: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [state, formAction, pending] = useActionState(crearFamiliaAction, initialState);
  const [archivePending, startTransition] = useTransition();
  const [archiveError, setArchiveError] = useState<string | null>(null);

  function handleArchive(householdId: string) {
    startTransition(async () => {
      const result = await archivarFamiliaAction(householdId);
      setArchiveError(result.error);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {archiveError ? <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>{archiveError}</p> : null}

      {households.length === 0 ? (
        <div className="shell-card shell-empty-state">
          <h3>Todavía no hay familias creadas</h3>
          <p>Agrupa personas relacionadas para verlas juntas en el directorio.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {households.map((h) => (
            <div key={h.id} className="shell-card" style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{h.name}</p>
                {h.primaryAddress ? <p style={{ fontSize: 12, color: "var(--shell-text-muted)" }}>{h.primaryAddress}</p> : null}
                <ul style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {h.members.map((m) => (
                    <li key={m.personId}>
                      <Link
                        href={`/app/personas/${m.personId}`}
                        style={{ fontSize: 12, color: "var(--shell-brand)", fontWeight: 600, textDecoration: "none" }}
                      >
                        {m.firstName} {m.lastName ?? ""}
                      </Link>
                    </li>
                  ))}
                  {h.members.length === 0 ? <li style={{ fontSize: 12, color: "var(--shell-text-subtle)" }}>Sin miembros todavía</li> : null}
                </ul>
              </div>
              {canManage ? (
                <button
                  type="button"
                  disabled={archivePending}
                  onClick={() => handleArchive(h.id)}
                  style={{ fontSize: 11.5, color: "var(--shell-text-subtle)", background: "none", border: "1px solid var(--shell-border)", borderRadius: "var(--shell-radius-sm)", padding: "6px 10px", cursor: "pointer" }}
                >
                  Archivar
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {canManage ? (
        showForm ? (
          <form action={formAction} className="shell-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }} noValidate>
            <div>
              <label htmlFor="household-name" style={authLabelStyle}>Nombre de la familia</label>
              <input id="household-name" name="name" required style={authInputStyle} placeholder="Familia López" />
            </div>
            <div>
              <label htmlFor="household-address" style={authLabelStyle}>Dirección compartida (opcional)</label>
              <input id="household-address" name="address" style={authInputStyle} />
            </div>
            {state.error ? <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>{state.error}</p> : null}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={pending} style={{ padding: "8px 16px", borderRadius: "var(--shell-radius-sm)", border: "none", background: "var(--shell-text)", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: pending ? "wait" : "pointer" }}>
                {pending ? "Creando…" : "Crear familia"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={{ padding: "8px 16px", borderRadius: "var(--shell-radius-sm)", border: "1px solid var(--shell-border)", background: "var(--shell-surface)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: "var(--shell-radius-sm)", border: "1px solid var(--shell-border)", background: "var(--shell-surface)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            <Plus size={14} /> Nuevo hogar
          </button>
        )
      ) : null}
    </div>
  );
}
