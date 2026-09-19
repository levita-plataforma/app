"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import {
  cancelGroupJoinRequest,
  requestGroupJoin,
  resolveGroupJoinRequest,
} from "@/server/groups/groups-service";

export type SolicitudesState = { error: string | null };

const OK: SolicitudesState = { error: null };

function asState(err: unknown): SolicitudesState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

function revalidateRequests(groupId?: string) {
  revalidatePath("/app/grupos/solicitudes");
  revalidatePath("/app/grupos");
  if (groupId) revalidatePath(`/app/grupos/${groupId}`);
}

export async function resolverSolicitudAction(
  requestId: string,
  accept: boolean,
  note?: string,
): Promise<SolicitudesState> {
  await requireTenantContext();
  try {
    await resolveGroupJoinRequest(requestId, accept, note ?? null);
  } catch (err) {
    return asState(err);
  }
  revalidateRequests();
  return OK;
}

/** Solo quien hizo la solicitud puede retirarla; la RPC lo vuelve a comprobar. */
export async function retirarSolicitudAction(requestId: string): Promise<SolicitudesState> {
  await requireTenantContext();
  try {
    await cancelGroupJoinRequest(requestId);
  } catch (err) {
    return asState(err);
  }
  revalidateRequests();
  return OK;
}

/**
 * Pedir plaza en un grupo. Solo una solicitud pendiente por persona y grupo
 * (decisión P-7) y el ingreso siempre lo aprueba el responsable.
 */
export async function pedirPlazaAction(groupId: string, message?: string): Promise<SolicitudesState> {
  await requireTenantContext();
  try {
    await requestGroupJoin(groupId, message ?? null);
  } catch (err) {
    return asState(err);
  }
  revalidateRequests(groupId);
  return OK;
}
