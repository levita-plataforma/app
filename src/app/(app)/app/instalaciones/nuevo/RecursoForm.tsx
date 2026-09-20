"use client";

import { useActionState } from "react";
import Link from "next/link";
import { guardarRecursoAction, type AccionState } from "../actions";
import { fieldStyle, inputStyle, labelStyle, primaryButtonStyle, secondaryButtonStyle, selectStyle } from "../ui";

const INICIAL: AccionState = { error: null, ok: null };

/**
 * El aforo solo se pide para salas: en un proyector no significa nada, y un
 * campo que no significa nada se acaba rellenando con cualquier cosa. Tampoco
 * es la cantidad de unidades: cada unidad física es su propio recurso.
 */
export default function RecursoForm({ sedes }: { sedes: { id: string; name: string }[] }) {
  const [estado, accion, pendiente] = useActionState(guardarRecursoAction, INICIAL);

  return (
    <form action={accion} className="shell-card" style={{ padding: 16, display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="rec-nombre">Nombre</label>
        <input id="rec-nombre" name="name" required maxLength={120} placeholder="Auditorio" style={inputStyle} disabled={pendiente} />
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="rec-tipo">Tipo</label>
        <select id="rec-tipo" name="type" required style={selectStyle} disabled={pendiente} defaultValue="room">
          <option value="room">Sala</option>
          <option value="equipment">Equipo</option>
          <option value="vehicle">Vehículo</option>
          <option value="other">Otro</option>
        </select>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="rec-sede">Sede</label>
        <select id="rec-sede" name="campusId" style={selectStyle} disabled={pendiente} defaultValue="">
          <option value="">Toda la iglesia</option>
          {sedes.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div style={fieldStyle}>
        <label style={labelStyle} htmlFor="rec-aforo">Aforo (solo salas)</label>
        <input id="rec-aforo" name="capacity" type="number" min={1} style={inputStyle} disabled={pendiente} />
      </div>

      <div style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
        <label style={labelStyle} htmlFor="rec-ubicacion">Dónde está</label>
        <input id="rec-ubicacion" name="locationDetails" maxLength={200} placeholder="Planta 1, junto a la cocina" style={inputStyle} disabled={pendiente} />
      </div>

      <div style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
        <label style={labelStyle} htmlFor="rec-desc">Descripción</label>
        <textarea id="rec-desc" name="description" rows={3} maxLength={500} style={{ ...inputStyle, resize: "vertical" }} disabled={pendiente} />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" name="reservable" defaultChecked disabled={pendiente} />
        Se puede reservar
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <input type="checkbox" name="requiresApproval" disabled={pendiente} />
        Las reservas necesitan aprobación
      </label>

      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="submit" style={primaryButtonStyle(pendiente)} disabled={pendiente}>
          {pendiente ? "Guardando…" : "Guardar recurso"}
        </button>
        <Link href="/app/instalaciones" style={secondaryButtonStyle()}>Cancelar</Link>
      </div>

      {estado.error && (
        <p role="alert" style={{ gridColumn: "1 / -1", margin: 0, color: "var(--shell-danger)", fontSize: 12.5 }}>
          {estado.error}
        </p>
      )}
      {estado.ok && (
        <p role="status" style={{ gridColumn: "1 / -1", margin: 0, color: "var(--shell-success)", fontSize: 12.5 }}>
          {estado.ok}
        </p>
      )}
    </form>
  );
}
