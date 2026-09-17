"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Search } from "lucide-react";
import type { AssignmentAttempt, EligibilityResult } from "@/server/assignments/assignments-service";
import {
  previewEligibilityAction,
  searchCandidatesAction,
  type CandidatePerson,
  type EquipoResult,
} from "./actions";
import { CodeList, EqChip, EqMessages, useEquipoAction } from "./ui";

export type PickerSubmit = {
  label: string;
  primary?: boolean;
  submit: (personId: string, acknowledgeWarnings: boolean) => Promise<EquipoResult<{ attempt: AssignmentAttempt }>>;
  /** Mensaje de éxito cuando se crea (no repetida). */
  successMessage: (personName: string) => string;
};

type Props = {
  title: string;
  activityPositionId: string;
  serviceAreaId: string | null;
  /** Personas con asignación vigente en el puesto: se marcan y no se pueden elegir. */
  assignedPersonIds: ReadonlySet<string>;
  help: string;
  submits: PickerSubmit[];
  onClose: () => void;
  onDone: (message: string) => void;
};

const DEBOUNCE_MS = 300;

/**
 * Buscador de personas con evaluación de elegibilidad. Bloqueos en rojo,
 * avisos en ámbar; con avisos hay que confirmar explícitamente la revisión.
 */
export default function PersonPicker(props: Props) {
  const { activityPositionId, serviceAreaId, assignedPersonIds } = props;
  const baseId = useId();
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState<CandidatePerson[]>([]);
  const [searching, setSearching] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const requestRef = useRef(0);

  const [selected, setSelected] = useState<CandidatePerson | null>(null);
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();
  const [acknowledged, setAcknowledged] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const action = useEquipoAction();

  useEffect(() => {
    const request = ++requestRef.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const result = await searchCandidatesAction(serviceAreaId, search);
        if (request !== requestRef.current) return;
        if (result.error !== null) {
          setSearchError(result.error);
          setPeople([]);
        } else {
          setSearchError(null);
          setPeople(result.people);
        }
      } catch {
        if (request === requestRef.current) setSearchError("No se pudo buscar personas. Inténtalo de nuevo.");
      } finally {
        if (request === requestRef.current) setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, serviceAreaId]);

  function choose(person: CandidatePerson) {
    setSelected(person);
    setEligibility(null);
    setPreviewError(null);
    setAcknowledged(false);
    setBlockedMessage(null);
    action.clear();
    startPreview(async () => {
      try {
        const result = await previewEligibilityAction(activityPositionId, person.id);
        if (result.error !== null) setPreviewError(result.error);
        else setEligibility(result.eligibility);
      } catch {
        setPreviewError("No se pudo evaluar a la persona. Inténtalo de nuevo.");
      }
    });
  }

  function submit(option: PickerSubmit) {
    if (!selected) return;
    const person = selected;
    setBlockedMessage(null);
    action.run(
      () => option.submit(person.id, acknowledged),
      ({ attempt }) => {
        if (attempt.kind === "needs_confirmation") {
          // Avisos que no estaban en la vista previa: se muestran y se pide revisarlos.
          setEligibility((prev) => ({ blocking: prev?.blocking ?? [], warnings: attempt.warnings }));
          setAcknowledged(false);
          return "Hay avisos que revisar antes de continuar. Márcalos como revisados y vuelve a intentarlo.";
        }
        if (attempt.kind === "blocked") {
          setEligibility((prev) => ({ blocking: attempt.blocking, warnings: prev?.warnings ?? [] }));
          setBlockedMessage(attempt.message);
          return null;
        }
        props.onDone(attempt.replayed ? `${person.name} ya estaba asignada en este puesto.` : option.successMessage(person.name));
        return null;
      },
    );
  }

  const blocking = eligibility?.blocking ?? [];
  const warnings = eligibility?.warnings ?? [];
  const canSubmit =
    selected !== null &&
    eligibility !== null &&
    !previewing &&
    !action.pending &&
    blocking.length === 0 &&
    (warnings.length === 0 || acknowledged);

  return (
    <div className="eq-picker" role="group" aria-labelledby={`${baseId}-title`}>
      <div className="eq-picker-head">
        <h4 id={`${baseId}-title`}>{props.title}</h4>
        <button type="button" className="eq-btn is-ghost" onClick={props.onClose}>
          Cerrar
        </button>
      </div>

      <div className="eq-field">
        <label htmlFor={`${baseId}-search`}>Buscar persona</label>
        <div className="eq-search">
          <Search size={15} aria-hidden="true" />
          <input
            id={`${baseId}-search`}
            type="search"
            value={search}
            autoComplete="off"
            placeholder="Nombre o apellidos"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <p className="eq-muted" aria-live="polite">
          {searching
            ? "Buscando…"
            : searchError
              ? ""
              : people.length === 0
                ? "No hay personas que coincidan."
                : serviceAreaId
                  ? "Primero, las personas que sirven en el área."
                  : `${people.length} ${people.length === 1 ? "persona" : "personas"}`}
        </p>
        <EqMessages error={searchError} />
      </div>

      {people.length > 0 ? (
        <ul className="eq-results" aria-label="Personas encontradas">
          {people.map((person) => {
            const already = assignedPersonIds.has(person.id);
            const isSelected = selected?.id === person.id;
            return (
              <li key={person.id}>
                <button
                  type="button"
                  className={`eq-result${isSelected ? " is-selected" : ""}`}
                  aria-pressed={isSelected}
                  disabled={already}
                  onClick={() => choose(person)}
                >
                  <span className="eq-result-name">{person.name}</span>
                  <span className="eq-chips">
                    {person.isAreaMember ? <EqChip tone="success">Miembro del área</EqChip> : null}
                    {!person.hasAccount ? <EqChip tone="muted">Sin cuenta</EqChip> : null}
                    {already ? <EqChip tone="muted">Ya asignada</EqChip> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {selected ? (
        <div className="eq-eligibility" aria-live="polite">
          <p className="eq-eligibility-title">
            <strong>{selected.name}</strong>
            {!selected.hasAccount ? " · sin cuenta: podrás registrar su respuesta como coordinador" : ""}
          </p>
          {previewing ? <p className="eq-muted">Comprobando si puede servir en este puesto…</p> : null}
          <EqMessages error={previewError} />
          {eligibility && !previewing ? (
            blocking.length === 0 && warnings.length === 0 ? (
              <p className="eq-ok">Cumple las condiciones del puesto.</p>
            ) : (
              <>
                {blocking.length > 0 ? (
                  <div className="eq-box is-danger" role="alert">
                    <strong>{blockedMessage ?? "No se puede asignar:"}</strong>
                    <CodeList codes={blocking} tone="danger" />
                  </div>
                ) : null}
                {warnings.length > 0 ? (
                  <div className="eq-box is-warning">
                    <strong>Avisos (se puede continuar confirmándolo; queda registrado):</strong>
                    <CodeList codes={warnings} tone="warning" />
                    {blocking.length === 0 ? (
                      <label className="eq-check">
                        <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                        He revisado los avisos
                      </label>
                    ) : null}
                  </div>
                ) : null}
              </>
            )
          ) : null}
        </div>
      ) : null}

      <p className="eq-muted">{props.help}</p>
      <div className="eq-actions">
        {props.submits.map((option) => (
          <button
            key={option.label}
            type="button"
            className={`eq-btn${option.primary ? " is-primary" : ""}`}
            disabled={!canSubmit}
            onClick={() => submit(option)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <EqMessages error={action.error} notice={action.notice} />
    </div>
  );
}
