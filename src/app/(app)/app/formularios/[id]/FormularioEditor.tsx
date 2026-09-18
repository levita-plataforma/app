"use client";

import { useMemo, useState, useTransition } from "react";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import type { FormDetail, FormFieldItem, FormFieldType, FormFieldClassification } from "@/server/forms/forms-service";
import {
  guardarFormularioAction,
  crearCampoAction,
  editarCampoAction,
  archivarCampoAction,
  type FormularioFichaState,
} from "./actions";
import {
  primaryButtonStyle,
  secondaryButtonStyle,
  subtleButtonStyle,
  FORM_FIELD_TYPE_LABELS,
  FORM_FIELD_CLASSIFICATION_LABELS,
} from "../ui";

const TABS = ["Campos", "Previsualizar", "Configuración"] as const;
type Tab = (typeof TABS)[number];

const SELECT_TYPES: FormFieldType[] = ["select", "multi_select"];
const ALL_CLASSIFICATIONS: FormFieldClassification[] = ["normal", "personal", "sensitive", "restricted"];
const SENSITIVE_CLASSIFICATIONS: FormFieldClassification[] = ["sensitive", "restricted"];

export default function FormularioEditor({
  form,
  canManage,
  canManageSensitive,
}: {
  form: FormDetail;
  canManage: boolean;
  canManageSensitive: boolean;
}) {
  const [tab, setTab] = useState<Tab>("Campos");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<FormularioFichaState>) {
    startTransition(async () => {
      const result = await fn();
      setError(result.error);
    });
  }

  // Solo se muestran las clasificaciones sensitive/restricted en el selector
  // si el usuario tiene la capability form.sensitive.manage; el servidor
  // vuelve a validar esto de todas formas (defensa en profundidad, no
  // duplicación de la regla real).
  const availableClassifications = canManageSensitive
    ? ALL_CLASSIFICATIONS
    : ALL_CLASSIFICATIONS.filter((c) => !SENSITIVE_CLASSIFICATIONS.includes(c));

  return (
    <>
      {error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      ) : null}

      <nav className="serving-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className="serving-tab"
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "Campos" ? (
        <CamposTab
          form={form}
          canManage={canManage}
          availableClassifications={availableClassifications}
          pending={pending}
          run={run}
        />
      ) : null}

      {tab === "Previsualizar" ? <PreviewTab fields={form.fields} /> : null}

      {tab === "Configuración" ? (
        <ConfiguracionTab form={form} canManage={canManage} pending={pending} run={run} />
      ) : null}
    </>
  );
}

function CamposTab({
  form,
  canManage,
  availableClassifications,
  pending,
  run,
}: {
  form: FormDetail;
  canManage: boolean;
  availableClassifications: FormFieldClassification[];
  pending: boolean;
  run: (fn: () => Promise<FormularioFichaState>) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const sortedFields = useMemo(() => [...form.fields].sort((a, b) => a.sortOrder - b.sortOrder), [form.fields]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        className="shell-card"
        style={{ padding: 18, fontSize: 12.5, color: "var(--shell-text-muted)" }}
      >
        Versión estructural actual: <strong>v{form.currentVersion}</strong>. Añadir un campo, o cambiar su
        tipo/obligatoriedad/opciones sube la versión. Esto no afecta a las respuestas ya enviadas: cada
        respuesta conserva una foto fija (snapshot) de los campos tal como estaban en el momento de
        enviarla.
      </div>

      {sortedFields.length === 0 ? (
        <div className="shell-card shell-empty-state">
          <h3>Este formulario todavía no tiene campos</h3>
          <p>Añade el primer campo con el formulario de abajo.</p>
        </div>
      ) : (
        <div className="shell-card list-card">
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Campo</th>
                  <th>Tipo</th>
                  <th>Obligatorio</th>
                  <th>Clasificación</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sortedFields.map((field) =>
                  editingId === field.id ? (
                    <tr key={field.id}>
                      <td colSpan={5} style={{ padding: 0 }}>
                        <CampoForm
                          formId={form.id}
                          field={field}
                          availableClassifications={availableClassifications}
                          pending={pending}
                          run={run}
                          onDone={() => setEditingId(null)}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={field.id}>
                      <td data-label="Campo">
                        <span style={{ fontWeight: 600 }}>{field.label}</span>
                        <div className="serving-meta">{field.key}</div>
                        {field.helpText ? <div className="serving-meta">{field.helpText}</div> : null}
                      </td>
                      <td data-label="Tipo" className="serving-meta">
                        {FORM_FIELD_TYPE_LABELS[field.type] ?? field.type}
                      </td>
                      <td data-label="Obligatorio">
                        <span className={`serving-chip ${field.required ? "is-success" : "is-muted"}`}>
                          {field.required ? "Sí" : "No"}
                        </span>
                      </td>
                      <td data-label="Clasificación">
                        <span
                          className={`serving-chip ${
                            SENSITIVE_CLASSIFICATIONS.includes(field.classification) ? "is-warning" : "is-muted"
                          }`}
                        >
                          {FORM_FIELD_CLASSIFICATION_LABELS[field.classification] ?? field.classification}
                        </span>
                      </td>
                      <td data-label="">
                        {canManage ? (
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => setEditingId(field.id)}
                              style={subtleButtonStyle}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => run(() => archivarCampoAction(form.id, field.id))}
                              style={subtleButtonStyle}
                            >
                              Archivar
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canManage ? (
        <div className="shell-card" style={{ padding: 18 }}>
          <p style={{ ...authLabelStyle, marginBottom: 10 }}>Añadir campo</p>
          <CampoForm
            formId={form.id}
            field={null}
            availableClassifications={availableClassifications}
            pending={pending}
            run={run}
          />
        </div>
      ) : null}
    </div>
  );
}

function CampoForm({
  formId,
  field,
  availableClassifications,
  pending,
  run,
  onDone,
}: {
  formId: string;
  field: FormFieldItem | null;
  availableClassifications: FormFieldClassification[];
  pending: boolean;
  run: (fn: () => Promise<FormularioFichaState>) => void;
  onDone?: () => void;
}) {
  const [type, setType] = useState<FormFieldType>(field?.type ?? "text");
  const isSelectType = SELECT_TYPES.includes(type);
  const optionsDefault = Array.isArray(field?.options) ? (field.options as string[]).join("\n") : "";

  function handleSubmit(formData: FormData) {
    run(async () => {
      const result = field
        ? await editarCampoAction(formId, field.id, formData)
        : await crearCampoAction(formId, formData);
      if (!result.error) onDone?.();
      return result;
    });
  }

  return (
    <form
      action={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: 12, padding: field ? 18 : 0 }}
    >
      <div className="serving-toolbar">
        <div style={{ flex: "1 1 160px" }}>
          <label htmlFor={`key-${field?.id ?? "new"}`} style={authLabelStyle}>
            Clave
          </label>
          <input
            id={`key-${field?.id ?? "new"}`}
            name="key"
            required
            disabled={Boolean(field)}
            defaultValue={field?.key ?? ""}
            placeholder="nombre_completo"
            style={{ ...authInputStyle, width: "100%" }}
          />
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label htmlFor={`label-${field?.id ?? "new"}`} style={authLabelStyle}>
            Etiqueta
          </label>
          <input
            id={`label-${field?.id ?? "new"}`}
            name="label"
            required
            defaultValue={field?.label ?? ""}
            placeholder="Nombre completo"
            style={{ ...authInputStyle, width: "100%" }}
          />
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label htmlFor={`type-${field?.id ?? "new"}`} style={authLabelStyle}>
            Tipo
          </label>
          <select
            id={`type-${field?.id ?? "new"}`}
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as FormFieldType)}
            style={{ ...authInputStyle, width: "100%" }}
          >
            {Object.entries(FORM_FIELD_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 160px" }}>
          <label htmlFor={`classification-${field?.id ?? "new"}`} style={authLabelStyle}>
            Clasificación
          </label>
          <select
            id={`classification-${field?.id ?? "new"}`}
            name="classification"
            defaultValue={field?.classification ?? "normal"}
            style={{ ...authInputStyle, width: "100%" }}
          >
            {availableClassifications.map((c) => (
              <option key={c} value={c}>
                {FORM_FIELD_CLASSIFICATION_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor={`help-${field?.id ?? "new"}`} style={authLabelStyle}>
          Texto de ayuda
        </label>
        <input
          id={`help-${field?.id ?? "new"}`}
          name="helpText"
          defaultValue={field?.helpText ?? ""}
          style={{ ...authInputStyle, width: "100%" }}
        />
      </div>

      {isSelectType ? (
        <div>
          <label htmlFor={`options-${field?.id ?? "new"}`} style={authLabelStyle}>
            Opciones (una por línea)
          </label>
          <textarea
            id={`options-${field?.id ?? "new"}`}
            name="options"
            required
            rows={4}
            defaultValue={optionsDefault}
            placeholder={"Opción 1\nOpción 2\nOpción 3"}
            style={{ ...authInputStyle, width: "100%", resize: "vertical", fontFamily: "inherit" }}
          />
        </div>
      ) : null}

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
        <input type="checkbox" name="required" defaultChecked={field?.required ?? false} /> Campo obligatorio
      </label>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
          {pending ? "Guardando…" : field ? "Guardar campo" : "Añadir campo"}
        </button>
        {field ? (
          <button type="button" onClick={onDone} style={secondaryButtonStyle()}>
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}

function PreviewTab({ fields }: { fields: FormFieldItem[] }) {
  const sortedFields = useMemo(() => [...fields].sort((a, b) => a.sortOrder - b.sortOrder), [fields]);

  if (sortedFields.length === 0) {
    return (
      <div className="shell-card shell-empty-state">
        <h3>Nada que previsualizar todavía</h3>
        <p>Añade campos en la pestaña Campos para ver aquí cómo se vería el formulario.</p>
      </div>
    );
  }

  return (
    <div className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, maxWidth: 560 }}>
      <p style={{ fontSize: 12, color: "var(--shell-text-subtle)" }}>
        Vista previa de solo lectura: así se mostrarían los campos a la persona que rellena el formulario.
        No envía datos.
      </p>
      {sortedFields.map((field) => (
        <PreviewField key={field.id} field={field} />
      ))}
    </div>
  );
}

function PreviewField({ field }: { field: FormFieldItem }) {
  const options = Array.isArray(field.options) ? (field.options as string[]) : [];
  const label = (
    <label style={authLabelStyle}>
      {field.label}
      {field.required ? <span style={{ color: "var(--shell-danger)" }}> *</span> : null}
    </label>
  );

  return (
    <div>
      {label}
      <PreviewInput field={field} options={options} />
      {field.helpText ? (
        <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)", marginTop: 4 }}>{field.helpText}</p>
      ) : null}
    </div>
  );
}

function PreviewInput({ field, options }: { field: FormFieldItem; options: string[] }) {
  const commonStyle: React.CSSProperties = { ...authInputStyle, width: "100%" };

  switch (field.type) {
    case "textarea":
      return <textarea disabled rows={3} style={{ ...commonStyle, resize: "vertical", fontFamily: "inherit" }} />;
    case "email":
      return <input type="email" disabled placeholder="correo@ejemplo.com" style={commonStyle} />;
    case "phone":
      return <input type="tel" disabled placeholder="+34 600 000 000" style={commonStyle} />;
    case "number":
      return <input type="number" disabled style={commonStyle} />;
    case "date":
      return <input type="date" disabled style={commonStyle} />;
    case "select":
      return (
        <select disabled style={commonStyle}>
          <option value="">Selecciona…</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    case "multi_select":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {options.length === 0 ? (
            <p className="serving-meta">Sin opciones definidas.</p>
          ) : (
            options.map((opt) => (
              <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                <input type="checkbox" disabled /> {opt}
              </label>
            ))
          )}
        </div>
      );
    case "checkbox":
      return (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
          <input type="checkbox" disabled /> {field.label}
        </label>
      );
    case "boolean":
      return (
        <div style={{ display: "flex", gap: 14, fontSize: 12.5 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="radio" disabled name={`preview-${field.id}`} /> Sí
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="radio" disabled name={`preview-${field.id}`} /> No
          </label>
        </div>
      );
    case "address":
      return <textarea disabled rows={2} placeholder="Dirección completa" style={{ ...commonStyle, resize: "vertical", fontFamily: "inherit" }} />;
    case "text":
    default:
      return <input type="text" disabled style={commonStyle} />;
  }
}

function ConfiguracionTab({
  form,
  canManage,
  pending,
  run,
}: {
  form: FormDetail;
  canManage: boolean;
  pending: boolean;
  run: (fn: () => Promise<FormularioFichaState>) => void;
}) {
  return (
    <form
      className="shell-card"
      style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, opacity: canManage ? 1 : 0.7, maxWidth: 560 }}
      action={(formData) => run(() => guardarFormularioAction(form.id, formData))}
    >
      <div>
        <label htmlFor="cfg-name" style={authLabelStyle}>
          Nombre
        </label>
        <input
          id="cfg-name"
          name="name"
          defaultValue={form.name}
          required
          disabled={!canManage}
          style={{ ...authInputStyle, width: "100%" }}
        />
      </div>
      <div>
        <label htmlFor="cfg-description" style={authLabelStyle}>
          Descripción
        </label>
        <input
          id="cfg-description"
          name="description"
          defaultValue={form.description ?? ""}
          disabled={!canManage}
          style={{ ...authInputStyle, width: "100%" }}
        />
      </div>
      <div>
        <label htmlFor="cfg-purpose" style={authLabelStyle}>
          Finalidad (RGPD)
        </label>
        <textarea
          id="cfg-purpose"
          name="purpose"
          required
          rows={3}
          defaultValue={form.purpose}
          disabled={!canManage}
          style={{ ...authInputStyle, width: "100%", resize: "vertical", fontFamily: "inherit" }}
        />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
        <input type="checkbox" name="active" defaultChecked={form.active} disabled={!canManage} /> Formulario activo
      </label>

      <div className="shell-card" style={{ padding: 14, background: "var(--shell-bg)", fontSize: 12, color: "var(--shell-text-muted)" }}>
        Versión estructural actual: <strong>v{form.currentVersion}</strong>. Cambiar el nombre, la
        descripción o la finalidad no sube la versión (son cosméticos). Solo cambios en los campos
        (tipo, obligatoriedad, opciones, añadir/archivar) suben la versión, y nunca afectan a las
        respuestas ya enviadas: cada respuesta guarda su propia foto fija de los campos vigentes en el
        momento del envío.
      </div>

      {canManage ? (
        <button type="submit" disabled={pending} style={{ ...primaryButtonStyle(pending), alignSelf: "flex-start" }}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
      ) : (
        <p style={{ fontSize: 12, color: "var(--shell-text-subtle)" }}>
          No tienes permiso para editar este formulario.
        </p>
      )}
    </form>
  );
}
