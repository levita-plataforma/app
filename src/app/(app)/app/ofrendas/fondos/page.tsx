import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { listGivingFunds } from "@/server/giving/giving-service";
import { ensureGivingModule } from "../module-gate";
import FondosManager from "./FondosManager";

export default async function FondosPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureGivingModule(tenant.churchId);
  if (disabled) return disabled;

  const [funds, canManage] = await Promise.all([
    listGivingFunds(tenant.churchId),
    hasCapability(tenant.churchId, "giving.manage_funds"),
  ]);

  return (
    <>
      <section style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/app/ofrendas" style={{ color: "var(--shell-text-muted)", display: "flex" }}>
          <ArrowLeft size={18} />
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Fondos</h1>
      </section>

      <FondosManager funds={funds} canManage={canManage} />
    </>
  );
}
