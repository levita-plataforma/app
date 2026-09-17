"use client";

import { useId, useState, useTransition } from "react";
import { Bell, Mail, Smartphone, type LucideIcon } from "lucide-react";
import type { NotificationChannel, NotificationPreferences } from "@/server/notifications/notifications-service";
import { cambiarPreferenciaAvisoAction } from "./actions";

/**
 * Preferencias por canal. La bandeja de la aplicación aparece fija: es el
 * registro del aviso y la base de datos impide desactivarla.
 *
 * Los textos no prometen ningún envío: mientras el transporte externo esté
 * desactivado, el aviso solo aparece dentro de LEVITA.
 */

type Channel = { key: Exclude<NotificationChannel, "inapp">; label: string; Icon: LucideIcon; help: string };

const CHANNELS: Channel[] = [
  {
    key: "email",
    label: "Correo electrónico",
    Icon: Mail,
    help: "Deja preparado si quieres recibir los avisos por correo.",
  },
  {
    key: "push",
    label: "Notificación en el móvil",
    Icon: Smartphone,
    help: "Deja preparado si quieres recibir los avisos como notificación del dispositivo.",
  },
];

export default function PreferenciasAvisos({
  preferences,
  externalTransportEnabled,
}: {
  preferences: NotificationPreferences;
  /** Falso mientras el envío fuera de la aplicación siga desactivado. */
  externalTransportEnabled: boolean;
}) {
  const [values, setValues] = useState(preferences);
  const [busy, setBusy] = useState<NotificationChannel | null>(null);
  const [, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const titleId = useId();

  function toggle(channel: Exclude<NotificationChannel, "inapp">, next: boolean) {
    if (busy) return;
    const previous = values[channel];
    setBusy(channel);
    setFeedback(null);
    // Optimista: se revierte si la acción falla.
    setValues((current) => ({ ...current, [channel]: next }));
    startTransition(async () => {
      try {
        const result = await cambiarPreferenciaAvisoAction(channel, next);
        if (!result.ok) {
          setValues((current) => ({ ...current, [channel]: previous }));
          setFeedback({ kind: "error", message: result.error });
          return;
        }
        setFeedback({
          kind: "success",
          message: next
            ? "Preferencia guardada: este canal queda activado."
            : "Preferencia guardada: este canal queda desactivado.",
        });
      } catch {
        setValues((current) => ({ ...current, [channel]: previous }));
        setFeedback({ kind: "error", message: "No se pudo guardar tu preferencia. Inténtalo de nuevo." });
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <section className="shell-card av-prefs" aria-labelledby={titleId}>
      <div>
        <h2 id={titleId} className="av-prefs-title">
          Cómo quieres recibir los avisos
        </h2>
        {externalTransportEnabled ? null : (
          <p className="av-prefs-lead">
            De momento los avisos <strong>solo aparecen aquí, dentro de la aplicación</strong>: LEVITA todavía no
            envía correos ni notificaciones al móvil. Puedes dejar indicada tu preferencia para cuando el envío esté
            disponible.
          </p>
        )}
        <p className="av-prefs-lead">
          La preferencia es personal: se aplica a todas las iglesias a las que perteneces.
        </p>
      </div>

      <ul className="av-prefs-list">
        <li className="av-pref">
          <span className="av-pref-icon" aria-hidden="true">
            <Bell size={16} />
          </span>
          <div className="av-pref-main">
            <p className="av-pref-label">En la aplicación</p>
            <p className="av-pref-help">
              Siempre activo: los avisos se guardan en esta bandeja y no se pueden desactivar.
            </p>
          </div>
          <span className="av-pref-fixed">Siempre activo</span>
        </li>

        {CHANNELS.map(({ key, label, Icon, help }) => {
          const checked = values[key];
          const isBusy = busy === key;
          return (
            <li className="av-pref" key={key}>
              <span className="av-pref-icon" aria-hidden="true">
                <Icon size={16} />
              </span>
              <div className="av-pref-main">
                <p className="av-pref-label">
                  <label htmlFor={`${titleId}-${key}`}>{label}</label>
                </p>
                <p className="av-pref-help" id={`${titleId}-${key}-help`}>
                  {help}
                  {externalTransportEnabled ? "" : " Hoy no sale nada de LEVITA por este canal."}
                </p>
              </div>
              <input
                id={`${titleId}-${key}`}
                className="av-switch"
                type="checkbox"
                role="switch"
                checked={checked}
                disabled={isBusy}
                aria-busy={isBusy}
                aria-describedby={`${titleId}-${key}-help`}
                onChange={(event) => toggle(key, event.target.checked)}
              />
            </li>
          );
        })}
      </ul>

      {feedback ? (
        <p className={`av-feedback is-${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}
