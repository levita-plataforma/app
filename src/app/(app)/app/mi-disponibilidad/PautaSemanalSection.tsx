"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Lock, Plus, Repeat } from "lucide-react";
import type { WeeklyUnavailability } from "@/server/availability/availability-service";
import { eliminarPautaAction, guardarPautaAction } from "./actions";
import { REASON_MAX, WEEKDAY_LABELS, weekdayLabel } from "./labels";
import { DpConfirmDelete, DpMessages, useDisponibilidadAction } from "./ui";

/**
 * Bloque 2: pauta semanal repetida. Alta y borrado (para cambiar una franja
 * se borra y se vuelve a crear, que es lo mismo y se entiende mejor).
 * La base guarda `weekday` con 0 = lunes … 6 = domingo.
 */

type FormState = { open: boolean; weekday: number; starts: string; ends: string; reason: string };

const CLOSED: FormState = { open: false, weekday: 0, starts: "", ends: "", reason: "" };

export default function PautaSemanalSection({
  timezone,
  items,
}: {
  timezone: string;
  items: WeeklyUnavailability[];
}) {
  const { pending, error, notice, setError, run, clear } = useDisponibilidadAction();
  const [form, setForm] = useState<FormState>(CLOSED);
  const firstFieldRef = useRef<HTMLSelectElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (form.open) {
      firstFieldRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      addButtonRef.current?.focus();
    }
  }, [form.open]);

  function open() {
    clear();
    setForm({ ...CLOSED, open: true });
  }

  function close() {
    returnFocus.current = true;
    setForm(CLOSED);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.starts || !form.ends) {
      setError("Indica la hora de inicio y la de fin.");
      return;
    }
    if (form.ends <= form.starts) {
      setError("La hora de fin debe ser posterior a la de inicio.");
      return;
    }
    run(
      () =>
        guardarPautaAction({
          weekday: form.weekday,
          startsTime: form.starts,
          endsTime: form.ends,
          reason: form.reason,
        }),
      "Franja semanal guardada.",
      () => {
        returnFocus.current = true;
        setForm(CLOSED);
      },
    );
  }

  return (
    <section className="shell-card dp-card" aria-labelledby="dp-pauta-title">
      <div className="dp-section-head">
        <div>
          <h2 id="dp-pauta-title">Pauta semanal</h2>
          <p className="dp-muted">
            Franjas que se repiten todas las semanas: el turno de trabajo de los sábados por la mañana,
            las clases de los martes…
          </p>
        </div>
        {!form.open ? (
          <button ref={addButtonRef} type="button" className="dp-btn is-primary" onClick={open}>
            <Plus size={15} aria-hidden="true" /> Añadir franja
          </button>
        ) : null}
      </div>

      <p className="dp-note">
        <Repeat size={13} aria-hidden="true" />
        <span>
          Las horas se interpretan en la zona horaria de la iglesia ({timezone}), no en la de tu
          dispositivo.
        </span>
      </p>

      <DpMessages error={error} notice={notice} />

      {form.open ? (
        <form className="dp-form" onSubmit={submit} noValidate>
          <h3 className="dp-form-title">Nueva franja semanal</h3>

          <div className="dp-grid dp-grid-3">
            <div className="dp-field">
              <label htmlFor="dp-pauta-dia">Día de la semana</label>
              <select
                ref={firstFieldRef}
                id="dp-pauta-dia"
                className="dp-input"
                value={form.weekday}
                onChange={(event) => setForm((prev) => ({ ...prev, weekday: Number(event.target.value) }))}
              >
                {WEEKDAY_LABELS.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="dp-field">
              <label htmlFor="dp-pauta-inicio">Desde</label>
              <input
                id="dp-pauta-inicio"
                type="time"
                className="dp-input"
                value={form.starts}
                required
                onChange={(event) => setForm((prev) => ({ ...prev, starts: event.target.value }))}
              />
            </div>
            <div className="dp-field">
              <label htmlFor="dp-pauta-fin">Hasta</label>
              <input
                id="dp-pauta-fin"
                type="time"
                className="dp-input"
                value={form.ends}
                required
                aria-describedby="dp-pauta-fin-ayuda"
                onChange={(event) => setForm((prev) => ({ ...prev, ends: event.target.value }))}
              />
              <p id="dp-pauta-fin-ayuda" className="dp-hint">
                Dentro del mismo día.
              </p>
            </div>
          </div>

          <div className="dp-field">
            <label htmlFor="dp-pauta-motivo">Motivo (opcional y privado)</label>
            <input
              id="dp-pauta-motivo"
              type="text"
              className="dp-input"
              maxLength={REASON_MAX}
              value={form.reason}
              aria-describedby="dp-pauta-motivo-ayuda"
              onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
            />
            <p id="dp-pauta-motivo-ayuda" className="dp-hint">
              Solo lo ves tú. Quien coordina ve que no estás disponible, nunca el motivo.
            </p>
          </div>

          <div className="dp-actions">
            <button type="submit" className="dp-btn is-primary" aria-busy={pending} disabled={pending}>
              Guardar franja
            </button>
            <button type="button" className="dp-btn" onClick={close} disabled={pending}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {items.length === 0 ? (
        <p className="dp-empty">
          <Repeat size={15} aria-hidden="true" /> No tienes ninguna franja semanal. Si hay un día y una
          hora en los que nunca puedes, márcalo aquí una sola vez.
        </p>
      ) : (
        <ul className="dp-list">
          {items.map((item) => {
            const text = `${weekdayLabel(item.weekday)} · ${item.startsTime}–${item.endsTime}`;
            return (
              <li key={item.id} className="dp-item">
                <div className="dp-item-main">
                  <p className="dp-item-title">{text}</p>
                  {item.reason ? (
                    <p className="dp-item-reason">
                      <Lock size={12} aria-hidden="true" /> {item.reason}
                    </p>
                  ) : null}
                </div>
                <div className="dp-actions">
                  <DpConfirmDelete
                    label="Eliminar"
                    confirmLabel="Eliminar franja"
                    message={<>¿Eliminar la franja de los {text.toLowerCase()}?</>}
                    busy={pending}
                    onConfirm={() => run(() => eliminarPautaAction(item.id), "Franja eliminada.")}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
