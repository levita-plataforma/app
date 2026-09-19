import Link from "next/link";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { listGroupTypes } from "@/server/groups/groups-service";
import { ensureGroupsModule } from "../module-gate";
import TiposManager from "./TiposManager";

export default async function TiposPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureGroupsModule(tenant.churchId);
  if (disabled) return disabled;

  const [types, canManage] = await Promise.all([
    listGroupTypes(tenant.churchId, true),
    hasCapability(tenant.churchId, "group.manage"),
  ]);

  return (
    <>
      <section>
        <Link href="/app/grupos" style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}>
          ← Grupos
        </Link>
        <h1 style={{ fontSize: 21, fontWeight: 600, marginTop: 6 }}>Tipos de grupo</h1>
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 2 }}>
          El catálogo con el que clasificas los grupos de tu iglesia. Archivar un tipo no toca los grupos que ya lo
          usan.
        </p>
      </section>

      <TiposManager types={types} canManage={canManage} />
    </>
  );
}
