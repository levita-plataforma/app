import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { listGivingCampaigns, listGivingFunds } from "@/server/giving/giving-service";
import { ensureGivingModule } from "../module-gate";
import CampanasManager from "./CampanasManager";

export default async function CampanasPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureGivingModule(tenant.churchId);
  if (disabled) return disabled;

  const [campaigns, funds, canManage] = await Promise.all([
    listGivingCampaigns(tenant.churchId),
    listGivingFunds(tenant.churchId),
    hasCapability(tenant.churchId, "giving.manage_campaigns"),
  ]);

  return (
    <>
      <section style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/app/ofrendas" style={{ color: "var(--shell-text-muted)", display: "flex" }}>
          <ArrowLeft size={18} />
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Campañas</h1>
      </section>

      <CampanasManager campaigns={campaigns} funds={funds} canManage={canManage} />
    </>
  );
}
