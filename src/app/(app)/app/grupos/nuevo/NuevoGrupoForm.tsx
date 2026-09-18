"use client";

import { useActionState } from "react";
import { crearGrupoAction, type NuevoGrupoState } from "./actions";
import {
  GROUP_JOIN_POLICIES,
  GROUP_JOIN_POLICY_INFO,
  GROUP_STATUSES,
  GROUP_STATUS_INFO,
  GROUP_VISIBILITIES,
  GROUP_VISIBILITY_INFO,
} from "@/lib/groups/constants";
import { cardStyle, fieldStyle, inputStyle, labelStyle, primaryButtonStyle, selectStyle } from "../ui";

const initialState: NuevoGrupoState = { error: null };

export type GroupFormOption = { id: string; name: string };

export default function NuevoGrupoForm({
  campuses,
  groupTypes,
}: {
  campuses: GroupFormOption[];
  groupTypes: GroupFormOption[];
}) {
  const [state, formAction, pending] = useActionState(crearGrupoAction, initialState);

  return (
    <form action={formAction} className="shell-card" style={cardStyle} noValidate>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <div style={{ ...fieldStyle, flex: "1 1 320px" }}>
          <label htmlFor="grupo-nombre" style={labelStyle}>
            Nombre del grupo
          </label>
          <input id="grupo-nombre" name="name" required maxLength={120} style={inputStyle} placeholder="Célula del centro" />
        </div>
        <div style={fieldStyle}>
          <label htmlFor="grupo-tipo" style={labelStyle}>
            Tipo de grupo
          </label>
          <select id="grupo-tipo" name="groupTypeId" defaultValue="" style={selectStyle}>
            <option value="">Sin tipo</option>
            {groupTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
        <div style={fieldStyle}>
          <label htmlFor="grupo-sede" style={labelStyle}>
            Sede
          </label>
          <select id="grupo-sede" name="campusId" defaultValue="" style={selectStyle}>
            <option value="">Toda la iglesia</option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ ...fieldStyle, flex: "1 1 100%" }}>
        <label htmlFor="grupo-descripcion" style={labelStyle}>
          Descripción
        </label>
        <textarea
          id="grupo-descripcion"
          name="description"
          rows={3}
          maxLength={2000}
          style={{ ...inputStyle, resize: "vertical" }}
          placeholder="Para quién es este grupo y qué hace cuando se reúne."
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <div style={fieldStyle}>
          <label htmlFor="grupo-visibilidad" style={labelStyle}>
            Visibilidad
          </label>
          <select id="grupo-visibilidad" name="visibility" defaultValue="listed" style={selectStyle}>
            {GROUP_VISIBILITIES.map((visibility) => (
              <option key={visibility} value={visibility}>
                {GROUP_VISIBILITY_INFO[visibility].label}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)", marginTop: 4 }}>
            {GROUP_VISIBILITY_INFO.listed.description} Un grupo privado solo lo ven sus responsables y participantes.
          </p>
        </div>
        <div style={fieldStyle}>
          <label htmlFor="grupo-ingreso" style={labelStyle}>
            Forma de ingreso
          </label>
          <select id="grupo-ingreso" name="joinPolicy" defaultValue="open_request" style={selectStyle}>
            {GROUP_JOIN_POLICIES.map((policy) => (
              <option key={policy} value={policy}>
                {GROUP_JOIN_POLICY_INFO[policy].label}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)", marginTop: 4 }}>
            El ingreso siempre lo aprueba una persona: no hay altas automáticas.
          </p>
        </div>
        <div style={fieldStyle}>
          <label htmlFor="grupo-estado" style={labelStyle}>
            Estado
          </label>
          <select id="grupo-estado" name="status" defaultValue="active" style={selectStyle}>
            {GROUP_STATUSES.map((status) => (
              <option key={status} value={status}>
                {GROUP_STATUS_INFO[status].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        <div style={fieldStyle}>
          <label htmlFor="grupo-aforo" style={labelStyle}>
            Aforo (opcional)
          </label>
          <input id="grupo-aforo" name="capacity" type="number" min={1} step={1} style={inputStyle} />
          <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)", marginTop: 4 }}>
            El aforo cuenta participantes; quien lleva el grupo no ocupa plaza.
          </p>
        </div>
        <div style={fieldStyle}>
          <label htmlFor="grupo-edad" style={labelStyle}>
            Segmento de edad (opcional)
          </label>
          <input id="grupo-edad" name="ageSegment" maxLength={60} style={inputStyle} placeholder="Jóvenes, adultos…" />
        </div>
        <div style={fieldStyle}>
          <label htmlFor="grupo-cuando" style={labelStyle}>
            Cuándo se reúne (texto libre)
          </label>
          <input
            id="grupo-cuando"
            name="meetingScheduleText"
            maxLength={160}
            style={inputStyle}
            placeholder="Jueves a las 20:00"
          />
        </div>
        <div style={fieldStyle}>
          <label htmlFor="grupo-donde" style={labelStyle}>
            Dónde se reúne (texto libre)
          </label>
          <input
            id="grupo-donde"
            name="meetingLocationText"
            maxLength={160}
            style={inputStyle}
            placeholder="Casa de la familia Pérez"
          />
        </div>
      </div>

      {state.error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {state.error}
        </p>
      ) : null}

      <div>
        <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
          {pending ? "Creando…" : "Crear grupo"}
        </button>
      </div>
    </form>
  );
}
