import type { PublicEventDetail } from "@/server/events/public-events-service";

/**
 * Helpers compartidos por las páginas públicas de un evento
 * (/i/[churchSlug]/eventos/[eventSlug]/...).
 */

export function formatEventDateRange(event: Pick<PublicEventDetail, "startsAt" | "endsAt" | "timezone">): string {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);

  const dayFormatter = new Intl.DateTimeFormat("es-ES", {
    timeZone: event.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("es-ES", {
    timeZone: event.timezone,
    hour: "2-digit",
    minute: "2-digit",
  });

  const sameDay =
    new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone }).format(start) ===
    new Intl.DateTimeFormat("en-CA", { timeZone: event.timezone }).format(end);

  const dayLabel = dayFormatter.format(start);
  const startTime = timeFormatter.format(start);
  const endTime = timeFormatter.format(end);

  if (sameDay) {
    return `${capitalize(dayLabel)} · ${startTime} – ${endTime}`;
  }

  const endDayLabel = dayFormatter.format(end);
  return `${capitalize(dayLabel)} ${startTime} — ${capitalize(endDayLabel)} ${endTime}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function availableSpots(event: Pick<PublicEventDetail, "capacity" | "confirmedCount">): number | null {
  if (event.capacity === null) return null;
  return Math.max(0, event.capacity - event.confirmedCount);
}

export function registrationStatusMessage(
  status: PublicEventDetail["registrationStatus"],
): { label: string; tone: "neutral" | "success" | "warning" | "danger" } {
  switch (status) {
    case "disabled":
      return { label: "Este evento no tiene inscripción.", tone: "neutral" };
    case "scheduled":
      return { label: "Inscripción aún no abierta.", tone: "warning" };
    case "open":
      return { label: "Inscripción abierta.", tone: "success" };
    case "full":
      return { label: "Aforo completo — puedes unirte a la lista de espera.", tone: "warning" };
    case "closed":
      return { label: "Inscripción cerrada.", tone: "neutral" };
    default:
      return { label: "", tone: "neutral" };
  }
}

export const toneColor: Record<"neutral" | "success" | "warning" | "danger", string> = {
  neutral: "var(--shell-text-muted)",
  success: "var(--shell-success)",
  warning: "var(--shell-warning)",
  danger: "var(--shell-danger)",
};
