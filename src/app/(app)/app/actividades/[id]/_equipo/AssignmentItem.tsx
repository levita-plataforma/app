"use client";

import { useState } from "react";
import { AlertTriangle, Clock, UserRound } from "lucide-react";
import { formatDateShort, formatTime } from "@/lib/activities/time";
import {
  ASSIGNMENT_STATUS_INFO,
  CANCEL_CAUSE_LABELS,
  RESPONSE_SOURCE_LABELS,
  SUBSTITUTION_STATUS_LABELS,
  eligibilityCodeLabel,
} from "@/lib/assignments/constants";
import type {
  ActivityAssignment,
  AssignmentReview,
  SubstitutionRequest,
} from "@/server/assignments/assignments-service";
import {
  cancelAssignmentAction,
  cancelSubstitutionAction,
  proposeCandidateAction,
  recordResponseAction,
  requestSubstitutionAction,
  sendAssignmentsAction,
} from "./actions";
import PersonPicker from "./PersonPicker";
import { CodeList, EqChip, EqConfirm, EqMessages, useEquipoAction } from "./ui";

type Props = {
  assignment: ActivityAssignment;
  timezone: string;
  canAct: boolean;
  review: AssignmentReview | undefined;
  /** Solicitud de sustitución abierta sobre esta asignación. */
  openRequest: SubstitutionRequest | undefined;
  /** Candidato vigente de esa solicitud, si lo hay (se muestra anidado). */
  candidate: ActivityAssignment | undefined;
  candidateReview: AssignmentReview | undefined;
  /** Nombre de la persona a la que sustituye (si es candidata). */
  substitutesName: string | null;
  serviceAreaId: string | null;
  assignedPersonIds: ReadonlySet<string>;
  history?: boolean;
};

function when(iso: string, tz: string): string {
  return `${formatDateShort(iso, tz)}, ${formatTime(iso, tz)}`;
}

/** Bloqueos nuevos de la revisión actual (el estado de la actividad ya se explica arriba). */
function reviewBlocking(review: AssignmentReview | undefined): string[] {
  return (review?.blocking ?? []).filter((c) => c !== "activity_not_assignable");
}

export default function AssignmentItem(props: Props) {
  const { assignment: a, timezone, canAct, openRequest, candidate } = props;
  const info = ASSIGNMENT_STATUS_INFO[a.status];
  const action = useEquipoAction();
  const [proposing, setProposing] = useState(false);

  const blocking = reviewBlocking(props.review);
  const newWarnings = (props.review?.warnings ?? []).filter((w) => !a.acknowledgedWarnings.includes(w));
  const hasOpenCandidate = candidate !== undefined;
  const isVigente = a.status === "proposed" || a.status === "pending" || a.status === "accepted";

  return (
    <li className={`eq-assignment${props.history ? " is-history" : ""}`}>
      <div className="eq-assignment-head">
        <span className="eq-person">
          <UserRound size={15} aria-hidden="true" />
          <strong>{a.person.name}</strong>
        </span>
        <span className="eq-chips">
          <EqChip tone={info.tone} title={info.description}>
            {info.label}
          </EqChip>
          {!a.person.hasAccount ? <EqChip tone="muted">Sin cuenta</EqChip> : null}
          {blocking.length > 0 ? (
            <EqChip tone="danger">
              <AlertTriangle size={12} aria-hidden="true" /> Revisar
            </EqChip>
          ) : null}
          {openRequest ? (
            <EqChip tone="warning">
              {SUBSTITUTION_STATUS_LABELS.open}
              {openRequest.requestedBySelf ? " por la persona" : ""}
            </EqChip>
          ) : null}
        </span>
      </div>

      <ul className="eq-facts">
        {props.substitutesName ? <li>Sustituye a {props.substitutesName}</li> : null}
        {a.responseSource === "representative" ? <li>{RESPONSE_SOURCE_LABELS.representative}</li> : null}
        {a.reconfirmationRequestedAt && a.status === "pending" ? (
          <li className="is-warning">
            <Clock size={12} aria-hidden="true" /> Hora cambiada: pendiente de reconfirmar
          </li>
        ) : null}
        {a.status === "proposed" ? <li>La persona todavía no lo ve: envíalo para que aparezca en «Mis turnos».</li> : null}
        {a.sentAt && a.status === "pending" ? <li>Enviada el {when(a.sentAt, timezone)}</li> : null}
        {a.respondedAt && (a.status === "accepted" || a.status === "declined") ? (
          <li>Respondió el {when(a.respondedAt, timezone)}</li>
        ) : null}
        {a.status === "cancelled" && a.cancelCause ? <li>{CANCEL_CAUSE_LABELS[a.cancelCause] ?? a.cancelCause}</li> : null}
        {a.status === "substituted" ? <li>{info.description}</li> : null}
        {a.acknowledgedWarnings.length > 0 ? (
          <li>
            Avisos confirmados al asignar: {a.acknowledgedWarnings.map((c) => eligibilityCodeLabel(c)).join("; ")}
          </li>
        ) : null}
      </ul>

      {isVigente && blocking.length > 0 ? (
        <div className="eq-box is-danger">
          <strong>Revisar: con los datos actuales ya no cumple las condiciones del puesto.</strong>
          <CodeList codes={blocking} tone="danger" />
        </div>
      ) : null}
      {isVigente && newWarnings.length > 0 ? (
        <div className="eq-box is-warning">
          <strong>Avisos nuevos:</strong>
          <CodeList codes={newWarnings} tone="warning" />
        </div>
      ) : null}

      {canAct ? (
        <div className="eq-actions">
          {a.status === "proposed" ? (
            <button
              type="button"
              className="eq-btn is-primary"
              disabled={action.pending}
              onClick={() =>
                action.run(
                  () => sendAssignmentsAction(a.activityId, [a.id]),
                  ({ sent }) =>
                    sent > 0 ? `Enviada. ${a.person.name} verá el turno en «Mis turnos».` : "No había nada que enviar.",
                )
              }
            >
              Enviar
            </button>
          ) : null}

          {a.status === "pending" || a.status === "declined" ? (
            <button
              type="button"
              className={`eq-btn${!a.person.hasAccount ? " is-primary" : ""}`}
              disabled={action.pending}
              onClick={() =>
                action.run(
                  () => recordResponseAction(a.id, "accepted", a.version),
                  ({ outcome }) => {
                    if (outcome.kind === "blocked") {
                      action.setError(
                        `${outcome.message} ${outcome.blocking.map((c) => eligibilityCodeLabel(c)).join("; ")}.`,
                      );
                      return null;
                    }
                    if (outcome.kind === "responded" && outcome.replayed) return "La respuesta ya estaba registrada.";
                    return "Respuesta registrada: confirmada.";
                  },
                )
              }
            >
              Registrar que acepta
            </button>
          ) : null}

          {a.status === "pending" ? (
            <button
              type="button"
              className="eq-btn"
              disabled={action.pending}
              onClick={() =>
                action.run(
                  () => recordResponseAction(a.id, "declined", a.version),
                  ({ outcome }) =>
                    outcome.kind === "responded" && outcome.replayed
                      ? "La respuesta ya estaba registrada."
                      : "Respuesta registrada: rechazada.",
                )
              }
            >
              Registrar que rechaza
            </button>
          ) : null}

          {(a.status === "pending" || a.status === "accepted") && !openRequest && !props.substitutesName ? (
            <button
              type="button"
              className="eq-btn"
              disabled={action.pending}
              onClick={() =>
                action.run(
                  () => requestSubstitutionAction(a.id),
                  ({ replayed }) =>
                    replayed
                      ? "Ya había una sustitución abierta."
                      : `Sustitución solicitada. ${a.person.name} sigue en el puesto hasta que alguien la sustituya.`,
                )
              }
            >
              Pedir sustitución
            </button>
          ) : null}

          {openRequest && !hasOpenCandidate && !proposing ? (
            <button type="button" className="eq-btn is-primary" disabled={action.pending} onClick={() => setProposing(true)}>
              Proponer candidato
            </button>
          ) : null}

          {openRequest ? (
            <EqConfirm
              label="Cancelar sustitución"
              confirmLabel="Cancelar sustitución"
              disabled={action.pending}
              message={
                hasOpenCandidate
                  ? `Se cerrará la solicitud y se retirará al candidato. ${a.person.name} sigue en el puesto.`
                  : `Se cerrará la solicitud. ${a.person.name} sigue en el puesto.`
              }
              onConfirm={() =>
                action.run(() => cancelSubstitutionAction(openRequest.id), () => "Sustitución cancelada.")
              }
            />
          ) : null}

          {isVigente ? (
            <EqConfirm
              label="Retirar"
              confirmLabel="Retirar"
              disabled={action.pending}
              message={
                openRequest
                  ? `Se retirará a ${a.person.name} y se cerrará su sustitución abierta (con su candidato, si lo hay).`
                  : `Se retirará a ${a.person.name} de este puesto. Quedará en el historial.`
              }
              onConfirm={() => action.run(() => cancelAssignmentAction(a.id, a.version), () => "Asignación retirada.")}
            />
          ) : null}
        </div>
      ) : null}
      <EqMessages error={action.error} notice={action.notice} />

      {openRequest && proposing && canAct && a.activityPositionId ? (
        <PersonPicker
          title={`Candidato para sustituir a ${a.person.name}`}
          activityPositionId={a.activityPositionId}
          serviceAreaId={props.serviceAreaId}
          assignedPersonIds={props.assignedPersonIds}
          help={`El candidato recibirá el turno como pendiente y lo verá en «Mis turnos». ${a.person.name} sigue en el puesto hasta que el candidato acepte.`}
          submits={[
            {
              label: "Proponer candidato",
              primary: true,
              submit: (personId, ack) => proposeCandidateAction(openRequest.id, personId, ack),
              successMessage: (name) => `${name} propuesto como candidato.`,
            },
          ]}
          onClose={() => setProposing(false)}
          onDone={(message) => {
            setProposing(false);
            action.setNotice(message);
          }}
        />
      ) : null}

      {candidate ? (
        <div className="eq-candidate">
          <p className="eq-muted">Candidato propuesto para la sustitución:</p>
          <ul className="eq-assignment-list">
            <AssignmentItem
              assignment={candidate}
              timezone={timezone}
              canAct={canAct}
              review={props.candidateReview}
              openRequest={undefined}
              candidate={undefined}
              candidateReview={undefined}
              substitutesName={a.person.name}
              serviceAreaId={props.serviceAreaId}
              assignedPersonIds={props.assignedPersonIds}
            />
          </ul>
        </div>
      ) : null}
    </li>
  );
}
