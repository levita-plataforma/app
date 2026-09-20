import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { ensureWorshipModule } from "../../module-gate";
import RepertorioForm from "../RepertorioForm";

export default async function NuevoRepertorioPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureWorshipModule(tenant.churchId);
  if (disabled) return disabled;

  await requireCapability(tenant.churchId, "worship.repertoire.manage");

  return (
    <>
      <section style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/app/alabanza/repertorios" style={{ color: "var(--shell-text-muted)", display: "flex" }}>
          <ArrowLeft size={18} />
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Nuevo repertorio</h1>
      </section>

      <RepertorioForm />
    </>
  );
}
