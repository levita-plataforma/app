/**
 * Utilidades de fecha/hora para actividades, seguras para cliente y servidor.
 *
 * Regla del dominio (ADR 0017): la base de datos guarda instantes (UTC) y la
 * zona IANA de la actividad; la conversión de hora local a instante la hace
 * SIEMPRE PostgreSQL (app.local_to_instant), también en recurrencias y DST.
 * Aquí solo se formatea un instante en una zona y se preparan valores para
 * inputs `datetime-local`. Sin dependencias ni imports, para poder probarlo
 * con `node --test`.
 */

const LOCALE = "es-ES";

function partsIn(iso: string, timeZone: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(iso))) parts[part.type] = part.value;
  return parts;
}

/** "YYYY-MM-DD" del instante en la zona dada. */
export function localDateKey(iso: string, timeZone: string): string {
  const p = partsIn(iso, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "HH:MM" del instante en la zona dada. */
export function localTimeValue(iso: string, timeZone: string): string {
  const p = partsIn(iso, timeZone);
  return `${p.hour}:${p.minute}`;
}

/** Valor para `<input type="datetime-local">`: "YYYY-MM-DDTHH:MM" en la zona. */
export function toLocalInputValue(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  return `${localDateKey(iso, timeZone)}T${localTimeValue(iso, timeZone)}`;
}

export function durationMinutes(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null;
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? "-" : "";
  if (hours === 0) return `${sign}${rest} min`;
  if (rest === 0) return `${sign}${hours} h`;
  return `${sign}${hours} h ${rest} min`;
}

export function formatDateLong(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatDateShort(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone, weekday: "short", day: "numeric", month: "short" }).format(
    new Date(iso),
  );
}

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso),
  );
}

/**
 * Rango legible en la zona de la actividad. Si termina otro día, lo indica.
 * Ej.: "domingo, 25 de octubre de 2026 · 11:00–12:30".
 */
export function formatActivityRange(startIso: string | null, endIso: string | null, timeZone: string): string {
  if (!startIso) return endIso ? `Hasta ${formatDateLong(endIso, timeZone)} ${formatTime(endIso, timeZone)}` : "Sin fecha";
  if (!endIso) return `${formatDateLong(startIso, timeZone)} · ${formatTime(startIso, timeZone)}`;
  const sameDay = localDateKey(startIso, timeZone) === localDateKey(endIso, timeZone);
  if (sameDay) {
    return `${formatDateLong(startIso, timeZone)} · ${formatTime(startIso, timeZone)}–${formatTime(endIso, timeZone)}`;
  }
  return `${formatDateShort(startIso, timeZone)} ${formatTime(startIso, timeZone)} – ${formatDateShort(endIso, timeZone)} ${formatTime(endIso, timeZone)}`;
}

/** Abreviatura de la zona en ese instante (p. ej. "CEST", "GMT-5"). */
export function timeZoneAbbreviation(iso: string, timeZone: string): string {
  const part = new Intl.DateTimeFormat(LOCALE, { timeZone, timeZoneName: "short" })
    .formatToParts(new Date(iso))
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

/** Suma días a una clave "YYYY-MM-DD" (calendario civil, sin zona). */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Día ISO de la semana (1 = lunes … 7 = domingo) de una clave "YYYY-MM-DD". */
export function isoWeekdayOfKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Lunes de la semana de la clave dada. */
export function startOfWeekKey(key: string): string {
  return addDaysToKey(key, 1 - isoWeekdayOfKey(key));
}

/**
 * Celdas de un mes (semanas de lunes a domingo) como claves "YYYY-MM-DD".
 * Siempre 6 semanas para una rejilla estable.
 */
export function monthGridKeys(year: number, month: number): string[] {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const start = startOfWeekKey(first);
  return Array.from({ length: 42 }, (_, i) => addDaysToKey(start, i));
}
