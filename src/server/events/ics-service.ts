/**
 * Generación de archivos .ics (RFC 5545) para eventos públicos. Función
 * pura: no accede a la base de datos, recibe los datos ya cargados. Ver
 * encargo Fase 6 §37 (botón "Añadir al calendario").
 *
 * Decisión: DTSTART/DTEND se convierten siempre a UTC (`YYYYMMDDTHHMMSSZ`)
 * en vez de generar un bloque VTIMEZONE completo con reglas de cambio de
 * hora. Es más simple y robusto (evita depender de una base de datos de
 * zonas horarias completa en el servidor) y la mayoría de clientes de
 * calendario interpretan correctamente un instante en UTC, mostrándolo ya
 * convertido a la zona horaria local del usuario.
 *
 * Decisión: no se implementa el plegado de líneas a 75 octetos que exige
 * RFC 5545 estrictamente. Se omite por simplicidad: la inmensa mayoría de
 * clientes de calendario modernos (Google Calendar, Apple Calendar,
 * Outlook) toleran líneas largas sin plegado.
 */

export type GenerateEventIcsParams = {
  eventId: string;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  locationText?: string | null;
  publicUrl?: string | null;
};

const MAX_DESCRIPTION_LENGTH = 500;

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

function toIcsUtc(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Genera el contenido de un archivo .ics para un único evento. Nunca
 * incluye datos administrativos (notas internas, información de inscritos):
 * solo los campos de la página pública del evento.
 */
export function generateEventIcs(params: GenerateEventIcsParams): string {
  const now = new Date().toISOString();

  const description = params.description
    ? escapeIcsText(params.description.slice(0, MAX_DESCRIPTION_LENGTH))
    : null;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LEVITA//Eventos//ES",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${params.eventId}@levita.app`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(params.startsAt)}`,
    `DTEND:${toIcsUtc(params.endsAt)}`,
    `SUMMARY:${escapeIcsText(params.title)}`,
  ];

  if (description) lines.push(`DESCRIPTION:${description}`);
  if (params.locationText) lines.push(`LOCATION:${escapeIcsText(params.locationText)}`);
  if (params.publicUrl) lines.push(`URL:${params.publicUrl}`);

  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.join("\r\n");
}
