/**
 * Catálogo de asignaciones (Fase 5, parte de Carlos): estados, causas y
 * códigos de elegibilidad. Seguro para cliente. Refleja las migraciones
 * 20260922000100-20260922000500; no repetir estos strings en la UI.
 */

import type { ChipTone } from "@/lib/activities/constants";

export const ASSIGNMENT_STATUSES = ["proposed", "pending", "accepted", "declined", "cancelled", "substituted"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const VIGENTE_STATUSES: readonly AssignmentStatus[] = ["proposed", "pending", "accepted"];

export const ASSIGNMENT_STATUS_INFO: Record<AssignmentStatus, { label: string; tone: ChipTone; description: string }> = {
  proposed: { label: "Borrador", tone: "muted", description: "Preparada; la persona todavía no la ve." },
  pending: { label: "Pendiente", tone: "warning", description: "Enviada; esperando respuesta." },
  accepted: { label: "Confirmada", tone: "success", description: "La persona ha aceptado." },
  declined: { label: "Rechazada", tone: "danger", description: "La persona no puede servir." },
  cancelled: { label: "Retirada", tone: "muted", description: "Ya no forma parte del equipo." },
  substituted: { label: "Sustituida", tone: "muted", description: "Otra persona ocupa ahora este puesto." },
};

export type ResponseSource = "self" | "representative";

export const RESPONSE_SOURCE_LABELS: Record<ResponseSource, string> = {
  self: "Respuesta propia",
  representative: "Registrada por un coordinador",
};

export const CANCEL_CAUSE_LABELS: Record<string, string> = {
  coordinator: "Retirada por coordinación",
  activity_cancelled: "La actividad se canceló",
  activity_archived: "La actividad se archivó",
  occurrence_removed: "La fecha se eliminó de la serie",
  substitution_withdrawn: "Se retiró la sustitución",
};

export type EligibilitySeverity = "blocking" | "warning";

/** Etiquetas de los códigos de elegibilidad y conflicto que devuelve la base de datos. */
export const ELIGIBILITY_CODE_LABELS: Record<string, string> = {
  inactive_person: "No es una persona activa de la iglesia",
  not_area_member: "No es miembro activo del área",
  insufficient_level: "Nivel operativo insuficiente",
  missing_qualification: "Le falta una cualificación obligatoria",
  qualification_expired_at_activity: "Su cualificación no estará vigente en la fecha de la actividad",
  missing_credential: "Le falta una credencial obligatoria",
  credential_expired_at_activity: "Su credencial no estará vigente en la fecha de la actividad",
  requirement_not_met: "No cumple un requisito obligatorio",
  activity_not_assignable: "La actividad no admite asignaciones en su estado actual",
  position_full: "El puesto ya tiene el máximo de personas",
  position_not_found: "El puesto ya no existe",
  overlapping_assignment: "Tiene otra asignación que se solapa en el tiempo",
  unavailable: "Ha indicado que no está disponible",
  different_campus: "Su sede principal es otra",
};

export function eligibilityCodeLabel(code: string): string {
  if (code.endsWith("_recommended")) {
    const base = code.slice(0, -"_recommended".length);
    return `${ELIGIBILITY_CODE_LABELS[base] ?? base} (requisito recomendado)`;
  }
  return ELIGIBILITY_CODE_LABELS[code] ?? code;
}

export const SUBSTITUTION_STATUS_LABELS: Record<"open" | "completed" | "cancelled", string> = {
  open: "Sustitución solicitada",
  completed: "Sustitución completada",
  cancelled: "Sustitución cancelada",
};
