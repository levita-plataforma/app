import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CalendarCheck, Clock, MapPin, RefreshCw } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { getMyAssignment } from "@/server/assignments/assignments-service";
import { ACTIVITY_STATUS_INFO, ACTIVITY_TYPE_INFO } from "@/lib/activities/constants";
import { ASSIGNMENT_STATUS_INFO, SUBSTITUTION_STATUS_LABELS } from "@/lib/assignments/constants";
import { chipClass } from "../../actividades/_components/describe";
import {
  cancelCauseText,
  deadlineText,
  isActivityOpenForResponses,
  isPastDeadline,
  needsReconfirmation,
  turnoScheduleText,
} from "../_lib/turno";
import TurnoRespuesta, { type TurnoRespuestaMode } from "./TurnoRespuesta";
import "../mis-turnos.css";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function currentTimeMs(): number {
  return Date.now();
}

/**
 * Estado del módulo Servicios. A diferencia de isModuleEnabled, distingue
 * «deshabilitado» de «no se pudo comprobar» para no mostrar un motivo falso.
 */
async function servingModuleState(churchId: string): Promise<"enabled" | "disabled" | "unknown"> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("module_enabled", { p_church_id: churchId, p_module_key: "serving" });
  if (error) return "unknown";
  return data ? "enabled" : "disabled";
}

export default async function MiTurnoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const tenant = await requireTenantContext();
  if (!tenant.personId) notFound();

  const [assignment, moduleState] = await Promise.all([
    getMyAssignment(tenant.churchId, tenant.personId, id),
    servingModuleState(tenant.churchId),
  ]);
  if (!assignment) notFound();

  const { activity } = assignment;
  const status = ASSIGNMENT_STATUS_INFO[assignment.status];
  const activityStatus = ACTIVITY_STATUS_INFO[activity.status];
  const schedule = turnoScheduleText(activity);
  const open = isActivityOpenForResponses(activity);
  const pastDeadline = isPastDeadline(activity, currentTimeMs());
  const deadline = deadlineText(activity);

  // Qué puede hacer la persona ahora (la base de datos lo vuelve a comprobar).
  let mode: TurnoRespuestaMode;
  let readOnlyReason: string | null = null;
  if (assignment.status === "proposed") {
    mode = "readonly";
    readOnlyReason = "Este turno todavía no se ha enviado.";
  } else if (assignment.status === "cancelled") {
    mode = "readonly";
    readOnlyReason = cancelCauseText(assignment.cancelCause) ?? "Este turno se retiró: ya no formas parte del equipo.";
  } else if (assignment.status === "substituted") {
    mode = "readonly";
    readOnlyReason = "Otra persona ocupa ahora este puesto. No tienes que hacer nada más.";
  } else if (moduleState === "disabled") {
    mode = "readonly";
    readOnlyReason =
      "El módulo Servicios no está habilitado en la iglesia: por ahora no se pueden responder turnos ni pedir sustituciones.";
  } else if (moduleState === "unknown") {
    mode = "readonly";
    readOnlyReason = "No se pudo comprobar si puedes responder a este turno. Recarga la página para intentarlo de nuevo.";
  } else if (assignment.substitutesAssignmentId && assignment.status === "declined") {
    // Al rechazar, la propuesta de sustitución deja de estar activa: aceptarla después siempre se rechaza.
    mode = "readonly";
    readOnlyReason =
      "Rechazaste esta propuesta de sustitución y ya no está activa. Si ahora puedes, habla con quien coordina el puesto.";
  } else if (!open) {
    mode = "readonly";
    readOnlyReason =
      activity.status === "cancelled"
        ? "La actividad se canceló: ya no se pueden cambiar las respuestas."
        : `La actividad está «${activityStatus.label.toLowerCase()}» y no admite respuestas.`;
  } else if (pastDeadline) {
    mode = "readonly";
    readOnlyReason =
      activity.scheduleKind === "timed"
        ? "El plazo para responder terminó al empezar la actividad. Si algo cambia, habla con quien coordina el puesto."
        : "La ventana de la tarea ya terminó. Si algo cambia, habla con quien coordina el puesto.";
  } else {
    mode = assignment.status; // pending | accepted | declined
  }

  return (
    <>
      <Link href="/app/mis-turnos" className="mt-back-link">
        <ArrowLeft size={13} aria-hidden="true" /> Mis turnos
      </Link>

      <section className="mt-page-header">
        <div className="mt-title-row">
          <span className="mt-module-icon">
            <CalendarCheck size={18} aria-hidden="true" />
          </span>
          <div>
            <p className="mt-eyebrow">{assignment.positionName}</p>
            <h1 className={activity.status === "cancelled" ? "mt-is-cancelled" : undefined}>{activity.title}</h1>
          </div>
        </div>
        <div className="mt-badges">
          <span className={chipClass(status.tone)} title={status.description}>
            {status.label}
          </span>
          {activity.status === "cancelled" ? (
            <span className="serving-chip is-danger">
              <AlertTriangle size={11} aria-hidden="true" /> Actividad cancelada
            </span>
          ) : null}
        </div>
      </section>

      {needsReconfirmation(assignment) ? (
        <p className="mt-notice is-warning" role="status">
          <RefreshCw size={14} aria-hidden="true" />
          <span>
            <strong>La hora cambió: confirma de nuevo.</strong> Habías aceptado este turno, pero la actividad cambió de
            horario. Revisa la nueva hora y vuelve a responder.
          </span>
        </p>
      ) : null}

      <div className="mt-detail-grid">
        <section className="shell-card mt-panel" aria-labelledby="mt-datos-title">
          <h2 id="mt-datos-title" className="mt-panel-title">
            Datos del turno
          </h2>
          <dl className="mt-dl">
            <div>
              <dt>Puesto</dt>
              <dd>{assignment.positionName}</dd>
            </div>
            <div>
              <dt>Actividad</dt>
              <dd>
                {ACTIVITY_TYPE_INFO[activity.type].label} · {activityStatus.label}
              </dd>
            </div>
            <div>
              <dt>Fecha y hora</dt>
              <dd>
                <Clock size={12} aria-hidden="true" /> {schedule.text}
                {schedule.zone ? <span className="mt-tz">{schedule.zone}</span> : null}
              </dd>
            </div>
            <div>
              <dt>Lugar</dt>
              <dd>
                <MapPin size={12} aria-hidden="true" /> {activity.campusName ?? "Toda la iglesia"}
                {activity.locationText ? ` · ${activity.locationText}` : ""}
              </dd>
            </div>
            {mode === "pending" || mode === "declined" ? (
              <div>
                <dt>Plazo para responder</dt>
                <dd>{deadline ? `Hasta el ${deadline}` : "Sin límite"}</dd>
              </div>
            ) : null}
          </dl>
          <Link href={`/app/actividades/${activity.id}`} className="mt-inline-link">
            Ver la ficha de la actividad →
          </Link>
        </section>

        <section className="shell-card mt-panel" aria-labelledby="mt-respuesta-title">
          <h2 id="mt-respuesta-title" className="mt-panel-title">
            Tu respuesta
          </h2>
          {assignment.openSubstitutionRequestId && assignment.status === "accepted" ? (
            <p className="mt-notice is-muted">
              <span>
                <strong>{SUBSTITUTION_STATUS_LABELS.open}.</strong> Sigues en el turno hasta que otra persona lo acepte.
              </span>
            </p>
          ) : null}
          <TurnoRespuesta
            assignmentId={assignment.id}
            version={assignment.version}
            mode={mode}
            readOnlyReason={readOnlyReason}
            note={assignment.note}
            positionName={assignment.positionName}
            hasOpenSubstitution={Boolean(assignment.openSubstitutionRequestId)}
            ownSubstitutionRequestId={assignment.openSubstitutionRequestedBySelf ? assignment.openSubstitutionRequestId : null}
          />
        </section>
      </div>
    </>
  );
}
