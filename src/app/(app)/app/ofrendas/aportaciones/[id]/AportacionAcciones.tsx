"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { secondaryButtonStyle, formatMoneyClient } from "../../ui";
import { cancelarAportacionAction, reembolsarAportacionAction } from "../actions";
import type { GivingContributionStatus } from "@/server/giving/giving-service";

export default function AportacionAcciones({
  contributionId,
  status,
  amountMinor,
  canUpdate,
  canRefund,
  canReconcile,
}: {
  contributionId: string;
  status: GivingContributionStatus;
  amountMinor: number;
  canUpdate: boolean;
  canRefund: boolean;
  canReconcile: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const router = useRouter();

  function handleCancel() {
    if (!window.confirm("¿Cancelar esta aportación? Queda registrada como cancelada, nunca se elimina.")) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelarAportacionAction(contributionId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleRefund() {
    const amount = Math.round(Number(refundAmount) * 100);
    if (!refundAmount || !Number.isFinite(amount) || amount <= 0) {
      setError("Introduce un importe de devolución válido.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await reembolsarAportacionAction(contributionId, amount);
      if (result.error) {
        setError(result.error);
        return;
      }
      setRefundAmount("");
      router.refresh();
    });
  }

  if (!canUpdate && !canRefund && !canReconcile) return null;

  return (
    <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 600 }}>Acciones</p>

      {error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      ) : null}

      {canRefund && status === "succeeded" ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={refundAmount}
            onChange={(e) => setRefundAmount(e.target.value)}
            placeholder={`Máx. ${formatMoneyClient(amountMinor, "EUR")}`}
            style={{
              padding: "9px 12px",
              borderRadius: "var(--shell-radius-sm)",
              border: "1px solid var(--shell-border)",
              fontSize: 13,
              width: 160,
            }}
          />
          <button type="button" onClick={handleRefund} disabled={pending} style={secondaryButtonStyle(pending)}>
            {pending ? "Procesando…" : "Registrar devolución"}
          </button>
        </div>
      ) : null}

      {canUpdate && (status === "pending" || status === "succeeded") ? (
        <button type="button" onClick={handleCancel} disabled={pending} style={secondaryButtonStyle(pending)}>
          Cancelar aportación
        </button>
      ) : null}
    </section>
  );
}
