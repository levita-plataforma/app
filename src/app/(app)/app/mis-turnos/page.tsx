import Link from "next/link";
import { AlertTriangle, CalendarCheck, Clock, MapPin, RefreshCw } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import {
  countMyPendingAssignments,
  listMyAssignments,
  type MyAssignment,
} from "@/server/assignments/assignments-service";
import { ACTIVITY_TYPE_INFO } from "@/lib/activities/constants";
import { ASSIGNMENT_STATUS_INFO, SUBSTITUTION_STATUS_LABELS } from "@/lib/assignments/constants";
import { formatDateLong, localDateKey } from "@/lib/activities/time";
import { chipClass } from "../actividades/_components/describe";
import { keyParts, monthShortLabel, weekdayShortLabel } from "../calendario/calendar-utils";
import { isActivityOpenForResponses, isPastDeadline, needsReconfirmation, turnoScheduleText } from "./_lib/turno";
import "./mis-turnos.css";

type SearchParams = { ver?: string };

function currentTimeMs(): number {
  return Date.now();
}

export default async function MisTurnosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const tenant = await requireTenantContext();
  const scope = params.ver === "anteriores" ? "past" : "upcoming";

  const hasPerson = Boolean(tenant.personId);
  const [items, pendingCount] = hasPerson
    ? await Promise.all([
        listMyAssignments(tenant.churchId, tenant.personId, { scope }),
        countMyPendingAssignments(tenant.churchId),
      ])
    : [[] as MyAssignment[], 0];

  return (
    <>
      <section className="mt-page-header">
        <div className="mt-title-row">
          <span className="mt-module-icon">
            <CalendarCheck size={18} aria-hidden="true" />
          </span>
          <div>
            <h1>Mis turnos</h1>
            <p className="mt-subtitle">Los puestos en los que te han pedido servir en {tenant.churchName}.</p>
          </div>
        </div>
      </section>

      {hasPerson && pendingCount > 0 ? (
        <p className="mt-pending-banner" role="status">
          <strong>{pendingCount}</strong>{" "}
          {pendingCount === 1
            ? "turno espera tu respuesta y aún estás a tiempo de responder"
            : "turnos esperan tu respuesta y aún estás a tiempo de responder"}
        </p>
      ) : null}

      <nav className="serving-tabs mt-tabs" aria-label="Periodo de los turnos">
        <Link href="/app/mis-turnos" className="mt-tab" aria-current={scope === "upcoming" ? "page" : undefined}>
          Próximos
        </Link>
        <Link
          href="/app/mis-turnos?ver=anteriores"
          className="mt-tab"
          aria-current={scope === "past" ? "page" : undefined}
        >
          Anteriores
        </Link>
      </nav>

      {!hasPerson ? (
        <div className="shell-card shell-empty-state">
          <h3>Tu cuenta no está vinculada a una persona</h3>
          <p>Pide a la administración de la iglesia que vincule tu cuenta a tu ficha para ver tus turnos.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="shell-card shell-empty-state">
          <span className="mt-module-icon">
            <CalendarCheck size={18} aria-hidden="true" />
          </span>
          <h3>{scope === "upcoming" ? "No tienes turnos próximos" : "No tienes turnos anteriores"}</h3>
          <p>
            {scope === "upcoming"
              ? "Cuando alguien de coordinación te asigne a un puesto, lo verás aquí para responder."
              : "Aquí aparecerán los turnos de actividades que ya han pasado."}
          </p>
        </div>
      ) : (
        <ul className="mt-list">
          {items.map((assignment) => (
            <TurnoCard key={assignment.id} assignment={assignment} nowMs={currentTimeMs()} />
          ))}
        </ul>
      )}
    </>
  );
}

function TurnoCard({ assignment, nowMs }: { assignment: MyAssignment; nowMs: number }) {
  const { activity } = assignment;
  const tz = activity.timezone;
  const dateIso = activity.startsAt ?? activity.endsAt;
  const dayKey = dateIso ? localDateKey(dateIso, tz) : null;
  const status = ASSIGNMENT_STATUS_INFO[assignment.status];
  const schedule = turnoScheduleText(activity);
  const place = [activity.campusName, activity.locationText].filter(Boolean).join(" · ");
  const cancelled = activity.status === "cancelled";
  // Pendiente pero ya sin posibilidad de responder (plazo vencido o actividad cerrada): no cuenta como pendiente.
  const noLongerRespondable =
    assignment.status === "pending" && !cancelled && (!isActivityOpenForResponses(activity) || isPastDeadline(activity, nowMs));

  return (
    <li className="shell-card mt-card">
      {dayKey && dateIso ? (
        <span className="mt-date">
          <span className="sr-only">{formatDateLong(dateIso, tz)}</span>
          <span className="mt-date-small" aria-hidden="true">
            {weekdayShortLabel(dayKey)}
          </span>
          <span className="mt-date-day" aria-hidden="true">
            {keyParts(dayKey).day}
          </span>
          <span className="mt-date-small" aria-hidden="true">
            {monthShortLabel(dayKey)}
          </span>
        </span>
      ) : (
        <span className="mt-date" aria-hidden="true">
          <Clock size={16} />
        </span>
      )}
      <div className="mt-card-main">
        <h2 className="mt-card-title">
          <Link href={`/app/mis-turnos/${assignment.id}`} className={`mt-card-link${cancelled ? " mt-is-cancelled" : ""}`}>
            {activity.title}
          </Link>
        </h2>
        <p className="mt-card-position">{assignment.positionName}</p>
        <p className="mt-card-meta">
          {schedule.text}
          {schedule.zone ? <span className="mt-tz">{schedule.zone}</span> : null}
          {" · "}
          {ACTIVITY_TYPE_INFO[activity.type].label}
        </p>
        {place ? (
          <p className="mt-card-meta">
            <MapPin size={12} aria-hidden="true" /> {place}
          </p>
        ) : null}
        <div className="mt-badges">
          <span className={chipClass(status.tone)} title={status.description}>
            {status.label}
          </span>
          {cancelled ? (
            <span className="serving-chip is-danger">
              <AlertTriangle size={11} aria-hidden="true" /> Actividad cancelada
            </span>
          ) : null}
          {noLongerRespondable ? <span className="serving-chip is-muted">Ya no se puede responder</span> : null}
          {needsReconfirmation(assignment) && !noLongerRespondable ? (
            <span className="serving-chip is-warning">
              <RefreshCw size={11} aria-hidden="true" /> La hora cambió: confirma de nuevo
            </span>
          ) : null}
          {assignment.openSubstitutionRequestId ? (
            <span className="serving-chip is-muted">{SUBSTITUTION_STATUS_LABELS.open}</span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
