"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { COVERAGE_INFO } from "@/lib/activities/constants";
import { VIGENTE_STATUSES, type AssignmentStatus } from "@/lib/assignments/constants";
import type { ActivityPosition } from "@/server/activities/activity-structure-service";
import type {
  ActivityAssignment,
  AssignmentReview,
  SubstitutionRequest,
} from "@/server/assignments/assignments-service";
import { createAssignmentAction } from "./actions";
import AssignmentItem from "./AssignmentItem";
import PersonPicker from "./PersonPicker";
import { EqChip, EqMessages } from "./ui";

type Props = {
  position: ActivityPosition;
  serviceAreaId: string | null;
  assignments: ActivityAssignment[];
  assignmentsById: Map<string, ActivityAssignment>;
  openRequestsByOriginal: Map<string, SubstitutionRequest>;
  reviewsById: Map<string, AssignmentReview>;
  /** Puede crear, enviar, registrar respuestas y gestionar sustituciones (actividad abierta a asignaciones). */
  canAct: boolean;
  /** Puede retirar asignaciones (gestiona el área y la actividad está en borrador, planificada o publicada). */
  canWithdraw: boolean;
  timezone: string;
};

const STATUS_ORDER: Record<AssignmentStatus, number> = {
  accepted: 0,
  pending: 1,
  proposed: 2,
  declined: 3,
  substituted: 4,
  cancelled: 5,
};

function isVigente(a: ActivityAssignment): boolean {
  return VIGENTE_STATUSES.includes(a.status);
}

export default function PositionCard(props: Props) {
  const { position, assignments, openRequestsByOriginal, assignmentsById, reviewsById, canAct, canWithdraw } = props;
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const coverage = COVERAGE_INFO[position.coverage];
  const headingId = `eq-pos-${position.id}`;

  const vigentes = assignments.filter(isVigente);
  const assignedPersonIds = new Set(vigentes.map((a) => a.person.id));

  // Candidatos activos de solicitudes abiertas: solo ellos pueden aceptar la sustitución.
  const activeCandidateIds = new Set<string>();
  for (const request of openRequestsByOriginal.values()) {
    if (request.candidateAssignmentId) activeCandidateIds.add(request.candidateAssignmentId);
  }

  // Candidatos vigentes de sustituciones abiertas: se muestran anidados bajo la original.
  const nestedCandidateIds = new Set<string>();
  const candidateByOriginal = new Map<string, ActivityAssignment>();
  for (const original of vigentes) {
    const request = openRequestsByOriginal.get(original.id);
    const candidate = request?.candidateAssignmentId ? assignmentsById.get(request.candidateAssignmentId) : undefined;
    if (candidate && isVigente(candidate)) {
      nestedCandidateIds.add(candidate.id);
      candidateByOriginal.set(original.id, candidate);
    }
  }

  const byStatus = (x: ActivityAssignment, y: ActivityAssignment) => STATUS_ORDER[x.status] - STATUS_ORDER[y.status];
  const current = vigentes.filter((a) => !nestedCandidateIds.has(a.id)).sort(byStatus);
  const history = assignments.filter((a) => !isVigente(a)).sort(byStatus);

  function substitutesName(a: ActivityAssignment): string | null {
    if (!a.substitutesAssignmentId) return null;
    return assignmentsById.get(a.substitutesAssignmentId)?.person.name ?? "otra persona";
  }

  /** Una rechazada solo se reactiva si la persona no tiene ya otra asignación vigente en el puesto. */
  function item(a: ActivityAssignment, inHistory: boolean) {
    const candidate = candidateByOriginal.get(a.id);
    return (
      <AssignmentItem
        key={a.id}
        assignment={a}
        timezone={props.timezone}
        canAct={canAct && !(inHistory && assignedPersonIds.has(a.person.id))}
        canWithdraw={canWithdraw}
        isActiveCandidate={activeCandidateIds.has(a.id)}
        review={reviewsById.get(a.id)}
        openRequest={isVigente(a) ? openRequestsByOriginal.get(a.id) : undefined}
        candidate={candidate}
        candidateReview={candidate ? reviewsById.get(candidate.id) : undefined}
        substitutesName={substitutesName(a)}
        serviceAreaId={props.serviceAreaId}
        assignedPersonIds={assignedPersonIds}
        history={inHistory}
      />
    );
  }

  return (
    <section className="eq-position" aria-labelledby={headingId}>
      <div className="eq-position-head">
        <div className="eq-position-title">
          <h3 id={headingId}>{position.name}</h3>
          <span className="eq-muted">
            mín {position.minPeople} · {position.maxPeople === null ? "sin máximo" : `máx ${position.maxPeople}`}
          </span>
        </div>
        <span className="eq-chips">
          {position.critical ? <EqChip tone="danger">Crítico</EqChip> : null}
          {position.coverageUnavailable ? (
            <EqChip tone="muted" title="No se pudo calcular la cobertura de personas.">
              Cobertura no disponible
            </EqChip>
          ) : (
            <>
              <EqChip tone={coverage.tone} title="La cobertura cuenta solo las personas confirmadas.">
                {coverage.label} · {position.assignedCount}{" "}
                {position.assignedCount === 1 ? "confirmada" : "confirmadas"}
              </EqChip>
              {position.pendingCount !== null && position.pendingCount > 0 ? (
                <EqChip tone="warning">
                  {position.pendingCount} {position.pendingCount === 1 ? "pendiente" : "pendientes"}
                </EqChip>
              ) : null}
              {position.proposedCount !== null && position.proposedCount > 0 ? (
                <EqChip tone="muted">
                  {position.proposedCount} {position.proposedCount === 1 ? "borrador" : "borradores"}
                </EqChip>
              ) : null}
            </>
          )}
        </span>
      </div>

      {current.length === 0 ? (
        <p className="eq-muted">Nadie asignado todavía.</p>
      ) : (
        <ul className="eq-assignment-list">{current.map((a) => item(a, false))}</ul>
      )}

      {canAct ? (
        adding ? (
          <PersonPicker
            title={`Añadir persona a «${position.name}»`}
            activityPositionId={position.id}
            serviceAreaId={props.serviceAreaId}
            assignedPersonIds={assignedPersonIds}
            help="Un borrador solo lo ve quien gestiona el puesto. Al enviarlo, la persona verá el turno en «Mis turnos» y podrá responder; no se le envía ningún aviso aparte."
            submits={[
              {
                label: "Añadir como borrador",
                submit: (personId, acknowledgedWarnings) =>
                  createAssignmentAction(position.id, personId, { acknowledgedWarnings, send: false }),
                successMessage: (name) => `${name} añadida como borrador.`,
              },
              {
                label: "Añadir y enviar",
                primary: true,
                submit: (personId, acknowledgedWarnings) =>
                  createAssignmentAction(position.id, personId, { acknowledgedWarnings, send: true }),
                successMessage: (name) => `${name} añadida. Verá el turno en «Mis turnos».`,
              },
            ]}
            onClose={() => setAdding(false)}
            onDone={(message) => {
              setAdding(false);
              setNotice(message);
            }}
          />
        ) : (
          <div className="eq-actions">
            <button
              type="button"
              className="eq-btn"
              onClick={() => {
                setNotice(null);
                setAdding(true);
              }}
            >
              <UserPlus size={15} aria-hidden="true" /> Añadir persona
            </button>
          </div>
        )
      ) : null}
      <EqMessages error={null} notice={notice} />

      {history.length > 0 ? (
        <details className="eq-history">
          <summary>Historial del puesto ({history.length})</summary>
          <ul className="eq-assignment-list">{history.map((a) => item(a, true))}</ul>
        </details>
      ) : null}
    </section>
  );
}
