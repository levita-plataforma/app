import Link from "next/link";
import { Baby, DoorOpen, ShieldAlert, UsersRound, CalendarClock } from "lucide-react";
import StatCard from "@/components/shell/StatCard";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { listKidsProfiles } from "@/server/kids/kids-profiles-service";
import { listKidsRooms } from "@/server/kids/kids-rooms-service";
import { getIncidentsCount } from "@/server/kids/kids-incidents-service";
import { ensureKidsModule } from "./module-gate";
import { primaryButtonStyle, secondaryButtonStyle } from "./ui";

/**
 * Dashboard de Kids (encargo §A). Solo datos reales, sin cifras ficticias:
 * - Menores con perfil activo: listKidsProfiles(status: "active").
 * - Salas activas: listKidsRooms(active: true).
 * - Incidencias abiertas: SOLO el número (getIncidentsCount con
 *   status=open), nunca el contenido, que vive únicamente en la ficha del
 *   menor (§24 del encargo: "Dashboard puede mostrar solo: '1 incidencia
 *   abierta'. Sin contenido."). La tarjeta solo se pinta a quien tiene
 *   kids.incident.read: el contador sale de la misma tabla protegida por
 *   RLS, así que a cualquier otro perfil le habría salido siempre un cero,
 *   y un cero falso es peor que no enseñar la tarjeta.
 *
 * Nota: "Credenciales Kids venciendo pronto" se deja fuera a propósito por
 * simplicidad de esta fase — no existe todavía un servicio de credenciales
 * específico de Kids (el de Servicios es de otro módulo), así que se
 * documenta como pendiente en vez de improvisar una consulta ad-hoc.
 */
export default async function KidsPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureKidsModule(tenant.churchId);
  if (disabled) return disabled;

  const [canManage, canReadIncidents] = await Promise.all([
    hasCapability(tenant.churchId, "kids.manage"),
    hasCapability(tenant.churchId, "kids.incident.read"),
  ]);

  const [activeProfiles, activeRooms, openIncidents] = await Promise.all([
    listKidsProfiles(tenant.churchId, { status: "active", pageSize: 1 }),
    listKidsRooms(tenant.churchId, { active: true }),
    canReadIncidents ? getIncidentsCount(tenant.churchId, { status: "open" }) : Promise.resolve(null),
  ]);

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
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Niños</h1>
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
            Perfiles de menores, salas, responsables y autorizaciones de recogida.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/app/kids/salas" style={secondaryButtonStyle()}>
            <DoorOpen size={14} /> Salas
          </Link>
          <Link href="/app/kids/sesiones" style={secondaryButtonStyle()}>
            <CalendarClock size={14} /> Sesiones
          </Link>
          <Link href="/app/kids/menores" style={primaryButtonStyle()}>
            <Baby size={14} /> Menores
          </Link>
        </div>
      </section>

      <div className="stat-grid">
        <StatCard
          icon={Baby}
          value={String(activeProfiles.total)}
          label="Menores con perfil activo"
          accentBg="var(--mod-kids-bg)"
          accentFg="var(--mod-kids-fg)"
        />
        <StatCard
          icon={DoorOpen}
          value={String(activeRooms.length)}
          label="Salas activas"
          accentBg="var(--mod-kids-bg)"
          accentFg="var(--mod-kids-fg)"
        />
        {openIncidents !== null ? (
          <StatCard
            icon={ShieldAlert}
            value={String(openIncidents)}
            label="Incidencias abiertas"
            accentBg="var(--mod-worship-bg)"
            accentFg="var(--mod-worship-fg)"
          />
        ) : null}
      </div>

      <div className="shell-card list-card">
        <div className="list-card-header">
          <h2>Accesos rápidos</h2>
        </div>
        <div className="serving-grid" style={{ padding: 18 }}>
          <Link href="/app/kids/menores" className="shell-card" style={quickLinkStyle}>
            <Baby aria-hidden="true" />
            <div>
              <p style={{ fontSize: 14, fontWeight: 600 }}>Menores</p>
              <p className="serving-meta">Perfiles, responsables, autorizaciones e incidencias.</p>
            </div>
          </Link>
          <Link href="/app/kids/salas" className="shell-card" style={quickLinkStyle}>
            <DoorOpen aria-hidden="true" />
            <div>
              <p style={{ fontSize: 14, fontWeight: 600 }}>Salas</p>
              <p className="serving-meta">Capacidad, franja de edad y ratio por sala.</p>
            </div>
          </Link>
          <Link href="/app/kids/sesiones" className="shell-card" style={quickLinkStyle}>
            <UsersRound aria-hidden="true" />
            <div>
              <p style={{ fontSize: 14, fontWeight: 600 }}>Sesiones</p>
              <p className="serving-meta">
                Check-in y checkout por sesión.
                {/* Ruta construida por otro agente en paralelo: puede no existir
                    todavía en este entorno de build local. No es un fallo de
                    esta página, que solo enlaza a ella. */}
              </p>
            </div>
          </Link>
        </div>
      </div>

      {!canManage ? (
        <p style={{ fontSize: 12, color: "var(--shell-text-subtle)" }}>
          Tu rol actual solo permite consultar Kids. Contacta con un administrador para dar de alta
          menores, salas o autorizaciones.
        </p>
      ) : null}
    </>
  );
}

const quickLinkStyle: React.CSSProperties = {
  padding: 18,
  display: "flex",
  alignItems: "center",
  gap: 12,
  textDecoration: "none",
  color: "var(--shell-text)",
};
