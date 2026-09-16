"use client";

import Link from "next/link";
import { CalendarClock, Copy, LayoutTemplate, MapPin, Repeat } from "lucide-react";
import { ACTIVITY_TYPE_INFO } from "@/lib/activities/constants";
import { formatActivityRange, formatDateLong, timeZoneAbbreviation } from "@/lib/activities/time";
import type { ActivityCapabilities, ActivityDetail } from "@/server/activities/activities-service";
import StatusChip from "../../_components/StatusChip";
import { describeSeries } from "../../_components/describe";
import StatusActions from "./StatusActions";
import DuplicateForm from "./DuplicateForm";

type Props = {
  activity: ActivityDetail;
  capabilities: ActivityCapabilities;
  blockingIssues: number;
  onShowIssues: () => void;
};

export function scheduleSummary(activity: ActivityDetail): string {
  if (activity.scheduleKind === "flexible") {
    const tz = activity.timezone;
    const parts = ["Sin hora fija"];
    if (activity.startsAt) parts.push(`desde ${formatDateLong(activity.startsAt, tz)}`);
    if (activity.endsAt) parts.push(`hasta ${formatDateLong(activity.endsAt, tz)}`);
    return parts.join(" · ");
  }
  return formatActivityRange(activity.startsAt, activity.endsAt, activity.timezone);
}

export default function FichaHeader({ activity, capabilities, blockingIssues, onShowIssues }: Props) {
  return (
    <section className="shell-card act-ficha-header">
      <Link href="/app/actividades" className="act-back-link">
        ← Actividades
      </Link>

      <div className="act-page-header">
        <div className="act-title-row" style={{ alignItems: "flex-start" }}>
          <span className="act-module-icon">
            <CalendarClock size={18} aria-hidden="true" />
          </span>
          <div>
            <h1>{activity.title}</h1>
            <div className="act-badges" style={{ marginTop: 6 }}>
              <StatusChip status={activity.status} />
              <span className="serving-chip is-muted">{ACTIVITY_TYPE_INFO[activity.type].label}</span>
              {activity.seriesId ? (
                activity.seriesModified ? (
                  <span className="serving-chip is-warning" title="Esta ocurrencia se editó individualmente">
                    <Repeat size={11} aria-hidden="true" /> Excepción de la serie
                  </span>
                ) : (
                  <span className="serving-chip is-muted">
                    <Repeat size={11} aria-hidden="true" /> Serie
                  </span>
                )
              ) : null}
              {activity.duplicatedFromActivityId ? (
                <Link href={`/app/actividades/${activity.duplicatedFromActivityId}`} className="serving-chip is-muted">
                  <Copy size={11} aria-hidden="true" /> Duplicada
                </Link>
              ) : null}
              {activity.templateName ? (
                <span className="serving-chip is-muted">
                  <LayoutTemplate size={11} aria-hidden="true" /> {activity.templateName}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="act-meta-line">
        <span>
          <CalendarClock size={13} aria-hidden="true" />
          {scheduleSummary(activity)}
          {activity.scheduleKind === "timed" && activity.startsAt ? (
            <span className="act-tz">
              {timeZoneAbbreviation(activity.startsAt, activity.timezone)} ({activity.timezone})
            </span>
          ) : null}
        </span>
        <span>{activity.campusName ?? "Toda la iglesia"}</span>
        {activity.locationText ? (
          <span>
            <MapPin size={13} aria-hidden="true" />
            {activity.locationText}
          </span>
        ) : null}
        {activity.series ? (
          <span>
            <Repeat size={13} aria-hidden="true" />
            {describeSeries(activity.series)}
          </span>
        ) : null}
      </div>

      <StatusActions
        activity={activity}
        capabilities={capabilities}
        blockingIssues={blockingIssues}
        onShowIssues={onShowIssues}
      />

      {capabilities.duplicate ? <DuplicateForm activity={activity} /> : null}
    </section>
  );
}
