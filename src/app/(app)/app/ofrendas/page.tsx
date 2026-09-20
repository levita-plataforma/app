import Link from "next/link";
import { Coins, Wallet, ClipboardCheck, Megaphone, Plus } from "lucide-react";
import StatCard from "@/components/shell/StatCard";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { getGivingSummary, listGivingFunds, formatMoney } from "@/server/giving/giving-service";
import { ensureGivingModule } from "./module-gate";
import { primaryButtonStyle, secondaryButtonStyle } from "./ui";

/**
 * Dashboard de Ofrendas. KPIs reales, nunca ficticios (encargo §42).
 * Privacidad del dashboard (encargo §43): giving_summary ya solo devuelve
 * agregados (nunca filas), así que cualquier usuario con
 * giving.read_summary llega aquí sin ver ningún donante — la separación
 * vive en la RPC/RLS, no solo en esta página.
 */
export default async function OfrendasPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureGivingModule(tenant.churchId);
  if (disabled) return disabled;

  const [canReadSummary, canReadDetail, canCreate] = await Promise.all([
    hasCapability(tenant.churchId, "giving.read_summary"),
    hasCapability(tenant.churchId, "giving.read_contributions"),
    hasCapability(tenant.churchId, "giving.create_contribution"),
  ]);

  if (!canReadSummary && !canReadDetail) {
    return (
      <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
        <span className="module-icon" style={{ background: "var(--mod-giving-bg)", color: "var(--mod-giving-fg)" }}>
          <Coins aria-hidden="true" />
        </span>
        <h3>No tienes acceso a Ofrendas</h3>
        <p>Necesitas una capacidad financiera para consultar este módulo.</p>
      </div>
    );
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [summary, funds] = await Promise.all([
    getGivingSummary(tenant.churchId, startOfMonth.toISOString()),
    listGivingFunds(tenant.churchId),
  ]);

  return (
    <>
      <section style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Ofrendas</h1>
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
            Generosidad que transforma.
          </p>
        </div>
        {canCreate ? (
          <Link href="/app/ofrendas/aportaciones/nueva" style={primaryButtonStyle()}>
            <Plus size={14} /> Nueva aportación
          </Link>
        ) : null}
      </section>

      <div className="stat-grid">
        <StatCard
          icon={Coins}
          value={formatMoney(summary.totalAmountMinor, summary.currency)}
          label="Total este mes"
          accentBg="var(--mod-giving-bg)"
          accentFg="var(--mod-giving-fg)"
        />
        <StatCard
          icon={Wallet}
          value={String(summary.contributionsCount)}
          label="Número de aportaciones"
          accentBg="var(--mod-giving-bg)"
          accentFg="var(--mod-giving-fg)"
        />
        <StatCard
          icon={ClipboardCheck}
          value={String(summary.pendingReconciliationCount)}
          label="Pendientes de conciliación"
          accentBg="var(--mod-giving-bg)"
          accentFg="var(--mod-giving-fg)"
        />
        <StatCard
          icon={Megaphone}
          value={String(funds.length)}
          label="Fondos activos"
          accentBg="var(--mod-giving-bg)"
          accentFg="var(--mod-giving-fg)"
        />
      </div>

      <section style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {canReadDetail ? (
          <Link href="/app/ofrendas/aportaciones" style={secondaryButtonStyle()}>
            Aportaciones
          </Link>
        ) : null}
        <Link href="/app/ofrendas/fondos" style={secondaryButtonStyle()}>
          Fondos
        </Link>
        <Link href="/app/ofrendas/campanas" style={secondaryButtonStyle()}>
          Campañas
        </Link>
        {canReadDetail ? (
          <>
            <Link href="/app/ofrendas/recurrencia" style={secondaryButtonStyle()}>
              Recurrencia
            </Link>
            <Link href="/app/ofrendas/conciliacion" style={secondaryButtonStyle()}>
              Conciliación
            </Link>
            <Link href="/app/ofrendas/informes" style={secondaryButtonStyle()}>
              Informes
            </Link>
          </>
        ) : null}
      </section>

      {!canReadDetail ? (
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
          Ves totales agregados. Para consultar aportaciones individuales necesitas una capacidad financiera de
          detalle.
        </p>
      ) : null}
    </>
  );
}
