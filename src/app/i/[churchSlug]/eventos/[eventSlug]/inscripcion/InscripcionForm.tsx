"use client";

import { useActionState, useId, useMemo, useState } from "react";
import { inscribirseAction, type InscripcionState } from "./actions";
import { authInputStyle, authLabelStyle, authPrimaryButtonStyle } from "@/components/shell/AuthCard";
import type { PublicFormField } from "@/server/events/public-events-service";
import type { PublicConsentDefinition } from "@/server/events/public-events-service";

type AttendeeRow = { id: string; fullName: string; attendeeType: "adult" | "minor" };

const initialState: InscripcionState = { error: null };

export default function InscripcionForm({
  churchSlug,
  eventSlug,
  eventId,
  registrationType,
  formFields,
  consentDefinitions,
}: {
  churchSlug: string;
  eventSlug: string;
  eventId: string;
  registrationType: "individual" | "household" | "group";
  formFields: PublicFormField[];
  consentDefinitions: PublicConsentDefinition[];
}) {
  const boundAction = inscribirseAction.bind(null, churchSlug, eventSlug, eventId, registrationType);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const allowsMultipleAttendees = registrationType === "household" || registrationType === "group";

  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);

  function addAttendee() {
    setAttendees((prev) => [...prev, { id: crypto.randomUUID(), fullName: "", attendeeType: "adult" }]);
  }

  function removeAttendee(id: string) {
    setAttendees((prev) => prev.filter((a) => a.id !== id));
  }

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 16 }} noValidate>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {/* Honeypot: oculto visualmente (nunca display:none ni type=hidden) para
          atrapar bots que autocompletan todos los campos de un formulario. */}
      <div style={{ position: "absolute", left: -9999, top: "auto", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="website">Empresa</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="primaryName" style={authLabelStyle}>
          Nombre completo <span style={{ color: "var(--shell-danger)" }}>*</span>
        </label>
        <input id="primaryName" name="primaryName" type="text" required style={authInputStyle} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="primaryEmail" style={authLabelStyle}>
          Correo <span style={{ color: "var(--shell-danger)" }}>*</span>
        </label>
        <input id="primaryEmail" name="primaryEmail" type="email" autoComplete="email" required style={authInputStyle} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="primaryPhone" style={authLabelStyle}>
          Teléfono
        </label>
        <input id="primaryPhone" name="primaryPhone" type="tel" autoComplete="tel" style={authInputStyle} />
      </div>

      {allowsMultipleAttendees ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={authLabelStyle}>Otros asistentes</p>
          {attendees.map((attendee, index) => (
            <div key={attendee.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                name="attendeeName"
                type="text"
                placeholder="Nombre completo"
                defaultValue={attendee.fullName}
                style={{ ...authInputStyle, flex: 1 }}
              />
              <select name="attendeeType" defaultValue={attendee.attendeeType} style={{ ...authInputStyle, width: 100 }}>
                <option value="adult">Adulto</option>
                <option value="minor">Menor</option>
              </select>
              <button
                type="button"
                onClick={() => removeAttendee(attendee.id)}
                aria-label={`Quitar asistente ${index + 1}`}
                style={{ background: "none", border: "none", color: "var(--shell-danger)", cursor: "pointer", fontSize: 13 }}
              >
                Quitar
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addAttendee}
            style={{
              alignSelf: "flex-start",
              background: "none",
              border: "1px solid var(--shell-border)",
              borderRadius: "var(--shell-radius-sm)",
              padding: "6px 12px",
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--shell-text)",
              cursor: "pointer",
            }}
          >
            + Añadir otra persona
          </button>
        </div>
      ) : null}

      {formFields.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {formFields
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((field) => (
              <FormFieldInput key={field.fieldKey} field={field} />
            ))}
        </div>
      ) : null}

      {consentDefinitions.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {consentDefinitions.map((consent) => (
            <div key={consent.consentKey}>
              <input type="hidden" name="consentKey" value={consent.consentKey} />
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5, color: "var(--shell-text-muted)" }}>
                <input type="checkbox" name={`consent__${consent.consentKey}`} style={{ marginTop: 2 }} />
                <span>
                  <strong style={{ color: "var(--shell-text)" }}>{consent.title}</strong>
                  <br />
                  {consent.body}
                </span>
              </label>
            </div>
          ))}
        </div>
      ) : null}

      {state.error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} style={authPrimaryButtonStyle(pending)}>
        {pending ? "Enviando…" : "Confirmar inscripción"}
      </button>
    </form>
  );
}

function FormFieldInput({ field }: { field: PublicFormField }) {
  const inputId = useId();
  const name = `answer__${field.fieldKey}`;

  const label = (
    <label htmlFor={inputId} style={authLabelStyle}>
      {field.label} {field.required ? <span style={{ color: "var(--shell-danger)" }}>*</span> : null}
    </label>
  );

  const options = Array.isArray(field.options)
    ? (field.options as unknown[]).filter((o): o is string => typeof o === "string")
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <input type="hidden" name="answerFieldKey" value={field.fieldKey} />
      {field.type !== "boolean" && field.type !== "checkbox" ? label : null}

      {(() => {
        switch (field.type) {
          case "textarea":
          case "address":
            return <textarea id={inputId} name={name} required={field.required} rows={3} style={{ ...authInputStyle, resize: "vertical" }} />;
          case "email":
            return <input id={inputId} name={name} type="email" required={field.required} style={authInputStyle} />;
          case "phone":
            return <input id={inputId} name={name} type="tel" required={field.required} style={authInputStyle} />;
          case "number":
            return <input id={inputId} name={name} type="number" required={field.required} style={authInputStyle} />;
          case "date":
            return <input id={inputId} name={name} type="date" required={field.required} style={authInputStyle} />;
          case "select":
            return (
              <select id={inputId} name={name} required={field.required} style={authInputStyle} defaultValue="">
                <option value="" disabled>
                  Selecciona…
                </option>
                {options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            );
          case "multi_select":
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {options.map((opt) => (
                  <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <input type="checkbox" name={name} value={opt} />
                    {opt}
                  </label>
                ))}
              </div>
            );
          case "checkbox":
          case "boolean":
            return (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--shell-text-muted)" }}>
                <input id={inputId} name={name} type="checkbox" />
                {field.label} {field.required ? <span style={{ color: "var(--shell-danger)" }}>*</span> : null}
              </label>
            );
          case "text":
          default:
            return <input id={inputId} name={name} type="text" required={field.required} style={authInputStyle} />;
        }
      })()}

      {field.helpText ? (
        <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)" }}>{field.helpText}</p>
      ) : null}
    </div>
  );
}
