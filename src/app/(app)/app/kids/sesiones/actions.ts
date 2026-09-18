"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import {
  listKidsSessions,
  createKidsSessionFromActivity,
  type KidsSessionDetail,
  type KidsSessionFilters,
} from "@/server/kids/kids-sessions-service";
import { listKidsRooms, type KidsRoom } from "@/server/kids/kids-rooms-service";
import { listActivities, type ActivitySummary } from "@/server/activities/activities-service";

export type SesionesActionState<T> = { error: string | null; data?: T };

function asState<T>(err: unknown): SesionesActionState<T> {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

export async function listKidsSessionsAction(
  filters: KidsSessionFilters,
): Promise<SesionesActionState<KidsSessionDetail[]>> {
  const tenant = await requireTenantContext();
  try {
    const data = await listKidsSessions(tenant.churchId, filters);
    return { error: null, data };
  } catch (err) {
    return asState(err);
  }
}

export async function listKidsRoomsForSelectAction(): Promise<SesionesActionState<KidsRoom[]>> {
  const tenant = await requireTenantContext();
  try {
    const data = await listKidsRooms(tenant.churchId, { active: true });
    return { error: null, data };
  } catch (err) {
    return asState(err);
  }
}

/**
 * Actividades próximas ('planned'/'published', que empiezan en el futuro)
 * para el selector de "Nueva sesión desde actividad". Reutiliza
 * listActivities (Fase 4) filtrando por from=ahora; no se filtra por status
 * porque ActivityListFilters no admite una lista de estados, así que se
 * filtra en memoria tras traer la página.
 */
export async function listUpcomingActivitiesAction(): Promise<SesionesActionState<ActivitySummary[]>> {
  const tenant = await requireTenantContext();
  try {
    const { items } = await listActivities(tenant.churchId, {
      from: new Date().toISOString(),
      pageSize: 100,
      order: "asc",
    });
    const data = items.filter((a) => a.status === "planned" || a.status === "published");
    return { error: null, data };
  } catch (err) {
    return asState(err);
  }
}

export async function crearSesionDesdeActividadAction(
  activityId: string,
  roomId: string,
  campusId?: string,
): Promise<SesionesActionState<{ sessionId: string }>> {
  const tenant = await requireTenantContext();
  try {
    const data = await createKidsSessionFromActivity(tenant.churchId, activityId, roomId, campusId);
    revalidatePath("/app/kids/sesiones");
    return { error: null, data };
  } catch (err) {
    return asState(err);
  }
}
