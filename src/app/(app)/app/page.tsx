import Link from "next/link";
import {
  Users,
  CalendarDays,
  CalendarCheck,
  UsersRound,
  UserX,
  CalendarRange,
  FilePen,
  TriangleAlert,
  ListTodo,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ModuleGrid from "@/components/shell/ModuleGrid";
import StatCard from "@/components/shell/StatCard";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { getActivitiesDashboard, type ActivitiesDashboard } from "@/server/activities/activities-dashboard-service";
import type { ActivitySummary } from "@/server/activities/activities-service";
import {
  countMyPendingAssignments,
  getStaffingSummaries,
  type StaffingSummary,
} from "@/server/assignments/assignments-service";
import { ACTIVITY_STATUS_INFO, ACTIVITY_TYPE_INFO } from "@/lib/activities/constants";
import { formatDateLong, formatTime, localDateKey } from "@/lib/activities/time";
import { keyParts, monthShortLabel, weekdayShortLabel } from "./calendario/calendar-utils";
import { staffingCountsText, uncoveredText } from "./actividades/_components/ActivitiesTable";
import "./dashboard-actividades.css";
import "./mis-turnos/mis-turnos.css";

export default async function InicioPage() {
  const tenant = await requireTenantContext();
  const supabase = await createSupabaseServerClient();

  const [
    { count: peopleCount },
    { count: householdsCount },
    { data: peopleWithoutAccount },
    { data: enabledModules },
    activities,
    myPendingCount,
  ] = await Promise.all([
    supabase
      .from("church_people")
      .select("id", { count: "exact", head: true })
      .eq("church_id", tenant.churchId)
      .is("archived_at", null),
    supabase
      .from("households")
      .select("id", { count: "exact", head: true })
      .eq("church_id", tenant.churchId)
      .is("archived_at", null),
    // Personas sin cuenta: requiere el join a people porque user_id vive
    // ahí, no en church_people. Se cuenta en aplicación, no via count()
    // directo, porque el filtro atraviesa la relación.
    supabase
      .from("church_people")
      .select("people!church_people_person_id_fkey!inner(user_id)")
      .eq("church_id", tenant.churchId)
      .is("archived_at", null),
    supabase
      .from("church_modules")
      .select("module_key")
      .eq("church_id", tenant.churchId)
      .in("status", ["enabled", "trial"]),
    // Resumen real de actividades (Fase 4). Si la RPC falla se muestra un
    // aviso y "—", nunca ceros que parecerían datos reales.
    getActivitiesDashboard(tenant.churchId).catch((): ActivitiesDashboard | null => null),
    // Mis turnos (Fase 5). null = no se pudo contar: se muestra "—".
    tenant.personId
      ? countMyPendingAssignments(tenant.churchId).catch((): number | null => null)
      : Promise.resolve(null),
  ]);

  // Cobertura de personas de las actividades listadas. Si falla, "—".
  const listedIds = [...(activities?.nextActivities ?? []), ...(activities?.nextServices ?? [])].map((a) => a.id);
  const staffing = activities
    ? await getStaffingSummaries([...new Set(listedIds)]).catch((): Map<string, StaffingSummary> | null => null)
    : null;

  const peopleWithoutAccountCount = (peopleWithoutAccount ?? []).filter((row) => {
    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    return !person?.user_id;
  }).length;

  const enabledModuleKeys = new Set((enabledModules ?? []).map((m) => m.module_key as string));
  const statValue = (value: number | undefined) => (activities ? String(value ?? 0) : "—");

  return (
    <>
      <section>
        <h1 style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: 28, fontWeight: 600 }}>
          ¡Bienvenido a {tenant.churchName}!
        </h1>
        <p style={{ color: "var(--shell-text-muted)", marginTop: 4, fontSize: 14 }}>
          Aquí tienes un resumen de la actividad de tu iglesia.
        </p>
      </section>

      <div className="stat-grid">
        <StatCard
          icon={Users}
          value={String(peopleCount ?? 0)}
          label="Personas"
          accentBg="var(--mod-people-bg)"
          accentFg="var(--mod-people-fg)"
        />
        <DashboardStat
          href="/app/calendario?vista=lista"
          icon={CalendarDays}
          value={statValue(activities?.upcoming)}
          label="Próximas actividades"
          hint="próximos 60 días"
        />
        <StatCard
          icon={UsersRound}
          value={String(householdsCount ?? 0)}
          label="Familias"
          accentBg="var(--mod-families-bg)"
          accentFg="var(--mod-families-fg)"
        />
        <StatCard
          icon={UserX}
          value={String(peopleWithoutAccountCount)}
          label="Personas sin cuenta"
          accentBg="var(--mod-analytics-bg)"
          accentFg="var(--mod-analytics-fg)"
        />
      </div>

      {tenant.personId ? (
        <section className="shell-card mt-dash-card" aria-labelledby="mt-dash-title">
          <span className="mt-module-icon">
            <CalendarCheck size={18} aria-hidden="true" />
          </span>
          <div className="mt-dash-card-main">
            <h2 id="mt-dash-title" className="stat-label">
              Mis turnos pendientes
            </h2>
            <p className="mt-dash-card-value">{myPendingCount === null ? "—" : String(myPendingCount)}</p>
            <p className="serving-meta">
              {myPendingCount === null
                ? "No se pudieron contar tus turnos. Vuelve a intentarlo en unos minutos."
                : myPendingCount === 0
                  ? "No tienes turnos esperando tu respuesta."
                  : myPendingCount === 1
                    ? "Un turno espera tu respuesta."
                    : `${myPendingCount} turnos esperan tu respuesta.`}
            </p>
          </div>
          <Link href="/app/mis-turnos">Ver mis turnos →</Link>
        </section>
      ) : null}

      <section className="dash-section" aria-labelledby="dash-actividades-title">
        <div className="dash-section-header">
          <h2 id="dash-actividades-title">Actividades</h2>
          <Link href="/app/calendario">Abrir calendario →</Link>
        </div>
        {activities ? null : (
          <p className="dash-alert" role="alert">
            No se pudo cargar el resumen de actividades. Vuelve a intentarlo en unos minutos.
          </p>
        )}
        <div className="stat-grid">
          <DashboardStat
            href="/app/calendario?vista=semana"
            icon={CalendarRange}
            value={statValue(activities?.thisWeek)}
            label="Actividades esta semana"
          />
          <DashboardStat
            href="/app/actividades?estado=draft"
            icon={FilePen}
            value={statValue(activities?.drafts)}
            label="Borradores"
          />
          <DashboardStat
            href="/app/actividades"
            icon={TriangleAlert}
            value={statValue(activities?.incompleteStructure)}
            label="Sin estructura completa"
            hint="próximos 60 días"
          />
          <DashboardStat
            href="/app/actividades?tipo=task"
            icon={ListTodo}
            value={statValue(activities?.flexibleOpenTasks)}
            label="Tareas sin hora fija abiertas"
          />
        </div>
      </section>

      <ModuleGrid enabledModuleKeys={enabledModuleKeys} />

      <div className="shell-two-col">
        <ActivityListCard
          title="Próximas actividades"
          items={activities?.nextActivities ?? []}
          failed={!activities}
          staffing={staffing}
          emptyTitle="No hay actividades próximas"
          emptyText="Cuando planifiques o publiques una actividad, aparecerá aquí."
          moreHref="/app/calendario?vista=lista"
        />
        <ActivityListCard
          title="Próximos cultos"
          items={activities?.nextServices ?? []}
          failed={!activities}
          staffing={staffing}
          emptyTitle="No hay cultos próximos"
          emptyText="Los cultos programados, incluidos los borradores, aparecerán aquí."
          moreHref="/app/calendario?vista=lista&tipo=service"
        />
      </div>

      <div className="shell-card list-card">
        <div className="list-card-header">
          <h2>Actividad reciente</h2>
        </div>
        <div className="shell-empty-state" style={{ padding: "32px 12px" }}>
          <h3>Sin actividad todavía</h3>
          <p>Los cambios relevantes de tu iglesia aparecerán aquí.</p>
        </div>
      </div>
    </>
  );
}

function DashboardStat({
  href,
  icon,
  value,
  label,
  hint,
}: {
  href: string;
  icon: LucideIcon;
  value: string;
  label: string;
  hint?: string;
}) {
  return (
    <Link href={href} className="dash-stat-link" aria-label={`${label}: ${value}${hint ? ` (${hint})` : ""}`}>
      <StatCard icon={icon} value={value} label={label} accentBg="var(--mod-events-bg)" accentFg="var(--mod-events-fg)" />
      {hint ? (
        <span className="dash-stat-hint" aria-hidden="true">
          {hint}
        </span>
      ) : null}
    </Link>
  );
}

function ActivityListCard({
  title,
  items,
  failed,
  emptyTitle,
  emptyText,
  moreHref,
  staffing,
}: {
  title: string;
  items: ActivitySummary[];
  failed: boolean;
  /** Cobertura de personas; null si no se pudo calcular. */
  staffing: Map<string, StaffingSummary> | null;
  emptyTitle: string;
  emptyText: string;
  moreHref: string;
}) {
  return (
    <div className="shell-card list-card">
      <div className="list-card-header">
        <h2>{title}</h2>
        {items.length > 0 ? <Link href={moreHref}>Ver todo →</Link> : null}
      </div>
      {failed ? (
        <div className="shell-empty-state" style={{ padding: "32px 12px" }}>
          <h3>No disponible</h3>
          <p>No se pudieron cargar las actividades.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="shell-empty-state" style={{ padding: "32px 12px" }}>
          <h3>{emptyTitle}</h3>
          <p>{emptyText}</p>
        </div>
      ) : (
        <ul className="dash-activity-list">
          {items.map((activity) => (
            <DashboardActivityRow
              key={activity.id}
              activity={activity}
              staffing={staffing ? staffing.get(activity.id) : null}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** null = no se pudo calcular («—»); undefined = sin datos visibles para esta actividad. */
function StaffingLine({ summary }: { summary: StaffingSummary | null | undefined }) {
  if (summary === null || summary === undefined) {
    return (
      <span className="mt-staffing">
        Personas: —
        {summary === null ? <span className="sr-only"> (no se pudo calcular la cobertura)</span> : null}
      </span>
    );
  }
  if (summary.positions === 0) return null;
  return (
    <span className="mt-staffing">
      Personas: {staffingCountsText(summary)}
      {summary.uncoveredPositions > 0 ? (
        <>
          {" · "}
          <span className="mt-staffing-alert">{uncoveredText(summary.uncoveredPositions)}</span>
        </>
      ) : null}
    </span>
  );
}

function DashboardActivityRow({
  activity,
  staffing,
}: {
  activity: ActivitySummary;
  staffing: StaffingSummary | null | undefined;
}) {
  const tz = activity.timezone;
  const dayKey = activity.startsAt ? localDateKey(activity.startsAt, tz) : null;
  const status = ACTIVITY_STATUS_INFO[activity.status];
  const time = activity.startsAt
    ? `${formatTime(activity.startsAt, tz)}${activity.endsAt ? `–${formatTime(activity.endsAt, tz)}` : ""}`
    : "Sin hora fija";

  return (
    <li className="dash-activity">
      {dayKey && activity.startsAt ? (
        <span className="dash-date">
          <span className="sr-only">{formatDateLong(activity.startsAt, tz)}</span>
          <span className="dash-date-weekday" aria-hidden="true">
            {weekdayShortLabel(dayKey)}
          </span>
          <span className="dash-date-day" aria-hidden="true">
            {keyParts(dayKey).day}
          </span>
          <span className="dash-date-month" aria-hidden="true">
            {monthShortLabel(dayKey)}
          </span>
        </span>
      ) : null}
      <div className="dash-activity-main">
        <Link
          href={`/app/actividades/${activity.id}`}
          className={`dash-activity-title${activity.status === "cancelled" ? " dash-is-cancelled" : ""}`}
        >
          {activity.title}
        </Link>
        <span className="dash-activity-meta">
          {time} · {ACTIVITY_TYPE_INFO[activity.type].label}
          {activity.campusName ? ` · ${activity.campusName}` : ""}
        </span>
        <StaffingLine summary={staffing} />
      </div>
      <span className={`dash-status dash-tone-${status.tone}`}>{status.label}</span>
    </li>
  );
}
