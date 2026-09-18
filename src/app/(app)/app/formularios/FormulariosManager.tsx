"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { FormListItem } from "@/server/forms/forms-service";
import { duplicarFormularioAction, archivarFormularioAction, type FormulariosState } from "./actions";
import { subtleButtonStyle } from "./ui";

export default function FormulariosManager({
  forms,
  canManage,
  showingArchived,
}: {
  forms: FormListItem[];
  canManage: boolean;
  showingArchived: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<FormulariosState>) {
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

      <div className="shell-card list-card">
        <div className="list-card-header">
          <h2>{showingArchived ? "Formularios archivados" : "Catálogo de formularios"}</h2>
        </div>
        {forms.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "32px 12px" }}>
            <h3>{showingArchived ? "No hay formularios archivados" : "Todavía no hay formularios"}</h3>
            <p>
              Un formulario define los campos que se pedirán en una inscripción u otra necesidad de
              captura de datos. Es reutilizable y versionado.
            </p>
          </div>
        ) : (
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Formulario</th>
                  <th>Finalidad</th>
                  <th>Respuestas</th>
                  <th>Versión</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {forms.map((form) => (
                  <tr key={form.id}>
                    <td data-label="Formulario">
                      <Link
                        href={`/app/formularios/${form.id}`}
                        style={{ fontWeight: 600, color: "var(--shell-text)", textDecoration: "none" }}
                      >
                        {form.name}
                      </Link>
                      {form.description ? <div className="serving-meta">{form.description}</div> : null}
                    </td>
                    <td data-label="Finalidad" className="serving-meta">
                      {form.purpose}
                    </td>
                    <td data-label="Respuestas">{form.submissionCount}</td>
                    <td data-label="Versión">
                      <span className="serving-chip is-muted">v{form.currentVersion}</span>
                    </td>
                    <td data-label="Estado">
                      <span className={`serving-chip ${form.active ? "is-success" : "is-muted"}`}>
                        {form.archivedAt ? "Archivado" : form.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td data-label="">
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <Link
                          href={`/app/formularios/${form.id}`}
                          style={{ fontSize: 12, fontWeight: 600, color: "var(--shell-brand)", textDecoration: "none" }}
                        >
                          Ver/editar
                        </Link>
                        {canManage && !showingArchived ? (
                          <>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => run(() => duplicarFormularioAction(form.id))}
                              style={subtleButtonStyle}
                            >
                              Duplicar
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => run(() => archivarFormularioAction(form.id))}
                              style={subtleButtonStyle}
                            >
                              Archivar
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
