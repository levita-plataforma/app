"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CalendarPlus, ClipboardCheck } from "lucide-react";
import {
  GROUP_JOIN_POLICIES,
  GROUP_JOIN_POLICY_INFO,
  GROUP_LEADER_ROLES,
  GROUP_LEADER_ROLE_LABELS,
  GROUP_ROSTER_ROLE_LABELS,
  GROUP_STATUSES,
  GROUP_STATUS_INFO,
  GROUP_VISIBILITIES,
  GROUP_VISIBILITY_INFO,
} from "@/lib/groups/constants";
import type { GroupDetail, GroupJoinRequestItem, GroupRosterEntry } from "@/server/groups/groups-service";
import type { GroupMeetingItem } from "@/server/groups/group-meetings-service";
import {
  anadirParticipanteAction,
  anadirResponsableAction,
  archivarGrupoAction,
  buscarPersonasAction,
  cambiarEstadoGrupoAction,
  cambiarFechaReunionAction,
  cancelarReunionAction,
  convocarReunionAction,
  darDeBajaParticipanteAction,
  guardarGrupoAction,
  resolverSolicitudAction,
  retirarResponsableAction,
  type GrupoState,
} from "./actions";
import {
  CHIP_CLASS,
  cardStyle,
  dangerButtonStyle,
  fieldStyle,
  formatDate,
  formatDateTime,
  formatOccupancy,
  inputStyle,
  labelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionTitleStyle,
  selectStyle,
  subtleButtonStyle,
  toLocalInputValue,
} from "../ui";

type Permissions = {
  canManage: boolean;
  canManageMembers: boolean;
  canManageRequests: boolean;
  canManageMeetings: boolean;
  canManageAttendance: boolean;
};

type Tab = "resumen" | "personas" | "reuniones" | "solicitudes";

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "L" },
  { value: 2, label: "M" },
  { value: 3, label: "X" },
  { value: 4, label: "J" },
  { value: 5, label: "V" },
  { value: 6, label: "S" },
  { value: 7, label: "D" },
];

export default function GrupoFicha({
  group,
  roster,
  meetings,
  pendingRequests,
  groupTypes,
  permissions,
}: {
  group: GroupDetail;
  roster: GroupRosterEntry[];
  meetings: GroupMeetingItem[];
  pendingRequests: GroupJoinRequestItem[];
  groupTypes: { id: string; name: string }[];
  permissions: Permissions;
}) {
  const [tab, setTab] = useState<Tab>("resumen");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const leaders = roster.filter((entry) => entry.role === "leader");
  const members = roster.filter((entry) => entry.role === "member");
  const statusInfo = GROUP_STATUS_INFO[group.status];

  function run(action: () => Promise<GrupoState>) {
    startTransition(async () => {
      const result = await action();
      setError(result.error);
    });
  }

  return (
    <>
      <section
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
      >
        <div>
          <Link href="/app/grupos" style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}>
            ← Grupos
          </Link>
          <h1 style={{ fontSize: 21, fontWeight: 600, marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
            {group.name}
            <span className={CHIP_CLASS[statusInfo.tone]}>{statusInfo.label}</span>
            {leaders.length === 0 ? <span className="serving-chip is-warning">Sin responsable</span> : null}
            {group.archivedAt ? <span className="serving-chip is-muted">Archivado</span> : null}
          </h1>
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 2 }}>
            {group.groupTypeName ?? "Sin tipo"} · {group.campusName ?? "Toda la iglesia"} ·{" "}
            {GROUP_VISIBILITY_INFO[group.visibility].label} · {formatOccupancy(members.length, group.capacity)}{" "}
            participantes
          </p>
        </div>
        {permissions.canManageAttendance ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/app/grupos/${group.id}/asistencia`} style={secondaryButtonStyle()}>
              <ClipboardCheck size={14} /> Asistencia
            </Link>
          </div>
        ) : null}
      </section>

      {error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      ) : null}

      <div className="serving-tabs" role="tablist">
        {(
          [
            ["resumen", "Resumen"],
            ["personas", `Personas (${roster.length})`],
            ["reuniones", `Reuniones (${meetings.length})`],
            ["solicitudes", `Solicitudes (${pendingRequests.length})`],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className="serving-tab"
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "resumen" ? (
        <ResumenTab group={group} groupTypes={groupTypes} permissions={permissions} pending={pending} run={run} />
      ) : null}

      {tab === "personas" ? (
        <PersonasTab
          groupId={group.id}
          leaders={leaders}
          members={members}
          capacity={group.capacity}
          permissions={permissions}
          pending={pending}
          run={run}
        />
      ) : null}

      {tab === "reuniones" ? (
        <ReunionesTab groupId={group.id} meetings={meetings} permissions={permissions} pending={pending} run={run} />
      ) : null}

      {tab === "solicitudes" ? (
        <SolicitudesTab
          groupId={group.id}
          requests={pendingRequests}
          canResolve={permissions.canManageRequests}
          pending={pending}
          run={run}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------------------

function ResumenTab({
  group,
  groupTypes,
  permissions,
  pending,
  run,
}: {
  group: GroupDetail;
  groupTypes: { id: string; name: string }[];
  permissions: Permissions;
  pending: boolean;
  run: (action: () => Promise<GrupoState>) => void;
}) {
  if (!permissions.canManage) {
    return (
      <div className="shell-card" style={cardStyle}>
        <h2 style={sectionTitleStyle}>Sobre este grupo</h2>
        <p style={{ fontSize: 13 }}>{group.description ?? "Este grupo todavía no tiene descripción."}</p>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <Dato titulo="Cuándo se reúne" valor={group.meetingScheduleText ?? "—"} />
          <Dato titulo="Dónde se reúne" valor={group.meetingLocationText ?? "—"} />
          <Dato titulo="Segmento de edad" valor={group.ageSegment ?? "—"} />
          <Dato titulo="Forma de ingreso" valor={GROUP_JOIN_POLICY_INFO[group.joinPolicy].label} />
        </dl>
      </div>
    );
  }

  return (
    <>
      <form
        className="shell-card"
        style={cardStyle}
        action={(formData) => run(() => guardarGrupoAction(group.id, formData))}
        noValidate
      >
        <h2 style={sectionTitleStyle}>Datos del grupo</h2>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <div style={{ ...fieldStyle, flex: "1 1 320px" }}>
            <label htmlFor="ficha-nombre" style={labelStyle}>
              Nombre
            </label>
            <input id="ficha-nombre" name="name" defaultValue={group.name} required maxLength={120} style={inputStyle} />
          </div>
          <div style={fieldStyle}>
            <label htmlFor="ficha-tipo" style={labelStyle}>
              Tipo de grupo
            </label>
            <select id="ficha-tipo" name="groupTypeId" defaultValue={group.groupTypeId ?? ""} style={selectStyle}>
              <option value="">Sin tipo</option>
              {groupTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ ...fieldStyle, flex: "1 1 100%" }}>
          <label htmlFor="ficha-descripcion" style={labelStyle}>
            Descripción
          </label>
          <textarea
            id="ficha-descripcion"
            name="description"
            rows={3}
            maxLength={2000}
            defaultValue={group.description ?? ""}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          <div style={fieldStyle}>
            <label htmlFor="ficha-visibilidad" style={labelStyle}>
              Visibilidad
            </label>
            <select id="ficha-visibilidad" name="visibility" defaultValue={group.visibility} style={selectStyle}>
              {GROUP_VISIBILITIES.map((visibility) => (
                <option key={visibility} value={visibility}>
                  {GROUP_VISIBILITY_INFO[visibility].label}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label htmlFor="ficha-ingreso" style={labelStyle}>
              Forma de ingreso
            </label>
            <select id="ficha-ingreso" name="joinPolicy" defaultValue={group.joinPolicy} style={selectStyle}>
              {GROUP_JOIN_POLICIES.map((policy) => (
                <option key={policy} value={policy}>
                  {GROUP_JOIN_POLICY_INFO[policy].label}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label htmlFor="ficha-aforo" style={labelStyle}>
              Aforo
            </label>
            <input
              id="ficha-aforo"
              name="capacity"
              type="number"
              min={1}
              step={1}
              defaultValue={group.capacity ?? ""}
              style={inputStyle}
            />
          </div>
          <div style={fieldStyle}>
            <label htmlFor="ficha-edad" style={labelStyle}>
              Segmento de edad
            </label>
            <input id="ficha-edad" name="ageSegment" defaultValue={group.ageSegment ?? ""} maxLength={60} style={inputStyle} />
          </div>
          <div style={fieldStyle}>
            <label htmlFor="ficha-cuando" style={labelStyle}>
              Cuándo se reúne
            </label>
            <input
              id="ficha-cuando"
              name="meetingScheduleText"
              defaultValue={group.meetingScheduleText ?? ""}
              maxLength={160}
              style={inputStyle}
            />
          </div>
          <div style={fieldStyle}>
            <label htmlFor="ficha-donde" style={labelStyle}>
              Dónde se reúne
            </label>
            <input
              id="ficha-donde"
              name="meetingLocationText"
              defaultValue={group.meetingLocationText ?? ""}
              maxLength={160}
              style={inputStyle}
            />
          </div>
        </div>

        <div>
          <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </form>

      <div className="shell-card" style={cardStyle}>
        <h2 style={sectionTitleStyle}>Estado del grupo</h2>
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
          {GROUP_STATUS_INFO[group.status].description}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {GROUP_STATUSES.filter((status) => status !== group.status).map((status) => (
            <button
              key={status}
              type="button"
              disabled={pending}
              onClick={() => run(() => cambiarEstadoGrupoAction(group.id, status))}
              style={secondaryButtonStyle(pending)}
            >
              {GROUP_STATUS_INFO[status].label}
            </button>
          ))}
        </div>
        <div style={{ borderTop: "1px solid var(--shell-border)", paddingTop: 12 }}>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => archivarGrupoAction(group.id, !group.archivedAt))}
            style={group.archivedAt ? subtleButtonStyle : dangerButtonStyle}
          >
            {group.archivedAt ? "Restaurar el grupo" : "Archivar el grupo"}
          </button>
          <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)", marginTop: 4 }}>
            Archivar conserva participantes, reuniones y asistencia: no se borra nada.
          </p>
        </div>
      </div>
    </>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <dt style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--shell-text-subtle)" }}>
        {titulo}
      </dt>
      <dd style={{ fontSize: 13, marginTop: 2 }}>{valor}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

function PersonasTab({
  groupId,
  leaders,
  members,
  capacity,
  permissions,
  pending,
  run,
}: {
  groupId: string;
  leaders: GroupRosterEntry[];
  members: GroupRosterEntry[];
  capacity: number | null;
  permissions: Permissions;
  pending: boolean;
  run: (action: () => Promise<GrupoState>) => void;
}) {
  return (
    <>
      <div className="shell-card" style={cardStyle}>
        <h2 style={sectionTitleStyle}>Responsables</h2>
        {leaders.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
            Este grupo no tiene responsable vigente. Sigue funcionando; solo falta quien lo lleve.
          </p>
        ) : (
          <ListaPersonas
            entries={leaders}
            canRemove={permissions.canManage}
            removeLabel="Retirar"
            pending={pending}
            onRemove={(personId) => run(() => retirarResponsableAction(groupId, personId))}
          />
        )}
        {permissions.canManage ? (
          <BuscadorPersonas
            groupId={groupId}
            pending={pending}
            withRole
            submitLabel="Nombrar responsable"
            onSubmit={(personId, role) => run(() => anadirResponsableAction(groupId, personId, role ?? "leader"))}
          />
        ) : null}
      </div>

      <div className="shell-card" style={cardStyle}>
        <h2 style={sectionTitleStyle}>
          Participantes ({formatOccupancy(members.length, capacity)})
        </h2>
        <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
          El aforo cuenta participantes: quien lleva el grupo no ocupa plaza.
        </p>
        {members.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>Todavía no participa nadie.</p>
        ) : (
          <ListaPersonas
            entries={members}
            canRemove={permissions.canManageMembers}
            removeLabel="Dar de baja"
            pending={pending}
            onRemove={(personId) => run(() => darDeBajaParticipanteAction(groupId, personId))}
          />
        )}
        {permissions.canManageMembers ? (
          <BuscadorPersonas
            groupId={groupId}
            pending={pending}
            submitLabel="Añadir al grupo"
            onSubmit={(personId) => run(() => anadirParticipanteAction(groupId, personId))}
          />
        ) : null}
      </div>
    </>
  );
}

/**
 * El nombre se muestra siempre. El correo y el teléfono solo aparecen cuando
 * `contactVisible` lo permite (decisión P-5); cuando no, la celda queda vacía
 * sin insinuar que haya algo escondido.
 */
function ListaPersonas({
  entries,
  canRemove,
  removeLabel,
  pending,
  onRemove,
}: {
  entries: GroupRosterEntry[];
  canRemove: boolean;
  removeLabel: string;
  pending: boolean;
  onRemove: (personId: string) => void;
}) {
  return (
    <div className="people-table-wrap">
      <table className="serving-table">
        <thead>
          <tr>
            <th>Persona</th>
            <th>Papel</th>
            <th>Desde</th>
            <th>Contacto</th>
            {canRemove ? <th aria-label="Acciones" /> : null}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={`${entry.role}-${entry.personId}`}>
              <td data-label="Persona" style={{ fontWeight: 600 }}>
                <Link
                  href={`/app/personas/${entry.personId}`}
                  style={{ color: "var(--shell-text)", textDecoration: "none" }}
                >
                  {entry.displayName}
                </Link>
              </td>
              <td data-label="Papel" className="serving-meta">
                {GROUP_ROSTER_ROLE_LABELS[entry.role] ?? entry.role}
              </td>
              <td data-label="Desde" className="serving-meta">
                {formatDate(entry.joinedAt)}
              </td>
              <td data-label="Contacto" className="serving-meta">
                {entry.contactVisible ? [entry.email, entry.phone].filter(Boolean).join(" · ") : ""}
              </td>
              {canRemove ? (
                <td data-label="">
                  <button type="button" disabled={pending} onClick={() => onRemove(entry.personId)} style={dangerButtonStyle}>
                    {removeLabel}
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BuscadorPersonas({
  pending,
  withRole = false,
  submitLabel,
  onSubmit,
}: {
  groupId: string;
  pending: boolean;
  withRole?: boolean;
  submitLabel: string;
  onSubmit: (personId: string, role?: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [role, setRole] = useState<string>("leader");
  const [searching, startSearch] = useTransition();

  function buscar() {
    startSearch(async () => {
      setResults(await buscarPersonasAction(search));
    });
  }

  return (
    <div style={{ borderTop: "1px solid var(--shell-border)", paddingTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar persona por nombre…"
        aria-label="Buscar persona"
        style={{ ...inputStyle, flex: "1 1 200px", width: "auto" }}
      />
      <button type="button" disabled={searching} onClick={buscar} style={secondaryButtonStyle(searching)}>
        {searching ? "Buscando…" : "Buscar"}
      </button>
      {results.length > 0 ? (
        <>
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            aria-label="Persona encontrada"
            style={{ ...selectStyle, flex: "1 1 200px" }}
          >
            <option value="">Elige una persona…</option>
            {results.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          {withRole ? (
            <select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Papel" style={selectStyle}>
              {GROUP_LEADER_ROLES.map((value) => (
                <option key={value} value={value}>
                  {GROUP_LEADER_ROLE_LABELS[value]}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            disabled={pending || !selected}
            onClick={() => {
              if (!selected) return;
              onSubmit(selected, withRole ? role : undefined);
              setSelected("");
            }}
            style={primaryButtonStyle(pending)}
          >
            {submitLabel}
          </button>
        </>
      ) : null}
      {results.length === 0 && search && !searching ? (
        <span style={{ fontSize: 12, color: "var(--shell-text-subtle)", alignSelf: "center" }}>
          Busca para ver a quién puedes añadir.
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reuniones
// ---------------------------------------------------------------------------

function ReunionesTab({
  groupId,
  meetings,
  permissions,
  pending,
  run,
}: {
  groupId: string;
  meetings: GroupMeetingItem[];
  permissions: Permissions;
  pending: boolean;
  run: (action: () => Promise<GrupoState>) => void;
}) {
  const [repeats, setRepeats] = useState(false);
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("weekly");
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <>
      {permissions.canManageMeetings ? (
        <form className="shell-card" style={cardStyle} action={(formData) => run(() => convocarReunionAction(groupId, formData))} noValidate>
          <h2 style={sectionTitleStyle}>
            <CalendarPlus size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Convocar una reunión
          </h2>
          <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
            La reunión no se anuncia en el calendario general de la iglesia: la ven quienes participan en el grupo.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            <div style={fieldStyle}>
              <label htmlFor="reunion-inicio" style={labelStyle}>
                Comienzo
              </label>
              <input id="reunion-inicio" name="localStart" type="datetime-local" required style={inputStyle} />
            </div>
            <div style={fieldStyle}>
              <label htmlFor="reunion-duracion" style={labelStyle}>
                Duración (minutos)
              </label>
              <input
                id="reunion-duracion"
                name="durationMinutes"
                type="number"
                min={1}
                step={5}
                defaultValue={90}
                style={inputStyle}
              />
            </div>
            <div style={fieldStyle}>
              <label htmlFor="reunion-titulo" style={labelStyle}>
                Título (opcional)
              </label>
              <input id="reunion-titulo" name="title" maxLength={160} style={inputStyle} />
            </div>
            <div style={fieldStyle}>
              <label htmlFor="reunion-lugar" style={labelStyle}>
                Lugar (opcional)
              </label>
              <input id="reunion-lugar" name="locationText" maxLength={160} style={inputStyle} />
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
            <input type="checkbox" name="repeats" checked={repeats} onChange={(event) => setRepeats(event.target.checked)} />
            Se repite
          </label>

          {repeats ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              <div style={fieldStyle}>
                <label htmlFor="reunion-frecuencia" style={labelStyle}>
                  Cada
                </label>
                <select
                  id="reunion-frecuencia"
                  name="frequency"
                  value={frequency}
                  onChange={(event) => setFrequency(event.target.value === "monthly" ? "monthly" : "weekly")}
                  style={selectStyle}
                >
                  <option value="weekly">Semanas</option>
                  <option value="monthly">Meses</option>
                </select>
              </div>
              <div style={fieldStyle}>
                <label htmlFor="reunion-intervalo" style={labelStyle}>
                  Intervalo
                </label>
                <input id="reunion-intervalo" name="interval" type="number" min={1} defaultValue={1} style={inputStyle} />
              </div>
              {frequency === "weekly" ? (
                <fieldset style={{ ...fieldStyle, border: "none", padding: 0, margin: 0 }}>
                  <legend style={labelStyle}>Días de la semana</legend>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {WEEKDAYS.map((day) => (
                      <label key={day.value} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12.5 }}>
                        <input type="checkbox" name="weekdays" value={day.value} /> {day.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              <div style={fieldStyle}>
                <label htmlFor="reunion-hasta" style={labelStyle}>
                  Hasta (fecha)
                </label>
                <input id="reunion-hasta" name="untilDate" type="date" style={inputStyle} />
              </div>
              <div style={fieldStyle}>
                <label htmlFor="reunion-veces" style={labelStyle}>
                  …o número de reuniones
                </label>
                <input id="reunion-veces" name="count" type="number" min={1} max={200} defaultValue={10} style={inputStyle} />
              </div>
            </div>
          ) : null}

          <div>
            <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
              {pending ? "Convocando…" : "Convocar"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="shell-card list-card">
        {meetings.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "40px 24px" }}>
            <h3>Todavía no hay reuniones</h3>
            <p>Convoca la primera para poder registrar quién asiste.</p>
          </div>
        ) : (
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Reunión</th>
                  <th>Cuándo</th>
                  <th>Lugar</th>
                  <th>Asistencia</th>
                  {permissions.canManageMeetings ? <th aria-label="Acciones" /> : null}
                </tr>
              </thead>
              <tbody>
                {meetings.map((meeting) => (
                  <tr key={meeting.id}>
                    <td data-label="Reunión" style={{ fontWeight: 600 }}>
                      {meeting.title}
                      {/* Una reunión cancelada se reconoce por cancelledAt, no
                          por el estado de la actividad (ADR 0019). */}
                      {meeting.cancelledAt ? (
                        <span className="serving-chip is-danger" style={{ marginLeft: 6 }}>
                          Cancelada
                        </span>
                      ) : null}
                      {meeting.cancellationReason ? (
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
                          {meeting.cancellationReason}
                        </span>
                      ) : null}
                    </td>
                    <td data-label="Cuándo" className="serving-meta">
                      {formatDateTime(meeting.startsAt)}
                    </td>
                    <td data-label="Lugar" className="serving-meta">
                      {meeting.locationText ?? "—"}
                    </td>
                    <td data-label="Asistencia" className="serving-meta">
                      {meeting.attendanceRecordedAt ? `${meeting.attendanceCount} presentes` : "Sin registrar"}
                    </td>
                    {permissions.canManageMeetings ? (
                      <td data-label="">
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {!meeting.cancelledAt ? (
                            <>
                              {permissions.canManageAttendance ? (
                                <Link
                                  href={`/app/grupos/${groupId}/asistencia?reunion=${meeting.id}`}
                                  style={{ ...subtleButtonStyle, textDecoration: "none" }}
                                >
                                  Asistencia
                                </Link>
                              ) : null}
                              <button
                                type="button"
                                style={subtleButtonStyle}
                                onClick={() => setEditing(editing === meeting.id ? null : meeting.id)}
                              >
                                Cambiar fecha
                              </button>
                              <button
                                type="button"
                                disabled={pending}
                                style={dangerButtonStyle}
                                onClick={() => run(() => cancelarReunionAction(groupId, meeting.id))}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : null}
                        </div>
                        {editing === meeting.id ? (
                          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                            <input
                              type="datetime-local"
                              defaultValue={toLocalInputValue(meeting.startsAt)}
                              aria-label="Nueva fecha y hora"
                              id={`nueva-fecha-${meeting.id}`}
                              style={{ ...inputStyle, width: "auto" }}
                            />
                            <button
                              type="button"
                              disabled={pending}
                              style={secondaryButtonStyle(pending)}
                              onClick={() => {
                                const field = document.getElementById(`nueva-fecha-${meeting.id}`) as HTMLInputElement | null;
                                const value = field?.value ?? "";
                                if (!value) return;
                                setEditing(null);
                                run(() => cambiarFechaReunionAction(groupId, meeting.id, value));
                              }}
                            >
                              Guardar fecha
                            </button>
                          </div>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Solicitudes
// ---------------------------------------------------------------------------

function SolicitudesTab({
  groupId,
  requests,
  canResolve,
  pending,
  run,
}: {
  groupId: string;
  requests: GroupJoinRequestItem[];
  canResolve: boolean;
  pending: boolean;
  run: (action: () => Promise<GrupoState>) => void;
}) {
  if (requests.length === 0) {
    return (
      <div className="shell-card shell-empty-state" style={{ padding: "40px 24px" }}>
        <h3>No hay solicitudes pendientes</h3>
        <p>Cuando alguien pida entrar en el grupo, aparecerá aquí y en la bandeja de avisos de sus responsables.</p>
      </div>
    );
  }

  return (
    <div className="shell-card list-card">
      <div className="people-table-wrap">
        <table className="serving-table">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Mensaje</th>
              <th>Pedida</th>
              {canResolve ? <th aria-label="Acciones" /> : null}
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td data-label="Persona" style={{ fontWeight: 600 }}>
                  {request.personName}
                </td>
                <td data-label="Mensaje" className="serving-meta">
                  {request.message ?? "—"}
                </td>
                <td data-label="Pedida" className="serving-meta">
                  {formatDate(request.createdAt)}
                </td>
                {canResolve ? (
                  <td data-label="">
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        type="button"
                        disabled={pending}
                        style={subtleButtonStyle}
                        onClick={() => run(() => resolverSolicitudAction(groupId, request.id, true))}
                      >
                        Aceptar
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        style={dangerButtonStyle}
                        onClick={() => run(() => resolverSolicitudAction(groupId, request.id, false))}
                      >
                        Rechazar
                      </button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
