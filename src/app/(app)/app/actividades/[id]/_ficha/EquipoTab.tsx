"use client";

import "../_equipo/equipo.css";
import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { canManageAny, canManageServiceArea, canWithdrawInStatus, type EquipoData } from "../_equipo/types";
import { EqMessages, SendBlockedBox, useEquipoAction, type BlockedSend } from "../_equipo/ui";

type Props = {
  activity: Pick<ActivityDetail, "id" | "status" | "scheduleKind" | "timezone">;
  capabilities: Pick<ActivityCapabilities, "servingEnabled">;
  /** No se pudieron cargar los permisos: no equivale a módulo deshabilitado. */
  capabilitiesError: boolean;
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
export default function EquipoTab({ activity, capabilities, capabilitiesError, data, equipo }: Props) {
  const { areas, summary } = data.structure;
  const router = useRouter();
  const sendAction = useEquipoAction();
  const [blockedSend, setBlockedSend] = useState<BlockedSend[]>([]);

  // Si fallaron los permisos no se sabe si el módulo está habilitado: se explica el error, no «deshabilitado».
  const permissionsFailed = capabilitiesError || equipo.permissionsError;
  const readOnlyReason = permissionsFailed
    ? null
    : !capabilities.servingEnabled
      ? "El módulo Servicios no está habilitado: el equipo se muestra solo en lectura."
      : !equipo.acceptsAssignments
        ? (NOT_ASSIGNABLE_REASON[activity.status] ?? "La actividad ya terminó: el equipo se muestra solo en lectura.")
        : null;
  const actionsEnabled =
    capabilities.servingEnabled && equipo.acceptsAssignments && !equipo.loadError && !permissionsFailed;
  const withdrawEnabled =
    capabilities.servingEnabled && canWithdrawInStatus(activity.status) && !equipo.loadError && !permissionsFailed;
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

  function sendDrafts() {
    setBlockedSend([]);
    sendAction.run(
      () => sendAssignmentsAction(activity.id),
      ({ sent }) => {
        setBlockedSend(
          sent.blocked.map((b) => ({ ...b, name: assignmentsById.get(b.assignmentId)?.person.name ?? "Persona no visible" })),
        );
        if (sent.sent === 0) {
          return sent.blocked.length > 0 ? null : "No había borradores que enviar.";
        }
        return `${plural(sent.sent, "asignación enviada", "asignaciones enviadas")}. Las personas verán el turno en «Mis turnos».`;
      },
    );
  }

  return (
    <div className="eq-stack">
      {/* Si fallaron los permisos de toda la ficha, el aviso ya está encima de las pestañas. */}
      {equipo.permissionsError && !capabilitiesError ? (
        <div role="alert" className="eq-error eq-banner">
          No se pudieron comprobar tus permisos para gestionar el equipo. Mientras tanto se muestra solo en lectura.{" "}
          <button type="button" className="eq-btn is-ghost" onClick={() => router.refresh()}>
            Reintentar
          </button>
        </div>
      ) : null}

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
        {summary.coverageUnavailable ? (
          <p className="eq-unavailable" role="status">
            No se pudo calcular la cobertura de personas ahora mismo. Las asignaciones de cada puesto se muestran igual;
            recarga la página más tarde para ver los recuentos.
          </p>
        ) : (
          <>
            <div className="eq-stats">
              <div className="eq-stat is-success">
                <strong>{summary.assignedPeople}</strong>
                <span>Confirmadas</span>
              </div>
              {summary.pendingPeople !== null ? (
                <div className="eq-stat is-warning">
                  <strong>{summary.pendingPeople}</strong>
                  <span>Pendientes</span>
                </div>
              ) : null}
              {summary.proposedPeople !== null ? (
                <div className="eq-stat">
                  <strong>{summary.proposedPeople}</strong>
                  <span>Borradores</span>
                </div>
              ) : null}
              <div className={`eq-stat${summary.uncoveredPositions > 0 ? " is-danger" : ""}`}>
                <strong>{summary.uncoveredPositions}</strong>
                <span>Puestos sin cubrir</span>
              </div>
            </div>
            <p className="eq-muted">
              {summary.pendingPeople !== null
                ? "Un puesto se cubre con personas confirmadas. Las pendientes aún no han respondido y los borradores todavía no se han enviado."
                : "Un puesto se cubre con personas confirmadas."}
            </p>
          </>
        )}

        {actionsEnabled && sendableDrafts > 0 ? (
          <div className="eq-send">
            <button type="button" className="eq-btn is-primary" disabled={sendAction.pending} onClick={sendDrafts}>
              <Send size={15} aria-hidden="true" /> Enviar borradores ({sendableDrafts})
            </button>
            <p className="eq-muted">
              Al enviarlos, cada persona verá su turno en «Mis turnos» y podrá responder. Los que ya no cumplan las
              condiciones del puesto no se envían y siguen en borrador.
            </p>
          </div>
        ) : null}
        <EqMessages error={sendAction.error} notice={sendAction.notice} />
        <SendBlockedBox blocked={blockedSend} />

        {!managesSomething && capabilities.servingEnabled && !equipo.loadError && !permissionsFailed ? (
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
          const managesArea = canManageServiceArea(equipo.manage, area.serviceAreaId);
          const canAct = actionsEnabled && managesArea;
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
                    canWithdraw={withdrawEnabled && managesArea}
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
                  canWithdraw={false}
                  isActiveCandidate={false}
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
