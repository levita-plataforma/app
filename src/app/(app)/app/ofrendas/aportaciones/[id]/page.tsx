import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { listGivingContributions, listGivingFunds, listGivingCampaigns, formatMoney, GIVING_METHOD_LABELS } from "@/server/giving/giving-service";
import { ensureGivingModule } from "../../module-gate";
import { formatDateTime } from "../../ui";
import AportacionAcciones from "./AportacionAcciones";

export default async function AportacionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenantContext();
  const disabled = await ensureGivingModule(tenant.churchId);
  if (disabled) return disabled;

  const canRead = await hasCapability(tenant.churchId, "giving.read_contributions");
  if (!canRead) {
    return (
      <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
        <h3>No tienes acceso a este detalle</h3>
      </div>
    );
  }

  const [contributions, funds, campaigns, canUpdate, canRefund, canReconcile] = await Promise.all([
    listGivingContributions(tenant.churchId),
    listGivingFunds(tenant.churchId),
    listGivingCampaigns(tenant.churchId),
    hasCapability(tenant.churchId, "giving.update_contribution"),
    hasCapability(tenant.churchId, "giving.refund"),
    hasCapability(tenant.churchId, "giving.reconcile"),
  ]);

  const contribution = contributions.find((c) => c.id === id);
  if (!contribution) notFound();

  const fund = funds.find((f) => f.id === contribution.fundId);
  const campaign = contribution.campaignId ? campaigns.find((c) => c.id === contribution.campaignId) : null;

  return (
    <>
      <section style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/app/ofrendas/aportaciones" style={{ color: "var(--shell-text-muted)", display: "flex" }}>
          <ArrowLeft size={18} />
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>{formatMoney(contribution.amountMinor, contribution.currency)}</h1>
      </section>

      <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <Row label="Fecha" value={formatDateTime(contribution.contributedAt)} />
        <Row label="Fondo" value={fund?.name ?? "—"} />
        <Row label="Campaña" value={campaign?.name ?? "—"} />
        <Row label="Método" value={GIVING_METHOD_LABELS[contribution.method]} />
        <Row label="Estado" value={contribution.status} />
        <Row label="Conciliación" value={contribution.reconciliationStatus} />
        <Row label="Anónima" value={contribution.anonymous ? "Sí" : "No"} />
        <Row label="Referencia" value={contribution.reference ?? "—"} />
        {contribution.notes ? <Row label="Nota" value={contribution.notes} /> : null}
      </section>

      <AportacionAcciones
        contributionId={contribution.id}
        status={contribution.status}
        amountMinor={contribution.amountMinor}
        canUpdate={canUpdate}
        canRefund={canRefund}
        canReconcile={canReconcile}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
      <span style={{ color: "var(--shell-text-muted)" }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}
