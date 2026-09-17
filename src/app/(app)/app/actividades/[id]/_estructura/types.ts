import type { ActivityCapabilities, ActivityDetail } from "@/server/activities/activities-service";
import type { StructureTabsData } from "./load";

/** Contrato fijo con `../page.tsx` (re-exportado desde StructureTabs.tsx). */

export type StructureTabActivity = Pick<
  ActivityDetail,
  "id" | "status" | "type" | "campusId" | "scheduleKind" | "startsAt" | "endsAt" | "timezone" | "seriesId" | "occurrenceDate"
>;

export type StructureTabsProps = {
  activity: StructureTabActivity;
  capabilities: ActivityCapabilities;
  /** No se pudieron cargar los permisos: `capabilities` va vacío pero NO significa módulo deshabilitado. */
  capabilitiesError?: boolean;
  data: StructureTabsData;
};
