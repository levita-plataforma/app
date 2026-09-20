import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { ensureWorshipModule } from "../../module-gate";
import CancionForm from "../CancionForm";

export default async function NuevaCancionPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureWorshipModule(tenant.churchId);
  if (disabled) return disabled;

  await requireCapability(tenant.churchId, "worship.song.manage");

  return (
    <>
      <section style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/app/alabanza/canciones" style={{ color: "var(--shell-text-muted)", display: "flex" }}>
          <ArrowLeft size={18} />
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Nueva canción</h1>
      </section>

      <CancionForm />
    </>
  );
}
