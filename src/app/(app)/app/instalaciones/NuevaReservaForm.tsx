"use client";

import { useActionState } from "react";
import { CalendarPlus } from "lucide-react";
import { crearReservaAction, type AccionState } from "./actions";
import { fieldStyle, inputStyle, labelStyle, primaryButtonStyle, selectStyle } from "./ui";

const INICIAL: AccionState = { error: null, ok: null };

/**
 * Reservar un recurso sin pasar por una actividad: prestar un proyector, usar
 * una sala para una reunión administrativa, sacar la furgoneta. El encargo pide
 * expresamente no obligar a inventarse un culto para esto.
 *
 * El horario se envía tal como se escribe y lo interpreta la base con la zona
 * de la iglesia. Aquí no se hace ninguna cuenta con husos.
 *
 * Si el recurso está ocupado, el mensaje que se ve viene de la base y dice qué
 * franja choca y a qué hora, pero nunca de qué va lo que la ocupa.
 */
export default function NuevaReservaForm({ recursos }: { recursos: { id: string; name: string }[] }) {
  const [estado, accion, pendiente] = useActionState(crearReservaAction, INICIAL);

  return (
    <section className="shell-card" style={{ padding: 16 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 15 }}>Reservar un recurso</h2>

      <form action={accion} style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="reserva-recurso">Recurso</label>
          <select id="reserva-recurso" name="resourceId" required style={selectStyle} disabled={pendiente}>
            {recursos.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="reserva-desde">Desde</label>
          <input id="reserva-desde" name="startsAt" type="datetime-local" required style={inputStyle} disabled={pendiente} />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="reserva-hasta">Hasta</label>
          <input id="reserva-hasta" name="endsAt" type="datetime-local" required style={inputStyle} disabled={pendiente} />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle} htmlFor="reserva-proposito">Para qué</label>
          <input
            id="reserva-proposito"
            name="purpose"
            required
            maxLength={200}
            placeholder="Ensayo del grupo de alabanza"
            style={inputStyle}
            disabled={pendiente}
          />
        </div>

        <div style={{ ...fieldStyle, alignSelf: "end" }}>
          <button type="submit" style={primaryButtonStyle(pendiente)} disabled={pendiente}>
            <CalendarPlus aria-hidden="true" size={15} />
            {pendiente ? "Reservando…" : "Reservar"}
          </button>
        </div>
      </form>

      {estado.error && (
        <p role="alert" style={{ marginTop: 10, marginBottom: 0, color: "var(--shell-danger)", fontSize: 12.5 }}>
          {estado.error}
        </p>
      )}
      {estado.ok && (
        <p role="status" style={{ marginTop: 10, marginBottom: 0, color: "var(--shell-success)", fontSize: 12.5 }}>
          {estado.ok}
        </p>
      )}
    </section>
  );
}
