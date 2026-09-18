"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import { ACTIVITY_VISIBILITIES, VISIBILITY_INFO, type ActivityVisibility } from "@/lib/activities/constants";
import { primaryButtonStyle, secondaryButtonStyle } from "../ui";
import { crearEventoDesdeCeroAction, crearEventoDesdeActividadAction, type NuevoEventoState } from "./actions";

export type CandidateActivity = {
  id: string;
  title: string;
  startsAt: string | null;
  status: string;
  campusName: string | null;
};

type Props = {
  campuses: { id: string; name: string; timezone: string | null }[];
  churchTimezone: string;
  forms: { id: string; name: string }[];
  candidates: CandidateActivity[];
};

const initialState: NuevoEventoState = { error: null };

export default function NuevoEventoForm({ campuses, churchTimezone, forms, candidates }: Props) {
  const [mode, setMode] = useState<"scratch" | "activity">("scratch");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <nav className="serving-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "scratch"} onClick={() => setMode("scratch")} className="serving-tab">
          Desde cero
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "activity"}
          onClick={() => setMode("activity")}
          className="serving-tab"
        >
          Desde actividad existente
        </button>
      </nav>

      {mode === "scratch" ? (
        <ScratchForm campuses={campuses} churchTimezone={churchTimezone} forms={forms} />
      ) : (
        <ActivityForm candidates={candidates} forms={forms} />
      )}
    </div>
  );
}

function EventContentFields({ forms }: { forms: { id: string; name: string }[] }) {
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [waitlistEnabled, setWaitlistEnabled] = useState(false);

  return (
    <div className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 13, fontWeight: 600 }}>Contenido público del evento</p>

      <div>
        <label htmlFor="eventVisibility" style={authLabelStyle}>
          Visibilidad del evento (página pública)
        </label>
        <select id="eventVisibility" name="eventVisibility" defaultValue="internal" style={{ ...authInputStyle, width: "100%" }}>
          <option value="internal">Interno</option>
          <option value="members">Miembros</option>
          <option value="public">Público</option>
        </select>
      </div>

      <div>
        <label htmlFor="shortDescription" style={authLabelStyle}>
          Descripción corta
        </label>
        <input id="shortDescription" name="shortDescription" style={{ ...authInputStyle, width: "100%" }} />
      </div>

      <div>
        <label htmlFor="publicDescription" style={authLabelStyle}>
          Descripción pública
        </label>
        <textarea id="publicDescription" name="publicDescription" rows={4} style={{ ...authInputStyle, width: "100%" }} />
      </div>

      <div>
        <label htmlFor="coverImageUrl" style={authLabelStyle}>
          Imagen de portada (URL https)
        </label>
        <input
          id="coverImageUrl"
          name="coverImageUrl"
          type="url"
          placeholder="https://…"
          style={{ ...authInputStyle, width: "100%" }}
        />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
        <input
          type="checkbox"
          name="registrationEnabled"
          checked={registrationEnabled}
          onChange={(e) => setRegistrationEnabled(e.target.checked)}
        />
        Permitir inscripción
      </label>

      {registrationEnabled ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingLeft: 4, borderLeft: "2px solid var(--shell-border)" }}>
          <div className="serving-toolbar">
            <div style={{ flex: "1 1 180px" }}>
              <label htmlFor="registrationOpensAt" style={authLabelStyle}>
                Apertura de inscripción
              </label>
              <input
                id="registrationOpensAt"
                name="registrationOpensAt"
                type="datetime-local"
                style={{ ...authInputStyle, width: "100%" }}
              />
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <label htmlFor="registrationClosesAt" style={authLabelStyle}>
                Cierre de inscripción
              </label>
              <input
                id="registrationClosesAt"
                name="registrationClosesAt"
                type="datetime-local"
                style={{ ...authInputStyle, width: "100%" }}
              />
            </div>
          </div>

          <div className="serving-toolbar">
            <div style={{ flex: "1 1 120px" }}>
              <label htmlFor="capacity" style={authLabelStyle}>
                Aforo
              </label>
              <input id="capacity" name="capacity" type="number" min={0} style={{ ...authInputStyle, width: "100%" }} />
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <label htmlFor="registrationType" style={authLabelStyle}>
                Tipo de inscripción
              </label>
              <select id="registrationType" name="registrationType" defaultValue="individual" style={{ ...authInputStyle, width: "100%" }}>
                <option value="individual">Individual</option>
                <option value="household">Familiar</option>
                <option value="group">Grupo</option>
              </select>
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <input
              type="checkbox"
              name="waitlistEnabled"
              checked={waitlistEnabled}
              onChange={(e) => setWaitlistEnabled(e.target.checked)}
            />
            Habilitar lista de espera
          </label>

          {waitlistEnabled ? (
            <div style={{ maxWidth: 200 }}>
              <label htmlFor="maxWaitlist" style={authLabelStyle}>
                Máximo en lista de espera
              </label>
              <input id="maxWaitlist" name="maxWaitlist" type="number" min={0} style={{ ...authInputStyle, width: "100%" }} />
            </div>
          ) : null}

          <div>
            <label htmlFor="formId" style={authLabelStyle}>
              Formulario de inscripción
            </label>
            <select id="formId" name="formId" defaultValue="" style={{ ...authInputStyle, width: "100%" }}>
              <option value="">Sin formulario</option>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div className="serving-toolbar">
            <div style={{ flex: "1 1 180px" }}>
              <label htmlFor="contactEmail" style={authLabelStyle}>
                Email de contacto
              </label>
              <input id="contactEmail" name="contactEmail" type="email" style={{ ...authInputStyle, width: "100%" }} />
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <label htmlFor="contactPhone" style={authLabelStyle}>
                Teléfono de contacto
              </label>
              <input id="contactPhone" name="contactPhone" style={{ ...authInputStyle, width: "100%" }} />
            </div>
          </div>

          <div>
            <label htmlFor="confirmationMessage" style={authLabelStyle}>
              Mensaje de confirmación
            </label>
            <textarea id="confirmationMessage" name="confirmationMessage" rows={2} style={{ ...authInputStyle, width: "100%" }} />
          </div>

          <div>
            <label htmlFor="cancellationPolicy" style={authLabelStyle}>
              Política de cancelación
            </label>
            <textarea id="cancellationPolicy" name="cancellationPolicy" rows={2} style={{ ...authInputStyle, width: "100%" }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ScratchForm({
  campuses,
  churchTimezone,
  forms,
}: {
  campuses: { id: string; name: string; timezone: string | null }[];
  churchTimezone: string;
  forms: { id: string; name: string }[];
}) {
  const requestIdRef = useRef<string | null>(null);
  const [state, formAction, pending] = useActionState<NuevoEventoState, FormData>(async (prev, formData) => {
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    formData.set("requestId", requestIdRef.current);
    return crearEventoDesdeCeroAction(prev, formData);
  }, initialState);

  return (
    <form action={formAction} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>Datos de la actividad</p>

        <div>
          <label htmlFor="title" style={authLabelStyle}>
            Título
          </label>
          <input id="title" name="title" required style={{ ...authInputStyle, width: "100%" }} />
        </div>

        <div>
          <label htmlFor="description" style={authLabelStyle}>
            Descripción interna
          </label>
          <textarea id="description" name="description" rows={3} style={{ ...authInputStyle, width: "100%" }} />
        </div>

        {campuses.length > 0 ? (
          <div>
            <label htmlFor="campusId" style={authLabelStyle}>
              Sede
            </label>
            <select id="campusId" name="campusId" defaultValue="" style={{ ...authInputStyle, width: "100%" }}>
              <option value="">Toda la iglesia</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="serving-toolbar">
          <div style={{ flex: "1 1 200px" }}>
            <label htmlFor="localStart" style={authLabelStyle}>
              Inicio
            </label>
            <input id="localStart" name="localStart" type="datetime-local" required style={{ ...authInputStyle, width: "100%" }} />
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label htmlFor="localEnd" style={authLabelStyle}>
              Fin
            </label>
            <input id="localEnd" name="localEnd" type="datetime-local" required style={{ ...authInputStyle, width: "100%" }} />
          </div>
        </div>

        <div>
          <label htmlFor="timezone" style={authLabelStyle}>
            Zona horaria (opcional, por defecto {churchTimezone})
          </label>
          <input id="timezone" name="timezone" placeholder={churchTimezone} style={{ ...authInputStyle, width: "100%" }} />
        </div>

        <div>
          <label htmlFor="locationText" style={authLabelStyle}>
            Lugar
          </label>
          <input id="locationText" name="locationText" style={{ ...authInputStyle, width: "100%" }} />
        </div>

        <div>
          <label htmlFor="activityVisibility" style={authLabelStyle}>
            Visibilidad de la actividad
          </label>
          <select id="activityVisibility" name="activityVisibility" defaultValue="members" style={{ ...authInputStyle, width: "100%" }}>
            {ACTIVITY_VISIBILITIES.map((v: ActivityVisibility) => (
              <option key={v} value={v}>
                {VISIBILITY_INFO[v].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <EventContentFields forms={forms} />

      {state.error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {state.error}
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
          {pending ? "Creando…" : "Crear evento"}
        </button>
        <Link href="/app/eventos" style={secondaryButtonStyle()}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function ActivityForm({ candidates, forms }: { candidates: CandidateActivity[]; forms: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<NuevoEventoState, FormData>(
    crearEventoDesdeActividadAction,
    initialState,
  );

  if (candidates.length === 0) {
    return (
      <div className="shell-card shell-empty-state">
        <h3>No hay actividades disponibles</h3>
        <p>
          Solo aparecen aquí actividades de tipo evento que todavía no tienen comportamiento de evento activado. Crea
          primero la actividad desde Actividades → Nueva actividad (tipo Evento), o usa &quot;Desde cero&quot;.
        </p>
        <Link href="/app/actividades/nueva?tipo=event" style={{ ...secondaryButtonStyle(), marginTop: 12 }}>
          Ir a Nueva actividad
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 600 }}>Actividad</p>
        <div>
          <label htmlFor="activityId" style={authLabelStyle}>
            Selecciona una actividad de tipo evento
          </label>
          <select id="activityId" name="activityId" required style={{ ...authInputStyle, width: "100%" }}>
            <option value="">Selecciona…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
                {c.campusName ? ` · ${c.campusName}` : ""}
                {c.startsAt ? ` · ${new Date(c.startsAt).toLocaleString("es-ES")}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <EventContentFields forms={forms} />

      {state.error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {state.error}
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
          {pending ? "Creando…" : "Activar evento"}
        </button>
        <Link href="/app/eventos" style={secondaryButtonStyle()}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
