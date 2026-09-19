import Link from "next/link";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { listLearningPaths } from "@/server/discipleship/learning-paths-service";
import { ensureDiscipleshipModule } from "../module-gate";
import { ensureDiscipleshipRead } from "../access-gate";
import ItinerariosManager from "./ItinerariosManager";

export default async function ItinerariosPage() {
  const tenant = await requireTenantContext();

  const disabled = await ensureDiscipleshipModule(tenant.churchId);
  if (disabled) return disabled;

  const denied = await ensureDiscipleshipRead(tenant.churchId, ["path.read"], "los itinerarios");
  if (denied) return denied;

  const [paths, canManage] = await Promise.all([
    listLearningPaths(tenant.churchId, { includeArchived: true }).catch(() => []),
    hasCapability(tenant.churchId, "path.manage"),
  ]);

  return (
    <>
      <section>
        <Link href="/app/discipulado" style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}>
          ← Discipulado
        </Link>
        <h1 style={{ fontSize: 21, fontWeight: 600, marginTop: 6 }}>Itinerarios</h1>
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 2 }}>
          Los pasos del camino de una persona. Cambiar un itinerario archiva pasos, nunca los borra: el progreso
          conseguido se conserva.
        </p>
      </section>

      <ItinerariosManager paths={paths} canManage={canManage} />
    </>
  );
}
