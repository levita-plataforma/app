"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import { createGroup, type GroupInput } from "@/server/groups/groups-service";
import { isGroupJoinPolicy, isGroupStatus, isGroupVisibility } from "@/lib/groups/constants";

export type NuevoGrupoState = { error: string | null };

function optionalText(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (raw === null) return undefined;
  const value = String(raw).trim();
  return value === "" ? undefined : value;
}

/**
 * Lee los campos del formulario validando cada enum contra su lista blanca: un
 * valor que no esté en el catálogo se descarta en vez de viajar a la RPC.
 */
function readGroupInput(formData: FormData): GroupInput {
  const visibility = String(formData.get("visibility") ?? "");
  const status = String(formData.get("status") ?? "");
  const joinPolicy = String(formData.get("joinPolicy") ?? "");
  const capacityRaw = optionalText(formData, "capacity");

  return {
    name: String(formData.get("name") ?? "").trim(),
    description: optionalText(formData, "description") ?? null,
    campusId: optionalText(formData, "campusId") ?? null,
    groupTypeId: optionalText(formData, "groupTypeId") ?? null,
    visibility: isGroupVisibility(visibility) ? visibility : undefined,
    status: isGroupStatus(status) ? status : undefined,
    joinPolicy: isGroupJoinPolicy(joinPolicy) ? joinPolicy : undefined,
    capacity: capacityRaw ? Number(capacityRaw) : null,
    ageSegment: optionalText(formData, "ageSegment") ?? null,
    meetingLocationText: optionalText(formData, "meetingLocationText") ?? null,
    meetingScheduleText: optionalText(formData, "meetingScheduleText") ?? null,
  };
}

export async function crearGrupoAction(_prev: NuevoGrupoState, formData: FormData): Promise<NuevoGrupoState> {
  const tenant = await requireTenantContext();
  const input = readGroupInput(formData);
  if (!input.name) return { error: "El nombre del grupo es obligatorio." };

  let groupId: string;
  try {
    const result = await createGroup(tenant.churchId, input);
    groupId = result.groupId;
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/grupos");
  redirect(`/app/grupos/${groupId}`);
}
