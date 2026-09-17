import "server-only";

/**
 * Conversión entre la hora local de la iglesia y el instante absoluto.
 *
 * La regla del proyecto (ADR 0017) es que la conversión de hora local a
 * instante la hace PostgreSQL con `app.local_to_instant`. Las RPC de
 * disponibilidad (`20260923000100_disponibilidad.sql`) reciben ya un
 * `timestamptz` y no admiten una zona, y `app.local_to_instant` no está
 * expuesta a PostgREST, así que aquí se reproduce su semántica con `Intl`,
 * sin dependencias nuevas.
 *
 * Método: dos pasadas. La primera estima el desfase con la hora escrita leída
 * como UTC; la segunda lo corrige con el instante ya aproximado, que es lo que
 * hace falta en los días de cambio de hora. Una hora inexistente (la madrugada
 * del adelanto) se desplaza hacia delante, igual que hace PostgreSQL.
 */

/** "YYYY-MM-DDTHH:MM", tal y como lo emite un <input type="datetime-local">. */
const LOCAL_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** "HH:MM", tal y como lo emite un <input type="time">. */
const LOCAL_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isLocalDateTime(value: unknown): value is string {
  return (
    typeof value === "string" && LOCAL_DATETIME_RE.test(value) && !Number.isNaN(Date.parse(`${value}:00Z`))
  );
}

export function isLocalTime(value: unknown): value is string {
  return typeof value === "string" && LOCAL_TIME_RE.test(value);
}

/** Desfase de la zona en ese instante, en milisegundos (hora local − UTC). */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instantMs));

  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  return asUtc - instantMs;
}

/** "YYYY-MM-DDTHH:MM" en la zona indicada → instante en ISO (UTC). */
export function localToInstant(local: string, timeZone: string): string {
  const naiveMs = Date.parse(`${local}:00Z`);
  if (Number.isNaN(naiveMs)) throw new RangeError(`Fecha y hora no válidas: ${local}`);
  let instantMs = naiveMs - zoneOffsetMs(naiveMs, timeZone);
  instantMs = naiveMs - zoneOffsetMs(instantMs, timeZone);
  return new Date(instantMs).toISOString();
}
