"use client";

import "../_equipo/equipo.css";
import { Info, Send, UsersRound } from "lucide-react";
import { AREA_REQUIREMENT_LABELS, type ActivityStatus } from "@/lib/activities/constants";
import type { ActivityCapabilities, ActivityDetail } from "@/server/activities/activities-service";
import type {
  ActivityAssignment,
  AssignmentReview,
  SubstitutionRequest,
} from "@/server/assignments/assignments-service";
import type { StructureTabsData } from "../_estructura/load";
import { sendAssignmentsAction } from "../_equipo/actions";
import PositionCard from "../_equipo/PositionCard";
import AssignmentItem from "../_equipo/AssignmentItem";
import { canManageAny, canManageServiceArea, type EquipoData } from "../_equipo/types";
import { EqMessages, useEquipoAction } from "../_equipo/ui";

type Props = {
  activity: Pick<ActivityDetail, "id" | "status" | "scheduleKind" | "timezone">;
  capabilities: Pick<ActivityCapabilities, "servingEnabled">;
  data: StructureTabsData;
  equipo: EquipoData;
};

const NOT_ASSIGNABLE_REASON: Partial<Record<ActivityStatus, string>> = {
  draft: "La actividad está en borrador: pásala a Planificada o Publicada para asignar personas.",
  cancelled: "La actividad está cancelada: no admite asignaciones.",
  completed: "La actividad está completada: el equipo se conserva como histórico.",
  archived: "La actividad está archivada: el equipo se muestra solo en lectura.",
};

const EMPTY_SET: ReadonlySet<string> = new Set();

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Equipo: asignaciones reales por área y puesto (Fase 5). */
export default function EquipoTab({ activity, capabilities, data, equipo }: Props) {
  const { areas, summary } = data.structure;
  const sendAction = useEquipoAction();

  const readOnlyReason = !capabilities.servingEnabled
    ? "El módulo Servicios no está habilitado: el equipo se muestra solo en lectura."
    : !equipo.acceptsAssignments
      ? (NOT_ASSIGNABLE_REASON[activity.status] ?? "La actividad ya terminó: el equipo se muestra solo en lectura.")
      : null;
  const actionsEnabled = capabilities.servingEnabled && equipo.acceptsAssignments && !equipo.loadError;
  const managesSomething = canManageAny(equipo.manage);

  const assignmentsById = new Map<string, ActivityAssignment>(equipo.assignments.map((a) => [a.id, a]));
  const reviewsById = new Map<string, AssignmentReview>(equipo.reviews.map((r) => [r.assignmentId, r]));
  const openRequestsByOriginal = new Map<string, SubstitutionRequest>(
    equipo.substitutions.filter((s) => s.status === "open").map((s) => [s.originalAssignmentId, s]),
  );
  const areaByPositionId = new Map(areas.flatMap((area) => area.positions.map((p) => [p.id, area] as const)));
  const byPosition = new Map<string, ActivityAssignment[]>();
  const orphaned: ActivityAssignment[] = [];
  for (const a of equipo.assignments) {
    if (a.activityPositionId && areaByPositionId.has(a.activityPositionId)) {
      const list = byPosition.get(a.activityPositionId) ?? [];
      list.push(a);
      byPosition.set(a.activityPositionId, list);
    } else {
      orphaned.push(a);
    }
  }

  const sendableDrafts = equipo.assignments.filter((a) => {
    if (a.status !== "proposed" || !a.activityPositionId) return false;
    const area = areaByPositionId.get(a.activityPositionId);
    return area !== undefined && canManageServiceArea(equipo.manage, area.serviceAreaId);
  }).length;

  return (
    <div className="eq-stack">
      {readOnlyReason ? (
        <div className="act-notice is-info" role="status">
          <Info size={16} aria-hidden="true" />
          <span>{readOnlyReason}</span>
        </div>
      ) : null}

      {equipo.loadError ? (
        <p role="alert" className="eq-error eq-banner">
          No se pudieron cargar las asignaciones. Recarga la página para intentarlo de nuevo; mientras tanto no se
          muestran personas ni se pueden hacer cambios.
        </p>
      ) : null}
      {equipo.reviewError ? (
        <p role="alert" className="eq-error eq-banner">
          No se pudo revisar si las personas asignadas siguen cumpliendo las condiciones de sus puestos.
        </p>
      ) : null}

      <section className="shell-card eq-card" aria-labelledby="eq-summary-title">
        <div className="eq-section-head">
          <h2 id="eq-summary-title">Resumen del equipo</h2>
          <span className="eq-muted">{plural(summary.positions, "puesto", "puestos")}</span>
        </div>
        <div className="eq-stats">
          <div className="eq-stat is-success">
            <strong>{summary.assignedPeople}</strong>
            <span>Confirmadas</span>
          </div>
          <div className="eq-stat is-warning">
            <strong>{summary.pendingPeople}</strong>
            <span>Pendientes</span>
          </div>
          <div className="eq-stat">
            <strong>{summary.proposedPeople}</strong>
            <span>Borradores</span>
          </div>
          <div className={`eq-stat${summary.uncoveredPositions > 0 ? " is-danger" : ""}`}>
            <strong>{summary.uncoveredPositions}</strong>
            <span>Puestos sin cubrir</span>
          </div>
        </div>
        <p className="eq-muted">
          Un puesto se cubre con personas confirmadas. Las pendientes aún no han respondido y los borradores todavía no
          se han enviado.
        </p>

        {actionsEnabled && sendableDrafts > 0 ? (
          <div className="eq-send">
            <button
              type="button"
              className="eq-btn is-primary"
              disabled={sendAction.pending}
              onClick={() =>
                sendAction.run(
                  () => sendAssignmentsAction(activity.id),
                  ({ sent }) =>
                    sent === 0
                      ? "No había borradores que enviar."
                      : `${plural(sent, "asignación enviada", "asignaciones enviadas")}. Las personas verán el turno en «Mis turnos».`,
                )
              }
            >
              <Send size={15} aria-hidden="true" /> Enviar borradores ({sendableDrafts})
            </button>
            <p className="eq-muted">Al enviarlos, cada persona verá su turno en «Mis turnos» y podrá responder.</p>
          </div>
        ) : null}
        <EqMessages error={sendAction.error} notice={sendAction.notice} />

        {!managesSomething && capabilities.servingEnabled && !equipo.loadError ? (
          <p className="eq-muted">
            No gestionas asignaciones en esta actividad: ves la información del equipo que tu rol permite.
          </p>
        ) : null}
      </section>

      {summary.positions === 0 ? (
        <div className="shell-card shell-empty-state">
          <UsersRound size={22} aria-hidden="true" />
          <h3>Sin puestos definidos</h3>
          <p>Añade áreas y puestos en las pestañas correspondientes para poder asignar personas.</p>
        </div>
      ) : (
        areas.map((area) => {
          const canAct = actionsEnabled && canManageServiceArea(equipo.manage, area.serviceAreaId);
          return (
            <section key={area.id} className="shell-card eq-card" aria-labelledby={`eq-area-${area.id}`}>
              <div className="eq-section-head">
                <h2 id={`eq-area-${area.id}`}>{area.areaName}</h2>
                <span className="eq-muted">
                  {AREA_REQUIREMENT_LABELS[area.requirement]} · {plural(area.positions.length, "puesto", "puestos")}
                </span>
              </div>
              {area.positions.length === 0 ? (
                <p className="eq-muted">Esta área no tiene puestos en la actividad.</p>
              ) : (
                area.positions.map((position) => (
                  <PositionCard
                    key={position.id}
                    position={position}
                    serviceAreaId={area.serviceAreaId}
                    assignments={byPosition.get(position.id) ?? []}
                    assignmentsById={assignmentsById}
                    openRequestsByOriginal={openRequestsByOriginal}
                    reviewsById={reviewsById}
                    canAct={canAct}
                    timezone={activity.timezone}
                  />
                ))
              )}
            </section>
          );
        })
      )}

      {orphaned.length > 0 ? (
        <section className="shell-card eq-card">
          <details className="eq-history">
            <summary>Asignaciones de puestos retirados de la actividad ({orphaned.length})</summary>
            <ul className="eq-assignment-list">
              {orphaned.map((a) => (
                <AssignmentItem
                  key={a.id}
                  assignment={a}
                  timezone={activity.timezone}
                  canAct={false}
                  review={undefined}
                  openRequest={undefined}
                  candidate={undefined}
                  candidateReview={undefined}
                  substitutesName={null}
                  serviceAreaId={null}
                  assignedPersonIds={EMPTY_SET}
                  history
                />
              ))}
            </ul>
          </details>
        </section>
      ) : null}
    </div>
  );
}
