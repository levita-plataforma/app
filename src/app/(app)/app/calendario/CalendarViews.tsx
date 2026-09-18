import Link from "next/link";
import { ACTIVITY_STATUS_INFO, ACTIVITY_TYPE_INFO, WEEKDAY_LABELS } from "@/lib/activities/constants";
import { formatActivityRange, formatDateShort, formatTime, localDateKey } from "@/lib/activities/time";
import type { ActivitySummary } from "@/server/activities/activities-service";
import { formatKeyDayMonth, formatKeyLong, keyParts, weekdayShortLabel } from "./calendar-utils";

/**
 * Vistas del calendario operativo. Componentes de servidor sin estado: la
 * navegación y los filtros son enlaces/formularios GET, así que funcionan con
 * teclado y sin JavaScript.
 */

const MAX_PILLS_PER_DAY = 3;

export function activityHref(activity: ActivitySummary): string {
  return `/app/actividades/${activity.id}`;
}

function toneClass(activity: ActivitySummary): string {
  return `cal-tone-${ACTIVITY_STATUS_INFO[activity.status].tone}`;
}

export function StatusChip({ activity }: { activity: ActivitySummary }) {
  const info = ACTIVITY_STATUS_INFO[activity.status];
  const toneToChip: Record<string, string> = {
    success: " is-success",
    warning: " is-warning",
    danger: " is-danger",
    muted: " is-muted",
    default: "",
  };
  return <span className={`serving-chip${toneToChip[info.tone]}`}>{info.label}</span>;
}

/** Hora que se muestra para la actividad en un día concreto (en su zona). */
function timeForDay(activity: ActivitySummary, dayKey: string): string {
  if (!activity.startsAt) return "";
  const startKey = localDateKey(activity.startsAt, activity.timezone);
  if (startKey === dayKey) return formatTime(activity.startsAt, activity.timezone);
  return "cont.";
}

/** Rango horario compacto para un día concreto. */
function timeRangeForDay(activity: ActivitySummary, dayKey: string): string {
  if (!activity.startsAt) return "";
  const tz = activity.timezone;
  const startKey = localDateKey(activity.startsAt, tz);
  const endKey = activity.endsAt ? localDateKey(activity.endsAt, tz) : startKey;
  if (startKey === endKey) {
    return activity.endsAt
      ? `${formatTime(activity.startsAt, tz)}–${formatTime(activity.endsAt, tz)}`
      : formatTime(activity.startsAt, tz);
  }
  if (dayKey === startKey) return `Desde ${formatTime(activity.startsAt, tz)}`;
  if (activity.endsAt && dayKey === endKey) return `Hasta ${formatTime(activity.endsAt, tz)}`;
  return "Todo el día";
}

function ariaLabelFor(activity: ActivitySummary): string {
  return [
    activity.title,
    ACTIVITY_TYPE_INFO[activity.type].label,
    ACTIVITY_STATUS_INFO[activity.status].label,
    formatActivityRange(activity.startsAt, activity.endsAt, activity.timezone),
    eventRegistrationLabel(activity),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Etiqueta corta de inscripción para eventos con `eventRegistration`
 * habilitado (Fase 6, campo opcional y aditivo de ActivitySummary). Para
 * cualquier otra actividad devuelve null y no se renderiza nada distinto.
 */
function eventRegistrationLabel(activity: ActivitySummary): string | null {
  const reg = activity.eventRegistration;
  if (!reg || !reg.enabled) return null;
  if (reg.capacity !== null) return `${reg.confirmedCount}/${reg.capacity} plazas`;
  return "Inscripción abierta";
}

function EventRegistrationBadge({ activity }: { activity: ActivitySummary }) {
  const label = eventRegistrationLabel(activity);
  if (!label) return null;
  const isFull = activity.eventRegistration?.capacity !== null && activity.eventRegistration
    ? activity.eventRegistration.confirmedCount >= (activity.eventRegistration.capacity ?? Infinity)
    : false;
  return <span className={`cal-event-reg-badge${isFull ? " is-full" : ""}`}>{label}</span>;
}

// ---------------------------------------------------------------------------
// Mes
// ---------------------------------------------------------------------------

type MonthViewProps = {
  gridKeys: string[];
  month: number;
  todayKey: string;
  byDay: Map<string, ActivitySummary[]>;
  dayHref: (key: string) => string;
};

export function MonthView({ gridKeys, month, todayKey, byDay, dayHref }: MonthViewProps) {
  const weeks = Array.from({ length: 6 }, (_, i) => gridKeys.slice(i * 7, i * 7 + 7));
  const inMonthWithActivities = gridKeys.filter((key) => keyParts(key).month === month && byDay.has(key));

  return (
    <>
      <div className="shell-card cal-month" role="table" aria-label="Calendario mensual">
        <div className="cal-month-head" role="row">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <div key={d} role="columnheader" className="cal-month-weekday">
              <abbr title={WEEKDAY_LABELS[d].long}>{WEEKDAY_LABELS[d].short}</abbr>
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} className="cal-month-row" role="row">
            {week.map((key) => {
              const items = byDay.get(key) ?? [];
              const outside = keyParts(key).month !== month;
              const isToday = key === todayKey;
              const hidden = items.length - MAX_PILLS_PER_DAY;
              return (
                <div
                  key={key}
                  role="cell"
                  className={`cal-day${outside ? " is-outside" : ""}${isToday ? " is-today" : ""}`}
                >
                  <Link
                    href={dayHref(key)}
                    className="cal-day-number"
                    aria-label={`${formatKeyLong(key)}${isToday ? " (hoy)" : ""}: ${items.length} actividad${items.length === 1 ? "" : "es"}. Ver semana`}
                    aria-current={isToday ? "date" : undefined}
                  >
                    {keyParts(key).day}
                  </Link>
                  <ul className="cal-pills">
                    {items.slice(0, MAX_PILLS_PER_DAY).map((activity) => (
                      <li key={activity.id}>
                        <Link
                          href={activityHref(activity)}
                          className={`cal-pill ${toneClass(activity)}${activity.status === "cancelled" ? " is-cancelled" : ""}`}
                          aria-label={ariaLabelFor(activity)}
                          title={ariaLabelFor(activity)}
                        >
                          <span className="cal-pill-time">{timeForDay(activity, key)}</span>
                          <span className="cal-pill-title">{activity.title}</span>
                          <EventRegistrationBadge activity={activity} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {hidden > 0 ? (
                    <Link href={dayHref(key)} className="cal-more">
                      +{hidden} más
                    </Link>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* En móvil la rejilla se sustituye por una agenda del mes. */}
      <div className="cal-month-agenda">
        {inMonthWithActivities.length === 0 ? (
          <div className="shell-card shell-empty-state">
            <h3>No hay actividades este mes</h3>
            <p>Prueba otro mes o revisa los filtros.</p>
          </div>
        ) : (
          <AgendaDays keys={inMonthWithActivities} byDay={byDay} todayKey={todayKey} />
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Semana
// ---------------------------------------------------------------------------

type WeekViewProps = { weekKeys: string[]; todayKey: string; byDay: Map<string, ActivitySummary[]> };

export function WeekView({ weekKeys, todayKey, byDay }: WeekViewProps) {
  return (
    <div className="cal-week">
      {weekKeys.map((key) => {
        const items = byDay.get(key) ?? [];
        const isToday = key === todayKey;
        return (
          <section
            key={key}
            id={`dia-${key}`}
            className={`shell-card cal-week-day${isToday ? " is-today" : ""}`}
            aria-labelledby={`cal-week-${key}`}
          >
            <h2 id={`cal-week-${key}`} className="cal-week-heading">
              <span className="cal-week-weekday">{weekdayShortLabel(key)}</span>
              <span className="cal-week-date">{formatKeyDayMonth(key)}</span>
              {isToday ? <span className="cal-today-badge">Hoy</span> : null}
            </h2>
            {items.length === 0 ? (
              <p className="cal-week-empty">Sin actividades</p>
            ) : (
              <ul className="cal-week-list">
                {items.map((activity) => (
                  <li key={activity.id}>
                    <Link
                      href={activityHref(activity)}
                      className={`cal-week-item ${toneClass(activity)}${activity.status === "cancelled" ? " is-cancelled" : ""}`}
                      aria-label={ariaLabelFor(activity)}
                    >
                      <span className="cal-week-time">{timeRangeForDay(activity, key)}</span>
                      <span className="cal-week-title">{activity.title}</span>
                      <span className="cal-week-meta">
                        {ACTIVITY_TYPE_INFO[activity.type].label}
                        {activity.campusName ? ` · ${activity.campusName}` : ""}
                      </span>
                      <EventRegistrationBadge activity={activity} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lista / agenda
// ---------------------------------------------------------------------------

type AgendaDaysProps = { keys: string[]; byDay: Map<string, ActivitySummary[]>; todayKey: string };

export function AgendaDays({ keys, byDay, todayKey }: AgendaDaysProps) {
  return (
    <div className="cal-agenda">
      {keys.map((key) => {
        const items = byDay.get(key) ?? [];
        if (items.length === 0) return null;
        return (
          <section key={key} className="shell-card cal-agenda-day" aria-labelledby={`cal-agenda-${key}`}>
            <h2 id={`cal-agenda-${key}`} className="cal-agenda-heading">
              {formatKeyLong(key)}
              {key === todayKey ? <span className="cal-today-badge">Hoy</span> : null}
            </h2>
            <ul className="cal-agenda-list">
              {items.map((activity) => (
                <li key={activity.id} className={`cal-agenda-row ${toneClass(activity)}`}>
                  <span className="cal-agenda-time">{timeRangeForDay(activity, key)}</span>
                  <div className="cal-agenda-main">
                    <Link
                      href={activityHref(activity)}
                      className={`cal-agenda-title${activity.status === "cancelled" ? " is-cancelled" : ""}`}
                    >
                      {activity.title}
                    </Link>
                    <span className="cal-agenda-meta">
                      {ACTIVITY_TYPE_INFO[activity.type].label}
                      {activity.campusName ? ` · ${activity.campusName}` : ""}
                      {activity.locationText ? ` · ${activity.locationText}` : ""}
                    </span>
                    <EventRegistrationBadge activity={activity} />
                  </div>
                  <StatusChip activity={activity} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tareas sin hora fija
// ---------------------------------------------------------------------------

function taskWindow(task: ActivitySummary): string {
  const tz = task.timezone;
  if (task.startsAt && task.endsAt) return `Del ${formatDateShort(task.startsAt, tz)} al ${formatDateShort(task.endsAt, tz)}`;
  if (task.endsAt) return `Hasta el ${formatDateShort(task.endsAt, tz)}`;
  if (task.startsAt) return `Desde el ${formatDateShort(task.startsAt, tz)}`;
  return "Sin ventana de fechas";
}

export function FlexibleTasksCard({ tasks, hiddenByTypeFilter }: { tasks: ActivitySummary[]; hiddenByTypeFilter: boolean }) {
  return (
    <aside className="shell-card list-card cal-flexible" aria-labelledby="cal-flexible-title">
      <div className="list-card-header">
        <h2 id="cal-flexible-title">Tareas sin hora fija</h2>
      </div>
      {hiddenByTypeFilter ? (
        <p className="cal-muted">El filtro de tipo actual excluye las tareas.</p>
      ) : tasks.length === 0 ? (
        <p className="cal-muted">No hay tareas sin hora fija en este periodo.</p>
      ) : (
        <ul className="cal-flexible-list">
          {tasks.map((task) => (
            <li key={task.id} className="cal-flexible-item">
              <div className="cal-agenda-main">
                <Link
                  href={activityHref(task)}
                  className={`cal-agenda-title${task.status === "cancelled" ? " is-cancelled" : ""}`}
                >
                  {task.title}
                </Link>
                <span className="cal-agenda-meta">
                  {taskWindow(task)}
                  {task.campusName ? ` · ${task.campusName}` : ""}
                </span>
              </div>
              <StatusChip activity={task} />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
