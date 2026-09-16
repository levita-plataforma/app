import Link from "next/link";
import { AlertTriangle, Repeat } from "lucide-react";
import { ACTIVITY_TYPE_INFO } from "@/lib/activities/constants";
import { formatActivityRange, formatDateShort, timeZoneAbbreviation } from "@/lib/activities/time";
import type { ActivitySummary } from "@/server/activities/activities-service";
import StatusChip from "./StatusChip";

type StructureStatus = Map<string, { blocking: number; warnings: number }>;

export function ScheduleText({ activity }: { activity: ActivitySummary }) {
  if (activity.scheduleKind === "flexible") {
    const tz = activity.timezone;
    if (!activity.startsAt && !activity.endsAt) return <>Sin hora fija</>;
    return (
      <>
        Sin hora fija ·{" "}
        {activity.startsAt ? `desde ${formatDateShort(activity.startsAt, tz)}` : ""}
        {activity.startsAt && activity.endsAt ? " " : ""}
        {activity.endsAt ? `hasta ${formatDateShort(activity.endsAt, tz)}` : ""}
      </>
    );
  }
  return (
    <>
      {formatActivityRange(activity.startsAt, activity.endsAt, activity.timezone)}
      {activity.startsAt ? (
        <span className="act-tz">{timeZoneAbbreviation(activity.startsAt, activity.timezone)}</span>
      ) : null}
    </>
  );
}

export function SeriesBadge({ activity }: { activity: Pick<ActivitySummary, "seriesId" | "seriesModified"> }) {
  if (!activity.seriesId) return null;
  return activity.seriesModified ? (
    <span className="serving-chip is-warning" title="Ocurrencia editada individualmente">
      <Repeat size={11} aria-hidden="true" /> Excepción
    </span>
  ) : (
    <span className="serving-chip is-muted" title="Forma parte de una serie">
      <Repeat size={11} aria-hidden="true" /> Serie
    </span>
  );
}

function StructureBadge({ status }: { status: { blocking: number; warnings: number } | undefined }) {
  if (!status) return <span className="serving-meta">—</span>;
  if (status.blocking > 0) {
    return (
      <span className="serving-chip is-danger">
        <AlertTriangle size={11} aria-hidden="true" /> Estructura incompleta
      </span>
    );
  }
  if (status.warnings > 0) {
    return <span className="serving-chip is-warning">{status.warnings} aviso{status.warnings === 1 ? "" : "s"}</span>;
  }
  return <span className="serving-chip is-success">OK</span>;
}

export default function ActivitiesTable({
  activities,
  structure,
  caption,
}: {
  activities: ActivitySummary[];
  structure: StructureStatus;
  caption: string;
}) {
  return (
    <table className="serving-table">
      <caption className="act-sr-only">
        {caption}
      </caption>
      <thead>
        <tr>
          <th scope="col">Actividad</th>
          <th scope="col">Fecha y hora</th>
          <th scope="col">Sede</th>
          <th scope="col">Estado</th>
          <th scope="col">Estructura</th>
        </tr>
      </thead>
      <tbody>
        {activities.map((a) => (
          <tr key={a.id}>
            <td data-label="">
              <Link href={`/app/actividades/${a.id}`} className="act-row-link">
                {a.title}
              </Link>
              <div className="act-badges" style={{ marginTop: 4 }}>
                <span className="serving-meta">{ACTIVITY_TYPE_INFO[a.type].label}</span>
                <SeriesBadge activity={a} />
              </div>
            </td>
            <td data-label="Fecha y hora">
              <ScheduleText activity={a} />
            </td>
            <td data-label="Sede">{a.campusName ?? "Toda la iglesia"}</td>
            <td data-label="Estado">
              <StatusChip status={a.status} />
            </td>
            <td data-label="Estructura">
              <StructureBadge status={structure.get(a.id)} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
