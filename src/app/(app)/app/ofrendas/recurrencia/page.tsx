import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { listGivingRecurringPlans, listGivingFunds } from "@/server/giving/giving-service";
import { ensureGivingModule } from "../module-gate";
import RecurrenciaManager from "./RecurrenciaManager";

export default async function RecurrenciaPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureGivingModule(tenant.churchId);
  if (disabled) return disabled;

  const canRead = await hasCapability(tenant.churchId, "giving.read_contributions");
  if (!canRead) {
    return (
      <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
        <h3>No tienes acceso a la recurrencia</h3>
      </div>
    );
  }

  const [plans, funds, canManage] = await Promise.all([
    listGivingRecurringPlans(tenant.churchId),
    listGivingFunds(tenant.churchId),
    hasCapability(tenant.churchId, "giving.create_contribution"),
  ]);

  return (
    <>
      <section style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/app/ofrendas" style={{ color: "var(--shell-text-muted)", display: "flex" }}>
          <ArrowLeft size={18} />
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Recurrencia</h1>
      </section>

      <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
        Un plan recurrente es un compromiso planificado, no un cobro automático: sin proveedor de pago
        conectado, cada aportación real sigue registrándose manualmente cuando ocurre.
      </p>

      <RecurrenciaManager plans={plans} funds={funds} canManage={canManage} />
    </>
  );
}
