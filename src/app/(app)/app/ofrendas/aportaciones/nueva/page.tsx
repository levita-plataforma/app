import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { listGivingFunds, listGivingCampaigns } from "@/server/giving/giving-service";
import { ensureGivingModule } from "../../module-gate";
import NuevaAportacionForm from "./NuevaAportacionForm";

export default async function NuevaAportacionPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureGivingModule(tenant.churchId);
  if (disabled) return disabled;

  await requireCapability(tenant.churchId, "giving.create_contribution");

  const [funds, campaigns] = await Promise.all([
    listGivingFunds(tenant.churchId),
    listGivingCampaigns(tenant.churchId),
  ]);

  return (
    <>
      <section style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/app/ofrendas/aportaciones" style={{ color: "var(--shell-text-muted)", display: "flex" }}>
          <ArrowLeft size={18} />
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Nueva aportación</h1>
      </section>

      <NuevaAportacionForm funds={funds} campaigns={campaigns} />
    </>
  );
}
