import { CANCEL_CAUSE_LABELS } from "@/lib/assignments/constants";
import { formatActivityRange, formatDateShort, formatTime, timeZoneAbbreviation } from "@/lib/activities/time";
import type { MyAssignment } from "@/server/assignments/assignments-service";

/**
 * Utilidades de presentación de «Mis turnos». Puras y sin estado: el plazo y
 * el estado de la actividad se calculan aquí solo para decidir qué botones
 * mostrar; la base de datos vuelve a comprobarlo todo al responder.
 */

type TurnoActivity = MyAssignment["activity"];

/** Texto de fecha y hora en la zona de la actividad (sin inventar horas en tareas flexibles). */
export function turnoScheduleText(activity: TurnoActivity): { text: string; zone: string | null } {
  const tz = activity.timezone;
  if (activity.scheduleKind === "flexible") {
    if (!activity.startsAt && !activity.endsAt) return { text: "Sin hora fija", zone: null };
    const parts = ["Sin hora fija"];
    if (activity.startsAt) parts.push(`desde ${formatDateShort(activity.startsAt, tz)}`);
    if (activity.endsAt) parts.push(`hasta ${formatDateShort(activity.endsAt, tz)} ${formatTime(activity.endsAt, tz)}`);
    return {
      text: `${parts[0]} · ${parts.slice(1).join(" ")}`,
      zone: activity.endsAt ? timeZoneAbbreviation(activity.endsAt, tz) : null,
    };
  }
  return {
    text: formatActivityRange(activity.startsAt, activity.endsAt, tz),
    zone: activity.startsAt ? timeZoneAbbreviation(activity.startsAt, tz) : null,
  };
}

/** Límite para responder: inicio (con horario) o fin de la ventana (flexible); null = sin límite. */
export function responseDeadline(activity: TurnoActivity): string | null {
  return activity.scheduleKind === "timed" ? activity.startsAt : activity.endsAt;
}

export function isActivityOpenForResponses(activity: TurnoActivity): boolean {
  return activity.status === "planned" || activity.status === "published";
}

export function isPastDeadline(activity: TurnoActivity, nowMs: number): boolean {
  const deadline = responseDeadline(activity);
  return deadline !== null && nowMs >= new Date(deadline).getTime();
}

export function deadlineText(activity: TurnoActivity): string | null {
  const deadline = responseDeadline(activity);
  if (!deadline) return null;
  const tz = activity.timezone;
  return `${formatDateShort(deadline, tz)} a las ${formatTime(deadline, tz)} (${timeZoneAbbreviation(deadline, tz)})`;
}

export function cancelCauseText(cause: string | null): string | null {
  if (!cause) return null;
  return CANCEL_CAUSE_LABELS[cause] ?? null;
}

export function needsReconfirmation(assignment: Pick<MyAssignment, "status" | "reconfirmationRequestedAt">): boolean {
  return assignment.status === "pending" && Boolean(assignment.reconfirmationRequestedAt);
}
