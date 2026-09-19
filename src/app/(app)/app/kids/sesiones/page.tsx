import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { listKidsSessions } from "@/server/kids/kids-sessions-service";
import { listKidsRooms } from "@/server/kids/kids-rooms-service";
import { ensureKidsModule } from "../module-gate";
import SesionesManager from "./SesionesManager";
import type { KidsSessionStatus } from "@/server/kids/kids-sessions-service";

type SearchParams = { status?: string; roomId?: string; from?: string; to?: string };

const STATUS_VALUES: KidsSessionStatus[] = ["scheduled", "open", "closed", "cancelled"];

export default async function SesionesKidsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const tenant = await requireTenantContext();
  const disabled = await ensureKidsModule(tenant.churchId);
  if (disabled) return disabled;

  const status = sp.status && STATUS_VALUES.includes(sp.status as KidsSessionStatus) ? (sp.status as KidsSessionStatus) : undefined;

  const [sessions, rooms, canManage] = await Promise.all([
    listKidsSessions(tenant.churchId, {
      status,
      roomId: sp.roomId || undefined,
      from: sp.from || undefined,
      to: sp.to || undefined,
    }),
    listKidsRooms(tenant.churchId, { active: true }),
    hasCapability(tenant.churchId, "kids.session.manage"),
  ]);

  return (
    <SesionesManager
      initialSessions={sessions}
      rooms={rooms}
      canManage={canManage}
      filters={{ status: sp.status, roomId: sp.roomId, from: sp.from, to: sp.to }}
    />
  );
}
