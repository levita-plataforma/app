import Link from "next/link";
import { Building2, CalendarClock, Plus, Wrench } from "lucide-react";
import StatCard from "@/components/shell/StatCard";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import {
  listMaintenance,
  listReservations,
  listResources,
  MAINTENANCE_STATUS_LABELS,
  RESERVATION_STATUS_LABELS,
  RESOURCE_STATUS_LABELS,
  RESOURCE_TYPE_LABELS,
  type ResourceStatus,
  type ResourceType,
} from "@/server/facilities/facilities-service";
import { ensureFacilitiesModule } from "./module-gate";
import { CHIP_CLASS, formatDateTime, primaryButtonStyle, selectStyle } from "./ui";
import NuevaReservaForm from "./NuevaReservaForm";

type SearchParams = { tipo?: string; estado?: string; q?: string };

const TIPOS: ResourceType[] = ["room", "equipment", "vehicle", "other"];
const ESTADOS: ResourceStatus[] = ["active", "unavailable", "maintenance", "archived"];

/**
 * Instalaciones: catálogo, próximas reservas y mantenimientos pendientes.
 *
 * Cada filtro se valida contra su lista blanca antes de llegar al servicio; lo
 * que no encaja se descarta en vez de viajar a la consulta.
 *
 * Los estados se pintan distinguiendo pendiente, confirmada y cancelada: una
 * reserva pendiente no es una reserva hecha, y enseñarlas igual haría creer que
 * la sala está cogida cuando todavía no lo está.
 */
export default async function InstalacionesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const tenant = await requireTenantContext();

  const sinModulo = await ensureFacilitiesModule(tenant.churchId);
  if (sinModulo) return sinModulo;

  const tipo = TIPOS.includes(params.tipo as ResourceType) ? (params.tipo as ResourceType) : undefined;
  const estado = ESTADOS.includes(params.estado as ResourceStatus) ? (params.estado as ResourceStatus) : undefined;
  const ahora = new Date().toISOString();

  const [recursos, reservas, mantenimientos, puedeGestionar, puedeReservar, puedeMantener] = await Promise.all([
    listResources(tenant.churchId, { type: tipo, status: estado, search: params.q }),
    listReservations(tenant.churchId, { from: ahora }),
    listMaintenance(tenant.churchId, { from: ahora }),
    hasCapability(tenant.churchId, "facilities.manage_resources"),
    hasCapability(tenant.churchId, "facilities.create_reservation"),
    hasCapability(tenant.churchId, "facilities.manage_maintenance"),
  ]);

  const activos = recursos.filter((r) => r.status === "active");
  const fueraDeServicio = recursos.filter((r) => r.status === "unavailable" || r.status === "maintenance");
  const pendientesAprobacion = reservas.filter((r) => r.status === "pending");
  const mantenimientosAbiertos = mantenimientos.filter(
    (m) => m.status === "scheduled" || m.status === "in_progress",
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>Instalaciones</h1>
          <p style={{ margin: "4px 0 0", color: "var(--shell-text-muted)", fontSize: 13 }}>
            Salas, equipos y vehículos de la iglesia, con sus reservas y su mantenimiento.
          </p>
        </div>
        {puedeGestionar && (
          <Link href="/app/instalaciones/nuevo" style={primaryButtonStyle()}>
            <Plus aria-hidden="true" size={15} /> Nuevo recurso
          </Link>
        )}
      </header>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
        <StatCard
          icon={Building2}
          value={String(activos.length)}
          label="Recursos disponibles"
          accentBg="var(--mod-facilities-bg)"
          accentFg="var(--mod-facilities-fg)"
        />
        <StatCard
          icon={CalendarClock}
          value={String(reservas.filter((r) => r.status === "confirmed").length)}
          label="Reservas próximas"
          accentBg="var(--mod-facilities-bg)"
          accentFg="var(--mod-facilities-fg)"
        />
        <StatCard
          icon={Wrench}
          value={String(mantenimientosAbiertos.length)}
          label="Mantenimientos abiertos"
          accentBg="var(--mod-facilities-bg)"
          accentFg="var(--mod-facilities-fg)"
        />
        <StatCard
          icon={Building2}
          value={String(fueraDeServicio.length)}
          label="Fuera de servicio"
          accentBg="var(--mod-facilities-bg)"
          accentFg="var(--mod-facilities-fg)"
        />
      </div>

      {puedeReservar && activos.some((r) => r.reservable) && (
        <NuevaReservaForm recursos={activos.filter((r) => r.reservable).map((r) => ({ id: r.id, name: r.name }))} />
      )}

      <section className="shell-card" style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 15 }}>Catálogo</h2>
          <form style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select name="tipo" defaultValue={tipo ?? ""} style={selectStyle} aria-label="Filtrar por tipo">
              <option value="">Todos los tipos</option>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {RESOURCE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <select name="estado" defaultValue={estado ?? ""} style={selectStyle} aria-label="Filtrar por estado">
              <option value="">Todos los estados</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {RESOURCE_STATUS_LABELS[e]}
                </option>
              ))}
            </select>
            <button type="submit" style={primaryButtonStyle()}>
              Filtrar
            </button>
          </form>
        </div>

        {recursos.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "32px 16px" }}>
            <h3>Todavía no hay recursos</h3>
            <p>
              {puedeGestionar
                ? "Añade la primera sala, equipo o vehículo para poder reservarlo."
                : "Cuando alguien dé de alta las salas y los equipos, aparecerán aquí."}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Recurso</th>
                  <th>Tipo</th>
                  <th>Sede</th>
                  <th>Aforo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {recursos.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/app/instalaciones/${r.id}`}>{r.name}</Link>
                      {r.requiresApproval && (
                        <span className={CHIP_CLASS.muted} style={{ marginLeft: 8 }}>
                          Con aprobación
                        </span>
                      )}
                      {!r.reservable && (
                        <span className={CHIP_CLASS.muted} style={{ marginLeft: 8 }}>
                          No reservable
                        </span>
                      )}
                    </td>
                    <td>{RESOURCE_TYPE_LABELS[r.type]}</td>
                    <td>{r.campusName ?? "Toda la iglesia"}</td>
                    <td>{r.capacity ?? "—"}</td>
                    <td>
                      <span className={r.status === "active" ? CHIP_CLASS.success : CHIP_CLASS.warning}>
                        {RESOURCE_STATUS_LABELS[r.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="shell-card" style={{ padding: 16 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 15 }}>Próximas reservas</h2>
        {reservas.length === 0 ? (
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, margin: 0 }}>No hay reservas por delante.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Recurso</th>
                  <th>Desde</th>
                  <th>Hasta</th>
                  <th>Para</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {reservas.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/app/instalaciones/${r.resourceId}`}>{r.resourceName}</Link>
                    </td>
                    <td>{formatDateTime(r.startsAt)}</td>
                    <td>{formatDateTime(r.endsAt)}</td>
                    <td>{r.purpose}</td>
                    <td>
                      <span
                        className={
                          r.status === "confirmed"
                            ? CHIP_CLASS.success
                            : r.status === "pending"
                              ? CHIP_CLASS.warning
                              : CHIP_CLASS.muted
                        }
                      >
                        {RESERVATION_STATUS_LABELS[r.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pendientesAprobacion.length > 0 && (
          <p style={{ marginTop: 10, fontSize: 12.5, color: "var(--shell-text-muted)" }}>
            {pendientesAprobacion.length === 1
              ? "Hay 1 reserva esperando aprobación. Mientras tanto no bloquea el recurso."
              : `Hay ${pendientesAprobacion.length} reservas esperando aprobación. Mientras tanto no bloquean el recurso.`}
          </p>
        )}
      </section>

      {(mantenimientosAbiertos.length > 0 || puedeMantener) && (
        <section className="shell-card" style={{ padding: 16 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 15 }}>Mantenimiento</h2>
          {mantenimientosAbiertos.length === 0 ? (
            <p style={{ color: "var(--shell-text-muted)", fontSize: 13, margin: 0 }}>
              No hay intervenciones pendientes.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="serving-table">
                <thead>
                  <tr>
                    <th>Recurso</th>
                    <th>Intervención</th>
                    <th>Desde</th>
                    <th>Hasta</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {mantenimientosAbiertos.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <Link href={`/app/instalaciones/${m.resourceId}`}>{m.resourceName}</Link>
                      </td>
                      <td>
                        {m.title}
                        {m.blocksAvailability ? (
                          <span className={CHIP_CLASS.warning} style={{ marginLeft: 8 }}>
                            Bloquea el recurso
                          </span>
                        ) : (
                          <span className={CHIP_CLASS.muted} style={{ marginLeft: 8 }}>
                            Solo aviso
                          </span>
                        )}
                      </td>
                      <td>{formatDateTime(m.startsAt)}</td>
                      <td>{formatDateTime(m.endsAt)}</td>
                      <td>
                        <span className={CHIP_CLASS.default}>{MAINTENANCE_STATUS_LABELS[m.status]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
