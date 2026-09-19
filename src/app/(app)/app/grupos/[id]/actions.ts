"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import {
  addGroupLeader,
  addGroupMember,
  endGroupLeadership,
  removeGroupMember,
  resolveGroupJoinRequest,
  setGroupArchived,
  setGroupStatus,
  updateGroup,
  type GroupInput,
} from "@/server/groups/groups-service";
import {
  cancelGroupMeeting,
  rescheduleGroupMeeting,
  scheduleGroupMeeting,
  type GroupMeetingRecurrence,
} from "@/server/groups/group-meetings-service";
import { listCandidatePeople } from "@/server/assignments/assignments-service";
import {
  isGroupJoinPolicy,
  isGroupLeaderRole,
  isGroupStatus,
  isGroupVisibility,
} from "@/lib/groups/constants";

export type GrupoState = { error: string | null };

const OK: GrupoState = { error: null };

function asState(err: unknown): GrupoState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

function revalidateGroup(groupId: string) {
  revalidatePath(`/app/grupos/${groupId}`);
  revalidatePath("/app/grupos");
  revalidatePath("/app/grupos/solicitudes");
  revalidatePath("/app/calendario");
}

function optionalText(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (raw === null) return undefined;
  const value = String(raw).trim();
  return value === "" ? undefined : value;
}

// ---------------------------------------------------------------------------
// Datos del grupo
// ---------------------------------------------------------------------------

export async function guardarGrupoAction(groupId: string, formData: FormData): Promise<GrupoState> {
  await requireTenantContext();

  const visibility = String(formData.get("visibility") ?? "");
  const joinPolicy = String(formData.get("joinPolicy") ?? "");
  const capacityRaw = optionalText(formData, "capacity");

  const input: GroupInput = {
    name: String(formData.get("name") ?? "").trim(),
    description: optionalText(formData, "description") ?? null,
    groupTypeId: optionalText(formData, "groupTypeId") ?? null,
    visibility: isGroupVisibility(visibility) ? visibility : undefined,
    joinPolicy: isGroupJoinPolicy(joinPolicy) ? joinPolicy : undefined,
    capacity: capacityRaw ? Number(capacityRaw) : null,
    ageSegment: optionalText(formData, "ageSegment") ?? null,
    meetingLocationText: optionalText(formData, "meetingLocationText") ?? null,
    meetingScheduleText: optionalText(formData, "meetingScheduleText") ?? null,
  };

  if (!input.name) return { error: "El nombre del grupo es obligatorio." };

  try {
    await updateGroup(groupId, input);
  } catch (err) {
    return asState(err);
  }
  revalidateGroup(groupId);
  return OK;
}

export async function cambiarEstadoGrupoAction(groupId: string, status: string): Promise<GrupoState> {
  await requireTenantContext();
  if (!isGroupStatus(status)) return { error: "Ese estado no existe." };

  try {
    await setGroupStatus(groupId, status);
  } catch (err) {
    return asState(err);
  }
  revalidateGroup(groupId);
  return OK;
}

export async function archivarGrupoAction(groupId: string, archived: boolean): Promise<GrupoState> {
  await requireTenantContext();
  try {
    await setGroupArchived(groupId, archived);
  } catch (err) {
    return asState(err);
  }
  revalidateGroup(groupId);
  return OK;
}

// ---------------------------------------------------------------------------
// Responsables y participantes
// ---------------------------------------------------------------------------

/**
 * Buscador de personas al añadir participantes o responsables. Reutiliza
 * `listCandidatePeople` (hasta 50 resultados) sin área de servicio: aquí el
 * criterio es solo pertenecer a la iglesia.
 */
export async function buscarPersonasAction(search: string): Promise<{ id: string; name: string }[]> {
  const tenant = await requireTenantContext();
  try {
    const people = await listCandidatePeople(tenant.churchId, null, search);
    return people.map((person) => ({ id: person.id, name: person.name }));
  } catch {
    return [];
  }
}

export async function anadirResponsableAction(
  groupId: string,
  personId: string,
  role: string,
): Promise<GrupoState> {
  await requireTenantContext();
  if (!isGroupLeaderRole(role)) return { error: "Ese papel no existe." };

  try {
    await addGroupLeader(groupId, personId, role);
  } catch (err) {
    return asState(err);
  }
  revalidateGroup(groupId);
  return OK;
}

/**
 * Retirar al último responsable está permitido: el grupo queda marcado como
 * «sin responsable» y no se bloquea la operación (decisión P-2).
 */
export async function retirarResponsableAction(groupId: string, personId: string): Promise<GrupoState> {
  await requireTenantContext();
  try {
    await endGroupLeadership(groupId, personId);
  } catch (err) {
    return asState(err);
  }
  revalidateGroup(groupId);
  return OK;
}

export async function anadirParticipanteAction(
  groupId: string,
  personId: string,
  notes?: string,
): Promise<GrupoState> {
  await requireTenantContext();
  try {
    await addGroupMember(groupId, personId, notes ?? null);
  } catch (err) {
    return asState(err);
  }
  revalidateGroup(groupId);
  return OK;
}

export async function darDeBajaParticipanteAction(
  groupId: string,
  personId: string,
  reason?: string,
): Promise<GrupoState> {
  await requireTenantContext();
  try {
    await removeGroupMember(groupId, personId, reason ?? null);
  } catch (err) {
    return asState(err);
  }
  revalidateGroup(groupId);
  return OK;
}

// ---------------------------------------------------------------------------
// Solicitudes de ingreso
// ---------------------------------------------------------------------------

export async function resolverSolicitudAction(
  groupId: string,
  requestId: string,
  accept: boolean,
  note?: string,
): Promise<GrupoState> {
  await requireTenantContext();
  try {
    await resolveGroupJoinRequest(requestId, accept, note ?? null);
  } catch (err) {
    return asState(err);
  }
  revalidateGroup(groupId);
  return OK;
}

// ---------------------------------------------------------------------------
// Reuniones
// ---------------------------------------------------------------------------

export async function convocarReunionAction(groupId: string, formData: FormData): Promise<GrupoState> {
  await requireTenantContext();

  const localStart = optionalText(formData, "localStart");
  if (!localStart) return { error: "Indica la fecha y la hora de la reunión." };

  const durationRaw = optionalText(formData, "durationMinutes");
  let recurrence: GroupMeetingRecurrence | null = null;

  if (formData.get("repeats") === "on") {
    const frequency = String(formData.get("frequency") ?? "weekly") === "monthly" ? "monthly" : "weekly";
    const intervalRaw = optionalText(formData, "interval");
    const weekdays = formData
      .getAll("weekdays")
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7);
    const untilDate = optionalText(formData, "untilDate");
    const countRaw = optionalText(formData, "count");

    recurrence = {
      frequency,
      interval: intervalRaw ? Number(intervalRaw) : 1,
      weekdays: weekdays.length > 0 ? [...new Set(weekdays)].sort((a, b) => a - b) : undefined,
      untilDate: untilDate ?? undefined,
      count: !untilDate && countRaw ? Number(countRaw) : undefined,
    };

    if (!recurrence.untilDate && !recurrence.count) {
      return { error: "Indica hasta cuándo se repite: una fecha o un número de reuniones." };
    }
  }

  try {
    await scheduleGroupMeeting(groupId, {
      title: optionalText(formData, "title") ?? null,
      description: optionalText(formData, "description") ?? null,
      localStart,
      localEnd: optionalText(formData, "localEnd") ?? null,
      durationMinutes: durationRaw ? Number(durationRaw) : 90,
      locationText: optionalText(formData, "locationText") ?? null,
      recurrence,
    });
  } catch (err) {
    return asState(err);
  }
  revalidateGroup(groupId);
  return OK;
}

export async function cambiarFechaReunionAction(
  groupId: string,
  meetingId: string,
  localStart: string,
  localEnd?: string,
  locationText?: string,
): Promise<GrupoState> {
  await requireTenantContext();
  if (!localStart) return { error: "Indica la fecha y la hora nuevas." };

  try {
    await rescheduleGroupMeeting(meetingId, {
      localStart,
      localEnd: localEnd || null,
      locationText: locationText ?? undefined,
    });
  } catch (err) {
    return asState(err);
  }
  revalidateGroup(groupId);
  return OK;
}

export async function cancelarReunionAction(
  groupId: string,
  meetingId: string,
  reason?: string,
): Promise<GrupoState> {
  await requireTenantContext();
  try {
    await cancelGroupMeeting(meetingId, reason ?? null);
  } catch (err) {
    return asState(err);
  }
  revalidateGroup(groupId);
  return OK;
}
