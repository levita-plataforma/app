"use server";

import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import {
  searchKidForCheckin,
  checkinKid,
  type KidCheckinCandidate,
  type CheckinKidResult,
} from "@/server/kids/kids-checkin-service";
import { getRatioStatus, type KidsRatioStatus } from "@/server/kids/kids-sessions-service";

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

export async function ratioStatusCheckinAction(sessionId: string): Promise<CheckinActionState<KidsRatioStatus | null>> {
  const tenant = await requireTenantContext();
  try {
    const data = await getRatioStatus(tenant.churchId, sessionId);
    return { error: null, data };
  } catch (err) {
    return asState(err);
  }
}
