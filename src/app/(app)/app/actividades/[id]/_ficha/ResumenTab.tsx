"use client";

import { useState } from "react";
import { AlertTriangle, Pencil, Repeat } from "lucide-react";
import {
  ACTIVITY_STATUS_INFO,
  ACTIVITY_TYPE_INFO,
  AREA_REQUIREMENT_LABELS,
  STRUCTURE_ISSUE_LABELS,
  VISIBILITY_INFO,
  isActivityEditable,
} from "@/lib/activities/constants";
import {
  durationMinutes,
  formatDateLong,
  formatDuration,
  formatTime,
  localDateKey,
  timeZoneAbbreviation,
} from "@/lib/activities/time";
import type { ActivityCapabilities, ActivityDetail, ActivitySeriesInfo } from "@/server/activities/activities-service";
import type { StructureTabsData } from "../_estructura/load";
import { secondaryButtonStyle } from "@/app/(app)/app/servicios/ui";
import StatusChip from "../../_components/StatusChip";
import { describeSeries } from "../../_components/describe";
import EditActivityForm from "./EditActivityForm";
import SeriesRuleForm from "./SeriesRuleForm";
import type { CampusOption } from "./ActivityFicha";

type Props = {
  activity: ActivityDetail;
  capabilities: ActivityCapabilities;
  data: StructureTabsData;
  campuses: CampusOption[];
  churchTimezone: string;
  people: { id: string; name: string }[];
};

type Mode = "view" | "edit" | "rule";

export default function ResumenTab({ activity, capabilities, data, campuses, churchTimezone, people }: Props) {
  const [mode, setMode] = useState<Mode>("view");
  const [flash, setFlash] = useState<string | null>(null);
  const canEdit = capabilities.manage && isActivityEditable(activity.status);
  const tz = activity.timezone;

  function saved(message: string) {
    setFlash(message);
    setMode("view");
  }

  if (mode === "edit" && canEdit) {
    return (
      <EditActivityForm
        activity={activity}
        campuses={campuses}
        churchTimezone={churchTimezone}
        people={people}
        canReadAdminNotes={capabilities.readAdminNotes}
        onCancel={() => setMode("view")}
        onSaved={saved}
      />
    );
  }
  if (mode === "rule" && canEdit && activity.series) {
    return (
      <SeriesRuleForm
        activity={activity as ActivityDetail & { series: ActivitySeriesInfo }}
        onCancel={() => setMode("view")}
        onSaved={saved}
      />
    );
  }

  const summary = data.structure.summary;
  const areaNames = new Map(data.structure.areas.map((a) => [a.id, a.areaName]));
  const positionNames = new Map(data.structure.areas.flatMap((a) => a.positions.map((p) => [p.id, p.name] as const)));
  const minutes = durationMinutes(activity.startsAt, activity.endsAt);
  const statusInfo = ACTIVITY_STATUS_INFO[activity.status];

  return (
    <div className="act-form" style={{ paddingTop: 16 }}>
      {flash ? (
        <p role="status" className="act-success">
          {flash}
        </p>
      ) : null}

      {canEdit ? (
        <div className="act-actions">
          <button type="button" style={secondaryButtonStyle()} onClick={() => { setFlash(null); setMode("edit"); }}>
            <Pencil size={14} aria-hidden="true" /> Editar datos
          </button>
          {activity.series ? (
            <button type="button" style={secondaryButtonStyle()} onClick={() => { setFlash(null); setMode("rule"); }}>
              <Repeat size={14} aria-hidden="true" /> Cambiar repetición
            </button>
          ) : null}
        </div>
      ) : capabilities.manage ? (
        <p className="act-hint">
          Una actividad {statusInfo.label.toLowerCase()} no admite cambios de contenido ni de estructura.
        </p>
      ) : null}

      <section className="shell-card list-card">
        <div className="list-card-header">
          <h2>Datos</h2>
        </div>
        <dl className="act-kv">
          <dt>Tipo</dt>
          <dd>{ACTIVITY_TYPE_INFO[activity.type].label}</dd>
          <dt>Sede</dt>
          <dd>{activity.campusName ?? "Toda la iglesia"}</dd>
          {activity.scheduleKind === "flexible" ? (
            <>
              <dt>Horario</dt>
              <dd>Sin hora fija</dd>
              <dt>Ventana</dt>
              <dd>
                {activity.startsAt || activity.endsAt
                  ? [
                      activity.startsAt ? `Desde ${formatDateLong(activity.startsAt, tz)}` : null,
                      activity.endsAt ? `hasta ${formatDateLong(activity.endsAt, tz)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" ")
                  : "Sin ventana de fechas"}
              </dd>
            </>
          ) : activity.startsAt && activity.endsAt ? (
            <>
              <dt>Fecha</dt>
              <dd>
                {formatDateLong(activity.startsAt, tz)}
                {localDateKey(activity.startsAt, tz) !== localDateKey(activity.endsAt, tz)
                  ? ` – ${formatDateLong(activity.endsAt, tz)}`
                  : ""}
              </dd>
              <dt>Hora</dt>
              <dd>
                {formatTime(activity.startsAt, tz)}–{formatTime(activity.endsAt, tz)}
              </dd>
              <dt>Duración</dt>
              <dd>{formatDuration(minutes)}</dd>
            </>
          ) : null}
          <dt>Zona horaria</dt>
          <dd>
            {tz}
            {activity.startsAt ? ` (${timeZoneAbbreviation(activity.startsAt, tz)})` : ""}
          </dd>
          {activity.series ? (
            <>
              <dt>Repetición</dt>
              <dd>
                {describeSeries(activity.series)}
                {activity.seriesModified ? " · esta ocurrencia es una excepción" : ""}
              </dd>
            </>
          ) : null}
          <dt>Estado</dt>
          <dd>
            <StatusChip status={activity.status} />{" "}
            <span className="serving-meta">{statusInfo.description}</span>
          </dd>
          {activity.status === "cancelled" ? (
            <>
              <dt>Cancelación</dt>
              <dd>
                {activity.cancelledAt ? `${formatDateLong(activity.cancelledAt, tz)}. ` : ""}
                {activity.cancellationReason ? `Motivo: ${activity.cancellationReason}` : "Sin motivo indicado."}
              </dd>
            </>
          ) : null}
          <dt>Visibilidad</dt>
          <dd>
            {VISIBILITY_INFO[activity.visibility].label}{" "}
            <span className="serving-meta">— {VISIBILITY_INFO[activity.visibility].description}</span>
          </dd>
          <dt>Lugar</dt>
          <dd>{activity.locationText ?? "—"}</dd>
          <dt>Responsable</dt>
          <dd>{activity.organizerName ?? "Sin responsable"}</dd>
          {activity.description ? (
            <>
              <dt>Descripción</dt>
              <dd>
                <p className="act-pre">{activity.description}</p>
              </dd>
            </>
          ) : null}
        </dl>
      </section>

      <section className="shell-card list-card">
        <div className="list-card-header">
          <h2>Cobertura estructural</h2>
        </div>
        <div className="act-stat-row">
          <div className="act-stat">
            <strong>{summary.areas}</strong>
            <span>Áreas ({summary.requiredAreas} obligatorias)</span>
          </div>
          <div className="act-stat">
            <strong>{summary.positions}</strong>
            <span>Puestos ({summary.criticalPositions} críticos)</span>
          </div>
          <div className="act-stat">
            <strong>{summary.minPeopleTotal}</strong>
            <span>Personas mínimas requeridas</span>
          </div>
          <div className="act-stat">
            <strong>{summary.assignedPeople}</strong>
            <span>Personas confirmadas</span>
          </div>
          <div className="act-stat">
            <strong>{summary.pendingPeople}</strong>
            <span>Pendientes de respuesta</span>
          </div>
          <div className="act-stat">
            <strong>{summary.proposedPeople}</strong>
            <span>Borradores sin enviar</span>
          </div>
          <div className="act-stat">
            <strong>{summary.uncoveredPositions}</strong>
            <span>Puestos sin cubrir</span>
          </div>
        </div>
        <p className="act-hint" style={{ marginTop: 10 }}>
          Un puesto se cubre con personas confirmadas. Gestiona las asignaciones en la pestaña Equipo.
        </p>

        {data.issuesError ? (
          <p role="alert" className="act-error" style={{ marginTop: 10 }}>
            No se pudo validar la estructura: las incidencias no están disponibles ahora mismo.
          </p>
        ) : data.issues.length > 0 ? (
          <div style={{ marginTop: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Incidencias de estructura</h3>
            <ul className="act-list">
              {data.issues.map((issue, i) => {
                const target =
                  (issue.activityPositionId && positionNames.get(issue.activityPositionId)) ||
                  (issue.activityServiceAreaId && areaNames.get(issue.activityServiceAreaId)) ||
                  null;
                return (
                  <li key={`${issue.code}-${issue.activityServiceAreaId ?? ""}-${issue.activityPositionId ?? ""}-${i}`}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <AlertTriangle
                        size={13}
                        aria-hidden="true"
                        style={{ color: issue.severity === "blocking" ? "var(--shell-danger)" : "var(--shell-warning)" }}
                      />
                      {STRUCTURE_ISSUE_LABELS[issue.code] ?? issue.code}
                      {target ? <span className="serving-meta">· {target}</span> : null}
                    </span>
                    <span className={issue.severity === "blocking" ? "serving-chip is-danger" : "serving-chip is-warning"}>
                      {issue.severity === "blocking" ? "Bloquea la publicación" : "Aviso"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="act-hint" style={{ marginTop: 10 }}>
            Sin incidencias de estructura.
          </p>
        )}
      </section>

      <section className="shell-card list-card">
        <div className="list-card-header">
          <h2>Áreas y puestos</h2>
        </div>
        {data.structure.areas.length === 0 ? (
          <p className="serving-meta">Esta actividad aún no tiene áreas de servicio.</p>
        ) : (
          <ul className="act-list">
            {data.structure.areas.map((area) => (
              <li key={area.id}>
                <span>
                  <strong style={{ fontWeight: 600 }}>{area.areaName}</strong>{" "}
                  <span className="serving-meta">· {AREA_REQUIREMENT_LABELS[area.requirement]}</span>
                </span>
                <span className="serving-meta">
                  {area.positions.length === 0 ? "Sin puestos" : area.positions.map((p) => p.name).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
