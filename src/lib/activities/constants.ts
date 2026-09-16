/**
 * Catálogo central de actividades (Fase 4): tipos, estados, visibilidad,
 * planning, cobertura e incidencias. Único lugar con etiquetas y valores de
 * los enums de actividades: no repetir strings en la UI.
 *
 * Seguro para cliente (sin `server-only`). Los valores reflejan los enums de
 * las migraciones 20260920000100-20260920000800; el tipo de actividad influye
 * en valores por defecto y presentación, nunca en seguridad.
 */

export const ACTIVITY_TYPES = [
  "service",
  "meeting",
  "event",
  "course_session",
  "group_meeting",
  "rehearsal",
  "task",
  "shift",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_STATUSES = ["draft", "planned", "published", "completed", "cancelled", "archived"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const ACTIVITY_VISIBILITIES = ["private", "leaders", "members", "public_future"] as const;
export type ActivityVisibility = (typeof ACTIVITY_VISIBILITIES)[number];

export const SCHEDULE_KINDS = ["timed", "flexible"] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export const AREA_REQUIREMENTS = ["required", "optional"] as const;
export type AreaRequirement = (typeof AREA_REQUIREMENTS)[number];

export const PLAN_ITEM_TYPES = [
  "section",
  "song",
  "speech",
  "prayer",
  "announcement",
  "media",
  "transition",
  "custom",
] as const;
export type PlanItemType = (typeof PLAN_ITEM_TYPES)[number];

export const COVERAGE_STATUSES = ["uncovered", "partially_covered", "covered", "overstaffed"] as const;
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

export type ChipTone = "success" | "warning" | "danger" | "muted" | "default";

type TypeInfo = {
  label: string;
  pluralLabel: string;
  /** Duración por defecto al crear desde cero, en minutos. */
  defaultDurationMinutes: number;
  /** Solo las tareas admiten "sin hora fija". */
  allowsFlexibleSchedule: boolean;
  /** Tipos en los que se sugiere definir áreas de servicio. */
  suggestsServiceStructure: boolean;
};

export const ACTIVITY_TYPE_INFO: Record<ActivityType, TypeInfo> = {
  service: { label: "Culto", pluralLabel: "Cultos", defaultDurationMinutes: 90, allowsFlexibleSchedule: false, suggestsServiceStructure: true },
  meeting: { label: "Reunión", pluralLabel: "Reuniones", defaultDurationMinutes: 60, allowsFlexibleSchedule: false, suggestsServiceStructure: false },
  event: { label: "Evento", pluralLabel: "Eventos", defaultDurationMinutes: 120, allowsFlexibleSchedule: false, suggestsServiceStructure: true },
  course_session: { label: "Sesión de curso", pluralLabel: "Sesiones de curso", defaultDurationMinutes: 90, allowsFlexibleSchedule: false, suggestsServiceStructure: false },
  group_meeting: { label: "Reunión de grupo", pluralLabel: "Reuniones de grupo", defaultDurationMinutes: 90, allowsFlexibleSchedule: false, suggestsServiceStructure: false },
  rehearsal: { label: "Ensayo", pluralLabel: "Ensayos", defaultDurationMinutes: 120, allowsFlexibleSchedule: false, suggestsServiceStructure: true },
  task: { label: "Tarea", pluralLabel: "Tareas", defaultDurationMinutes: 60, allowsFlexibleSchedule: true, suggestsServiceStructure: false },
  shift: { label: "Turno", pluralLabel: "Turnos", defaultDurationMinutes: 120, allowsFlexibleSchedule: false, suggestsServiceStructure: false },
};

export const ACTIVITY_STATUS_INFO: Record<ActivityStatus, { label: string; tone: ChipTone; description: string }> = {
  draft: { label: "Borrador", tone: "muted", description: "Editable libremente; solo la ven quienes gestionan actividades." },
  planned: { label: "Planificada", tone: "default", description: "Estructura definida; aún no visible para la audiencia." },
  published: { label: "Publicada", tone: "success", description: "Visible para su audiencia y preparada para asignaciones." },
  completed: { label: "Completada", tone: "default", description: "Histórico: su contenido ya no se modifica." },
  cancelled: { label: "Cancelada", tone: "danger", description: "Conservada en el histórico; no admite asignaciones." },
  archived: { label: "Archivada", tone: "muted", description: "Oculta por defecto; se puede desarchivar." },
};

export const VISIBILITY_INFO: Record<ActivityVisibility, { label: string; description: string }> = {
  private: { label: "Privada", description: "Solo quienes gestionan o consultan actividades en su ámbito." },
  leaders: { label: "Líderes", description: "Además, líderes y responsables de la iglesia cuando esté publicada." },
  members: { label: "Miembros", description: "Cualquier persona de la iglesia cuando esté publicada." },
  public_future: {
    label: "Pública (futuro)",
    description: "Marcada para la web pública de fases posteriores. Hoy equivale a Miembros: no hay acceso anónimo.",
  },
};

export const SCHEDULE_KIND_LABELS: Record<ScheduleKind, string> = {
  timed: "Con horario",
  flexible: "Sin hora fija",
};

export const AREA_REQUIREMENT_LABELS: Record<AreaRequirement, string> = {
  required: "Obligatoria",
  optional: "Opcional",
};

export const PLAN_ITEM_TYPE_LABELS: Record<PlanItemType, string> = {
  section: "Sección",
  song: "Canción",
  speech: "Predicación / palabra",
  prayer: "Oración",
  announcement: "Avisos",
  media: "Multimedia",
  transition: "Transición",
  custom: "Otro",
};

export const COVERAGE_INFO: Record<CoverageStatus, { label: string; tone: ChipTone }> = {
  uncovered: { label: "Sin cubrir", tone: "danger" },
  partially_covered: { label: "Parcial", tone: "warning" },
  covered: { label: "Cubierto", tone: "success" },
  overstaffed: { label: "Excedido", tone: "warning" },
};

export type StructureIssueSeverity = "blocking" | "warning";

export const STRUCTURE_ISSUE_LABELS: Record<string, string> = {
  required_area_without_positions: "Área obligatoria sin puestos",
  optional_area_without_positions: "Área opcional sin puestos",
  area_campus_mismatch: "Área de otra sede",
  position_campus_mismatch: "Puesto de otra sede",
  catalog_area_unavailable: "El área ya no está activa en el catálogo",
  catalog_position_unavailable: "El puesto ya no está activo en el catálogo",
  no_areas: "Sin áreas de servicio",
  plan_exceeds_activity: "El orden del servicio dura más que la actividad",
};

export const TEMPLATE_SKIP_REASON_LABELS: Record<string, string> = {
  inactive: "no está activo",
  campus_mismatch: "es de otra sede",
  serving_module_disabled: "el módulo Servicios no está habilitado",
};

export type TransitionAction = {
  to: ActivityStatus;
  label: string;
  capability: "manage" | "publish" | "cancel" | "archive";
  /** Pide motivo opcional (cancelación). */
  asksReason?: boolean;
  destructive?: boolean;
};

/**
 * Espejo de app.activity_transition_capability para decidir qué botones
 * mostrar. La base de datos vuelve a validar cada transición.
 */
export function availableTransitions(status: ActivityStatus, statusBeforeArchive: ActivityStatus | null): TransitionAction[] {
  const actions: TransitionAction[] = [];
  if (status === "draft") actions.push({ to: "planned", label: "Marcar como planificada", capability: "manage" });
  if (status === "planned") actions.push({ to: "draft", label: "Volver a borrador", capability: "manage" });
  if (status === "draft" || status === "planned") actions.push({ to: "published", label: "Publicar", capability: "publish" });
  if (status === "published") {
    actions.push({ to: "completed", label: "Marcar como completada", capability: "publish" });
    actions.push({ to: "planned", label: "Despublicar", capability: "publish" });
  }
  if (status === "completed") actions.push({ to: "published", label: "Reabrir", capability: "publish" });
  if (status === "draft" || status === "planned" || status === "published") {
    actions.push({ to: "cancelled", label: "Cancelar", capability: "cancel", asksReason: true, destructive: true });
  }
  if (status === "cancelled") actions.push({ to: "draft", label: "Reactivar como borrador", capability: "cancel" });
  if (status === "archived") {
    actions.push({ to: statusBeforeArchive ?? "draft", label: "Desarchivar", capability: "archive" });
  } else {
    actions.push({ to: "archived", label: "Archivar", capability: "archive", destructive: true });
  }
  return actions;
}

/** Estados en los que se puede editar contenido y estructura. */
export function isActivityEditable(status: ActivityStatus): boolean {
  return status === "draft" || status === "planned" || status === "published";
}

export const WEEKDAY_LABELS: Record<number, { short: string; long: string }> = {
  1: { short: "L", long: "Lunes" },
  2: { short: "M", long: "Martes" },
  3: { short: "X", long: "Miércoles" },
  4: { short: "J", long: "Jueves" },
  5: { short: "V", long: "Viernes" },
  6: { short: "S", long: "Sábado" },
  7: { short: "D", long: "Domingo" },
};

export const WEEK_OF_MONTH_LABELS: Record<number, string> = {
  1: "primer",
  2: "segundo",
  3: "tercer",
  4: "cuarto",
  5: "quinto",
  [-1]: "último",
};

export const RECURRENCE_LIMITS = {
  maxOccurrences: 200,
  maxHorizonDays: 731,
  maxWeeklyInterval: 52,
  maxMonthlyInterval: 12,
} as const;

export const SERIES_EDIT_SCOPES = ["this", "future", "all"] as const;
export type SeriesEditScope = (typeof SERIES_EDIT_SCOPES)[number];

export const SERIES_EDIT_SCOPE_LABELS: Record<SeriesEditScope, string> = {
  this: "Solo esta ocurrencia",
  future: "Esta y las siguientes",
  all: "Toda la serie",
};

export function isActivityType(value: string): value is ActivityType {
  return (ACTIVITY_TYPES as readonly string[]).includes(value);
}

export function isActivityStatus(value: string): value is ActivityStatus {
  return (ACTIVITY_STATUSES as readonly string[]).includes(value);
}
