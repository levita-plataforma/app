import { notFound } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { getGroup, getGroupRoster, listGroupJoinRequests, listGroupTypes } from "@/server/groups/groups-service";
import { listGroupMeetings } from "@/server/groups/group-meetings-service";
import { ensureGroupsModule } from "../module-gate";
import GrupoFicha from "./GrupoFicha";

export default async function GrupoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenantContext();
  const disabled = await ensureGroupsModule(tenant.churchId);
  if (disabled) return disabled;

  const group = await getGroup(tenant.churchId, id);
  if (!group) notFound();

  // Las capacidades de un grupo concreto se resuelven con el scope 'group':
  // quien lleva ese grupo las tiene sobre él y no sobre el resto.
  const [canManage, canManageMembers, canManageRequests, canManageMeetings, canManageAttendance] = await Promise.all([
    hasCapability(tenant.churchId, "group.manage", "group", id),
    hasCapability(tenant.churchId, "group.member.manage", "group", id),
    hasCapability(tenant.churchId, "group.request.manage", "group", id),
    hasCapability(tenant.churchId, "group.meeting.manage", "group", id),
    hasCapability(tenant.churchId, "group.attendance.manage", "group", id),
  ]);

  const [roster, meetings, pendingRequests, groupTypes] = await Promise.all([
    getGroupRoster(id).catch(() => []),
    listGroupMeetings(id, { limit: 100 }).catch(() => []),
    canManageRequests
      ? listGroupJoinRequests(tenant.churchId, { groupId: id, status: "pending" }).catch(() => [])
      : Promise.resolve([]),
    listGroupTypes(tenant.churchId),
  ]);

  return (
    <GrupoFicha
      group={group}
      roster={roster}
      meetings={meetings}
      pendingRequests={pendingRequests}
      groupTypes={groupTypes.map((type) => ({ id: type.id, name: type.name }))}
      permissions={{ canManage, canManageMembers, canManageRequests, canManageMeetings, canManageAttendance }}
    />
  );
}
