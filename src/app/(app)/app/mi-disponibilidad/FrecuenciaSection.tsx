"use client";

import { useState, type FormEvent } from "react";
import { Info } from "lucide-react";
import type { AreaFrequencyPreference, FrequencyPreference } from "@/server/availability/availability-service";
import { guardarFrecuenciaAction } from "./actions";
import { MAX_ACTIVITIES_LIMIT } from "./labels";
import { DpMessages, useDisponibilidadAction } from "./ui";

/**
 * Bloque 3: con qué frecuencia quiere servir la persona. Máximo de
 * actividades al mes, general y afinable por área (solo las áreas en las que
 * es miembro activo). Es una preferencia: superarla añade el aviso de
 * elegibilidad `frequency_exceeded`, que quien coordina ve al asignar, y nunca
 * bloquea. Ese aviso no genera ninguna notificación ni entra en la bandeja,
 * así que los textos de esta pantalla no pueden decir que se avise a nadie.
 *
 * Ojo con la diferencia que fija la migración: un área **sin** preferencia
 * propia hereda el máximo general; un área **con** preferencia y el campo
 * vacío queda expresamente sin límite, aunque el general sí lo tenga.
 */

const GLOBAL_KEY = "general";

function toInputValue(preference: { maxActivitiesPerMonth: number | null }): string {
  return preference.maxActivitiesPerMonth === null ? "" : String(preference.maxActivitiesPerMonth);
}

function globalStatus(global: FrequencyPreference): string {
  if (!global.isSet || global.maxActivitiesPerMonth === null) return "Ahora mismo: sin límite.";
  if (global.maxActivitiesPerMonth === 0) return "Ahora mismo: prefieres no servir en ninguna actividad.";
  return `Ahora mismo: hasta ${global.maxActivitiesPerMonth} ${
    global.maxActivitiesPerMonth === 1 ? "actividad" : "actividades"
  } al mes.`;
}

function areaStatus(area: AreaFrequencyPreference, global: FrequencyPreference): string {
  if (!area.isSet) {
    return global.isSet && global.maxActivitiesPerMonth !== null
      ? `Ahora mismo: se aplica el máximo general (${global.maxActivitiesPerMonth} al mes).`
      : "Ahora mismo: se aplica el máximo general (sin límite).";
  }
  if (area.maxActivitiesPerMonth === null) return "Ahora mismo: sin límite en esta área.";
  if (area.maxActivitiesPerMonth === 0) return "Ahora mismo: prefieres no servir en esta área.";
  return `Ahora mismo: hasta ${area.maxActivitiesPerMonth} ${
    area.maxActivitiesPerMonth === 1 ? "actividad" : "actividades"
  } al mes en esta área.`;
}

export default function FrecuenciaSection({
  global,
  areas,
}: {
  global: FrequencyPreference;
  areas: AreaFrequencyPreference[];
}) {
  const { pending, error, notice, setError, run } = useDisponibilidadAction();
  // Solo se guarda en el cliente lo que la persona ha tecleado y aún no se ha
  // guardado. Lo demás se lee siempre de lo que trae el servidor, así que tras
  // guardar los campos muestran lo que hay de verdad en la base de datos.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  function valueOf(key: string, preference: { maxActivitiesPerMonth: number | null }): string {
    return edits[key] ?? toInputValue(preference);
  }

  function forget(key: string) {
    setEdits((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function submit(
    event: FormEvent<HTMLFormElement>,
    preference: FrequencyPreference,
    label: string,
  ) {
    event.preventDefault();
    const key = preference.serviceAreaId ?? GLOBAL_KEY;
    const raw = valueOf(key, preference).trim();
    let max: number | null = null;
    if (raw !== "") {
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 0) {
        setError("Escribe un número entero de 0 en adelante, o deja el campo vacío para no poner límite.");
        return;
      }
      if (parsed > MAX_ACTIVITIES_LIMIT) {
        setError(`Como máximo se pueden indicar ${MAX_ACTIVITIES_LIMIT} actividades al mes.`);
        return;
      }
      max = parsed;
    }
    setSavingKey(key);
    run(
      () => guardarFrecuenciaAction(preference.serviceAreaId, max),
      `Preferencia guardada (${label}).`,
      () => forget(key),
    );
  }

  return (
    <section className="shell-card dp-card" aria-labelledby="dp-frecuencia-title">
      <div className="dp-section-head">
        <div>
          <h2 id="dp-frecuencia-title">Con qué frecuencia quieres servir</h2>
          <p className="dp-muted">
            Cuántas actividades al mes te vienen bien como mucho. Dos puestos de la misma actividad
            cuentan como una sola.
          </p>
        </div>
      </div>

      <p className="dp-note">
        <Info size={13} aria-hidden="true" />
        <span>
          Es una <strong>preferencia</strong>, no un bloqueo: si se supera, quien coordina lo ve al
          asignarte y decide. No se envía ningún aviso a nadie. Nadie deja de poder contar contigo por
          esto.
        </span>
      </p>

      <DpMessages error={error} notice={notice} />

      <ul className="dp-prefs">
        <li className="dp-pref">
          <form
            className="dp-pref-form"
            onSubmit={(event) => submit(event, global, "máximo general")}
            noValidate
          >
            <div className="dp-field dp-pref-field">
              <label htmlFor="dp-frecuencia-general">Máximo general (todas las áreas)</label>
              <input
                id="dp-frecuencia-general"
                type="number"
                inputMode="numeric"
                className="dp-input dp-number"
                min={0}
                max={MAX_ACTIVITIES_LIMIT}
                step={1}
                placeholder="Sin límite"
                value={valueOf(GLOBAL_KEY, global)}
                aria-describedby="dp-frecuencia-general-ayuda"
                onChange={(event) =>
                  setEdits((prev) => ({ ...prev, [GLOBAL_KEY]: event.target.value }))
                }
              />
              <p id="dp-frecuencia-general-ayuda" className="dp-hint">
                {globalStatus(global)} Deja el campo vacío para no poner límite.
              </p>
            </div>
            <button
              type="submit"
              className="dp-btn is-primary"
              aria-busy={pending && savingKey === GLOBAL_KEY}
              disabled={pending}
            >
              Guardar
            </button>
          </form>
        </li>

        {areas.map((area) => {
          const fieldId = `dp-frecuencia-${area.serviceAreaId}`;
          return (
            <li key={area.serviceAreaId} className="dp-pref">
              <form
                className="dp-pref-form"
                onSubmit={(event) => submit(event, area, area.serviceAreaName)}
                noValidate
              >
                <div className="dp-field dp-pref-field">
                  <label htmlFor={fieldId}>{area.serviceAreaName}</label>
                  <input
                    id={fieldId}
                    type="number"
                    inputMode="numeric"
                    className="dp-input dp-number"
                    min={0}
                    max={MAX_ACTIVITIES_LIMIT}
                    step={1}
                    placeholder={area.isSet ? "Sin límite" : "Máximo general"}
                    value={valueOf(area.serviceAreaId, area)}
                    aria-describedby={`${fieldId}-ayuda`}
                    onChange={(event) =>
                      setEdits((prev) => ({ ...prev, [area.serviceAreaId]: event.target.value }))
                    }
                  />
                  <p id={`${fieldId}-ayuda`} className="dp-hint">
                    {areaStatus(area, global)} Si guardas el campo vacío, esta área queda sin límite
                    aunque el general lo tenga.
                  </p>
                </div>
                <button
                  type="submit"
                  className="dp-btn"
                  aria-busy={pending && savingKey === area.serviceAreaId}
                  disabled={pending}
                >
                  Guardar
                </button>
              </form>
            </li>
          );
        })}
      </ul>

      {areas.length === 0 ? (
        <p className="dp-empty">
          Todavía no eres miembro activo de ninguna área de servicio, así que de momento solo puedes
          ajustar el máximo general.
        </p>
      ) : null}
    </section>
  );
}
