import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { listGivingContributions, listGivingFunds } from "@/server/giving/giving-service";
import { ensureGivingModule } from "../module-gate";
import ConciliacionManager from "./ConciliacionManager";

export default async function ConciliacionPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureGivingModule(tenant.churchId);
  if (disabled) return disabled;

  const canReconcile = await hasCapability(tenant.churchId, "giving.reconcile");
  if (!canReconcile) {
    return (
      <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
        <h3>No tienes acceso a la conciliación</h3>
      </div>
    );
  }

  const [unreconciled, funds] = await Promise.all([
    listGivingContributions(tenant.churchId, { reconciliationStatus: "unreconciled", status: "succeeded" }),
    listGivingFunds(tenant.churchId),
  ]);

  const fundNames = new Map(funds.map((f) => [f.id, f.name]));

  return (
    <>
      <section style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/app/ofrendas" style={{ color: "var(--shell-text-muted)", display: "flex" }}>
          <ArrowLeft size={18} />
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Conciliación</h1>
      </section>

      <ConciliacionManager contributions={unreconciled} fundNames={Object.fromEntries(fundNames)} />
    </>
  );
}
