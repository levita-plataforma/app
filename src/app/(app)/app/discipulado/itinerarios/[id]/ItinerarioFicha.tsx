"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import {
  LEARNING_PATH_STATUS_INFO,
  PATH_PROGRESS_STATUSES,
  PATH_PROGRESS_STATUS_INFO,
  PATH_STEP_KINDS,
  PATH_STEP_KIND_INFO,
} from "@/lib/discipleship/constants";
import type {
  LearningPathItem,
  PathPersonSummary,
  PathStepItem,
  PersonPathStep,
} from "@/server/discipleship/learning-paths-service";
import {
  archivarPasoAction,
  buscarPersonasAction,
  guardarPasoAction,
  marcarProgresoAction,
  reordenarPasosAction,
  type ItinerarioState,
} from "./actions";
import {
  CHIP_CLASS,
  cardStyle,
  dangerButtonStyle,
  fieldStyle,
  formatDate,
  inputStyle,
  labelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  sectionTitleStyle,
  selectStyle,
  subtleButtonStyle,
} from "../../ui";

type Tab = "pasos" | "personas";

export default function ItinerarioFicha({
  path,
  steps,
  people,
  courses,
  personProgress,
  selectedPerson,
  canManage,
  canManageProgress,
}: {
  path: LearningPathItem;
  steps: PathStepItem[];
  people: PathPersonSummary[];
  courses: { id: string; name: string }[];
  personProgress: PersonPathStep[];
  selectedPerson: { id: string; name: string } | null;
  canManage: boolean;
  canManageProgress: boolean;
}) {
  const [tab, setTab] = useState<Tab>(selectedPerson ? "personas" : "pasos");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const info = LEARNING_PATH_STATUS_INFO[path.status];

  function run(action: () => Promise<ItinerarioState>) {
    startTransition(async () => {
      const result = await action();
      setError(result.error);
    });
  }

  return (
    <>
      <section>
        <Link
          href="/app/discipulado/itinerarios"
          style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}
        >
          ← Itinerarios
        </Link>
        <h1 style={{ fontSize: 21, fontWeight: 600, marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
          {path.name}
          <span className={CHIP_CLASS[info.tone]}>{info.label}</span>
        </h1>
        {path.description ? (
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 2 }}>{path.description}</p>
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
            ["pasos", `Pasos (${steps.filter((step) => !step.archivedAt).length})`],
            ["personas", `Personas (${people.length})`],
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

      {tab === "pasos" ? (
        <PasosTab pathId={path.id} steps={steps} courses={courses} canManage={canManage} pending={pending} run={run} />
      ) : null}

      {tab === "personas" ? (
        <PersonasTab
          pathId={path.id}
          people={people}
          personProgress={personProgress}
          selectedPerson={selectedPerson}
          canManageProgress={canManageProgress}
          pending={pending}
          run={run}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Pasos
// ---------------------------------------------------------------------------

function PasosTab({
  pathId,
  steps,
  courses,
  canManage,
  pending,
  run,
}: {
  pathId: string;
  steps: PathStepItem[];
  courses: { id: string; name: string }[];
  canManage: boolean;
  pending: boolean;
  run: (action: () => Promise<ItinerarioState>) => void;
}) {
  const [editing, setEditing] = useState<PathStepItem | null>(null);
  const [creating, setCreating] = useState(false);

  const live = steps.filter((step) => !step.archivedAt);
  const archived = steps.filter((step) => step.archivedAt);

  function move(index: number, delta: number) {
    const next = [...live];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    run(() => reordenarPasosAction(pathId, next.map((step) => step.id)));
  }

  return (
    <>
      {canManage ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            style={primaryButtonStyle()}
            onClick={() => {
              setEditing(null);
              setCreating((value) => !value);
            }}
          >
            <Plus size={14} /> Nuevo paso
          </button>
        </div>
      ) : null}

      {creating || editing ? (
        <PasoForm
          step={editing ?? undefined}
          courses={courses}
          pending={pending}
          onCancel={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={(formData) => {
            run(() => guardarPasoAction(pathId, formData));
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}

      <div className="shell-card list-card">
        {live.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "40px 24px" }}>
            <h3>Este itinerario todavía no tiene pasos</h3>
            <p>Añade el primero: puede ser un curso del catálogo o un paso que se marca a mano.</p>
          </div>
        ) : (
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Paso</th>
                  <th>Tipo</th>
                  <th>Curso</th>
                  <th>Obligatorio</th>
                  {canManage ? <th aria-label="Acciones" /> : null}
                </tr>
              </thead>
              <tbody>
                {live.map((step, index) => (
                  <tr key={step.id}>
                    <td data-label="Paso" style={{ fontWeight: 600 }}>
                      {step.stepOrder}. {step.title}
                      {step.description ? (
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
                          {step.description}
                        </span>
                      ) : null}
                    </td>
                    <td data-label="Tipo" className="serving-meta">
                      {PATH_STEP_KIND_INFO[step.kind].label}
                    </td>
                    <td data-label="Curso" className="serving-meta">
                      {step.courseName ?? "—"}
                    </td>
                    <td data-label="Obligatorio" className="serving-meta">
                      {step.isRequired ? "Sí" : "No"}
                    </td>
                    {canManage ? (
                      <td data-label="">
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            disabled={pending || index === 0}
                            aria-label={`Subir ${step.title}`}
                            style={subtleButtonStyle}
                            onClick={() => move(index, -1)}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={pending || index === live.length - 1}
                            aria-label={`Bajar ${step.title}`}
                            style={subtleButtonStyle}
                            onClick={() => move(index, 1)}
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            style={subtleButtonStyle}
                            onClick={() => {
                              setCreating(false);
                              setEditing(step);
                            }}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            style={dangerButtonStyle}
                            onClick={() => run(() => archivarPasoAction(pathId, step.id, true))}
                          >
                            Archivar
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
      </div>

      {archived.length > 0 ? (
        <div className="shell-card" style={cardStyle}>
          <h2 style={sectionTitleStyle}>Pasos archivados</h2>
          <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
            Se conservan como historial: el progreso que alguien consiguió en ellos sigue siendo legible.
          </p>
          <ul style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
            {archived.map((step) => (
              <li key={step.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13 }}>{step.title}</span>
                <span className="serving-chip is-muted">Archivado</span>
                {canManage ? (
                  <button
                    type="button"
                    disabled={pending}
                    style={subtleButtonStyle}
                    onClick={() => run(() => archivarPasoAction(pathId, step.id, false))}
                  >
                    Restaurar
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function PasoForm({
  step,
  courses,
  pending,
  onCancel,
  onSubmit,
}: {
  step?: PathStepItem;
  courses: { id: string; name: string }[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const [kind, setKind] = useState(step?.kind ?? "manual");

  return (
    <form className="shell-card" style={cardStyle} action={onSubmit} noValidate>
      <h2 style={sectionTitleStyle}>{step ? `Editar «${step.title}»` : "Nuevo paso"}</h2>
      <input type="hidden" name="id" value={step?.id ?? ""} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <div style={{ ...fieldStyle, flex: "1 1 260px" }}>
          <label htmlFor="paso-titulo" style={labelStyle}>
            Título
          </label>
          <input id="paso-titulo" name="title" defaultValue={step?.title ?? ""} required maxLength={120} style={inputStyle} />
        </div>
        <div style={fieldStyle}>
          <label htmlFor="paso-tipo" style={labelStyle}>
            Tipo
          </label>
          <select
            id="paso-tipo"
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value === "course" ? "course" : "manual")}
            style={selectStyle}
          >
            {PATH_STEP_KINDS.map((value) => (
              <option key={value} value={value}>
                {PATH_STEP_KIND_INFO[value].label}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)", marginTop: 4 }}>
            {PATH_STEP_KIND_INFO[kind].description}
          </p>
        </div>
        {kind === "course" ? (
          <div style={fieldStyle}>
            <label htmlFor="paso-curso" style={labelStyle}>
              Curso
            </label>
            <select id="paso-curso" name="courseId" defaultValue={step?.courseId ?? ""} style={selectStyle}>
              <option value="">Elige un curso…</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div style={fieldStyle}>
          <label htmlFor="paso-orden" style={labelStyle}>
            Orden
          </label>
          <input
            id="paso-orden"
            name="stepOrder"
            type="number"
            min={1}
            step={1}
            defaultValue={step?.stepOrder ?? ""}
            style={inputStyle}
          />
        </div>
        <div style={{ ...fieldStyle, justifyContent: "flex-end" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
            <input type="checkbox" name="isRequired" defaultChecked={step?.isRequired ?? true} /> Obligatorio
          </label>
        </div>
      </div>

      <div style={{ ...fieldStyle, flex: "1 1 100%" }}>
        <label htmlFor="paso-descripcion" style={labelStyle}>
          Descripción
        </label>
        <textarea
          id="paso-descripcion"
          name="description"
          rows={2}
          maxLength={1000}
          defaultValue={step?.description ?? ""}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
          {pending ? "Guardando…" : step ? "Guardar cambios" : "Añadir paso"}
        </button>
        <button type="button" style={subtleButtonStyle} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Personas y progreso
// ---------------------------------------------------------------------------

function PersonasTab({
  pathId,
  people,
  personProgress,
  selectedPerson,
  canManageProgress,
  pending,
  run,
}: {
  pathId: string;
  people: PathPersonSummary[];
  personProgress: PersonPathStep[];
  selectedPerson: { id: string; name: string } | null;
  canManageProgress: boolean;
  pending: boolean;
  run: (action: () => Promise<ItinerarioState>) => void;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [searching, startSearch] = useTransition();

  const liveSteps = personProgress.filter((step) => !step.archived);
  const archivedSteps = personProgress.filter((step) => step.archived);

  return (
    <>
      <div className="shell-card" style={cardStyle}>
        <h2 style={sectionTitleStyle}>Quién está en este itinerario</h2>
        {people.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
            Todavía nadie tiene progreso en este itinerario.
          </p>
        ) : (
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Hechos</th>
                  <th>En curso</th>
                  <th>Última señal</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.personId}>
                    <td data-label="Persona" style={{ fontWeight: 600 }}>
                      {person.personName}
                    </td>
                    <td data-label="Hechos">{person.completedSteps}</td>
                    <td data-label="En curso">{person.inProgressSteps}</td>
                    <td data-label="Última señal" className="serving-meta">
                      {formatDate(person.lastActivityAt)}
                    </td>
                    <td data-label="">
                      <Link
                        href={`/app/discipulado/itinerarios/${pathId}?persona=${person.personId}`}
                        style={{ ...subtleButtonStyle, textDecoration: "none" }}
                      >
                        Ver progreso
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canManageProgress ? (
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
            {results.map((person) => (
              <Link
                key={person.id}
                href={`/app/discipulado/itinerarios/${pathId}?persona=${person.id}`}
                style={secondaryButtonStyle()}
              >
                {person.name}
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      {selectedPerson ? (
        <div className="shell-card" style={cardStyle}>
          <h2 style={sectionTitleStyle}>Progreso de {selectedPerson.name}</h2>
          {liveSteps.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
              Este itinerario no tiene pasos vivos que mostrar.
            </p>
          ) : (
            <div className="people-table-wrap">
              <table className="serving-table">
                <thead>
                  <tr>
                    <th>Paso</th>
                    <th>Estado</th>
                    <th>Hecho el</th>
                    {canManageProgress ? <th aria-label="Acciones" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {liveSteps.map((step) => (
                    <tr key={step.pathStepId}>
                      <td data-label="Paso" style={{ fontWeight: 600 }}>
                        {step.stepOrder}. {step.title}
                        {!step.isRequired ? (
                          <span className="serving-chip is-muted" style={{ marginLeft: 6 }}>
                            Opcional
                          </span>
                        ) : null}
                      </td>
                      <td data-label="Estado">
                        <span className={CHIP_CLASS[PATH_PROGRESS_STATUS_INFO[step.status].tone]}>
                          {PATH_PROGRESS_STATUS_INFO[step.status].label}
                        </span>
                      </td>
                      <td data-label="Hecho el" className="serving-meta">
                        {formatDate(step.completedAt)}
                      </td>
                      {canManageProgress ? (
                        <td data-label="">
                          <select
                            defaultValue={step.status}
                            disabled={pending}
                            aria-label={`Cambiar el estado de ${step.title}`}
                            style={selectStyle}
                            onChange={(event) =>
                              run(() =>
                                marcarProgresoAction(pathId, step.pathStepId, selectedPerson.id, event.target.value),
                              )
                            }
                          >
                            {PATH_PROGRESS_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {PATH_PROGRESS_STATUS_INFO[status].label}
                              </option>
                            ))}
                          </select>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {archivedSteps.length > 0 ? (
            <div style={{ borderTop: "1px solid var(--shell-border)", paddingTop: 12 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600 }}>Historial</h3>
              <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)", marginTop: 2 }}>
                Pasos que ya no forman parte del itinerario, pero en los que esta persona tiene progreso.
              </p>
              <ul style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", padding: 0, marginTop: 8 }}>
                {archivedSteps.map((step) => (
                  <li key={step.pathStepId} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13 }}>{step.title}</span>
                    <span className={CHIP_CLASS[PATH_PROGRESS_STATUS_INFO[step.status].tone]}>
                      {PATH_PROGRESS_STATUS_INFO[step.status].label}
                    </span>
                    <span className="serving-meta">{formatDate(step.completedAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
