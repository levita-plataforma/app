"use client";

import { useActionState, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import type { KidsRoom } from "@/server/kids/kids-rooms-service";
import { crearSalaAction, editarSalaAction, archivarSalaAction, type SalasState } from "./actions";
import { primaryButtonStyle, secondaryButtonStyle, subtleButtonStyle } from "../ui";

const initialState: SalasState = { error: null };

export default function SalasManager({
  rooms,
  campuses,
  canManage,
  showingArchived,
}: {
  rooms: KidsRoom[];
  campuses: { id: string; name: string }[];
  canManage: boolean;
  showingArchived: boolean;
}) {
  const [state, formAction, creating] = useActionState(crearSalaAction, initialState);
  const [showForm, setShowForm] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<SalasState>) {
    startTransition(async () => {
      const result = await fn();
      setError(result.error);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      ) : null}

      {canManage && !showingArchived ? (
        <div>
          {showForm ? (
            <form
              action={formAction}
              className="shell-card"
              style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}
              noValidate
            >
              <div>
                <label htmlFor="room-name" style={authLabelStyle}>
                  Nombre de la sala
                </label>
                <input id="room-name" name="name" required placeholder="Sala Bebés" style={{ ...authInputStyle, width: "100%" }} />
              </div>

              <div>
                <label htmlFor="room-description" style={authLabelStyle}>
                  Descripción
                </label>
                <input id="room-description" name="description" style={{ ...authInputStyle, width: "100%" }} />
              </div>

              {campuses.length > 0 ? (
                <div>
                  <label htmlFor="room-campus" style={authLabelStyle}>
                    Sede
                  </label>
                  <select id="room-campus" name="campusId" style={{ ...authInputStyle, width: "100%" }}>
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
                <div>
                  <label htmlFor="room-age-min" style={authLabelStyle}>
                    Edad mín. (meses)
                  </label>
                  <input id="room-age-min" name="ageMinMonths" type="number" min={0} style={{ ...authInputStyle, width: 120 }} />
                </div>
                <div>
                  <label htmlFor="room-age-max" style={authLabelStyle}>
                    Edad máx. (meses)
                  </label>
                  <input id="room-age-max" name="ageMaxMonths" type="number" min={0} style={{ ...authInputStyle, width: 120 }} />
                </div>
                <div>
                  <label htmlFor="room-capacity" style={authLabelStyle}>
                    Capacidad
                  </label>
                  <input id="room-capacity" name="capacity" type="number" min={1} required defaultValue={10} style={{ ...authInputStyle, width: 100 }} />
                </div>
              </div>

              <div className="serving-toolbar">
                <div>
                  <label htmlFor="room-min-adults" style={authLabelStyle}>
                    Adultos mínimos
                  </label>
                  <input id="room-min-adults" name="minAdults" type="number" min={1} defaultValue={1} style={{ ...authInputStyle, width: 120 }} />
                </div>
                <div>
                  <label htmlFor="room-ratio" style={authLabelStyle}>
                    Ratio niños/adulto
                  </label>
                  <input id="room-ratio" name="ratioChildrenPerAdult" type="number" min={1} defaultValue={6} style={{ ...authInputStyle, width: 120 }} />
                </div>
                <div style={{ flex: "1 1 200px" }}>
                  <label htmlFor="room-location" style={authLabelStyle}>
                    Ubicación
                  </label>
                  <input id="room-location" name="locationText" style={{ ...authInputStyle, width: "100%" }} />
                </div>
              </div>

              {state.error ? (
                <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
                  {state.error}
                </p>
              ) : null}

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={creating} style={primaryButtonStyle(creating)}>
                  {creating ? "Creando…" : "Crear sala"}
                </button>
                <button type="button" onClick={() => setShowForm(false)} style={secondaryButtonStyle()}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setShowForm(true)} style={primaryButtonStyle()}>
              <Plus size={14} /> Nueva sala
            </button>
          )}
        </div>
      ) : null}

      {rooms.length === 0 ? (
        <div className="shell-card shell-empty-state">
          <h3>{showingArchived ? "No hay salas archivadas" : "Todavía no hay salas Kids"}</h3>
          <p>
            {showingArchived
              ? "Las salas que archives aparecerán aquí."
              : "Crea las salas que ya usa tu iglesia: Bebés, Preescolar, Primaria…"}
          </p>
        </div>
      ) : (
        <div className="shell-card list-card">
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Sala</th>
                  <th>Franja de edad</th>
                  <th>Capacidad</th>
                  <th>Ratio</th>
                  <th>Sede</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => (
                  <tr key={room.id}>
                    <td data-label="Sala">
                      <span style={{ fontWeight: 600 }}>{room.name}</span>
                      {room.description ? <div className="serving-meta">{room.description}</div> : null}
                      {room.locationText ? <div className="serving-meta">{room.locationText}</div> : null}
                    </td>
                    <td data-label="Franja de edad" className="serving-meta">
                      {ageRangeLabel(room.ageMinMonths, room.ageMaxMonths)}
                    </td>
                    <td data-label="Capacidad">{room.capacity}</td>
                    <td data-label="Ratio" className="serving-meta">
                      1:{room.ratioChildrenPerAdult} (mín. {room.minAdults} adulto{room.minAdults === 1 ? "" : "s"})
                    </td>
                    <td data-label="Sede" className="serving-meta">
                      {campuses.find((c) => c.id === room.campusId)?.name ?? "Toda la iglesia"}
                    </td>
                    <td data-label="Estado">
                      <span className={`serving-chip ${room.active ? "is-success" : "is-muted"}`}>
                        {room.archivedAt ? "Archivada" : room.active ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td data-label="">
                      {canManage && !showingArchived ? (
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => editarSalaAction(room.id, { active: !room.active }))}
                            style={subtleButtonStyle}
                          >
                            {room.active ? "Desactivar" : "Activar"}
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => archivarSalaAction(room.id))}
                            style={subtleButtonStyle}
                          >
                            Archivar
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ageRangeLabel(minMonths: number | null, maxMonths: number | null): string {
  if (minMonths === null && maxMonths === null) return "Sin definir";
  const min = minMonths !== null ? `${minMonths}m` : "0m";
  const max = maxMonths !== null ? `${maxMonths}m` : "+";
  return `${min} – ${max}`;
}
