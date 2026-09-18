import Link from "next/link";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { listGroupJoinRequests, listGroups, listMyGroupIds } from "@/server/groups/groups-service";
import { ensureGroupsModule } from "../module-gate";
import SolicitudesManager from "./SolicitudesManager";

/**
 * Bandeja de solicitudes de ingreso. Quien puede resolverlas ve las pendientes
 * de sus grupos (RLS ya filtra); cualquier persona ve las suyas y puede pedir
 * plaza en un grupo abierto a solicitudes.
 */
export default async function SolicitudesPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureGroupsModule(tenant.churchId);
  if (disabled) return disabled;

  const canResolve = await hasCapability(tenant.churchId, "group.request.manage");

  const [allRequests, { items: groups }, myGroupIds] = await Promise.all([
    listGroupJoinRequests(tenant.churchId, { limit: 200 }).catch(() => []),
    listGroups(tenant.churchId, { status: "active", joinPolicy: "open_request", pageSize: 100 }).catch(() => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
    })),
    listMyGroupIds(tenant.churchId, tenant.personId),
  ]);

  const mine = allRequests.filter((request) => request.personId === tenant.personId);
  const others = allRequests.filter((request) => request.personId !== tenant.personId);
  const pendingRequests = others.filter((request) => request.status === "pending");
  const resolved = others.filter((request) => request.status !== "pending").slice(0, 50);

  // No se ofrece pedir plaza donde ya se participa ni donde ya hay una
  // solicitud pendiente: solo cabe una por persona y grupo (decisión P-7).
  const myPendingGroupIds = new Set(mine.filter((r) => r.status === "pending").map((r) => r.groupId));
  const openGroups = groups
    .filter((group) => !myGroupIds.has(group.id) && !myPendingGroupIds.has(group.id))
    .filter((group) => group.capacity === null || group.memberCount < group.capacity)
    .map((group) => ({ id: group.id, name: group.name }));

  return (
    <>
      <section>
        <Link href="/app/grupos" style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}>
          ← Grupos
        </Link>
        <h1 style={{ fontSize: 21, fontWeight: 600, marginTop: 6 }}>Solicitudes de ingreso</h1>
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 2 }}>
          Entrar en un grupo siempre lo aprueba una persona.
        </p>
      </section>

      <SolicitudesManager
        pending={pendingRequests}
        resolved={resolved}
        mine={mine}
        openGroups={openGroups}
        canResolve={canResolve}
      />
    </>
  );
}
