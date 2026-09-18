"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarOff, Lock, Plus } from "lucide-react";
import { formatActivityRange, timeZoneAbbreviation, toLocalInputValue } from "@/lib/activities/time";
import type { UnavailabilityPeriod } from "@/server/availability/availability-service";
import { eliminarPeriodoAction, guardarPeriodoAction } from "./actions";
import { REASON_MAX } from "./labels";
import { DpConfirmDelete, DpMessages, useDisponibilidadAction } from "./ui";

/**
 * Bloque 1: periodos concretos en los que la persona no puede servir.
 * Alta, edición y borrado. El motivo es opcional y privado.
 */

type FormState = { open: boolean; id: string | null; starts: string; ends: string; reason: string };

const CLOSED: FormState = { open: false, id: null, starts: "", ends: "", reason: "" };

function rangeText(period: UnavailabilityPeriod, timezone: string): string {
  return `${formatActivityRange(period.startsAt, period.endsAt, timezone)} (${timeZoneAbbreviation(
    period.startsAt,
    timezone,
  )})`;
}

export default function PeriodosSection({
  timezone,
  upcoming,
  past,
}: {
  timezone: string;
  upcoming: UnavailabilityPeriod[];
  past: UnavailabilityPeriod[];
}) {
  const { pending, error, notice, setError, run, clear } = useDisponibilidadAction();
  const [form, setForm] = useState<FormState>(CLOSED);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (form.open) {
      firstFieldRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      addButtonRef.current?.focus();
    }
    // form.id entra en las dependencias para que, al pasar de editar un
    // periodo a editar otro sin cerrar, el foco vuelva al primer campo.
  }, [form.open, form.id]);

  function openNew() {
    clear();
    setForm({ open: true, id: null, starts: "", ends: "", reason: "" });
  }

  function openEdit(period: UnavailabilityPeriod) {
    clear();
    setForm({
      open: true,
      id: period.id,
      starts: toLocalInputValue(period.startsAt, timezone),
      ends: toLocalInputValue(period.endsAt, timezone),
      reason: period.reason ?? "",
    });
  }

  function close() {
    returnFocus.current = true;
    setForm(CLOSED);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.starts || !form.ends) {
      setError("Indica la fecha y la hora de inicio y de fin.");
      return;
    }
    // Las dos cadenas están en el mismo formato y la misma zona, así que
    // compararlas como texto ordena igual que comparar los instantes.
    if (form.ends <= form.starts) {
      setError("El fin del periodo debe ser posterior al inicio.");
      return;
    }
    const editing = form.id !== null;
    run(
      () =>
        guardarPeriodoAction({
          id: form.id,
          startsLocal: form.starts,
          endsLocal: form.ends,
          reason: form.reason,
        }),
      editing ? "Periodo actualizado." : "Periodo guardado.",
      () => {
        returnFocus.current = true;
        setForm(CLOSED);
      },
    );
  }

  function remove(period: UnavailabilityPeriod) {
    run(() => eliminarPeriodoAction(period.id), "Periodo eliminado.");
  }

  return (
    <section className="shell-card dp-card" aria-labelledby="dp-periodos-title">
      <div className="dp-section-head">
        <div>
          <h2 id="dp-periodos-title">Periodos en los que no puedes servir</h2>
          <p className="dp-muted">
            Vacaciones, viajes, exámenes, una temporada de descanso… Indica desde cuándo y hasta cuándo,
            con la hora. Las horas son las de la iglesia ({timezone}).
          </p>
        </div>
        {!form.open ? (
          <button ref={addButtonRef} type="button" className="dp-btn is-primary" onClick={openNew}>
            <Plus size={15} aria-hidden="true" /> Añadir periodo
          </button>
        ) : null}
      </div>

      <p className="dp-privacy">
        <Lock size={13} aria-hidden="true" />
        <span>
          El motivo es opcional y <strong>solo lo ves tú</strong>: quien coordina únicamente ve que esos
          días no estás disponible, nunca por qué.
        </span>
      </p>

      <DpMessages error={error} notice={notice} />

      {form.open ? (
        <form className="dp-form" onSubmit={submit} noValidate>
          <h3 className="dp-form-title">{form.id ? "Editar periodo" : "Nuevo periodo"}</h3>

          <div className="dp-grid">
            <div className="dp-field">
              <label htmlFor="dp-periodo-inicio">Desde</label>
              <input
                ref={firstFieldRef}
                id="dp-periodo-inicio"
                type="datetime-local"
                className="dp-input"
                value={form.starts}
                required
                onChange={(event) => setForm((prev) => ({ ...prev, starts: event.target.value }))}
              />
            </div>
            <div className="dp-field">
              <label htmlFor="dp-periodo-fin">Hasta</label>
              <input
                id="dp-periodo-fin"
                type="datetime-local"
                className="dp-input"
                value={form.ends}
                required
                min={form.starts || undefined}
                aria-describedby="dp-periodo-fin-ayuda"
                onChange={(event) => setForm((prev) => ({ ...prev, ends: event.target.value }))}
              />
              <p id="dp-periodo-fin-ayuda" className="dp-hint">
                Tiene que ser posterior al inicio.
              </p>
            </div>
          </div>

          <div className="dp-field">
            <label htmlFor="dp-periodo-motivo">Motivo (opcional y privado)</label>
            <textarea
              id="dp-periodo-motivo"
              className="dp-input dp-textarea"
              rows={2}
              maxLength={REASON_MAX}
              value={form.reason}
              aria-describedby="dp-periodo-motivo-ayuda"
              onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
            />
            <p id="dp-periodo-motivo-ayuda" className="dp-hint">
              Te sirve para acordarte. No sale de aquí: nadie más lo lee.
            </p>
          </div>

          <div className="dp-actions">
            <button type="submit" className="dp-btn is-primary" aria-busy={pending} disabled={pending}>
              {form.id ? "Guardar cambios" : "Guardar periodo"}
            </button>
            <button type="button" className="dp-btn" onClick={close} disabled={pending}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <h3 className="dp-list-title">Próximos</h3>
      {upcoming.length === 0 ? (
        <p className="dp-empty">
          <CalendarOff size={15} aria-hidden="true" /> No has marcado ningún periodo próximo. Mientras no
          lo hagas, cuentas como disponible.
        </p>
      ) : (
        <ul className="dp-list">
          {upcoming.map((period) => (
            <li key={period.id} className="dp-item">
              <div className="dp-item-main">
                <p className="dp-item-title">{rangeText(period, timezone)}</p>
                {period.reason ? (
                  <p className="dp-item-reason">
                    <Lock size={12} aria-hidden="true" /> {period.reason}
                  </p>
                ) : null}
              </div>
              <div className="dp-actions">
                <button
                  type="button"
                  className="dp-btn is-ghost"
                  aria-busy={pending}
                  disabled={pending}
                  onClick={() => openEdit(period)}
                >
                  Editar
                </button>
                <DpConfirmDelete
                  label="Eliminar"
                  confirmLabel="Eliminar periodo"
                  message={<>¿Eliminar el periodo {rangeText(period, timezone)}? Volverás a contar como disponible esos días.</>}
                  busy={pending}
                  onConfirm={() => remove(period)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {past.length > 0 ? (
        <details className="dp-details">
          <summary>Periodos pasados recientes ({past.length})</summary>
          <ul className="dp-list">
            {past.map((period) => (
              <li key={period.id} className="dp-item is-past">
                <div className="dp-item-main">
                  <p className="dp-item-title">{rangeText(period, timezone)}</p>
                  {period.reason ? (
                    <p className="dp-item-reason">
                      <Lock size={12} aria-hidden="true" /> {period.reason}
                    </p>
                  ) : null}
                </div>
                <div className="dp-actions">
                  <DpConfirmDelete
                    label="Eliminar"
                    confirmLabel="Eliminar periodo"
                    message={<>¿Eliminar el periodo {rangeText(period, timezone)}? Ya ha pasado, así que no cambia nada de lo que viene.</>}
                    busy={pending}
                    onConfirm={() => remove(period)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
