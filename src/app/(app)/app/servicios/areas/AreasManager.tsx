"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUp, ArrowDown, Plus } from "lucide-react";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import type { ServiceAreaListItem, ServiceAreaTemplate } from "@/server/serving/service-areas-service";
import {
  crearAreaAction,
  archivarAreaAction,
  restaurarAreaAction,
  editarAreaAction,
  reordenarAreasAction,
  type AreasState,
} from "./actions";
import { primaryButtonStyle, secondaryButtonStyle, subtleButtonStyle, fullName } from "../ui";

const initialState: AreasState = { error: null };

export default function AreasManager({
  areas,
  templates,
  campuses,
  canManage,
  showingArchived,
}: {
  areas: ServiceAreaListItem[];
  templates: ServiceAreaTemplate[];
  campuses: { id: string; name: string }[];
  canManage: boolean;
  showingArchived: boolean;
}) {
  const [state, formAction, creating] = useActionState(crearAreaAction, initialState);
  const [showForm, setShowForm] = useState(false);
  const [template, setTemplate] = useState<ServiceAreaTemplate | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<AreasState>) {
    startTransition(async () => {
      const result = await fn();
      setError(result.error);
    });
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...areas];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    run(() => reordenarAreasAction(next.map((a) => a.id)));
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
                <label htmlFor="area-template" style={authLabelStyle}>
                  Usar una plantilla sugerida (opcional)
                </label>
                <select
                  id="area-template"
                  name="templateKey"
                  style={{ ...authInputStyle, width: "100%" }}
                  onChange={(e) =>
                    setTemplate(templates.find((t) => t.key === e.target.value) ?? null)
                  }
                >
                  <option value="">Sin plantilla — definir desde cero</option>
                  {templates.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)", marginTop: 4 }}>
                  Las plantillas solo rellenan el formulario. Puedes cambiar cualquier dato.
                </p>
              </div>

              <div>
                <label htmlFor="area-name" style={authLabelStyle}>
                  Nombre del área
                </label>
                <input
                  id="area-name"
                  name="name"
                  required
                  key={template?.key ?? "blank"}
                  defaultValue={template?.name ?? ""}
                  placeholder="Sonido"
                  style={{ ...authInputStyle, width: "100%" }}
                />
              </div>

              <div>
                <label htmlFor="area-description" style={authLabelStyle}>
                  Descripción
                </label>
                <input
                  id="area-description"
                  name="description"
                  key={`desc-${template?.key ?? "blank"}`}
                  defaultValue={template?.description ?? ""}
                  style={{ ...authInputStyle, width: "100%" }}
                />
              </div>

              <input type="hidden" name="icon" value={template?.icon ?? ""} />

              {campuses.length > 0 ? (
                <div>
                  <label htmlFor="area-campus" style={authLabelStyle}>
                    Sede
                  </label>
                  <select id="area-campus" name="campusId" style={{ ...authInputStyle, width: "100%" }}>
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
                  {creating ? "Creando…" : "Crear área"}
                </button>
                <button type="button" onClick={() => setShowForm(false)} style={secondaryButtonStyle()}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setShowForm(true)} style={primaryButtonStyle()}>
              <Plus size={14} /> Nueva área de servicio
            </button>
          )}
        </div>
      ) : null}

      {areas.length === 0 ? (
        <div className="shell-card shell-empty-state">
          <h3>{showingArchived ? "No hay áreas archivadas" : "Todavía no hay áreas de servicio"}</h3>
          <p>
            {showingArchived
              ? "Las áreas que archives aparecerán aquí."
              : "Crea las áreas que ya funcionan en tu iglesia: Sonido, Bienvenida, Niños…"}
          </p>
        </div>
      ) : (
        <div className="shell-card list-card">
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Área</th>
                  <th>Responsables</th>
                  <th>Personas</th>
                  <th>Puestos</th>
                  <th>Sede</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {areas.map((area, index) => (
                  <tr key={area.id}>
                    <td data-label="Área">
                      <Link
                        href={`/app/servicios/areas/${area.id}`}
                        style={{ fontWeight: 600, color: "var(--shell-text)", textDecoration: "none" }}
                      >
                        {area.name}
                      </Link>
                      {area.description ? <div className="serving-meta">{area.description}</div> : null}
                    </td>
                    <td data-label="Responsables" className="serving-meta">
                      {area.leaders.length === 0
                        ? "Sin responsable"
                        : area.leaders.map((l) => fullName(l.firstName, l.lastName)).join(", ")}
                    </td>
                    <td data-label="Personas">{area.memberCount}</td>
                    <td data-label="Puestos">{area.positionCount}</td>
                    <td data-label="Sede" className="serving-meta">
                      {area.campusName ?? "Toda la iglesia"}
                    </td>
                    <td data-label="Estado">
                      <span className={`serving-chip ${area.active ? "is-success" : "is-muted"}`}>
                        {area.archivedAt ? "Archivada" : area.active ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td data-label="">
                      {canManage ? (
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          {!showingArchived ? (
                            <>
                              <button
                                type="button"
                                aria-label={`Subir ${area.name}`}
                                disabled={pending || index === 0}
                                onClick={() => move(index, -1)}
                                style={subtleButtonStyle}
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                type="button"
                                aria-label={`Bajar ${area.name}`}
                                disabled={pending || index === areas.length - 1}
                                onClick={() => move(index, 1)}
                                style={subtleButtonStyle}
                              >
                                <ArrowDown size={14} />
                              </button>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => run(() => editarAreaAction(area.id, { active: !area.active }))}
                                style={subtleButtonStyle}
                              >
                                {area.active ? "Desactivar" : "Activar"}
                              </button>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => run(() => archivarAreaAction(area.id))}
                                style={subtleButtonStyle}
                              >
                                Archivar
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => run(() => restaurarAreaAction(area.id))}
                              style={subtleButtonStyle}
                            >
                              Restaurar
                            </button>
                          )}
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
