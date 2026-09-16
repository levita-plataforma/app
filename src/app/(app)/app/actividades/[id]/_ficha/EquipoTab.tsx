"use client";

import { Users } from "lucide-react";
import type { StructureTabsData } from "../_estructura/load";

/** Equipo: sin asignaciones en Fase 4. Solo necesidades reales, nunca personas inventadas. */
export default function EquipoTab({ data }: { data: StructureTabsData }) {
  const positions = data.structure.areas.flatMap((area) =>
    area.positions.map((p) => ({ ...p, areaName: area.areaName })),
  );

  return (
    <div className="act-form" style={{ paddingTop: 16 }}>
      <div className="act-notice is-info">
        <Users size={16} aria-hidden="true" />
        <span>
          Las asignaciones de personas, la disponibilidad y las respuestas llegan en la Fase 5. Aquí verás quién sirve en
          cada puesto cuando estén disponibles.
        </span>
      </div>

      <section className="shell-card act-table-card">
        {positions.length === 0 ? (
          <div className="shell-empty-state">
            <h3>Sin puestos definidos</h3>
            <p>Añade áreas y puestos en las pestañas correspondientes para conocer cuántas personas hacen falta.</p>
          </div>
        ) : (
          <table className="serving-table">
            <thead>
              <tr>
                <th scope="col">Puesto</th>
                <th scope="col">Área</th>
                <th scope="col">Mínimo</th>
                <th scope="col">Asignadas</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id}>
                  <td data-label="">
                    <strong style={{ fontWeight: 600 }}>{p.name}</strong>
                    {p.critical ? (
                      <span className="serving-chip is-warning" style={{ marginLeft: 6 }}>
                        Crítico
                      </span>
                    ) : null}
                  </td>
                  <td data-label="Área">{p.areaName}</td>
                  <td data-label="Mínimo">
                    {p.minPeople}
                    {p.maxPeople !== null ? ` (máx. ${p.maxPeople})` : ""}
                  </td>
                  <td data-label="Asignadas">0 asignadas</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
