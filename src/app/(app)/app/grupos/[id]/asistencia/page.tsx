import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { getGroup, getGroupRoster } from "@/server/groups/groups-service";
import { getMeetingAttendance, listGroupMeetings } from "@/server/groups/group-meetings-service";
import { ensureGroupsModule } from "../../module-gate";
import { CHIP_CLASS, formatDateTime, isUuid, secondaryButtonStyle } from "../../ui";
import AsistenciaForm from "./AsistenciaForm";

type SearchParams = { reunion?: string };

/**
 * Asistencia de una reunión. Sin `?reunion=`, se ofrece la lista de reuniones
 * que todavía admiten registro: una cancelada (se reconoce por `cancelledAt`,
 * no por el estado de la actividad) no aparece.
 */
export default async function AsistenciaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tenant = await requireTenantContext();
  const disabled = await ensureGroupsModule(tenant.churchId);
  if (disabled) return disabled;

  const group = await getGroup(tenant.churchId, id);
  if (!group) notFound();

  const [canManageAttendance, meetings] = await Promise.all([
    hasCapability(tenant.churchId, "group.attendance.manage", "group", id),
    listGroupMeetings(id, { limit: 100 }).catch(() => []),
  ]);

  const header = (
    <section>
      <Link href={`/app/grupos/${id}`} style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}>
        ← {group.name}
      </Link>
      <h1 style={{ fontSize: 21, fontWeight: 600, marginTop: 6 }}>Asistencia</h1>
    </section>
  );

  if (!canManageAttendance) {
    return (
      <>
        {header}
        <div className="shell-card shell-empty-state" style={{ padding: "48px 24px" }}>
          <h3>No puedes registrar la asistencia de este grupo</h3>
          <p>Pide a quien administra la iglesia que te dé permiso para anotar la asistencia.</p>
        </div>
      </>
    );
  }

  const selectedId = isUuid(sp.reunion) ? sp.reunion : null;
  const selected = selectedId ? meetings.find((meeting) => meeting.id === selectedId) : null;

  if (selectedId && !selected) notFound();

  if (!selected) {
    const openMeetings = meetings.filter((meeting) => !meeting.cancelledAt);
    return (
      <>
        {header}
        {openMeetings.length === 0 ? (
          <div className="shell-card shell-empty-state" style={{ padding: "48px 24px" }}>
            <h3>No hay reuniones a las que anotar asistencia</h3>
            <p>Convoca una reunión desde la ficha del grupo y vuelve aquí.</p>
          </div>
        ) : (
          <div className="shell-card list-card">
            <div className="people-table-wrap">
              <table className="serving-table">
                <thead>
                  <tr>
                    <th>Reunión</th>
                    <th>Cuándo</th>
                    <th>Estado</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {openMeetings.map((meeting) => (
                    <tr key={meeting.id}>
                      <td data-label="Reunión" style={{ fontWeight: 600 }}>
                        {meeting.title}
                      </td>
                      <td data-label="Cuándo" className="serving-meta">
                        {formatDateTime(meeting.startsAt)}
                      </td>
                      <td data-label="Estado">
                        <span className={meeting.attendanceRecordedAt ? CHIP_CLASS.success : CHIP_CLASS.muted}>
                          {meeting.attendanceRecordedAt ? `${meeting.attendanceCount} presentes` : "Sin registrar"}
                        </span>
                      </td>
                      <td data-label="">
                        <Link href={`/app/grupos/${id}/asistencia?reunion=${meeting.id}`} style={secondaryButtonStyle()}>
                          Anotar
                        </Link>
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

  const [roster, recorded] = await Promise.all([
    getGroupRoster(id).catch(() => []),
    getMeetingAttendance(tenant.churchId, selected.id).catch(() => new Map()),
  ]);

  return (
    <>
      <section>
        <Link
          href={`/app/grupos/${id}/asistencia`}
          style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}
        >
          ← Reuniones del grupo
        </Link>
        <h1 style={{ fontSize: 21, fontWeight: 600, marginTop: 6 }}>{selected.title}</h1>
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 2 }}>
          {formatDateTime(selected.startsAt)}
          {selected.locationText ? ` · ${selected.locationText}` : ""}
        </p>
      </section>

      {selected.cancelledAt ? (
        <div className="shell-card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <span className="serving-chip is-danger">Reunión cancelada</span>
          <span style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
            {selected.cancellationReason ?? "Se conserva lo anotado hasta ahora."}
          </span>
        </div>
      ) : null}

      <AsistenciaForm
        groupId={id}
        meetingId={selected.id}
        roster={roster}
        recorded={Object.fromEntries(recorded)}
      />
    </>
  );
}
