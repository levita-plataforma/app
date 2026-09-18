"use server";

import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import {
  searchAttendeeForCheckin,
  checkinAttendee,
  undoCheckin,
  getCheckinCounts,
  type CheckinAttendeeResult,
  type CheckinCounts,
} from "@/server/events/checkin-service";

export type CheckinActionState<T> = { error: string | null; data?: T };

function asState<T>(err: unknown): CheckinActionState<T> {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

export async function buscarAsistenteAction(eventId: string, query: string): Promise<CheckinActionState<CheckinAttendeeResult[]>> {
  const tenant = await requireTenantContext();
  try {
    const data = await searchAttendeeForCheckin(tenant.churchId, eventId, query);
    return { error: null, data };
  } catch (err) {
    return asState(err);
  }
}

export async function marcarAsistenciaAction(attendeeId: string): Promise<CheckinActionState<{ attendanceStatus: string; checkedInAt: string }>> {
  const tenant = await requireTenantContext();
  try {
    const data = await checkinAttendee(tenant.churchId, attendeeId);
    return { error: null, data };
  } catch (err) {
    return asState(err);
  }
}

export async function deshacerAsistenciaAction(attendeeId: string): Promise<CheckinActionState<{ attendanceStatus: string }>> {
  const tenant = await requireTenantContext();
  try {
    const data = await undoCheckin(tenant.churchId, attendeeId);
    return { error: null, data };
  } catch (err) {
    return asState(err);
  }
}

export async function contadorCheckinAction(eventId: string): Promise<CheckinActionState<CheckinCounts>> {
  const tenant = await requireTenantContext();
  try {
    const data = await getCheckinCounts(tenant.churchId, eventId);
    return { error: null, data };
  } catch (err) {
    return asState(err);
  }
}
