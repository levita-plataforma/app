"use client";

import type { ActivityCapabilities, ActivityDetail } from "@/server/activities/activities-service";
import type { StructureTabsData } from "./load";

/**
 * Pestañas de estructura y planning de la ficha de actividad. Contrato fijo
 * con `../page.tsx`. (Stub: el agente de estructura implementa los cuerpos.)
 */

export type StructureTabActivity = Pick<
  ActivityDetail,
  "id" | "status" | "type" | "campusId" | "scheduleKind" | "startsAt" | "endsAt" | "timezone" | "seriesId" | "occurrenceDate"
>;

export type StructureTabsProps = {
  activity: StructureTabActivity;
  capabilities: ActivityCapabilities;
  data: StructureTabsData;
};

export function AreasTab(props: StructureTabsProps) {
  void props;
  return <div className="shell-card shell-empty-state"><p>Áreas en preparación.</p></div>;
}

export function PuestosTab(props: StructureTabsProps) {
  void props;
  return <div className="shell-card shell-empty-state"><p>Puestos en preparación.</p></div>;
}

export function PlanTab(props: StructureTabsProps) {
  void props;
  return <div className="shell-card shell-empty-state"><p>Plan en preparación.</p></div>;
}
