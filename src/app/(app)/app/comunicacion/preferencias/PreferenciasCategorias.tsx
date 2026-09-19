"use client";

import { useId, useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import type { CategoryPreference, OptionalCommunicationPurpose } from "@/server/communications/communications-service";
import { cambiarPreferenciaCategoriaAction } from "./actions";

/**
 * Etiquetas duplicadas de COMMUNICATION_PURPOSE_LABELS (communications-service.ts,
 * "server-only") a propósito: ese módulo no puede importarse en un
 * componente cliente. Mismo criterio que el resto de constantes de
 * presentación de este componente (CATEGORY_HELP, debajo).
 */
const CATEGORY_LABELS: Record<OptionalCommunicationPurpose, string> = {
  services: "Servicios",
  groups: "Grupos",
  events: "Eventos",
  discipleship: "Discipulado",
  kids: "Niños",
  pastoral: "Pastoral",
};

const CATEGORY_HELP: Record<OptionalCommunicationPurpose, string> = {
  services: "Avisos de tus equipos y turnos de servicio.",
  groups: "Comunicados de los grupos en los que participas.",
  events: "Recordatorios e información de eventos.",
  discipleship: "Avisos de tus cursos e itinerarios de discipulado.",
  kids: "Información para responsables autorizados de niños.",
  pastoral: "Comunicados generales de acompañamiento pastoral.",
};

/**
 * Preferencias por categoría OPCIONAL de comunicación (iteración sobre
 * Fase 9). Las categorías institutional/operational/system nunca aparecen
 * aquí: son siempre obligatorias, no hay fila posible en
 * communication_category_preferences para ellas (CHECK en la tabla).
 */
export default function PreferenciasCategorias({ initialPreferences }: { initialPreferences: CategoryPreference[] }) {
  const [values, setValues] = useState(initialPreferences);
  const [busy, setBusy] = useState<OptionalCommunicationPurpose | null>(null);
  const [, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const titleId = useId();

  function toggle(category: OptionalCommunicationPurpose, nextOptedOut: boolean) {
    if (busy) return;
    const previous = values.find((v) => v.category === category)?.optedOut ?? false;
    setBusy(category);
    setFeedback(null);
    setValues((current) => current.map((v) => (v.category === category ? { ...v, optedOut: nextOptedOut } : v)));
    startTransition(async () => {
      const result = await cambiarPreferenciaCategoriaAction(category, nextOptedOut);
      if (!result.ok) {
        setValues((current) => current.map((v) => (v.category === category ? { ...v, optedOut: previous } : v)));
        setFeedback({ kind: "error", message: result.error });
        setBusy(null);
        return;
      }
      setFeedback({
        kind: "success",
        message: nextOptedOut
          ? "Preferencia guardada: ya no recibirás correos ni notificaciones de esta categoría."
          : "Preferencia guardada: volverás a recibir esta categoría.",
      });
      setBusy(null);
    });
  }

  return (
    <section className="shell-card av-prefs" aria-labelledby={titleId}>
      <div>
        <h2 id={titleId} className="av-prefs-title">
          Comunicaciones opcionales por categoría
        </h2>
        <p className="av-prefs-lead">
          Puedes darte de baja de categorías concretas sin afectar a los comunicados institucionales, operativos
          ni del sistema, que siempre se reciben.
        </p>
        <p className="av-prefs-lead">
          Darte de baja de una categoría no afecta a la bandeja interna de la aplicación: solo deja de enviarse por
          correo o notificación.
        </p>
      </div>

      <ul className="av-prefs-list">
        {values.map(({ category, optedOut }) => {
          const isBusy = busy === category;
          return (
            <li className="av-pref" key={category}>
              <div className="av-pref-main">
                <p className="av-pref-label">
                  <label htmlFor={`${titleId}-${category}`}>{CATEGORY_LABELS[category]}</label>
                </p>
                <p className="av-pref-help" id={`${titleId}-${category}-help`}>
                  {CATEGORY_HELP[category]}
                </p>
              </div>
              <input
                id={`${titleId}-${category}`}
                className="av-switch"
                type="checkbox"
                role="switch"
                checked={!optedOut}
                disabled={isBusy}
                aria-busy={isBusy}
                aria-describedby={`${titleId}-${category}-help`}
                onChange={(event) => toggle(category, !event.target.checked)}
              />
            </li>
          );
        })}
      </ul>

      {feedback ? (
        <p className={`av-feedback is-${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>
          {feedback.kind === "error" ? <AlertTriangle size={14} aria-hidden="true" /> : null}
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}
