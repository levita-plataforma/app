import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import {
  getResource,
  listMaintenance,
  listReservations,
  MAINTENANCE_STATUS_LABELS,
  RESERVATION_STATUS_LABELS,
  RESOURCE_STATUS_LABELS,
  RESOURCE_TYPE_LABELS,
} from "@/server/facilities/facilities-service";
import { ensureFacilitiesModule } from "../module-gate";
import { CHIP_CLASS, formatDateTime } from "../ui";
import AccionesRecurso from "./AccionesRecurso";

/**
 * Ficha de un recurso: lo que es, cuándo está cogido y qué mantenimiento tiene.
 *
 * Las reservas se muestran con su propósito, que es lo que necesita saber quien
 * consulta disponibilidad. Lo que no aparece es el contenido de la actividad
 * que hay detrás: para eso está la ficha de la actividad, con sus propios
 * permisos. Ver un recurso ocupado no da derecho a ver una reunión privada.
 */
export default async function RecursoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenantContext();

  const sinModulo = await ensureFacilitiesModule(tenant.churchId);
  if (sinModulo) return sinModulo;

  const recurso = await getResource(tenant.churchId, id);
  if (!recurso) notFound();

  const ahora = new Date().toISOString();
  const [reservas, mantenimientos, puedeGestionar] = await Promise.all([
    listReservations(tenant.churchId, { resourceId: id, from: ahora }),
    listMaintenance(tenant.churchId, { resourceId: id, from: ahora }),
    hasCapability(tenant.churchId, "facilities.manage_resources"),
  ]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <header
        style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}
      >
        <div>
          <Link href="/app/instalaciones" style={{ fontSize: 12.5 }}>
            Volver a Instalaciones
          </Link>
          <h1 style={{ margin: "6px 0 0", fontSize: 20 }}>{recurso.name}</h1>
          <p style={{ margin: "4px 0 0", color: "var(--shell-text-muted)", fontSize: 13 }}>
            {RESOURCE_TYPE_LABELS[recurso.type]} · {recurso.campusName ?? "Toda la iglesia"}
            {recurso.capacity ? ` · Aforo ${recurso.capacity}` : ""}
          </p>
        </div>
        <span className={recurso.status === "active" ? CHIP_CLASS.success : CHIP_CLASS.warning}>
          {RESOURCE_STATUS_LABELS[recurso.status]}
        </span>
      </header>

      {recurso.locationDetails && (
        <section className="shell-card" style={{ padding: 16 }}>
          <h2 style={{ margin: "0 0 6px", fontSize: 15 }}>Dónde está</h2>
          <p style={{ margin: 0, fontSize: 13 }}>{recurso.locationDetails}</p>
        </section>
      )}

      {puedeGestionar && <AccionesRecurso recurso={{ id: recurso.id, archivado: recurso.archivedAt !== null }} />}

      <section className="shell-card" style={{ padding: 16 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 15 }}>Próximas reservas</h2>
        {reservas.length === 0 ? (
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, margin: 0 }}>
            Este recurso está libre a partir de ahora.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Desde</th>
                  <th>Hasta</th>
                  <th>Para</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {reservas.map((r) => (
                  <tr key={r.id}>
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
      </section>

      <section className="shell-card" style={{ padding: 16 }}>
        <h2 style={{ margin: "0 0 12px", fontSize: 15 }}>Mantenimiento</h2>
        {mantenimientos.length === 0 ? (
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, margin: 0 }}>
            No hay intervenciones programadas.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Intervención</th>
                  <th>Desde</th>
                  <th>Hasta</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {mantenimientos.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.title}
                      {m.blocksAvailability ? (
                        <span className={CHIP_CLASS.warning} style={{ marginLeft: 8 }}>
                          Bloquea
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
    </div>
  );
}
