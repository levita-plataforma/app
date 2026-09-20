"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { subtleButtonStyle, formatDate, formatMoneyClient, GIVING_METHOD_LABELS_CLIENT } from "../ui";
import type { GivingContribution } from "@/server/giving/giving-service";
import { conciliarAction, marcarExcepcionAction } from "./actions";

export default function ConciliacionManager({
  contributions,
  fundNames,
}: {
  contributions: GivingContribution[];
  fundNames: Record<string, string>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [refs, setRefs] = useState<Record<string, string>>({});
  const router = useRouter();

  function handleReconcile(contributionId: string) {
    setError(null);
    startTransition(async () => {
      const result = await conciliarAction(contributionId, refs[contributionId] ?? "");
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleException(contributionId: string) {
    setError(null);
    startTransition(async () => {
      const result = await marcarExcepcionAction(contributionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="shell-card" style={{ padding: 20 }}>
      {error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)", marginBottom: 12 }}>
          {error}
        </p>
      ) : null}

      {contributions.length === 0 ? (
        <div className="shell-empty-state" style={{ padding: "32px 16px" }}>
          <p style={{ fontWeight: 600 }}>No hay aportaciones pendientes de conciliar.</p>
        </div>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {contributions.map((c) => (
            <li
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                padding: "10px 12px",
                border: "1px solid var(--shell-border)",
                borderRadius: "var(--shell-radius-sm)",
              }}
            >
              <div>
                <p style={{ fontSize: 13.5, fontWeight: 600 }}>{formatMoneyClient(c.amountMinor, c.currency)}</p>
                <p style={{ fontSize: 12, color: "var(--shell-text-muted)" }}>
                  {formatDate(c.contributedAt)} · {fundNames[c.fundId] ?? "—"} · {GIVING_METHOD_LABELS_CLIENT[c.method]}
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="Referencia externa"
                  value={refs[c.id] ?? ""}
                  onChange={(e) => setRefs((prev) => ({ ...prev, [c.id]: e.target.value }))}
                  style={{
                    padding: "8px 10px",
                    borderRadius: "var(--shell-radius-sm)",
                    border: "1px solid var(--shell-border)",
                    fontSize: 12.5,
                    width: 160,
                  }}
                />
                <button type="button" onClick={() => handleReconcile(c.id)} disabled={pending} style={subtleButtonStyle}>
                  Marcar conciliada
                </button>
                <button type="button" onClick={() => handleException(c.id)} disabled={pending} style={subtleButtonStyle}>
                  Excepción
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
