"use client";

import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import { subtleButtonStyle } from "../ui";

/**
 * Constructor de reglas de segmentación reutilizable (Fase 9).
 *
 * COMPONENTE COMPARTIDO: se usa tanto en Segmentos (crear/editar un
 * `communication_segment` reutilizable) como en el wizard de "Nueva
 * comunicación" (reglas ad-hoc, sin guardar un segmento). Impórtalo desde
 * aquí:
 *
 *   import SegmentoRuleBuilder, { type SegmentRules, type SegmentRuleCondition } from
 *     "@/app/(app)/app/comunicacion/segmentos/SegmentoRuleBuilder";
 *
 * Contrato de props (controlado, sin fetch interno):
 * - `value`: el estado actual de las reglas, forma { all: SegmentRuleCondition[] }.
 * - `onChange(next)`: se llama con el array de condiciones actualizado cada
 *   vez que el usuario edita una fila, añade o quita una condición. El
 *   padre es quien mantiene el estado (useState) y quien construye el JSON
 *   final { "all": [...] } para enviarlo a un Server Action.
 * - `campuses`, `tags`, `serviceAreas`: listas ya cargadas por el padre
 *   (Server Component) con `supabase.from(...)`, filtradas por
 *   church_id. Este componente NUNCA hace fetch por su cuenta.
 *
 * Solo se soporta el nivel `all` (AND) en esta fase: no hay UI de OR ni de
 * anidamiento, y no debe añadirse sin revisar primero
 * app.validate_segment_rules (supabase/migrations/20260929000600_rpc_comunicaciones.sql),
 * que solo acepta esa forma.
 *
 * El campo "group" aparece siempre como opción en el selector de campo,
 * pero deshabilitado ("Disponible próximamente (Fase 7)"): nunca se debe
 * habilitar aquí, aunque exista en la allowlist del backend como campo
 * reservado — la RPC lo rechaza explícitamente si se envía.
 */

export type SegmentField = "campus_id" | "tags" | "relationship" | "service_area_id" | "channel_available" | "group";

export type SegmentRuleCondition = {
  field: SegmentField;
  op: string;
  /** string para eq/contains, string[] para in/contains_any */
  value: string | string[];
};

export type SegmentRules = {
  all: SegmentRuleCondition[];
};

export type SegmentOption = { id: string; name: string };

const RELATIONSHIP_OPTIONS: { value: string; label: string }[] = [
  { value: "visitor", label: "Visitante" },
  { value: "connected", label: "Conectado" },
  { value: "member", label: "Miembro" },
  { value: "server", label: "Voluntario" },
  { value: "leader", label: "Líder" },
  { value: "external", label: "Externo" },
  { value: "inactive", label: "Inactivo" },
];

const CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: "email", label: "Correo" },
  { value: "push", label: "Notificación push" },
  { value: "inapp", label: "Aviso en la app" },
];

const FIELD_OPTIONS: { value: SegmentField; label: string; disabled?: boolean }[] = [
  { value: "campus_id", label: "Sede" },
  { value: "tags", label: "Etiqueta" },
  { value: "relationship", label: "Tipo de relación" },
  { value: "service_area_id", label: "Área de servicio" },
  { value: "channel_available", label: "Canal disponible" },
  { value: "group", label: "Grupo — Disponible próximamente (Fase 7)", disabled: true },
];

/** Operador por defecto y único disponible por cada campo (excepto tags/relationship/*_id, con dos). */
function defaultOpFor(field: SegmentField): string {
  switch (field) {
    case "campus_id":
    case "service_area_id":
    case "relationship":
      return "eq";
    case "tags":
      return "contains";
    case "channel_available":
      return "eq";
    default:
      return "eq";
  }
}

function emptyValueFor(op: string): string | string[] {
  return op === "in" || op === "contains_any" ? [] : "";
}

function newCondition(): SegmentRuleCondition {
  return { field: "campus_id", op: "eq", value: "" };
}

export default function SegmentoRuleBuilder({
  value,
  onChange,
  campuses,
  tags,
  serviceAreas,
}: {
  value: SegmentRules;
  onChange: (next: SegmentRules) => void;
  campuses: SegmentOption[];
  tags: SegmentOption[];
  serviceAreas: SegmentOption[];
}) {
  const conditions = value.all;

  function updateCondition(index: number, patch: Partial<SegmentRuleCondition>) {
    const next = conditions.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange({ all: next });
  }

  function handleFieldChange(index: number, field: SegmentField) {
    const op = defaultOpFor(field);
    updateCondition(index, { field, op, value: emptyValueFor(op) });
  }

  function handleOpChange(index: number, op: string) {
    updateCondition(index, { op, value: emptyValueFor(op) });
  }

  function addCondition() {
    onChange({ all: [...conditions, newCondition()] });
  }

  function removeCondition(index: number) {
    onChange({ all: conditions.filter((_, i) => i !== index) });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {conditions.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
          Añade al menos una condición para definir el segmento.
        </p>
      ) : null}

      {conditions.map((condition, index) => (
        <div
          key={index}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "flex-end",
            padding: 12,
            border: "1px solid var(--shell-border)",
            borderRadius: "var(--shell-radius-sm)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
            <label htmlFor={`rule-field-${index}`} style={authLabelStyle}>
              Campo
            </label>
            <select
              id={`rule-field-${index}`}
              value={condition.field}
              onChange={(e) => handleFieldChange(index, e.target.value as SegmentField)}
              style={{ ...authInputStyle, minHeight: 44 }}
            >
              {FIELD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <SegmentConditionValue
            index={index}
            condition={condition}
            campuses={campuses}
            tags={tags}
            serviceAreas={serviceAreas}
            onOpChange={handleOpChange}
            onValueChange={(val) => updateCondition(index, { value: val })}
          />

          <button
            type="button"
            onClick={() => removeCondition(index)}
            style={{ ...subtleButtonStyle, color: "var(--shell-danger)", marginBottom: 10 }}
            aria-label="Quitar condición"
          >
            Quitar
          </button>
        </div>
      ))}

      <button type="button" onClick={addCondition} style={{ ...subtleButtonStyle, alignSelf: "flex-start" }}>
        + Añadir condición
      </button>

      {conditions.length > 1 ? (
        <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
          Todas las condiciones se combinan con Y (deben cumplirse todas).
        </p>
      ) : null}
    </div>
  );
}

function SegmentConditionValue({
  index,
  condition,
  campuses,
  tags,
  serviceAreas,
  onOpChange,
  onValueChange,
}: {
  index: number;
  condition: SegmentRuleCondition;
  campuses: SegmentOption[];
  tags: SegmentOption[];
  serviceAreas: SegmentOption[];
  onOpChange: (index: number, op: string) => void;
  onValueChange: (value: string | string[]) => void;
}) {
  const opSelectId = `rule-op-${index}`;
  const valueId = `rule-value-${index}`;

  if (condition.field === "campus_id") {
    return (
      <>
        <OpSelect id={opSelectId} op={condition.op} options={["eq", "in"]} onChange={(op) => onOpChange(index, op)} />
        <OptionSelect
          id={valueId}
          label="Sede"
          multiple={condition.op === "in"}
          options={campuses}
          value={condition.value}
          onChange={onValueChange}
        />
      </>
    );
  }

  if (condition.field === "service_area_id") {
    return (
      <>
        <OpSelect id={opSelectId} op={condition.op} options={["eq", "in"]} onChange={(op) => onOpChange(index, op)} />
        <OptionSelect
          id={valueId}
          label="Área de servicio"
          multiple={condition.op === "in"}
          options={serviceAreas}
          value={condition.value}
          onChange={onValueChange}
        />
      </>
    );
  }

  if (condition.field === "tags") {
    return (
      <>
        <OpSelect
          id={opSelectId}
          op={condition.op}
          options={["contains", "contains_any"]}
          onChange={(op) => onOpChange(index, op)}
        />
        <OptionSelect
          id={valueId}
          label="Etiqueta"
          multiple={condition.op === "contains_any"}
          options={tags}
          value={condition.value}
          onChange={onValueChange}
        />
      </>
    );
  }

  if (condition.field === "relationship") {
    return (
      <>
        <OpSelect id={opSelectId} op={condition.op} options={["eq", "in"]} onChange={(op) => onOpChange(index, op)} />
        <OptionSelect
          id={valueId}
          label="Tipo de relación"
          multiple={condition.op === "in"}
          options={RELATIONSHIP_OPTIONS.map((r) => ({ id: r.value, name: r.label }))}
          value={condition.value}
          onChange={onValueChange}
        />
      </>
    );
  }

  if (condition.field === "channel_available") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
        <label htmlFor={valueId} style={authLabelStyle}>
          Canal
        </label>
        <select
          id={valueId}
          value={typeof condition.value === "string" ? condition.value : ""}
          onChange={(e) => onValueChange(e.target.value)}
          style={{ ...authInputStyle, minHeight: 44 }}
        >
          <option value="">Selecciona un canal</option>
          {CHANNEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // field === "group": deshabilitado, sin control de valor.
  return (
    <p style={{ fontSize: 12, color: "var(--shell-text-muted)", marginBottom: 10 }}>
      Disponible próximamente (Fase 7).
    </p>
  );
}

function OpSelect({
  id,
  op,
  options,
  onChange,
}: {
  id: string;
  op: string;
  options: string[];
  onChange: (op: string) => void;
}) {
  const OP_LABELS: Record<string, string> = {
    eq: "es",
    in: "es uno de",
    contains: "incluye",
    contains_any: "incluye alguna de",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 140 }}>
      <label htmlFor={id} style={authLabelStyle}>
        Operador
      </label>
      <select id={id} value={op} onChange={(e) => onChange(e.target.value)} style={{ ...authInputStyle, minHeight: 44 }}>
        {options.map((o) => (
          <option key={o} value={o}>
            {OP_LABELS[o] ?? o}
          </option>
        ))}
      </select>
    </div>
  );
}

function OptionSelect({
  id,
  label,
  multiple,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  multiple: boolean;
  options: SegmentOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
}) {
  if (multiple) {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}>
        <label htmlFor={id} style={authLabelStyle}>
          {label} (varios)
        </label>
        <select
          id={id}
          multiple
          value={selected}
          onChange={(e) => onChange(Array.from(e.target.selectedOptions).map((o) => o.value))}
          style={{ ...authInputStyle, minHeight: 88 }}
        >
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const single = typeof value === "string" ? value : "";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}>
      <label htmlFor={id} style={authLabelStyle}>
        {label}
      </label>
      <select id={id} value={single} onChange={(e) => onChange(e.target.value)} style={{ ...authInputStyle, minHeight: 44 }}>
        <option value="">Selecciona una opción</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name}
          </option>
        ))}
      </select>
    </div>
  );
}
