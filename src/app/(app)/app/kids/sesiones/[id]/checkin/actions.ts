"use server";

import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import {
  searchKidForCheckin,
  checkinKid,
  type KidCheckinCandidate,
  type CheckinKidResult,
} from "@/server/kids/kids-checkin-service";
import { getRatioStatus, type KidsRatioView } from "@/server/kids/kids-sessions-service";

export type CheckinActionState<T> = { error: string | null; data?: T };

function asState<T>(err: unknown): CheckinActionState<T> {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

export async function buscarMenorCheckinAction(
  sessionId: string,
  query: string,
): Promise<CheckinActionState<KidCheckinCandidate[]>> {
  const tenant = await requireTenantContext();
  try {
    const data = await searchKidForCheckin(tenant.churchId, sessionId, query);
    return { error: null, data };
  } catch (err) {
    return asState(err);
  }
}

export async function confirmarCheckinAction(
  sessionId: string,
  kidPersonId: string,
): Promise<CheckinActionState<CheckinKidResult>> {
  const tenant = await requireTenantContext();
  try {
    const data = await checkinKid(tenant.churchId, sessionId, kidPersonId);
    return { error: null, data };
  } catch (err) {
    return asState(err);
  }
}

/**
 * El sessionId llega del cliente. `getRatioStatus` lo resuelve primero
 * contra la iglesia del contexto y, si no le corresponde o falta permiso,
 * devuelve un estado propio en vez de dejar que la consulta responda a
 * cualquiera: hasta el hotfix, la función de la base contestaba con la
 * ocupación de cualquier sala, también de otra iglesia.
 */
export async function ratioStatusCheckinAction(sessionId: string): Promise<CheckinActionState<KidsRatioView>> {
  const tenant = await requireTenantContext();
  try {
    const data = await getRatioStatus(tenant.churchId, sessionId);
    return { error: null, data };
  } catch (err) {
    return asState(err);
  }
}
