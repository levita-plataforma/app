"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import type { ServiceTeamListItem } from "@/server/serving/service-teams-service";
import {
  crearEquipoAction,
  editarEquipoAction,
  archivarEquipoAction,
  anadirMiembroEquipoAction,
  quitarMiembroEquipoAction,
  type EquiposState,
} from "./actions";
import { primaryButtonStyle, secondaryButtonStyle, subtleButtonStyle, fullName } from "../ui";

const initialState: EquiposState = { error: null };

type PersonOption = { id: string; firstName: string; lastName: string | null };

export default function EquiposManager({
  teams,
  areas,
  campuses,
  people,
  canManage,
}: {
  teams: ServiceTeamListItem[];
  areas: { id: string; name: string }[];
  campuses: { id: string; name: string }[];
  people: PersonOption[];
  canManage: boolean;
}) {
  const [state, formAction, creating] = useActionState(crearEquipoAction, initialState);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [selectedPerson, setSelectedPerson] = useState<Record<string, string>>({});

  function run(fn: () => Promise<EquiposState>) {
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

      {canManage && areas.length > 0 ? (
        showForm ? (
          <form
            action={formAction}
            className="shell-card"
            style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}
            noValidate
          >
            <div>
              <label htmlFor="team-area" style={authLabelStyle}>
                Área de servicio
              </label>
              <select id="team-area" name="areaId" required style={{ ...authInputStyle, width: "100%" }}>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="team-name" style={authLabelStyle}>
                Nombre del equipo
              </label>
              <input
                id="team-name"
                name="name"
                required
                placeholder="Equipo A"
                style={{ ...authInputStyle, width: "100%" }}
              />
            </div>
            <div>
              <label htmlFor="team-desc" style={authLabelStyle}>
                Descripción
              </label>
              <input id="team-desc" name="description" style={{ ...authInputStyle, width: "100%" }} />
            </div>
            {campuses.length > 0 ? (
              <div>
                <label htmlFor="team-campus" style={authLabelStyle}>
                  Sede
                </label>
                <select id="team-campus" name="campusId" style={{ ...authInputStyle, width: "100%" }}>
                  <option value="">Toda la iglesia</option>
                  {campuses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {state.error ? (
              <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
                {state.error}
              </p>
            ) : null}

            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={creating} style={primaryButtonStyle(creating)}>
                {creating ? "Creando…" : "Crear equipo"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={secondaryButtonStyle()}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setShowForm(true)} style={{ ...primaryButtonStyle(), alignSelf: "flex-start" }}>
            <Plus size={14} /> Nuevo equipo
          </button>
        )
      ) : null}

      {teams.length === 0 ? (
        <div className="shell-card shell-empty-state">
          <h3>Todavía no hay equipos</h3>
          <p>
            {areas.length === 0
              ? "Crea primero un área de servicio: los equipos siempre pertenecen a un área."
              : "Un equipo agrupa a las personas que sirven juntas de forma estable dentro de un área."}
          </p>
          {areas.length === 0 ? (
            <Link
              href="/app/servicios/areas"
              style={{ fontSize: 12.5, fontWeight: 600, color: "var(--shell-brand)", textDecoration: "none", marginTop: 8 }}
            >
              Ir a Áreas de servicio →
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="serving-grid">
          {teams.map((team) => {
            const memberIds = new Set(team.members.map((m) => m.personId));
            const available = people.filter((p) => !memberIds.has(p.id));
            return (
              <div
                key={team.id}
                className="shell-card"
                style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <p style={{ fontSize: 14.5, fontWeight: 600 }}>{team.name}</p>
                    <p className="serving-meta">
                      {team.areaName}
                      {team.campusName ? ` · ${team.campusName}` : ""}
                    </p>
                  </div>
                  <span className={`serving-chip ${team.active ? "is-success" : "is-muted"}`}>
                    {team.active ? "Activo" : "Inactivo"}
                  </span>
                </div>

                {team.description ? <p className="serving-meta">{team.description}</p> : null}

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {team.members.length === 0 ? (
                    <p className="serving-meta">Todavía sin personas.</p>
                  ) : (
                    team.members.map((m) => (
                      <span key={m.id} className={`serving-chip ${m.isLeader ? "is-success" : ""}`}>
                        {fullName(m.firstName, m.lastName)}
                        {m.isLeader ? " · Líder" : ""}
                        {canManage ? (
                          <button
                            type="button"
                            aria-label={`Quitar a ${fullName(m.firstName, m.lastName)} de ${team.name}`}
                            disabled={pending}
                            onClick={() => run(() => quitarMiembroEquipoAction(team.id, m.personId))}
                            style={{ ...subtleButtonStyle, fontSize: 13 }}
                          >
                            ×
                          </button>
                        ) : null}
                      </span>
                    ))
                  )}
                </div>

                {canManage ? (
                  <>
                    <div className="serving-toolbar">
                      <select
                        value={selectedPerson[team.id] ?? ""}
                        onChange={(e) =>
                          setSelectedPerson((prev) => ({ ...prev, [team.id]: e.target.value }))
                        }
                        aria-label={`Añadir persona a ${team.name}`}
                        style={{ ...authInputStyle, flex: "1 1 140px", fontSize: 12.5 }}
                      >
                        <option value="">Añadir persona…</option>
                        {available.map((p) => (
                          <option key={p.id} value={p.id}>
                            {fullName(p.firstName, p.lastName)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={pending || !selectedPerson[team.id]}
                        onClick={() => {
                          const personId = selectedPerson[team.id];
                          if (!personId) return;
                          run(() => anadirMiembroEquipoAction(team.id, personId, false));
                          setSelectedPerson((prev) => ({ ...prev, [team.id]: "" }));
                        }}
                        style={secondaryButtonStyle(pending)}
                      >
                        Añadir
                      </button>
                      <button
                        type="button"
                        disabled={pending || !selectedPerson[team.id]}
                        onClick={() => {
                          const personId = selectedPerson[team.id];
                          if (!personId) return;
                          run(() => anadirMiembroEquipoAction(team.id, personId, true));
                          setSelectedPerson((prev) => ({ ...prev, [team.id]: "" }));
                        }}
                        style={secondaryButtonStyle(pending)}
                      >
                        Añadir como líder
                      </button>
                    </div>

                    <div style={{ display: "flex", gap: 12 }}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => editarEquipoAction(team.id, { active: !team.active }))}
                        style={subtleButtonStyle}
                      >
                        {team.active ? "Desactivar" : "Activar"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => archivarEquipoAction(team.id))}
                        style={subtleButtonStyle}
                      >
                        Archivar
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
