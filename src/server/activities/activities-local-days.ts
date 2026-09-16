import "server-only";
import { addDaysToKey, localDateKey } from "@/lib/activities/time";
import {
  listActivities,
  type ActivityListFilters,
  type ActivitySummary,
} from "@/server/activities/activities-service";

/**
 * Listado de actividades por DÍAS CIVILES en la zona de cada actividad.
 *
 * En TS no se convierte hora local a instante (ADR 0017), así que el rango se
 * consulta como instantes ampliados ±14 h respecto a medianoche UTC (cubre
 * UTC-12 … UTC+14) y después se descartan, en servidor, las actividades que
 * solo entraron por ese margen comparando `localDateKey(…, activity.timezone)`
 * con las claves pedidas. Como el filtrado ocurre tras la consulta, la
 * paginación se hace DESPUÉS de filtrar, sobre un máximo de
 * `LOCAL_DAY_FETCH_CAP` filas; si el rango tiene más, `capped` lo indica para
 * avisar al usuario (el total no promete más de lo que se puede mostrar).
 */

export const LOCAL_DAY_FETCH_CAP = 200;

const ZONE_MARGIN_MS = 14 * 60 * 60 * 1000;
/** Máximo de filas por consulta que admite listActivities. */
const SERVICE_PAGE_SIZE = 100;

/** Primer y último día civil (zona de la actividad) que ocupa una actividad con horario. */
export function activityLocalSpan(activity: Pick<ActivitySummary, "startsAt" | "endsAt" | "timezone">): {
  startKey: string | null;
  endKey: string | null;
} {
  const startKey = activity.startsAt ? localDateKey(activity.startsAt, activity.timezone) : null;
  if (!activity.endsAt) return { startKey, endKey: startKey };
  const endMs = Date.parse(activity.endsAt);
  const startMs = activity.startsAt ? Date.parse(activity.startsAt) : Number.NEGATIVE_INFINITY;
  // Una actividad que termina justo a medianoche no ocupa el día siguiente.
  const endKey = endMs > startMs ? localDateKey(new Date(endMs - 1).toISOString(), activity.timezone) : startKey;
  return { startKey, endKey };
}

/** ¿La actividad toca algún día civil de [firstKey, lastKey] (extremos opcionales)? */
export function overlapsLocalDays(
  activity: Pick<ActivitySummary, "startsAt" | "endsAt" | "timezone">,
  firstKey: string | undefined,
  lastKey: string | undefined,
): boolean {
  const { startKey, endKey } = activityLocalSpan(activity);
  if (lastKey && startKey && startKey > lastKey) return false;
  if (firstKey && endKey && endKey < firstKey) return false;
  return true;
}

/** Instantes ampliados ±14 h para consultar el intervalo de claves civiles. */
export function marginInstants(firstKey: string | undefined, lastKey: string | undefined): { from?: string; to?: string } {
  return {
    from: firstKey ? new Date(Date.parse(`${firstKey}T00:00:00Z`) - ZONE_MARGIN_MS).toISOString() : undefined,
    to: lastKey ? new Date(Date.parse(`${addDaysToKey(lastKey, 1)}T00:00:00Z`) + ZONE_MARGIN_MS).toISOString() : undefined,
  };
}

export type LocalDayListResult = {
  items: ActivitySummary[];
  /** Total tras filtrar por día local (acotado a LOCAL_DAY_FETCH_CAP filas consultadas). */
  total: number;
  page: number;
  pageSize: number;
  /** true si el rango tenía más filas de las que se consultaron. */
  capped: boolean;
};

export async function listActivitiesByLocalDays(
  churchId: string,
  filters: Omit<ActivityListFilters, "from" | "to" | "page" | "pageSize">,
  range: { firstKey?: string; lastKey?: string },
  pagination: { page: number; pageSize: number },
): Promise<LocalDayListResult> {
  const { from, to } = marginInstants(range.firstKey, range.lastKey);
  const rows: ActivitySummary[] = [];
  let rawTotal = 0;
  for (let servicePage = 1; rows.length < LOCAL_DAY_FETCH_CAP; servicePage += 1) {
    const result = await listActivities(churchId, {
      ...filters,
      from,
      to,
      page: servicePage,
      pageSize: SERVICE_PAGE_SIZE,
    });
    rawTotal = result.total;
    rows.push(...result.items);
    if (result.items.length < SERVICE_PAGE_SIZE || rows.length >= rawTotal) break;
  }
  const fetched = rows.slice(0, LOCAL_DAY_FETCH_CAP);
  const filtered = fetched.filter((a) => overlapsLocalDays(a, range.firstKey, range.lastKey));

  const pageSize = Math.max(1, pagination.pageSize);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, pagination.page), totalPages);
  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length,
    page,
    pageSize,
    capped: rawTotal > fetched.length,
  };
}
