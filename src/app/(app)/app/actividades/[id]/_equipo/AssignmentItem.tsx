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
import { CodeList, EqChip, EqConfirm, EqMessages, SendBlockedBox, useEquipoAction, type BlockedSend } from "./ui";

type Props = {
  assignment: ActivityAssignment;
  timezone: string;
  /** Crear, enviar, registrar respuestas y sustituciones: la actividad admite asignaciones y gestionas el área. */
  canAct: boolean;
  /** Retirar: gestionas el área y la actividad está en borrador, planificada o publicada. */
  canWithdraw: boolean;
  /** Es el candidato vigente de una solicitud de sustitución abierta. */
  isActiveCandidate: boolean;
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
  const { assignment: a, timezone, canAct, canWithdraw, openRequest, candidate } = props;
  const info = ASSIGNMENT_STATUS_INFO[a.status];
  const action = useEquipoAction();
  const [proposing, setProposing] = useState(false);
  const [blockedSend, setBlockedSend] = useState<BlockedSend[]>([]);

  const blocking = reviewBlocking(props.review);
  const newWarnings = (props.review?.warnings ?? []).filter((w) => !a.acknowledgedWarnings.includes(w));
  const hasOpenCandidate = candidate !== undefined;
  const isVigente = a.status === "proposed" || a.status === "pending" || a.status === "accepted";
  // Un candidato de sustitución solo puede aceptar mientras su solicitud siga abierta con él como candidato.
  const canRegisterAccept =
    (a.status === "pending" || a.status === "declined") && (!a.substitutesAssignmentId || props.isActiveCandidate);
  // Igual para titulares y para quien llegó por sustitución: aceptada, o pendiente si no es un candidato.
  const canRequestSubstitution =
    !openRequest && (a.status === "accepted" || (a.status === "pending" && !a.substitutesAssignmentId));
  const showWithdraw = canWithdraw && isVigente;

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

      {canAct || showWithdraw ? (
        <div className="eq-actions">
          {canAct && a.status === "proposed" ? (
            <button
              type="button"
              className="eq-btn is-primary"
              disabled={action.pending}
              onClick={() => {
                setBlockedSend([]);
                action.run(
                  () => sendAssignmentsAction(a.activityId, [a.id]),
                  ({ sent }) => {
                    if (sent.sent > 0) return `Enviada. ${a.person.name} verá el turno en «Mis turnos».`;
                    if (sent.blocked.length > 0) {
                      setBlockedSend(sent.blocked.map((b) => ({ ...b, name: a.person.name })));
                      return null;
                    }
                    return "No se envió: la asignación ya no estaba en borrador.";
                  },
                );
              }}
            >
              Enviar
            </button>
          ) : null}

          {canAct && canRegisterAccept ? (
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

          {canAct && a.status === "pending" ? (
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

          {canAct && canRequestSubstitution ? (
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

          {canAct && openRequest && !hasOpenCandidate && !proposing ? (
            <button type="button" className="eq-btn is-primary" disabled={action.pending} onClick={() => setProposing(true)}>
              Proponer candidato
            </button>
          ) : null}

          {canAct && openRequest ? (
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

          {showWithdraw ? (
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
      <SendBlockedBox blocked={blockedSend} />

      {openRequest && proposing && canAct && a.activityPositionId ? (
        <PersonPicker
          title={`Candidato para sustituir a ${a.person.name}`}
          activityPositionId={a.activityPositionId}
          serviceAreaId={props.serviceAreaId}
          assignedPersonIds={props.assignedPersonIds}
          help={`El turno del candidato quedará pendiente y lo verá en «Mis turnos» para responder. ${a.person.name} sigue en el puesto hasta que el candidato acepte.`}
          submits={[
            {
              label: "Proponer candidato",
              primary: true,
              submit: (personId, acknowledgedWarnings) => proposeCandidateAction(openRequest.id, personId, acknowledgedWarnings),
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
              canWithdraw={canWithdraw}
              isActiveCandidate
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
