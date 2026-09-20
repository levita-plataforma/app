"use client";

import { useActionState, useState } from "react";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import { primaryButtonStyle, GIVING_METHOD_LABELS_CLIENT } from "../../ui";
import type { GivingFund, GivingCampaign } from "@/server/giving/giving-service";
import { crearAportacionAction, contributionFormInitialState, type ContributionFormState } from "../actions";

const fieldStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };

export default function NuevaAportacionForm({ funds, campaigns }: { funds: GivingFund[]; campaigns: GivingCampaign[] }) {
  const [state, formAction, pending] = useActionState<ContributionFormState, FormData>(crearAportacionAction, contributionFormInitialState);
  const [anonymous, setAnonymous] = useState(false);

  const defaultFund = funds.find((f) => f.isDefault) ?? funds[0];

  return (
    <form action={formAction} className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      {state.error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {state.error}
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ ...fieldStyle, flex: "1 1 200px" }}>
          <label htmlFor="fundId" style={authLabelStyle}>
            Fondo *
          </label>
          <select id="fundId" name="fundId" required defaultValue={defaultFund?.id} style={authInputStyle}>
            <option value="">Selecciona…</option>
            {funds.map((fund) => (
              <option key={fund.id} value={fund.id}>
                {fund.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ ...fieldStyle, flex: "1 1 200px" }}>
          <label htmlFor="campaignId" style={authLabelStyle}>
            Campaña (opcional)
          </label>
          <select id="campaignId" name="campaignId" style={authInputStyle}>
            <option value="">Ninguna</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ ...fieldStyle, flex: "1 1 140px" }}>
          <label htmlFor="amount" style={authLabelStyle}>
            Importe *
          </label>
          <input id="amount" name="amount" type="number" min="0.01" step="0.01" required style={authInputStyle} />
        </div>

        <div style={{ ...fieldStyle, flex: "1 1 160px" }}>
          <label htmlFor="method" style={authLabelStyle}>
            Método *
          </label>
          <select id="method" name="method" required style={authInputStyle}>
            {Object.entries(GIVING_METHOD_LABELS_CLIENT).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ ...fieldStyle, flex: "1 1 180px" }}>
          <label htmlFor="contributedAt" style={authLabelStyle}>
            Fecha
          </label>
          <input id="contributedAt" name="contributedAt" type="datetime-local" style={authInputStyle} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ ...fieldStyle, flex: "1 1 220px" }}>
          <label htmlFor="personId" style={authLabelStyle}>
            Persona (opcional)
          </label>
          <input
            id="personId"
            name="personId"
            style={authInputStyle}
            placeholder="ID de persona, si se conoce"
            disabled={anonymous}
          />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, paddingBottom: 9 }}>
          <input type="checkbox" name="anonymous" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
          Aportación anónima
        </label>
      </div>

      <div style={{ ...fieldStyle }}>
        <label htmlFor="reference" style={authLabelStyle}>
          Referencia
        </label>
        <input id="reference" name="reference" style={authInputStyle} />
      </div>

      <div style={{ ...fieldStyle }}>
        <label htmlFor="notes" style={authLabelStyle}>
          Nota restringida
        </label>
        <textarea id="notes" name="notes" rows={2} style={authInputStyle} placeholder="Visible solo con detalle financiero. Nunca en listados generales." />
      </div>

      <div>
        <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
          {pending ? "Registrando…" : "Registrar aportación"}
        </button>
      </div>
    </form>
  );
}
