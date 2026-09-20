"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import { primaryButtonStyle, subtleButtonStyle } from "../ui";
import type { GivingFund } from "@/server/giving/giving-service";
import {
  crearFondoAction,
  archivarFondoAction,
  marcarFondoDefaultAction,
  fundFormInitialState,
  type FundFormState,
} from "./actions";

export default function FondosManager({ funds, canManage }: { funds: GivingFund[]; canManage: boolean }) {
  const [createState, createAction, createPending] = useActionState<FundFormState, FormData>(crearFondoAction, fundFormInitialState);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleArchive(fundId: string) {
    if (!window.confirm("¿Archivar este fondo?")) return;
    setError(null);
    startTransition(async () => {
      const result = await archivarFondoAction(fundId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleSetDefault(fundId: string) {
    setError(null);
    startTransition(async () => {
      const result = await marcarFondoDefaultAction(fundId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      {canManage ? (
        <form
          action={createAction}
          className="shell-card"
          style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}
        >
          <p style={{ fontSize: 13, fontWeight: 600 }}>Nuevo fondo</p>
          {createState.error ? (
            <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
              {createState.error}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 200px" }}>
              <label htmlFor="name" style={authLabelStyle}>
                Nombre *
              </label>
              <input id="name" name="name" required style={authInputStyle} placeholder="Fondo general" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 260px" }}>
              <label htmlFor="description" style={authLabelStyle}>
                Descripción
              </label>
              <input id="description" name="description" style={authInputStyle} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, paddingBottom: 9 }}>
              <input type="checkbox" name="isDefault" />
              Marcar como fondo por defecto
            </label>
            <button type="submit" disabled={createPending} style={primaryButtonStyle(createPending)}>
              {createPending ? "Creando…" : "Crear fondo"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      ) : null}

      <section className="shell-card" style={{ padding: 20 }}>
        {funds.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "32px 16px" }}>
            <p style={{ fontWeight: 600 }}>No hay fondos todavía.</p>
          </div>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {funds.map((fund) => (
              <li
                key={fund.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  border: "1px solid var(--shell-border)",
                  borderRadius: "var(--shell-radius-sm)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {fund.isDefault ? <Star size={14} style={{ color: "var(--mod-giving-fg)" }} fill="currentColor" /> : null}
                  <div>
                    <p style={{ fontSize: 13.5, fontWeight: 600 }}>{fund.name}</p>
                    {fund.description ? (
                      <p style={{ fontSize: 12, color: "var(--shell-text-muted)" }}>{fund.description}</p>
                    ) : null}
                  </div>
                </div>
                {canManage ? (
                  <div style={{ display: "flex", gap: 10 }}>
                    {!fund.isDefault ? (
                      <button type="button" onClick={() => handleSetDefault(fund.id)} disabled={pending} style={subtleButtonStyle}>
                        Marcar default
                      </button>
                    ) : null}
                    <button type="button" onClick={() => handleArchive(fund.id)} disabled={pending} style={subtleButtonStyle}>
                      Archivar
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
