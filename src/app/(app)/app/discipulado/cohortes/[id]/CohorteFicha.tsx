"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { CalendarPlus } from "lucide-react";
import { COHORT_STATUS_INFO, ENROLLMENT_STATUS_INFO } from "@/lib/discipleship/constants";
import { GROUP_ATTENDANCE_STATUSES, GROUP_ATTENDANCE_STATUS_INFO } from "@/lib/groups/constants";
import type {
  CohortItem,
  CohortSessionItem,
  CompletionSuggestion,
  EnrollmentItem,
} from "@/server/discipleship/discipleship-service";
import {
  buscarPersonasAction,
  cambiarFechaSesionAction,
  cancelarSesionAction,
  convocarSesionAction,
  darDeBajaAction,
  darPorTerminadoAction,
  guardarAsistenciaSesionAction,
  matricularAction,
  pedirPlazaAction,
  resolverPlazaAction,
  type AsistenciaSesionState,
  type CohorteState,
} from "./actions";
import {
  CHIP_CLASS,
  cardStyle,
  dangerButtonStyle,
  fieldStyle,
  formatDate,
  formatDateTime,
  formatRatio,
  inputStyle,
  labelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionTitleStyle,
  selectStyle,
  subtleButtonStyle,
  toLocalInputValue,
} from "../../ui";

type Permissions = {
  canManage: boolean;
  canManageEnrollments: boolean;
  canManageAttendance: boolean;
};

type Tab = "matriculas" | "sesiones" | "asistencia" | "finalizacion";

export default function CohorteFicha({
  cohort,
  enrollments,
  sessions,
  suggestions,
  attendanceBySession,
  permissions,
  canRequestSeat,
}: {
  cohort: CohortItem;
  enrollments: EnrollmentItem[];
  sessions: CohortSessionItem[];
  suggestions: CompletionSuggestion[];
  attendanceBySession: Record<string, Record<string, { status: string; notes: string | null }>>;
  permissions: Permissions;
  canRequestSeat: boolean;
}) {
  const [tab, setTab] = useState<Tab>("matriculas");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const statusInfo = COHORT_STATUS_INFO[cohort.status];
  const requested = enrollments.filter((item) => item.status === "requested");
  const enrolled = enrollments.filter((item) => item.status === "enrolled");
  const others = enrollments.filter((item) => item.status !== "requested" && item.status !== "enrolled");

  function run(action: () => Promise<CohorteState>) {
    startTransition(async () => {
      const result = await action();
      setError(result.error);
    });
  }

  return (
    <>
      <section>
        <Link
          href={`/app/discipulado/cursos/${cohort.courseId}`}
          style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}
        >
          ← {cohort.courseName ?? "Curso"}
        </Link>
        <h1 style={{ fontSize: 21, fontWeight: 600, marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
          {cohort.name}
          <span className={CHIP_CLASS[statusInfo.tone]}>{statusInfo.label}</span>
        </h1>
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 2 }}>
          {cohort.campusName ?? "Toda la iglesia"} · {formatDate(cohort.startsOn)} – {formatDate(cohort.endsOn)} ·{" "}
          {cohort.capacity === null ? `${enrolled.length} matriculadas` : `${enrolled.length}/${cohort.capacity} plazas`}
        </p>
      </section>

      {error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      ) : null}

      <div className="serving-tabs" role="tablist">
        {(
          [
            ["matriculas", `Matrículas (${enrolled.length})`],
            ["sesiones", `Sesiones (${sessions.length})`],
            ["asistencia", "Asistencia"],
            ["finalizacion", `Finalización (${suggestions.filter((s) => s.suggested).length})`],
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

      {tab === "matriculas" ? (
        <MatriculasTab
          cohort={cohort}
          requested={requested}
          enrolled={enrolled}
          others={others}
          permissions={permissions}
          canRequestSeat={canRequestSeat}
          pending={pending}
          run={run}
        />
      ) : null}

      {tab === "sesiones" ? (
        <SesionesTab cohortId={cohort.id} sessions={sessions} permissions={permissions} pending={pending} run={run} />
      ) : null}

      {tab === "asistencia" ? (
        <AsistenciaTab
          cohortId={cohort.id}
          sessions={sessions}
          enrolled={enrolled}
          attendanceBySession={attendanceBySession}
          canRecord={permissions.canManageAttendance}
        />
      ) : null}

      {tab === "finalizacion" ? (
        <FinalizacionTab
          cohortId={cohort.id}
          suggestions={suggestions}
          canComplete={permissions.canManageEnrollments}
          pending={pending}
          run={run}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Matrículas
// ---------------------------------------------------------------------------

function MatriculasTab({
  cohort,
  requested,
  enrolled,
  others,
  permissions,
  canRequestSeat,
  pending,
  run,
}: {
  cohort: CohortItem;
  requested: EnrollmentItem[];
  enrolled: EnrollmentItem[];
  others: EnrollmentItem[];
  permissions: Permissions;
  canRequestSeat: boolean;
  pending: boolean;
  run: (action: () => Promise<CohorteState>) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [searching, startSearch] = useTransition();

  return (
    <>
      {permissions.canManageEnrollments && requested.length > 0 ? (
        <div className="shell-card" style={cardStyle}>
          <h2 style={sectionTitleStyle}>Plazas pedidas ({requested.length})</h2>
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Mensaje</th>
                  <th>Pedida</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {requested.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Persona" style={{ fontWeight: 600 }}>
                      {item.personName}
                    </td>
                    <td data-label="Mensaje" className="serving-meta">
                      {item.requestMessage ?? "—"}
                    </td>
                    <td data-label="Pedida" className="serving-meta">
                      {formatDate(item.requestedAt)}
                    </td>
                    <td data-label="">
                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          type="button"
                          disabled={pending}
                          style={subtleButtonStyle}
                          onClick={() => run(() => resolverPlazaAction(cohort.id, item.id, true))}
                        >
                          Aceptar
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          style={dangerButtonStyle}
                          onClick={() => run(() => resolverPlazaAction(cohort.id, item.id, false))}
                        >
                          Rechazar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="shell-card" style={cardStyle}>
        <h2 style={sectionTitleStyle}>Matriculadas ({enrolled.length})</h2>
        {enrolled.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>Todavía no hay nadie matriculado.</p>
        ) : (
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Estado</th>
                  <th>Desde</th>
                  {permissions.canManageEnrollments ? <th aria-label="Acciones" /> : null}
                </tr>
              </thead>
              <tbody>
                {enrolled.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Persona" style={{ fontWeight: 600 }}>
                      <Link href={`/app/personas/${item.personId}`} style={{ color: "var(--shell-text)", textDecoration: "none" }}>
                        {item.personName}
                      </Link>
                    </td>
                    <td data-label="Estado">
                      <span className={CHIP_CLASS[ENROLLMENT_STATUS_INFO[item.status].tone]}>
                        {ENROLLMENT_STATUS_INFO[item.status].label}
                      </span>
                    </td>
                    <td data-label="Desde" className="serving-meta">
                      {formatDate(item.enrolledAt)}
                    </td>
                    {permissions.canManageEnrollments ? (
                      <td data-label="">
                        <div style={{ display: "flex", gap: 10 }}>
                          <button
                            type="button"
                            disabled={pending}
                            style={subtleButtonStyle}
                            onClick={() => run(() => darPorTerminadoAction(cohort.id, item.id))}
                          >
                            Dar por terminado
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            style={dangerButtonStyle}
                            onClick={() => run(() => darDeBajaAction(cohort.id, item.id))}
                          >
                            Dar de baja
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {permissions.canManageEnrollments ? (
          <div
            style={{ borderTop: "1px solid var(--shell-border)", paddingTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}
          >
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar persona por nombre…"
              aria-label="Buscar persona"
              style={{ ...inputStyle, flex: "1 1 200px", width: "auto" }}
            />
            <button
              type="button"
              disabled={searching}
              style={secondaryButtonStyle(searching)}
              onClick={() => startSearch(async () => setResults(await buscarPersonasAction(search)))}
            >
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
                <button
                  type="button"
                  disabled={pending || !selected}
                  style={primaryButtonStyle(pending)}
                  onClick={() => {
                    if (!selected) return;
                    const personId = selected;
                    setSelected("");
                    run(() => matricularAction(cohort.id, personId));
                  }}
                >
                  Matricular
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {canRequestSeat && cohort.allowsRequests ? (
          <div style={{ borderTop: "1px solid var(--shell-border)", paddingTop: 12 }}>
            <button
              type="button"
              disabled={pending}
              style={secondaryButtonStyle(pending)}
              onClick={() => run(() => pedirPlazaAction(cohort.id))}
            >
              Pedir plaza en esta cohorte
            </button>
            <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)", marginTop: 4 }}>
              Quien lleva la cohorte lo verá en su bandeja de LEVITA y decidirá.
            </p>
          </div>
        ) : null}
      </div>

      {others.length > 0 ? (
        <div className="shell-card" style={cardStyle}>
          <h2 style={sectionTitleStyle}>Historial</h2>
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Estado</th>
                  <th>Cuándo</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {others.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Persona" style={{ fontWeight: 600 }}>
                      {item.personName}
                    </td>
                    <td data-label="Estado">
                      <span className={CHIP_CLASS[ENROLLMENT_STATUS_INFO[item.status].tone]}>
                        {ENROLLMENT_STATUS_INFO[item.status].label}
                      </span>
                    </td>
                    <td data-label="Cuándo" className="serving-meta">
                      {formatDate(item.completedAt ?? item.droppedAt)}
                    </td>
                    <td data-label="Nota" className="serving-meta">
                      {item.completionNote ?? item.dropReason ?? item.decisionNote ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------------

function SesionesTab({
  cohortId,
  sessions,
  permissions,
  pending,
  run,
}: {
  cohortId: string;
  sessions: CohortSessionItem[];
  permissions: Permissions;
  pending: boolean;
  run: (action: () => Promise<CohorteState>) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <>
      {permissions.canManage ? (
        <form
          className="shell-card"
          style={cardStyle}
          action={(formData) => run(() => convocarSesionAction(cohortId, formData))}
          noValidate
        >
          <h2 style={sectionTitleStyle}>
            <CalendarPlus size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Convocar una sesión
          </h2>
          <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
            La sesión no se anuncia en el calendario general de la iglesia: la ven quienes cursan la cohorte.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            <div style={fieldStyle}>
              <label htmlFor="sesion-inicio" style={labelStyle}>
                Comienzo
              </label>
              <input id="sesion-inicio" name="localStart" type="datetime-local" required style={inputStyle} />
            </div>
            <div style={fieldStyle}>
              <label htmlFor="sesion-duracion" style={labelStyle}>
                Duración (minutos)
              </label>
              <input id="sesion-duracion" name="durationMinutes" type="number" min={1} step={5} defaultValue={90} style={inputStyle} />
            </div>
            <div style={fieldStyle}>
              <label htmlFor="sesion-numero" style={labelStyle}>
                Número (opcional)
              </label>
              <input id="sesion-numero" name="sessionNumber" type="number" min={1} step={1} style={inputStyle} />
            </div>
            <div style={fieldStyle}>
              <label htmlFor="sesion-tema" style={labelStyle}>
                Tema (opcional)
              </label>
              <input id="sesion-tema" name="topic" maxLength={160} style={inputStyle} />
            </div>
            <div style={fieldStyle}>
              <label htmlFor="sesion-lugar" style={labelStyle}>
                Lugar (opcional)
              </label>
              <input id="sesion-lugar" name="locationText" maxLength={160} style={inputStyle} />
            </div>
          </div>
          <div>
            <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
              {pending ? "Convocando…" : "Convocar"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="shell-card list-card">
        {sessions.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "40px 24px" }}>
            <h3>Todavía no hay sesiones</h3>
            <p>Convoca la primera para poder registrar quién asiste.</p>
          </div>
        ) : (
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Sesión</th>
                  <th>Cuándo</th>
                  <th>Tema</th>
                  <th>Asistencia</th>
                  {permissions.canManage ? <th aria-label="Acciones" /> : null}
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id}>
                    <td data-label="Sesión" style={{ fontWeight: 600 }}>
                      {session.sessionNumber}. {session.title}
                      {/* Cancelada se reconoce por cancelledAt, no por el
                          estado de la actividad (ADR 0019). */}
                      {session.cancelledAt ? (
                        <span className="serving-chip is-danger" style={{ marginLeft: 6 }}>
                          Cancelada
                        </span>
                      ) : null}
                      {session.cancellationReason ? (
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
                          {session.cancellationReason}
                        </span>
                      ) : null}
                    </td>
                    <td data-label="Cuándo" className="serving-meta">
                      {formatDateTime(session.startsAt)}
                    </td>
                    <td data-label="Tema" className="serving-meta">
                      {session.topic ?? "—"}
                    </td>
                    <td data-label="Asistencia" className="serving-meta">
                      {session.attendanceRecordedAt ? "Registrada" : "Sin registrar"}
                    </td>
                    {permissions.canManage ? (
                      <td data-label="">
                        {!session.cancelledAt ? (
                          <>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                style={subtleButtonStyle}
                                onClick={() => setEditing(editing === session.id ? null : session.id)}
                              >
                                Cambiar fecha
                              </button>
                              <button
                                type="button"
                                disabled={pending}
                                style={dangerButtonStyle}
                                onClick={() => run(() => cancelarSesionAction(cohortId, session.id))}
                              >
                                Cancelar
                              </button>
                            </div>
                            {editing === session.id ? (
                              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                                <input
                                  type="datetime-local"
                                  id={`sesion-fecha-${session.id}`}
                                  defaultValue={toLocalInputValue(session.startsAt)}
                                  aria-label="Nueva fecha y hora"
                                  style={{ ...inputStyle, width: "auto" }}
                                />
                                <button
                                  type="button"
                                  disabled={pending}
                                  style={secondaryButtonStyle(pending)}
                                  onClick={() => {
                                    const field = document.getElementById(
                                      `sesion-fecha-${session.id}`,
                                    ) as HTMLInputElement | null;
                                    const value = field?.value ?? "";
                                    if (!value) return;
                                    setEditing(null);
                                    run(() => cambiarFechaSesionAction(cohortId, session.id, value));
                                  }}
                                >
                                  Guardar fecha
                                </button>
                              </div>
                            ) : null}
                          </>
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
// Asistencia
// ---------------------------------------------------------------------------

const initialAttendanceState: AsistenciaSesionState = { error: null, saved: null };

function AsistenciaTab({
  cohortId,
  sessions,
  enrolled,
  attendanceBySession,
  canRecord,
}: {
  cohortId: string;
  sessions: CohortSessionItem[];
  enrolled: EnrollmentItem[];
  attendanceBySession: Record<string, Record<string, { status: string; notes: string | null }>>;
  canRecord: boolean;
}) {
  const openSessions = sessions.filter((session) => !session.cancelledAt);
  const [sessionId, setSessionId] = useState(openSessions[0]?.id ?? "");

  if (!canRecord) {
    return (
      <div className="shell-card shell-empty-state" style={{ padding: "40px 24px" }}>
        <h3>No puedes registrar la asistencia de esta cohorte</h3>
        <p>Pide a quien administra la iglesia que te dé permiso para anotar la asistencia.</p>
      </div>
    );
  }

  if (openSessions.length === 0) {
    return (
      <div className="shell-card shell-empty-state" style={{ padding: "40px 24px" }}>
        <h3>No hay sesiones a las que anotar asistencia</h3>
        <p>Convoca una sesión y vuelve aquí.</p>
      </div>
    );
  }

  return (
    <div className="shell-card" style={cardStyle}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label htmlFor="asistencia-sesion" style={labelStyle}>
          Sesión
        </label>
        <select
          id="asistencia-sesion"
          value={sessionId}
          onChange={(event) => setSessionId(event.target.value)}
          style={selectStyle}
        >
          {openSessions.map((session) => (
            <option key={session.id} value={session.id}>
              {session.sessionNumber}. {session.title} · {formatDateTime(session.startsAt)}
            </option>
          ))}
        </select>
      </div>

      {sessionId ? (
        <AsistenciaSesionForm
          key={sessionId}
          cohortId={cohortId}
          sessionId={sessionId}
          enrolled={enrolled}
          recorded={attendanceBySession[sessionId] ?? {}}
        />
      ) : null}
    </div>
  );
}

function AsistenciaSesionForm({
  cohortId,
  sessionId,
  enrolled,
  recorded,
}: {
  cohortId: string;
  sessionId: string;
  enrolled: EnrollmentItem[];
  recorded: Record<string, { status: string; notes: string | null }>;
}) {
  const [state, formAction, pending] = useActionState(
    guardarAsistenciaSesionAction.bind(null, cohortId, sessionId),
    initialAttendanceState,
  );

  return (
    <form action={formAction} noValidate style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
        Solo se puede anotar a quien está matriculado. Puedes volver a guardar: se corrige lo anotado, no se duplica.
      </p>
      <div className="people-table-wrap">
        <table className="serving-table">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Asistencia</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            {enrolled.map((item) => {
              const previous = recorded[item.personId];
              return (
                <tr key={item.personId}>
                  <td data-label="Persona" style={{ fontWeight: 600 }}>
                    {item.personName}
                  </td>
                  <td data-label="Asistencia">
                    <select
                      name={`estado-${item.personId}`}
                      defaultValue={previous?.status ?? ""}
                      aria-label={`Asistencia de ${item.personName}`}
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
                  <td data-label="Nota">
                    <input
                      name={`nota-${item.personId}`}
                      defaultValue={previous?.notes ?? ""}
                      maxLength={200}
                      aria-label={`Nota sobre ${item.personName}`}
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

// ---------------------------------------------------------------------------
// Finalización
// ---------------------------------------------------------------------------

function FinalizacionTab({
  cohortId,
  suggestions,
  canComplete,
  pending,
  run,
}: {
  cohortId: string;
  suggestions: CompletionSuggestion[];
  canComplete: boolean;
  pending: boolean;
  run: (action: () => Promise<CohorteState>) => void;
}) {
  if (suggestions.length === 0) {
    return (
      <div className="shell-card shell-empty-state" style={{ padding: "40px 24px" }}>
        <h3>Todavía no hay nada que sugerir</h3>
        <p>Cuando haya sesiones con asistencia anotada, aquí verás quién ha alcanzado el umbral del curso.</p>
      </div>
    );
  }

  return (
    <div className="shell-card" style={cardStyle}>
      <h2 style={sectionTitleStyle}>Quién podría dar el curso por terminado</h2>
      <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
        Esto es una sugerencia calculada con la asistencia: quien da un curso por terminado eres tú, con un acto
        explícito que queda registrado con fecha y autor.
      </p>
      <div className="people-table-wrap">
        <table className="serving-table">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Asistencia</th>
              <th>Sugerencia</th>
              {canComplete ? <th aria-label="Acciones" /> : null}
            </tr>
          </thead>
          <tbody>
            {suggestions.map((suggestion) => (
              <tr key={suggestion.enrollmentId}>
                <td data-label="Persona" style={{ fontWeight: 600 }}>
                  {suggestion.displayName}
                </td>
                <td data-label="Asistencia" className="serving-meta">
                  {suggestion.sessionsAttended}/{suggestion.sessionsTotal} ({formatRatio(suggestion.attendanceRatio)})
                </td>
                <td data-label="Sugerencia">
                  <span className={suggestion.suggested ? CHIP_CLASS.success : CHIP_CLASS.muted}>
                    {suggestion.suggested ? "Alcanza el umbral" : "Aún no llega"}
                  </span>
                </td>
                {canComplete ? (
                  <td data-label="">
                    <button
                      type="button"
                      disabled={pending}
                      style={subtleButtonStyle}
                      onClick={() => run(() => darPorTerminadoAction(cohortId, suggestion.enrollmentId))}
                    >
                      Dar por terminado
                    </button>
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
