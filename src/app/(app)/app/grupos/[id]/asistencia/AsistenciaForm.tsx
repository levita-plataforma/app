"use client";

import { useActionState } from "react";
import { GROUP_ATTENDANCE_STATUSES, GROUP_ATTENDANCE_STATUS_INFO } from "@/lib/groups/constants";
import type { GroupRosterEntry } from "@/server/groups/groups-service";
import type { RecordedAttendance } from "@/server/groups/group-meetings-service";
import { guardarAsistenciaAction, type AsistenciaState } from "./actions";
import { cardStyle, inputStyle, primaryButtonStyle, sectionTitleStyle, selectStyle } from "../../ui";

const initialState: AsistenciaState = { error: null, saved: null };

export default function AsistenciaForm({
  groupId,
  meetingId,
  roster,
  recorded,
}: {
  groupId: string;
  meetingId: string;
  roster: GroupRosterEntry[];
  recorded: Record<string, RecordedAttendance>;
}) {
  const [state, formAction, pending] = useActionState(
    guardarAsistenciaAction.bind(null, groupId, meetingId),
    initialState,
  );

  return (
    <form action={formAction} className="shell-card" style={cardStyle} noValidate>
      <h2 style={sectionTitleStyle}>Quién ha venido</h2>
      <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
        Puedes volver a guardar cuantas veces quieras: se corrige lo anotado, no se duplica. Para alguien que no
        participa en el grupo, márcalo como invitado.
      </p>

      <div className="people-table-wrap">
        <table className="serving-table">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Asistencia</th>
              <th>Invitada</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((entry) => {
              const previous = recorded[entry.personId];
              return (
                <tr key={entry.personId}>
                  <td data-label="Persona" style={{ fontWeight: 600 }}>
                    {entry.displayName}
                  </td>
                  <td data-label="Asistencia">
                    <select
                      name={`estado-${entry.personId}`}
                      defaultValue={previous?.status ?? ""}
                      aria-label={`Asistencia de ${entry.displayName}`}
                      style={selectStyle}
                    >
                      <option value="">Sin anotar</option>
                      {GROUP_ATTENDANCE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {GROUP_ATTENDANCE_STATUS_INFO[status].label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Invitada">
                    <input
                      type="checkbox"
                      name={`invitado-${entry.personId}`}
                      defaultChecked={previous?.isGuest ?? false}
                      aria-label={`${entry.displayName} viene como invitada`}
                    />
                  </td>
                  <td data-label="Nota">
                    <input
                      name={`nota-${entry.personId}`}
                      defaultValue={previous?.notes ?? ""}
                      maxLength={200}
                      aria-label={`Nota sobre ${entry.displayName}`}
                      style={inputStyle}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {state.error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {state.error}
        </p>
      ) : null}
      {state.saved !== null ? (
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
          Asistencia guardada: {state.saved} {state.saved === 1 ? "persona anotada" : "personas anotadas"}.
        </p>
      ) : null}

      <div>
        <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
          {pending ? "Guardando…" : "Guardar asistencia"}
        </button>
      </div>
    </form>
  );
}
