import Link from "next/link";
import { BookOpen, GraduationCap, Users, Inbox, CheckCircle2, Route, Footprints } from "lucide-react";
import StatCard from "@/components/shell/StatCard";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { getDiscipleshipMetrics, listCohorts } from "@/server/discipleship/discipleship-service";
import { listLearningPaths } from "@/server/discipleship/learning-paths-service";
import { COHORT_STATUS_INFO, LEARNING_PATH_STATUS_INFO } from "@/lib/discipleship/constants";
import { ensureDiscipleshipModule } from "./module-gate";
import { ensureDiscipleshipRead } from "./access-gate";
import { CHIP_CLASS, cardStyle, formatDate, secondaryButtonStyle, sectionTitleStyle } from "./ui";

/** Panel de Discipulado: métricas y puertas a cursos e itinerarios. */
export default async function DiscipuladoPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureDiscipleshipModule(tenant.churchId);
  if (disabled) return disabled;

  // Sin ninguna de las dos capacidades de lectura no hay nada que enseñar aquí:
  // mejor decirlo que mostrar un panel de ceros.
  const denied = await ensureDiscipleshipRead(tenant.churchId, ["course.read", "path.read"], "Discipulado");
  if (denied) return denied;

  const [metrics, cohorts, paths] = await Promise.all([
    getDiscipleshipMetrics(tenant.churchId),
    listCohorts(tenant.churchId, { limit: 10 }).catch(() => []),
    listLearningPaths(tenant.churchId).catch(() => []),
  ]);

  const activeCohorts = cohorts.filter((cohort) => cohort.status === "open" || cohort.status === "running");

  return (
    <>
      <section
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Discipulado</h1>
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
            Forma y acompaña: cursos, cohortes, matrículas e itinerarios.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/app/discipulado/cursos" style={secondaryButtonStyle()}>
            <BookOpen size={14} /> Cursos
          </Link>
          <Link href="/app/discipulado/itinerarios" style={secondaryButtonStyle()}>
            <Route size={14} /> Itinerarios
          </Link>
        </div>
      </section>

      <div className="stat-grid">
        <StatCard
          icon={BookOpen}
          value={String(metrics.activeCourses)}
          label="Cursos activos"
          accentBg="var(--mod-discipleship-bg)"
          accentFg="var(--mod-discipleship-fg)"
        />
        <StatCard
          icon={GraduationCap}
          value={String(metrics.runningCohorts)}
          label="Cohortes en marcha"
          accentBg="var(--mod-discipleship-bg)"
          accentFg="var(--mod-discipleship-fg)"
        />
        <StatCard
          icon={Users}
          value={String(metrics.enrolledPeople)}
          label="Personas matriculadas"
          accentBg="var(--mod-people-bg)"
          accentFg="var(--mod-people-fg)"
        />
        <StatCard
          icon={Inbox}
          value={String(metrics.pendingEnrollmentRequests)}
          label="Plazas por resolver"
          accentBg="var(--mod-events-bg)"
          accentFg="var(--mod-events-fg)"
        />
        <StatCard
          icon={CheckCircle2}
          value={String(metrics.completionsLast90Days)}
          label="Cursos terminados (90 días)"
          accentBg="var(--mod-serving-bg)"
          accentFg="var(--mod-serving-fg)"
        />
        <StatCard
          icon={Footprints}
          value={String(metrics.peopleInPaths)}
          label="Personas en un itinerario"
          accentBg="var(--mod-groups-bg)"
          accentFg="var(--mod-groups-fg)"
        />
      </div>

      <div className="shell-two-col">
        <div className="shell-card" style={cardStyle}>
          <h2 style={sectionTitleStyle}>Cohortes en marcha</h2>
          {activeCohorts.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
              No hay ninguna cohorte abierta ni en marcha ahora mismo.
            </p>
          ) : (
            <ul style={{ display: "flex", flexDirection: "column", gap: 10, listStyle: "none", padding: 0, margin: 0 }}>
              {activeCohorts.map((cohort) => (
                <li key={cohort.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <Link
                    href={`/app/discipulado/cohortes/${cohort.id}`}
                    style={{ fontSize: 13, fontWeight: 600, color: "var(--shell-text)", textDecoration: "none" }}
                  >
                    {cohort.courseName ? `${cohort.courseName} · ` : ""}
                    {cohort.name}
                  </Link>
                  <span className={CHIP_CLASS[COHORT_STATUS_INFO[cohort.status].tone]}>
                    {COHORT_STATUS_INFO[cohort.status].label}
                  </span>
                  <span className="serving-meta">
                    {cohort.enrolledCount} matriculadas · empieza {formatDate(cohort.startsOn)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="shell-card" style={cardStyle}>
          <h2 style={sectionTitleStyle}>Itinerarios</h2>
          {paths.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
              Todavía no hay itinerarios. Un itinerario ordena los pasos del camino de una persona.
            </p>
          ) : (
            <ul style={{ display: "flex", flexDirection: "column", gap: 10, listStyle: "none", padding: 0, margin: 0 }}>
              {paths.map((path) => (
                <li key={path.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <Link
                    href={`/app/discipulado/itinerarios/${path.id}`}
                    style={{ fontSize: 13, fontWeight: 600, color: "var(--shell-text)", textDecoration: "none" }}
                  >
                    {path.name}
                  </Link>
                  <span className={CHIP_CLASS[LEARNING_PATH_STATUS_INFO[path.status].tone]}>
                    {LEARNING_PATH_STATUS_INFO[path.status].label}
                  </span>
                  <span className="serving-meta">
                    {path.stepCount} {path.stepCount === 1 ? "paso" : "pasos"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
