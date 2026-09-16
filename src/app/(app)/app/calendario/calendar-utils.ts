import { addDaysToKey, isoWeekdayOfKey, localDateKey } from "@/lib/activities/time";
import { WEEKDAY_LABELS } from "@/lib/activities/constants";
import type { ActivitySummary } from "@/server/activities/activities-service";

/**
 * Utilidades del calendario operativo (Fase 4). Trabajan con claves civiles
 * "YYYY-MM-DD" (sin zona) y nunca convierten hora local a instante en TS: los
 * instantes solo se formatean con la zona de cada actividad (ADR 0017).
 */

export type CalendarView = "mes" | "semana" | "lista";

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Margen para convertir claves civiles en instantes que cubran cualquier zona (UTC-12 … UTC+14). */
const ZONE_MARGIN_MS = 14 * 60 * 60 * 1000;
/** Las actividades duran como máximo 62 días (regla de base de datos). */
const MAX_SPAN_DAYS = 62;

export function isValidKey(value: string | undefined): value is string {
  if (!value) return false;
  const match = KEY_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isUuid(value: string | undefined): value is string {
  return Boolean(value && UUID_RE.test(value));
}

export function keyParts(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

export function firstOfMonthKey(key: string): string {
  const { year, month } = keyParts(key);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function lastOfMonthKey(key: string): string {
  const { year, month } = keyParts(key);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** Desplaza meses conservando el día cuando existe (31 → último día del mes destino). */
export function addMonthsToKey(key: string, months: number): string {
  const { year, month, day } = keyParts(key);
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

/** Fecha civil de la clave formateada sin zona (se interpreta como UTC a propósito). */
function formatKey(key: string, options: Intl.DateTimeFormatOptions): string {
  const { year, month, day } = keyParts(key);
  return new Intl.DateTimeFormat("es-ES", { ...options, timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatMonthLabel(key: string): string {
  const label = formatKey(key, { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatKeyLong(key: string): string {
  const label = formatKey(key, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatKeyDayMonth(key: string): string {
  return formatKey(key, { day: "numeric", month: "short" });
}

export function monthShortLabel(key: string): string {
  return formatKey(key, { month: "short" }).replace(".", "").toUpperCase();
}

export function weekdayShortLabel(key: string): string {
  return WEEKDAY_LABELS[isoWeekdayOfKey(key)].long.slice(0, 3).toUpperCase();
}

/**
 * Rango de instantes para consultar un intervalo de claves civiles
 * [firstKey, lastKey] (ambas incluidas).
 *
 * Cada actividad tiene su propia zona y en TS no convertimos hora local a
 * instante, así que ampliamos los bordes ±14 h respecto a medianoche UTC: así
 * el rango cubre el día civil completo en cualquier zona IANA (UTC-12 a
 * UTC+14). Las actividades que entran solo por el margen se descartan al
 * agruparlas por `localDateKey(startsAt, activity.timezone)` contra las claves
 * visibles de la vista.
 */
export function rangeInstants(firstKey: string, lastKey: string): { from: string; to: string } {
  const from = new Date(Date.parse(`${firstKey}T00:00:00Z`) - ZONE_MARGIN_MS).toISOString();
  const to = new Date(Date.parse(`${addDaysToKey(lastKey, 1)}T00:00:00Z`) + ZONE_MARGIN_MS).toISOString();
  return { from, to };
}

/**
 * Días civiles (en la zona de la actividad) que ocupa una actividad con
 * horario. Una actividad que termina exactamente a medianoche no ocupa el día
 * siguiente.
 */
export function activityDayKeys(activity: ActivitySummary): string[] {
  if (!activity.startsAt) return [];
  const startKey = localDateKey(activity.startsAt, activity.timezone);
  if (!activity.endsAt) return [startKey];
  const endMs = Date.parse(activity.endsAt);
  const startMs = Date.parse(activity.startsAt);
  const endKey = endMs > startMs ? localDateKey(new Date(endMs - 1).toISOString(), activity.timezone) : startKey;
  const keys = [startKey];
  let current = startKey;
  while (current < endKey && keys.length <= MAX_SPAN_DAYS) {
    current = addDaysToKey(current, 1);
    keys.push(current);
  }
  return keys;
}

/** Agrupa actividades por día visible, en el orden recibido (por inicio). */
export function groupByDay(activities: ActivitySummary[], visibleKeys: string[]): Map<string, ActivitySummary[]> {
  const visible = new Set(visibleKeys);
  const map = new Map<string, ActivitySummary[]>();
  for (const activity of activities) {
    for (const key of activityDayKeys(activity)) {
      if (!visible.has(key)) continue;
      const list = map.get(key) ?? [];
      list.push(activity);
      map.set(key, list);
    }
  }
  return map;
}

export function keysBetween(firstKey: string, lastKey: string): string[] {
  const keys: string[] = [];
  let current = firstKey;
  while (current <= lastKey && keys.length < 400) {
    keys.push(current);
    current = addDaysToKey(current, 1);
  }
  return keys;
}

