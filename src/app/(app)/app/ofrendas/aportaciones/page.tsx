import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import {
  listGivingContributions,
  listGivingFunds,
  listGivingCampaigns,
  formatMoney,
  GIVING_METHOD_LABELS,
  type GivingMethod,
  type GivingContributionStatus,
  type GivingReconciliationStatus,
} from "@/server/giving/giving-service";
import { ensureGivingModule } from "../module-gate";
import { primaryButtonStyle, formatDate } from "../ui";

const STATUS_LABELS: Record<GivingContributionStatus, string> = {
  pending: "Pendiente",
  succeeded: "Completada",
  failed: "Fallida",
  refunded: "Devuelta",
  cancelled: "Cancelada",
};

const RECONCILIATION_LABELS: Record<GivingReconciliationStatus, string> = {
  unreconciled: "Sin conciliar",
  reconciled: "Conciliada",
  exception: "Excepción",
};

const PAGE_SIZE = 50;

export default async function AportacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ fondo?: string; campana?: string; metodo?: string; estado?: string; conciliacion?: string; page?: string }>;
}) {
  const tenant = await requireTenantContext();
  const disabled = await ensureGivingModule(tenant.churchId);
  if (disabled) return disabled;

  const canRead = await hasCapability(tenant.churchId, "giving.read_contributions");
  if (!canRead) {
    return (
      <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
        <h3>No tienes acceso al detalle de aportaciones</h3>
        <p>Necesitas la capacidad financiera de detalle para ver donantes individuales.</p>
      </div>
    );
  }

  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const [contributions, funds, campaigns, canCreate] = await Promise.all([
    listGivingContributions(tenant.churchId, {
      fundId: params.fondo || undefined,
      campaignId: params.campana || undefined,
      method: (params.metodo as GivingMethod) || undefined,
      status: (params.estado as GivingContributionStatus) || undefined,
      reconciliationStatus: (params.conciliacion as GivingReconciliationStatus) || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    listGivingFunds(tenant.churchId),
    listGivingCampaigns(tenant.churchId),
    hasCapability(tenant.churchId, "giving.create_contribution"),
  ]);

  const fundNames = new Map(funds.map((f) => [f.id, f.name]));
  const campaignNames = new Map(campaigns.map((c) => [c.id, c.name]));

  return (
    <>
      <section style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/app/ofrendas" style={{ color: "var(--shell-text-muted)", display: "flex" }}>
            <ArrowLeft size={18} />
          </Link>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Aportaciones</h1>
        </div>
        {canCreate ? (
          <Link href="/app/ofrendas/aportaciones/nueva" style={primaryButtonStyle()}>
            <Plus size={14} /> Nueva aportación
          </Link>
        ) : null}
      </section>

      <form style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select name="fondo" defaultValue={params.fondo ?? ""} style={filterStyle}>
          <option value="">Todos los fondos</option>
          {funds.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select name="campana" defaultValue={params.campana ?? ""} style={filterStyle}>
          <option value="">Todas las campañas</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="metodo" defaultValue={params.metodo ?? ""} style={filterStyle}>
          <option value="">Todos los métodos</option>
          {Object.entries(GIVING_METHOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select name="estado" defaultValue={params.estado ?? ""} style={filterStyle}>
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select name="conciliacion" defaultValue={params.conciliacion ?? ""} style={filterStyle}>
          <option value="">Toda conciliación</option>
          {Object.entries(RECONCILIATION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" style={{ ...filterStyle, fontWeight: 600, cursor: "pointer" }}>
          Filtrar
        </button>
      </form>

      <section className="shell-card" style={{ padding: 20 }}>
        {contributions.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "32px 16px" }}>
            <p style={{ fontWeight: 600 }}>No hay aportaciones con estos filtros.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--shell-text-muted)", fontSize: 12 }}>
                  <th style={{ padding: "8px 10px" }}>Fecha</th>
                  <th style={{ padding: "8px 10px" }}>Fondo</th>
                  <th style={{ padding: "8px 10px" }}>Campaña</th>
                  <th style={{ padding: "8px 10px" }}>Importe</th>
                  <th style={{ padding: "8px 10px" }}>Método</th>
                  <th style={{ padding: "8px 10px" }}>Estado</th>
                  <th style={{ padding: "8px 10px" }}>Conciliación</th>
                </tr>
              </thead>
              <tbody>
                {contributions.map((c) => (
                  <tr key={c.id} style={{ borderTop: "1px solid var(--shell-border)" }}>
                    <td style={{ padding: "10px" }}>
                      <Link href={`/app/ofrendas/aportaciones/${c.id}`} style={{ color: "var(--shell-text)", textDecoration: "none" }}>
                        {formatDate(c.contributedAt)}
                      </Link>
                    </td>
                    <td style={{ padding: "10px" }}>{fundNames.get(c.fundId) ?? "—"}</td>
                    <td style={{ padding: "10px" }}>{c.campaignId ? campaignNames.get(c.campaignId) ?? "—" : "—"}</td>
                    <td style={{ padding: "10px", fontWeight: 600 }}>{formatMoney(c.amountMinor, c.currency)}</td>
                    <td style={{ padding: "10px" }}>{GIVING_METHOD_LABELS[c.method]}</td>
                    <td style={{ padding: "10px" }}>{STATUS_LABELS[c.status]}</td>
                    <td style={{ padding: "10px" }}>{RECONCILIATION_LABELS[c.reconciliationStatus]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
