import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { getGivingSummaryByFund, getGivingSummaryByMethod, formatMoney, GIVING_METHOD_LABELS } from "@/server/giving/giving-service";
import { ensureGivingModule } from "../module-gate";
import { secondaryButtonStyle } from "../ui";

export default async function InformesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const tenant = await requireTenantContext();
  const disabled = await ensureGivingModule(tenant.churchId);
  if (disabled) return disabled;

  const canRead = await hasCapability(tenant.churchId, "giving.read_contributions");
  if (!canRead) {
    return (
      <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
        <h3>No tienes acceso a los informes</h3>
      </div>
    );
  }

  const canExport = await hasCapability(tenant.churchId, "giving.export");
  const { desde, hasta } = await searchParams;
  const from = desde ? new Date(desde).toISOString() : undefined;
  const to = hasta ? new Date(hasta).toISOString() : undefined;

  const [byFund, byMethod] = await Promise.all([
    getGivingSummaryByFund(tenant.churchId, from, to),
    getGivingSummaryByMethod(tenant.churchId, from, to),
  ]);

  const currency = byFund[0] ? undefined : "EUR";
  const exportHref = `/app/ofrendas/informes/export${desde || hasta ? `?${new URLSearchParams({ ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}) }).toString()}` : ""}`;

  return (
    <>
      <section style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/app/ofrendas" style={{ color: "var(--shell-text-muted)", display: "flex" }}>
            <ArrowLeft size={18} />
          </Link>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Informes</h1>
        </div>
        {canExport ? (
          <a href={exportHref} style={secondaryButtonStyle()}>
            <Download size={14} /> Exportar CSV
          </a>
        ) : null}
      </section>

      <form style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input type="date" name="desde" defaultValue={desde ?? ""} style={filterStyle} />
        <input type="date" name="hasta" defaultValue={hasta ?? ""} style={filterStyle} />
        <button type="submit" style={{ ...filterStyle, fontWeight: 600, cursor: "pointer" }}>
          Filtrar por período
        </button>
      </form>

      <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>Por fondo</h2>
        {byFund.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>Sin datos para este período.</p>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {byFund.map((row) => (
              <li key={row.fundId} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>{row.fundName}</span>
                <span style={{ fontWeight: 600 }}>
                  {formatMoney(row.totalAmountMinor, currency ?? "EUR")} · {row.contributionsCount} aportaciones
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>Por método</h2>
        {byMethod.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>Sin datos para este período.</p>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {byMethod.map((row) => (
              <li key={row.method} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>{GIVING_METHOD_LABELS[row.method]}</span>
                <span style={{ fontWeight: 600 }}>
                  {formatMoney(row.totalAmountMinor, currency ?? "EUR")} · {row.contributionsCount} aportaciones
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

const filterStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: "var(--shell-radius-sm)",
  border: "1px solid var(--shell-border)",
  fontSize: 13,
  background: "var(--shell-surface)",
  color: "var(--shell-text)",
};
