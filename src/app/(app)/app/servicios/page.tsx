import Link from "next/link";
import {
  LayoutGrid,
  Users,
  UsersRound,
  ClipboardList,
  ShieldAlert,
  GraduationCap,
} from "lucide-react";
import StatCard from "@/components/shell/StatCard";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { getServingDashboard } from "@/server/serving/serving-dashboard-service";
import { listServiceAreas } from "@/server/serving/service-areas-service";
import { ensureServingModule } from "./module-gate";
import { secondaryButtonStyle, primaryButtonStyle } from "./ui";

export default async function ServiciosPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureServingModule(tenant.churchId);
  if (disabled) return disabled;

  const [dashboard, { items: areas }] = await Promise.all([
    getServingDashboard(tenant.churchId),
    listServiceAreas(tenant.churchId, { pageSize: 25 }),
  ]);

  const hasAnything = dashboard.activeAreas > 0 || dashboard.teams > 0 || dashboard.positions > 0;

  return (
    <>
      <section
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Servicios</h1>
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
            Áreas, equipos, puestos y quién está preparado para servir en cada uno.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/app/servicios/equipos" style={secondaryButtonStyle()}>
            <UsersRound size={14} /> Equipos
          </Link>
          <Link href="/app/servicios/cualificaciones" style={secondaryButtonStyle()}>
            <GraduationCap size={14} /> Cualificaciones
          </Link>
          <Link href="/app/servicios/credenciales" style={secondaryButtonStyle()}>
            <ShieldAlert size={14} /> Credenciales
          </Link>
          <Link href="/app/servicios/areas" style={primaryButtonStyle()}>
            <LayoutGrid size={14} /> Áreas de servicio
          </Link>
        </div>
      </section>

      <div className="stat-grid">
        <StatCard
          icon={LayoutGrid}
          value={String(dashboard.activeAreas)}
          label="Áreas activas"
          accentBg="var(--mod-serving-bg)"
          accentFg="var(--mod-serving-fg)"
        />
        <StatCard
          icon={Users}
          value={String(dashboard.volunteers)}
          label="Voluntarios activos"
          accentBg="var(--mod-people-bg)"
          accentFg="var(--mod-people-fg)"
        />
        <StatCard
          icon={UsersRound}
          value={String(dashboard.teams)}
          label="Equipos"
          accentBg="var(--mod-families-bg)"
          accentFg="var(--mod-families-fg)"
        />
        <StatCard
          icon={ClipboardList}
          value={String(dashboard.positions)}
          label="Puestos"
          accentBg="var(--mod-discipleship-bg)"
          accentFg="var(--mod-discipleship-fg)"
        />
        <StatCard
          icon={GraduationCap}
          value={String(dashboard.peopleInTraining)}
          label="Personas en formación"
          accentBg="var(--mod-kids-bg)"
          accentFg="var(--mod-kids-fg)"
        />
        {dashboard.canSeeCredentials ? (
          <StatCard
            icon={ShieldAlert}
            value={String(dashboard.expiredCredentials + dashboard.expiringCredentials)}
            label="Credenciales vencidas o por vencer"
            accentBg="var(--mod-worship-bg)"
            accentFg="var(--mod-worship-fg)"
          />
        ) : null}
      </div>

      {!hasAnything ? (
        <div className="shell-card shell-empty-state" style={{ padding: "48px 24px" }}>
          <h3>Todavía no hay estructura de servicio</h3>
          <p>
            Empieza creando tus áreas de servicio (Sonido, Bienvenida, Niños…). Puedes partir de las
            plantillas sugeridas o definir las tuyas.
          </p>
          <Link href="/app/servicios/areas" style={{ ...primaryButtonStyle(), marginTop: 12 }}>
            Crear la primera área
          </Link>
        </div>
      ) : (
        <div className="shell-card list-card">
          <div className="list-card-header">
            <h2>Áreas de servicio</h2>
            <Link href="/app/servicios/areas">Ver todas</Link>
          </div>
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Área</th>
                  <th>Responsables</th>
                  <th>Personas</th>
                  <th>Puestos</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {areas.map((area) => (
                  <tr key={area.id}>
                    <td data-label="Área">
                      <Link
                        href={`/app/servicios/areas/${area.id}`}
                        style={{ fontWeight: 600, color: "var(--shell-text)", textDecoration: "none" }}
                      >
                        {area.name}
                      </Link>
                      {area.campusName ? (
                        <div className="serving-meta">{area.campusName}</div>
                      ) : null}
                    </td>
                    <td data-label="Responsables" className="serving-meta">
                      {area.leaders.length === 0
                        ? "Sin responsable"
                        : area.leaders
                            .map((l) => [l.firstName, l.lastName].filter(Boolean).join(" "))
                            .join(", ")}
                    </td>
                    <td data-label="Personas">{area.memberCount}</td>
                    <td data-label="Puestos">{area.positionCount}</td>
                    <td data-label="Estado">
                      <span className={`serving-chip ${area.active ? "is-success" : "is-muted"}`}>
                        {area.active ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
