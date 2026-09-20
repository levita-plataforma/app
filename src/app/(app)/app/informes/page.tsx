import Link from "next/link";
import {
  Users,
  CalendarClock,
  Ticket,
  Users2,
  GraduationCap,
  Baby,
  MessageCircle,
  Download,
} from "lucide-react";
import StatCard from "@/components/shell/StatCard";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { getAnalyticsDashboard, type AnalyticsPeriod } from "@/server/analytics/analytics-service";
import { ensureAnalyticsModule } from "./module-gate";
import { secondaryButtonStyle, cardStyle, ANALYTICS_PERIODS_CLIENT, PERIOD_LABELS_CLIENT, formatDelta, formatNumber } from "./ui";

const VALID_PERIODS = new Set<string>(ANALYTICS_PERIODS_CLIENT);

export default async function InformesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const tenant = await requireTenantContext();
  const disabled = await ensureAnalyticsModule(tenant.churchId);
  if (disabled) return disabled;

  const { period: rawPeriod } = await searchParams;
  const period: AnalyticsPeriod = VALID_PERIODS.has(rawPeriod ?? "") ? (rawPeriod as AnalyticsPeriod) : "30d";

  const canRead = await hasCapability(tenant.churchId, "analytics.read");
  if (!canRead) {
    return (
      <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
        <h3>No tienes acceso a Informes</h3>
        <p>Pide a un administrador que te conceda la capacidad correspondiente.</p>
      </div>
    );
  }

  const [dashboard, canExport] = await Promise.all([
    getAnalyticsDashboard(tenant.churchId, { period }),
    hasCapability(tenant.churchId, "analytics.export"),
  ]);

  const noModulesAvailable =
    !dashboard.people &&
    !dashboard.serving &&
    !dashboard.events &&
    !dashboard.groups &&
    !dashboard.discipleship &&
    !dashboard.kids &&
    !dashboard.communications;

  return (
    <>
      <section
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Informes</h1>
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
            Vista consolidada de los módulos habilitados en tu iglesia.
          </p>
        </div>
        {canExport ? (
          <Link href={`/app/informes/export?period=${period}`} style={secondaryButtonStyle()}>
            <Download size={14} /> Exportar CSV
          </Link>
        ) : null}
      </section>

      <section style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ANALYTICS_PERIODS_CLIENT.map((p) => (
          <Link
            key={p}
            href={`/app/informes?period=${p}`}
            style={{
              ...secondaryButtonStyle(),
              ...(p === period ? { background: "var(--shell-brand)", color: "#fff", borderColor: "var(--shell-brand)" } : {}),
            }}
          >
            {PERIOD_LABELS_CLIENT[p]}
          </Link>
        ))}
      </section>

      {noModulesAvailable ? (
        <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
          <h3>Todavía no hay datos que mostrar</h3>
          <p>
            Informes muestra métricas de los módulos que tu iglesia tiene habilitados y para los que tienes permiso de
            lectura. Activa un módulo o pide acceso a un administrador.
          </p>
        </div>
      ) : null}

      {dashboard.people ? (
        <section className="shell-card" style={cardStyle}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Personas</h2>
          <div className="stat-grid">
            <StatCard
              icon={Users}
              value={formatNumber(dashboard.people.activePeople)}
              label="Personas activas"
              accentBg="var(--mod-people-bg, var(--mod-analytics-bg))"
              accentFg="var(--mod-people-fg, var(--mod-analytics-fg))"
            />
            <StatCard
              icon={Users}
              value={formatNumber(dashboard.people.newPeople.current)}
              label="Nuevas personas"
              delta={formatDelta(dashboard.people.newPeople.deltaPct)}
              accentBg="var(--mod-analytics-bg)"
              accentFg="var(--mod-analytics-fg)"
            />
          </div>
        </section>
      ) : null}

      {dashboard.serving ? (
        <section className="shell-card" style={cardStyle}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Servicio</h2>
          <div className="stat-grid">
            <StatCard
              icon={CalendarClock}
              value={formatNumber(dashboard.serving.activities.current)}
              label="Actividades"
              delta={formatDelta(dashboard.serving.activities.deltaPct)}
              accentBg="var(--mod-analytics-bg)"
              accentFg="var(--mod-analytics-fg)"
            />
            <StatCard
              icon={CalendarClock}
              value={formatNumber(dashboard.serving.assignmentsConfirmed)}
              label="Asignaciones confirmadas"
              accentBg="var(--mod-analytics-bg)"
              accentFg="var(--mod-analytics-fg)"
            />
            <StatCard
              icon={CalendarClock}
              value={formatNumber(dashboard.serving.assignmentsPending)}
              label="Asignaciones pendientes"
              accentBg="var(--mod-analytics-bg)"
              accentFg="var(--mod-analytics-fg)"
            />
          </div>
        </section>
      ) : null}

      {dashboard.events ? (
        <section className="shell-card" style={cardStyle}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Eventos</h2>
          <div className="stat-grid">
            <StatCard
              icon={Ticket}
              value={formatNumber(dashboard.events.eventsPublished.current)}
              label="Eventos publicados"
              delta={formatDelta(dashboard.events.eventsPublished.deltaPct)}
              accentBg="var(--mod-analytics-bg)"
              accentFg="var(--mod-analytics-fg)"
            />
            <StatCard
              icon={Ticket}
              value={formatNumber(dashboard.events.registrations.current)}
              label="Inscripciones"
              delta={formatDelta(dashboard.events.registrations.deltaPct)}
              accentBg="var(--mod-analytics-bg)"
              accentFg="var(--mod-analytics-fg)"
            />
            <StatCard
              icon={Ticket}
              value={formatNumber(dashboard.events.waitlisted)}
              label="En lista de espera"
              accentBg="var(--mod-analytics-bg)"
              accentFg="var(--mod-analytics-fg)"
            />
          </div>
        </section>
      ) : null}

      {dashboard.groups ? (
        <section className="shell-card" style={cardStyle}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Grupos</h2>
          <div className="stat-grid">
            <StatCard
              icon={Users2}
              value={formatNumber(dashboard.groups.activeGroups)}
              label="Grupos activos"
              accentBg="var(--mod-analytics-bg)"
              accentFg="var(--mod-analytics-fg)"
            />
            <StatCard
              icon={Users2}
              value={formatNumber(dashboard.groups.activeMembers)}
              label="Participantes activos"
              accentBg="var(--mod-analytics-bg)"
              accentFg="var(--mod-analytics-fg)"
            />
            <StatCard
              icon={Users2}
              value={formatNumber(dashboard.groups.pendingRequests)}
              label="Solicitudes pendientes"
              accentBg="var(--mod-analytics-bg)"
              accentFg="var(--mod-analytics-fg)"
            />
          </div>
        </section>
      ) : null}

      {dashboard.discipleship ? (
        <section className="shell-card" style={cardStyle}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Discipulado</h2>
          <div className="stat-grid">
            <StatCard
              icon={GraduationCap}
              value={formatNumber(dashboard.discipleship.activeCourses)}
              label="Cursos activos"
              accentBg="var(--mod-analytics-bg)"
              accentFg="var(--mod-analytics-fg)"
            />
            <StatCard
              icon={GraduationCap}
              value={formatNumber(dashboard.discipleship.enrolledPeople)}
              label="Personas inscritas"
              accentBg="var(--mod-analytics-bg)"
              accentFg="var(--mod-analytics-fg)"
            />
            <StatCard
              icon={GraduationCap}
              value={formatNumber(dashboard.discipleship.completionsLast90Days)}
              label="Finalizaciones (90 días)"
              accentBg="var(--mod-analytics-bg)"
              accentFg="var(--mod-analytics-fg)"
            />
          </div>
        </section>
      ) : null}

      {dashboard.kids ? (
        <section className="shell-card" style={cardStyle}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Niños</h2>
          <div className="stat-grid">
            <StatCard
              icon={Baby}
              value={formatNumber(dashboard.kids.checkins.current)}
              label="Check-ins"
              delta={formatDelta(dashboard.kids.checkins.deltaPct)}
              accentBg="var(--mod-analytics-bg)"
              accentFg="var(--mod-analytics-fg)"
            />
            <StatCard
              icon={Baby}
              value={formatNumber(dashboard.kids.activeProfiles)}
              label="Perfiles activos"
              accentBg="var(--mod-analytics-bg)"
              accentFg="var(--mod-analytics-fg)"
            />
            <StatCard
              icon={Baby}
              value={formatNumber(dashboard.kids.incidents)}
              label="Incidencias"
              accentBg="var(--mod-analytics-bg)"
              accentFg="var(--mod-analytics-fg)"
            />
          </div>
        </section>
      ) : null}

      {dashboard.communications ? (
        <section className="shell-card" style={cardStyle}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Comunicación</h2>
          <div className="stat-grid">
            <StatCard
              icon={MessageCircle}
              value={formatNumber(dashboard.communications.communicationsSent.current)}
              label="Comunicaciones enviadas"
              delta={formatDelta(dashboard.communications.communicationsSent.deltaPct)}
              accentBg="var(--mod-analytics-bg)"
              accentFg="var(--mod-analytics-fg)"
            />
            <StatCard
              icon={MessageCircle}
              value={formatNumber(dashboard.communications.optOuts)}
              label="Bajas por categoría"
              accentBg="var(--mod-analytics-bg)"
              accentFg="var(--mod-analytics-fg)"
            />
          </div>
        </section>
      ) : null}
    </>
  );
}
