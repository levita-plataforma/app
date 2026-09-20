"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import { primaryButtonStyle, subtleButtonStyle, formatDate, formatMoneyClient } from "../ui";
import type { GivingRecurringPlan, GivingFund, GivingRecurringPlanStatus } from "@/server/giving/giving-service";
import { crearPlanRecurrenteAction, cambiarEstadoPlanAction, recurringPlanFormInitialState, type RecurringPlanFormState } from "./actions";

const FREQUENCY_LABELS: Record<string, string> = { weekly: "Semanal", monthly: "Mensual", yearly: "Anual" };
const STATUS_LABELS: Record<GivingRecurringPlanStatus, string> = { active: "Activo", paused: "Pausado", ended: "Finalizado" };

export default function RecurrenciaManager({
  plans,
  funds,
  canManage,
}: {
  plans: GivingRecurringPlan[];
  funds: GivingFund[];
  canManage: boolean;
}) {
  const [createState, createAction, createPending] = useActionState<RecurringPlanFormState, FormData>(
    crearPlanRecurrenteAction,
    recurringPlanFormInitialState,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleStatusChange(planId: string, status: GivingRecurringPlanStatus) {
    setError(null);
    startTransition(async () => {
      const result = await cambiarEstadoPlanAction(planId, status);
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
          <p style={{ fontSize: 13, fontWeight: 600 }}>Nuevo plan recurrente</p>
          {createState.error ? (
            <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
              {createState.error}
            </p>
          ) : null}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 180px" }}>
              <label htmlFor="fundId" style={authLabelStyle}>
                Fondo *
              </label>
              <select id="fundId" name="fundId" required style={authInputStyle}>
                <option value="">Selecciona…</option>
                {funds.map((fund) => (
                  <option key={fund.id} value={fund.id}>
                    {fund.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 120px" }}>
              <label htmlFor="amount" style={authLabelStyle}>
                Importe *
              </label>
              <input id="amount" name="amount" type="number" min="0.01" step="0.01" required style={authInputStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 140px" }}>
              <label htmlFor="frequency" style={authLabelStyle}>
                Frecuencia *
              </label>
              <select id="frequency" name="frequency" required style={authInputStyle}>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
                <option value="yearly">Anual</option>
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 180px" }}>
              <label htmlFor="personId" style={authLabelStyle}>
                Persona (opcional)
              </label>
              <input id="personId" name="personId" style={authInputStyle} placeholder="ID de persona" />
            </div>
            <button type="submit" disabled={createPending} style={primaryButtonStyle(createPending)}>
              {createPending ? "Creando…" : "Crear plan"}
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
        {plans.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "32px 16px" }}>
            <p style={{ fontWeight: 600 }}>No hay planes recurrentes registrados.</p>
          </div>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {plans.map((plan) => (
              <li
                key={plan.id}
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
                <div>
                  <p style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {formatMoneyClient(plan.amountMinor, plan.currency)} · {FREQUENCY_LABELS[plan.frequency]}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--shell-text-muted)" }}>
                    {STATUS_LABELS[plan.status]} · Desde {formatDate(plan.startsAt)}
                  </p>
                </div>
                {canManage && plan.status !== "ended" ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(plan.id, plan.status === "active" ? "paused" : "active")}
                      disabled={pending}
                      style={subtleButtonStyle}
                    >
                      {plan.status === "active" ? "Pausar" : "Reactivar"}
                    </button>
                    <button type="button" onClick={() => handleStatusChange(plan.id, "ended")} disabled={pending} style={subtleButtonStyle}>
                      Finalizar
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
