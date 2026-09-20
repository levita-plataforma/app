"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import { primaryButtonStyle, subtleButtonStyle, formatDate, formatMoneyClient } from "../ui";
import type { GivingCampaign, GivingFund, GivingCampaignStatus } from "@/server/giving/giving-service";
import { crearCampanaAction, cambiarEstadoCampanaAction, campaignFormInitialState, type CampaignFormState } from "./actions";

const STATUS_LABELS: Record<GivingCampaignStatus, string> = {
  draft: "Borrador",
  active: "Activa",
  closed: "Cerrada",
  archived: "Archivada",
};

const NEXT_STATUS: Partial<Record<GivingCampaignStatus, { status: GivingCampaignStatus; label: string }>> = {
  draft: { status: "active", label: "Activar" },
  active: { status: "closed", label: "Cerrar" },
  closed: { status: "archived", label: "Archivar" },
};

export default function CampanasManager({
  campaigns,
  funds,
  canManage,
}: {
  campaigns: GivingCampaign[];
  funds: GivingFund[];
  canManage: boolean;
}) {
  const [createState, createAction, createPending] = useActionState<CampaignFormState, FormData>(crearCampanaAction, campaignFormInitialState);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleTransition(campaignId: string, status: GivingCampaignStatus) {
    setError(null);
    startTransition(async () => {
      const result = await cambiarEstadoCampanaAction(campaignId, status);
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
          <p style={{ fontSize: 13, fontWeight: 600 }}>Nueva campaña</p>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 200px" }}>
              <label htmlFor="name" style={authLabelStyle}>
                Nombre *
              </label>
              <input id="name" name="name" required style={authInputStyle} placeholder="Navidad 2026" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 140px" }}>
              <label htmlFor="targetAmount" style={authLabelStyle}>
                Meta (opcional)
              </label>
              <input id="targetAmount" name="targetAmount" type="number" min="0" step="0.01" style={authInputStyle} />
            </div>
            <button type="submit" disabled={createPending} style={primaryButtonStyle(createPending)}>
              {createPending ? "Creando…" : "Crear campaña"}
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
        {campaigns.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "32px 16px" }}>
            <p style={{ fontWeight: 600 }}>No hay campañas todavía.</p>
          </div>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {campaigns.map((campaign) => {
              const next = NEXT_STATUS[campaign.status];
              return (
                <li
                  key={campaign.id}
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
                    <p style={{ fontSize: 13.5, fontWeight: 600 }}>{campaign.name}</p>
                    <p style={{ fontSize: 12, color: "var(--shell-text-muted)", marginTop: 2 }}>
                      {STATUS_LABELS[campaign.status]}
                      {campaign.targetAmountMinor ? ` · Meta: ${formatMoneyClient(campaign.targetAmountMinor, campaign.currency)}` : ""}
                      {campaign.startsAt ? ` · Desde ${formatDate(campaign.startsAt)}` : ""}
                    </p>
                  </div>
                  {canManage && next ? (
                    <button
                      type="button"
                      onClick={() => handleTransition(campaign.id, next.status)}
                      disabled={pending}
                      style={subtleButtonStyle}
                    >
                      {next.label}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
