"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import type { ServicePosition } from "@/server/serving/service-positions-service";
import type { PositionRequirement } from "@/server/serving/position-requirements-service";
import {
  REQUIREMENT_TYPE_LABELS,
  STRICTNESS_LABELS,
  QUALIFICATION_LEVEL_LABELS,
  OPERATIONAL_LEVEL_LABELS,
  type RequirementType,
} from "../../../../labels";
import type { EligibilityGroups, PersonEligibility } from "@/server/serving/eligibility-service";
import {
  anadirRequisitoAction,
  quitarRequisitoAction,
  guardarPuestoAction,
  type PuestoState,
} from "./actions";
import { primaryButtonStyle, subtleButtonStyle, fullName } from "../../../../ui";

export default function PuestoFicha({
  position,
  requirements,
  eligibility,
  qualifications,
  credentialTypes,
  canManage,
}: {
  position: ServicePosition;
  requirements: PositionRequirement[];
  eligibility: EligibilityGroups;
  qualifications: { id: string; name: string }[];
  credentialTypes: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [requirementType, setRequirementType] = useState<RequirementType>("qualification");

  function run(fn: () => Promise<PuestoState>) {
    startTransition(async () => {
      const result = await fn();
      setError(result.error);
    });
  }

  return (
    <>
      <section>
        <Link
          href={`/app/servicios/areas/${position.areaId}`}
          style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}
        >
          ← {position.areaName}
        </Link>
        <h1 style={{ fontSize: 21, fontWeight: 600, marginTop: 6 }}>
          {position.name}
          {position.critical ? (
            <span className="serving-chip is-danger" style={{ marginLeft: 8, verticalAlign: "middle" }}>
              Crítico
            </span>
          ) : null}
        </h1>
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 2 }}>
          {position.minPeople}
          {position.maxPeople ? `–${position.maxPeople}` : "+"} persona
          {position.maxPeople === 1 && position.minPeople === 1 ? "" : "s"}
          {position.requiresAutonomousPerson ? " · Requiere nivel autónomo" : ""}
        </p>
      </section>

      {error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      ) : null}

      <div className="shell-card list-card">
        <div className="list-card-header">
          <h2>Requisitos</h2>
        </div>
        {requirements.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "28px 12px" }}>
            <h3>Sin requisitos definidos</h3>
            <p>Cualquier persona activa del área es elegible para este puesto.</p>
          </div>
        ) : (
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Requisito</th>
                  <th>Exigencia</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {requirements.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Tipo">{REQUIREMENT_TYPE_LABELS[r.type]}</td>
                    <td data-label="Requisito">
                      {r.type === "qualification"
                        ? `${r.qualificationName ?? "—"}${r.minLevel ? ` · ${QUALIFICATION_LEVEL_LABELS[r.minLevel]}` : ""}`
                        : r.type === "credential"
                          ? (r.credentialTypeName ?? "—")
                          : r.minOperationalLevel
                            ? OPERATIONAL_LEVEL_LABELS[r.minOperationalLevel]
                            : "—"}
                    </td>
                    <td data-label="Exigencia">
                      <span className={`serving-chip ${r.strictness === "required" ? "is-danger" : "is-warning"}`}>
                        {STRICTNESS_LABELS[r.strictness]}
                      </span>
                    </td>
                    <td data-label="">
                      {canManage ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => quitarRequisitoAction(position.areaId, position.id, r.id))}
                          style={subtleButtonStyle}
                        >
                          Quitar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canManage ? (
          <form
            className="serving-toolbar"
            style={{ padding: 16, borderTop: "1px solid var(--shell-border)" }}
            action={(formData) => run(() => anadirRequisitoAction(position.areaId, position.id, formData))}
          >
            <div>
              <label htmlFor="req-type" style={authLabelStyle}>
                Tipo
              </label>
              <select
                id="req-type"
                name="type"
                value={requirementType}
                onChange={(e) => setRequirementType(e.target.value as RequirementType)}
                style={authInputStyle}
              >
                {Object.entries(REQUIREMENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {requirementType === "qualification" ? (
              <>
                <div>
                  <label htmlFor="req-qualification" style={authLabelStyle}>
                    Cualificación
                  </label>
                  <select id="req-qualification" name="qualificationId" style={authInputStyle} required>
                    <option value="">Selecciona…</option>
                    {qualifications.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="req-min-level" style={authLabelStyle}>
                    Nivel mínimo
                  </label>
                  <select id="req-min-level" name="minLevel" style={authInputStyle}>
                    <option value="">Cualquiera</option>
                    {Object.entries(QUALIFICATION_LEVEL_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}

            {requirementType === "credential" ? (
              <div>
                <label htmlFor="req-credential" style={authLabelStyle}>
                  Tipo de credencial
                </label>
                <select id="req-credential" name="credentialTypeId" style={authInputStyle} required>
                  <option value="">Selecciona…</option>
                  {credentialTypes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {requirementType === "minimum_level" ? (
              <div>
                <label htmlFor="req-operational" style={authLabelStyle}>
                  Nivel operativo mínimo
                </label>
                <select id="req-operational" name="minOperationalLevel" style={authInputStyle} required>
                  {Object.entries(OPERATIONAL_LEVEL_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label htmlFor="req-strictness" style={authLabelStyle}>
                Exigencia
              </label>
              <select id="req-strictness" name="strictness" style={authInputStyle}>
                {Object.entries(STRICTNESS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
              Añadir requisito
            </button>
          </form>
        ) : null}
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Quién puede servir en este puesto</h2>
        <p className="serving-meta" style={{ marginTop: -8 }}>
          Elegibilidad no es asignación: indica quién cumple los requisitos, no quién sirve un día
          concreto.
        </p>

        <EligibilityGroup
          title="Elegibles"
          icon={<CheckCircle2 size={15} color="var(--shell-success)" />}
          people={eligibility.eligible}
          emptyText="Todavía nadie del área cumple todos los requisitos."
        />
        <EligibilityGroup
          title="Elegibles con advertencia"
          icon={<AlertTriangle size={15} color="var(--shell-warning)" />}
          people={eligibility.eligibleWithWarning}
          emptyText="Nadie con advertencias."
        />
        <EligibilityGroup
          title="No elegibles"
          icon={<XCircle size={15} color="var(--shell-danger)" />}
          people={eligibility.notEligible}
          emptyText="Nadie bloqueado."
        />
      </section>

      {canManage ? (
        <form
          className="shell-card"
          style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}
          action={(formData) => run(() => guardarPuestoAction(position.areaId, position.id, formData))}
        >
          <p style={{ fontSize: 14, fontWeight: 600 }}>Configuración del puesto</p>
          <div className="serving-toolbar">
            <input
              name="name"
              defaultValue={position.name}
              required
              aria-label="Nombre del puesto"
              style={{ ...authInputStyle, flex: "1 1 200px" }}
            />
            <input
              name="description"
              defaultValue={position.description ?? ""}
              aria-label="Descripción"
              placeholder="Descripción"
              style={{ ...authInputStyle, flex: "1 1 200px" }}
            />
            <input
              name="minPeople"
              type="number"
              min={0}
              defaultValue={position.minPeople}
              aria-label="Mínimo de personas"
              style={{ ...authInputStyle, width: 90 }}
            />
            <input
              name="maxPeople"
              type="number"
              min={0}
              defaultValue={position.maxPeople ?? ""}
              aria-label="Máximo de personas"
              placeholder="Máx."
              style={{ ...authInputStyle, width: 90 }}
            />
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" name="critical" defaultChecked={position.critical} /> Puesto crítico
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                name="requiresAutonomous"
                defaultChecked={position.requiresAutonomousPerson}
              />{" "}
              Requiere persona autónoma
            </label>
          </div>
          <button type="submit" disabled={pending} style={{ ...primaryButtonStyle(pending), alignSelf: "flex-start" }}>
            {pending ? "Guardando…" : "Guardar puesto"}
          </button>
        </form>
      ) : null}
    </>
  );
}

function EligibilityGroup({
  title,
  icon,
  people,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  people: PersonEligibility[];
  emptyText: string;
}) {
  return (
    <div className="shell-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon}
        <p style={{ fontSize: 13.5, fontWeight: 600 }}>
          {title} ({people.length})
        </p>
      </div>
      {people.length === 0 ? (
        <p className="serving-meta">{emptyText}</p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {people.map((p) => (
            <li
              key={p.personId}
              style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 13 }}
            >
              <Link
                href={`/app/personas/${p.personId}`}
                style={{ fontWeight: 600, color: "var(--shell-text)", textDecoration: "none" }}
              >
                {fullName(p.firstName, p.lastName)}
              </Link>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {p.reasonLabels.map((reason) => (
                  <span key={reason} className="serving-chip is-muted">
                    {reason}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
