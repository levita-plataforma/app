"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import type {
  ActivityCapabilities,
  ActivityDetail,
  ActivityHistoryEntry,
} from "@/server/activities/activities-service";
import type { StructureTabsData } from "../_estructura/load";
import type { EquipoData } from "../_equipo/types";
import { AreasTab, PlanTab, PuestosTab, type StructureTabActivity } from "../_estructura/StructureTabs";
import FichaHeader from "./FichaHeader";
import ResumenTab from "./ResumenTab";
import EquipoTab from "./EquipoTab";
import NotasTab from "./NotasTab";
import HistorialTab from "./HistorialTab";

export type SkipNotice = {
  items: { kind: "area" | "position"; name: string; reason: string }[];
  total: number;
};

/** archived: sede archivada que se muestra solo porque es la actual de la actividad. */
export type CampusOption = { id: string; name: string; timezone: string | null; archived?: boolean };

/** error: el historial no se pudo cargar (no equivale a "sin registros"). */
export type HistoryData = { canRead: boolean; entries: ActivityHistoryEntry[]; error?: boolean };

type Props = {
  activity: ActivityDetail;
  capabilities: ActivityCapabilities;
  data: StructureTabsData;
  equipo: EquipoData;
  history: HistoryData;
  campuses: CampusOption[];
  churchTimezone: string;
  people: { id: string; name: string }[];
  skipNotice: SkipNotice | null;
  createdOccurrences: number | null;
};

const TABS = ["Resumen", "Plan", "Áreas", "Puestos", "Equipo", "Notas", "Historial"] as const;
type Tab = (typeof TABS)[number];

export default function ActivityFicha(props: Props) {
  const { activity, capabilities, data } = props;
  const [tab, setTab] = useState<Tab>("Resumen");

  const structureActivity: StructureTabActivity = {
    id: activity.id,
    status: activity.status,
    type: activity.type,
    campusId: activity.campusId,
    scheduleKind: activity.scheduleKind,
    startsAt: activity.startsAt,
    endsAt: activity.endsAt,
    timezone: activity.timezone,
    seriesId: activity.seriesId,
    occurrenceDate: activity.occurrenceDate,
  };
  const structureProps = { activity: structureActivity, capabilities, data };
  const blockingIssues = data.issues.filter((i) => i.severity === "blocking").length;

  function onTabKey(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (index + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    setTab(TABS[next]);
    document.getElementById(`act-tab-${next}`)?.focus();
  }

  return (
    <>
      <FichaHeader
        activity={activity}
        capabilities={capabilities}
        blockingIssues={blockingIssues}
        onShowIssues={() => setTab("Resumen")}
      />

      {props.createdOccurrences ? (
        <div className="act-notice is-info" role="status">
          <Info size={16} aria-hidden="true" />
          <span>
            Se ha creado una serie de {props.createdOccurrences} ocurrencias. Estás viendo la primera.
          </span>
        </div>
      ) : null}

      {props.skipNotice ? (
        <div className="act-notice" role="status">
          <Info size={16} aria-hidden="true" />
          <div>
            <strong>Algunos elementos de la plantilla no se copiaron ({props.skipNotice.total}).</strong>
            <ul>
              {props.skipNotice.items.map((item, i) => (
                <li key={`${item.kind}-${item.name}-${i}`}>
                  {item.kind === "area" ? "Área" : "Puesto"} «{item.name}»: {item.reason}.
                </li>
              ))}
            </ul>
            {props.skipNotice.total > props.skipNotice.items.length ? (
              <p>Y {props.skipNotice.total - props.skipNotice.items.length} más.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <nav className="serving-tabs" role="tablist" aria-label="Secciones de la actividad">
        {TABS.map((t, index) => (
          <button
            key={t}
            id={`act-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={tab === t}
            aria-controls="act-tabpanel"
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
            onKeyDown={(e) => onTabKey(e, index)}
            className="serving-tab"
          >
            {t}
          </button>
        ))}
      </nav>

      <div id="act-tabpanel" role="tabpanel" aria-labelledby={`act-tab-${TABS.indexOf(tab)}`}>
        {tab === "Resumen" ? (
          <ResumenTab
            activity={activity}
            capabilities={capabilities}
            data={data}
            campuses={props.campuses}
            churchTimezone={props.churchTimezone}
            people={props.people}
          />
        ) : null}
        {tab === "Plan" ? <PlanTab {...structureProps} /> : null}
        {tab === "Áreas" ? <AreasTab {...structureProps} /> : null}
        {tab === "Puestos" ? <PuestosTab {...structureProps} /> : null}
        {tab === "Equipo" ? (
          <EquipoTab activity={activity} capabilities={capabilities} data={data} equipo={props.equipo} />
        ) : null}
        {tab === "Notas" ? <NotasTab activity={activity} capabilities={capabilities} /> : null}
        {tab === "Historial" ? <HistorialTab history={props.history} timezone={activity.timezone} /> : null}
      </div>
    </>
  );
}
