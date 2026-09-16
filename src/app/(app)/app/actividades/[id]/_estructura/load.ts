import "server-only";
import type { ActivityDetail, StructureIssue } from "@/server/activities/activities-service";
import type { ActivityArea, ActivityPlanItem, StructureSummary } from "@/server/activities/activity-structure-service";

/**
 * Carga de datos de las pestañas Áreas, Puestos y Plan de la ficha de
 * actividad. Contrato fijo entre la página de detalle y los componentes de
 * `_estructura/`. (Stub: el agente de estructura implementa el cuerpo.)
 */

export type CatalogAreaOption = { id: string; name: string; campusId: string | null };
export type CatalogPositionOption = {
  id: string;
  serviceAreaId: string;
  name: string;
  campusId: string | null;
  minPeople: number;
  maxPeople: number | null;
  critical: boolean;
};
export type NamedOption = { id: string; name: string };

export type StructureTabsData = {
  structure: { areas: ActivityArea[]; summary: StructureSummary };
  plan: ActivityPlanItem[];
  issues: StructureIssue[];
  catalog: {
    areas: CatalogAreaOption[];
    positions: CatalogPositionOption[];
    qualifications: NamedOption[];
    credentialTypes: NamedOption[];
  };
  /** Personas activas de la iglesia para elegir responsable de bloque (acotado). */
  people: NamedOption[];
};

export async function loadStructureTabs(churchId: string, activity: ActivityDetail): Promise<StructureTabsData> {
  void churchId;
  void activity;
  return {
    structure: {
      areas: [],
      summary: {
        areas: 0,
        requiredAreas: 0,
        positions: 0,
        criticalPositions: 0,
        minPeopleTotal: 0,
        positionsRequiringPeople: 0,
        assignedPeople: 0,
      },
    },
    plan: [],
    issues: [],
    catalog: { areas: [], positions: [], qualifications: [], credentialTypes: [] },
    people: [],
  };
}
