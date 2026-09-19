"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import { recordGroupAttendance, type AttendanceEntry } from "@/server/groups/group-meetings-service";
import { isGroupAttendanceStatus } from "@/lib/groups/constants";

export type AsistenciaState = { error: string | null; saved: number | null };

/**
 * Guarda la asistencia de una reunión. Es idempotente: repetir el envío
 * corrige lo anotado, no duplica. Las personas llegan del formulario como
 * `estado-<personId>`; solo se envían las que tienen un estado del catálogo.
 */
export async function guardarAsistenciaAction(
  groupId: string,
  meetingId: string,
  _prev: AsistenciaState,
  formData: FormData,
): Promise<AsistenciaState> {
  await requireTenantContext();

  const entries: AttendanceEntry[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("estado-")) continue;
    const personId = key.slice("estado-".length);
    const status = String(value);
    if (status === "" || !isGroupAttendanceStatus(status)) continue;
    entries.push({
      personId,
      status,
      isGuest: formData.get(`invitado-${personId}`) === "on",
      notes: String(formData.get(`nota-${personId}`) ?? "").trim() || null,
    });
  }

  if (entries.length === 0) {
    return { error: "Marca al menos una persona antes de guardar la asistencia.", saved: null };
  }

  let saved: number;
  try {
    saved = await recordGroupAttendance(meetingId, entries);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message, saved: null };
    throw err;
  }

  revalidatePath(`/app/grupos/${groupId}/asistencia`);
  revalidatePath(`/app/grupos/${groupId}`);
  return { error: null, saved };
}
