import type {
  ActivityAssignment,
  AssignmentReview,
  SubstitutionRequest,
} from "@/server/assignments/assignments-service";

/**
 * Contrato entre la página de detalle y la pestaña Equipo (Fase 5). Solo
 * tipos: se puede importar desde componentes cliente.
 */

export type AssignmentManageScope = {
  /** assignment.manage en la iglesia, la sede de la actividad o la actividad. */
  all: boolean;
  /** assignment.manage con scope service_area, por id de área del catálogo. */
  byServiceAreaId: Record<string, boolean>;
};

export type EquipoData = {
  assignments: ActivityAssignment[];
  substitutions: SubstitutionRequest[];
  /** Revisión actual de las asignaciones vigentes que gestionas. */
  reviews: AssignmentReview[];
  manage: AssignmentManageScope;
  /** planned/published y no terminada (o flexible). La base de datos lo vuelve a comprobar. */
  acceptsAssignments: boolean;
  /** No se pudieron cargar las asignaciones: no equivale a "sin asignaciones". */
  loadError: boolean;
  /** No se pudo revisar la elegibilidad actual. */
  reviewError: boolean;
};

export function canManageServiceArea(manage: AssignmentManageScope, serviceAreaId: string | null): boolean {
  return manage.all || (serviceAreaId !== null && Boolean(manage.byServiceAreaId[serviceAreaId]));
}

export function canManageAny(manage: AssignmentManageScope): boolean {
  return manage.all || Object.values(manage.byServiceAreaId).some(Boolean);
}
