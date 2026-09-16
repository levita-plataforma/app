"use client";

import { isValidTimeZone } from "./form-values";

type Props = {
  idPrefix: string;
  /** Zona que se aplicará si no se cambia (sede → iglesia, o la actual). */
  resolved: string;
  resolvedHint: string;
  override: string;
  onOverrideChange: (value: string) => void;
};

/** Zona horaria: muestra la resuelta y permite indicar otra zona IANA. */
export default function TimezoneField({ idPrefix, resolved, resolvedHint, override, onOverrideChange }: Props) {
  const trimmed = override.trim();
  const invalid = trimmed !== "" && !isValidTimeZone(trimmed);
  return (
    <div className="act-field">
      <label className="act-label" htmlFor={`${idPrefix}-tz-resolved`}>
        Zona horaria
      </label>
      <input
        id={`${idPrefix}-tz-resolved`}
        className="act-input"
        readOnly
        value={trimmed && !invalid ? trimmed : resolved}
        aria-describedby={`${idPrefix}-tz-hint`}
      />
      <p id={`${idPrefix}-tz-hint`} className="act-hint">
        {trimmed && !invalid ? "Zona indicada manualmente." : resolvedHint}
      </p>
      <details className="act-disclosure">
        <summary>Cambiar zona horaria</summary>
        <div className="act-field" style={{ marginTop: 6 }}>
          <label className="act-label" htmlFor={`${idPrefix}-tz`}>
            Zona IANA (p. ej. Europe/Madrid, America/Mexico_City)
          </label>
          <input
            id={`${idPrefix}-tz`}
            className="act-input"
            name="timezone"
            autoComplete="off"
            spellCheck={false}
            value={override}
            aria-invalid={invalid}
            onChange={(e) => onOverrideChange(e.target.value)}
          />
          {invalid ? (
            <p role="alert" className="act-error">
              No parece una zona IANA válida.
            </p>
          ) : (
            <p className="act-hint">Déjalo vacío para usar la zona por defecto.</p>
          )}
        </div>
      </details>
    </div>
  );
}
