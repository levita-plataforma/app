/**
 * Catálogo central de Discipulado (Fase 7): cursos, cohortes, matrículas,
 * itinerarios y progreso. Único lugar con las etiquetas y los valores de los
 * enums del módulo: no repetir strings sueltos en la interfaz.
 *
 * Seguro para cliente (sin `server-only`). Los valores reflejan los enums de
 * 20260926000200_discipulado_esquema.sql. La asistencia a sesiones reutiliza
 * el enum de grupos (`group_attendance_status`), así que sus etiquetas viven
 * en `@/lib/groups/constants` y no se duplican aquí.
 */

import type { ChipTone } from "@/lib/activities/constants";

export const COURSE_STATUSES = ["draft", "active", "archived"] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export const COHORT_STATUSES = ["planned", "open", "running", "finished", "cancelled"] as const;
export type CohortStatus = (typeof COHORT_STATUSES)[number];

export const ENROLLMENT_STATUSES = ["requested", "enrolled", "completed", "dropped", "rejected"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const LEARNING_PATH_STATUSES = ["draft", "active", "archived"] as const;
export type LearningPathStatus = (typeof LEARNING_PATH_STATUSES)[number];

export const PATH_STEP_KINDS = ["course", "manual"] as const;
export type PathStepKind = (typeof PATH_STEP_KINDS)[number];

export const PATH_PROGRESS_STATUSES = ["pending", "in_progress", "completed", "skipped"] as const;
export type PathProgressStatus = (typeof PATH_PROGRESS_STATUSES)[number];

export const COURSE_STATUS_INFO: Record<CourseStatus, { label: string; tone: ChipTone; description: string }> = {
  draft: { label: "Borrador", tone: "muted", description: "En preparación; solo lo ve quien gestiona la formación." },
  active: { label: "Activo", tone: "success", description: "Disponible para abrir cohortes." },
  archived: { label: "Archivado", tone: "muted", description: "Fuera de uso; su historial se conserva." },
};

export const COHORT_STATUS_INFO: Record<CohortStatus, { label: string; tone: ChipTone; description: string }> = {
  planned: { label: "Prevista", tone: "muted", description: "Fechas apuntadas, todavía sin abrir matrícula." },
  open: { label: "Matrícula abierta", tone: "success", description: "Admite altas y solicitudes de plaza." },
  running: { label: "En marcha", tone: "default", description: "Las sesiones ya han empezado." },
  finished: { label: "Terminada", tone: "muted", description: "Cerrada; el historial se conserva." },
  cancelled: { label: "Cancelada", tone: "danger", description: "No se impartirá." },
};

export const ENROLLMENT_STATUS_INFO: Record<EnrollmentStatus, { label: string; tone: ChipTone }> = {
  requested: { label: "Plaza solicitada", tone: "warning" },
  enrolled: { label: "Matriculada", tone: "success" },
  completed: { label: "Terminada", tone: "default" },
  dropped: { label: "Abandonada", tone: "muted" },
  rejected: { label: "Rechazada", tone: "danger" },
};

export const LEARNING_PATH_STATUS_INFO: Record<LearningPathStatus, { label: string; tone: ChipTone; description: string }> = {
  draft: { label: "Borrador", tone: "muted", description: "En preparación; solo lo ve quien gestiona itinerarios." },
  active: { label: "Activo", tone: "success", description: "En uso para acompañar a las personas." },
  archived: { label: "Archivado", tone: "muted", description: "Fuera de uso; el progreso conseguido se conserva." },
};

export const PATH_STEP_KIND_INFO: Record<PathStepKind, { label: string; description: string }> = {
  course: { label: "Curso", description: "Se da por hecho al terminar el curso vinculado." },
  manual: { label: "Manual", description: "Lo marca quien acompaña a la persona." },
};

export const PATH_PROGRESS_STATUS_INFO: Record<PathProgressStatus, { label: string; tone: ChipTone }> = {
  pending: { label: "Pendiente", tone: "muted" },
  in_progress: { label: "En curso", tone: "warning" },
  completed: { label: "Hecho", tone: "success" },
  skipped: { label: "Omitido", tone: "muted" },
};

export function isCourseStatus(value: string): value is CourseStatus {
  return (COURSE_STATUSES as readonly string[]).includes(value);
}

export function isCohortStatus(value: string): value is CohortStatus {
  return (COHORT_STATUSES as readonly string[]).includes(value);
}

export function isEnrollmentStatus(value: string): value is EnrollmentStatus {
  return (ENROLLMENT_STATUSES as readonly string[]).includes(value);
}

export function isLearningPathStatus(value: string): value is LearningPathStatus {
  return (LEARNING_PATH_STATUSES as readonly string[]).includes(value);
}

export function isPathStepKind(value: string): value is PathStepKind {
  return (PATH_STEP_KINDS as readonly string[]).includes(value);
}

export function isPathProgressStatus(value: string): value is PathProgressStatus {
  return (PATH_PROGRESS_STATUSES as readonly string[]).includes(value);
}

/**
 * Umbral de asistencia sugerido por defecto al crear un curso. La base usa el
 * mismo 0,750; solo alimenta la SUGERENCIA de finalización, nunca la decide
 * (decisión P-4 del contrato).
 */
export const DEFAULT_COMPLETION_ATTENDANCE_RATIO = 0.75;
