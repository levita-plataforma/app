"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import type { KidsProfileListItem } from "@/server/kids/kids-profiles-service";
import { altaPerfilKidsAction, type MenoresState } from "./actions";
import { primaryButtonStyle, secondaryButtonStyle, fullName } from "../ui";

const STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  inactive: "Inactivo",
  archived: "Archivado",
};

const initialState: MenoresState = { error: null };

export default function MenoresManager({
  profiles,
  canManage,
}: {
  profiles: KidsProfileListItem[];
  canManage: boolean;
}) {
  const [state, formAction, pending] = useActionState(altaPerfilKidsAction, initialState);
  const [showForm, setShowForm] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {canManage ? (
        <div>
          {showForm ? (
            <form
              action={formAction}
              className="shell-card"
              style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}
              noValidate
            >
              <div>
                <label htmlFor="alta-person-id" style={authLabelStyle}>
                  ID de la persona (ya registrada en Personas)
                </label>
                <input
                  id="alta-person-id"
                  name="personId"
                  required
                  placeholder="00000000-0000-0000-0000-000000000000"
                  style={{ ...authInputStyle, width: "100%" }}
                />
                <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)", marginTop: 4 }}>
                  Copia el ID desde la ficha de la persona en /app/personas. Si el perfil Kids ya
                  existe para esa persona, simplemente se muestra.
                </p>
              </div>

              {state.error ? (
                <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
                  {state.error}
                </p>
              ) : null}

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
                  {pending ? "Creando…" : "Dar de alta perfil Kids"}
                </button>
                <button type="button" onClick={() => setShowForm(false)} style={secondaryButtonStyle()}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setShowForm(true)} style={primaryButtonStyle()}>
              <Plus size={14} /> Dar de alta perfil Kids
            </button>
          )}
        </div>
      ) : null}

      {profiles.length === 0 ? (
        <div className="shell-card shell-empty-state">
          <h3>Todavía no hay menores con perfil Kids</h3>
          <p>Da de alta el perfil de una persona ya registrada en Personas.</p>
        </div>
      ) : (
        <div className="shell-card list-card">
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Edad</th>
                  <th>Household</th>
                  <th>Responsables</th>
                  <th>Autorizaciones activas</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Nombre">
                      <Link
                        href={`/app/kids/menores/${p.personId}`}
                        style={{ fontWeight: 600, color: "var(--shell-text)", textDecoration: "none" }}
                      >
                        {fullName(p.firstName, p.lastName)}
                      </Link>
                      {p.preferredName ? <div className="serving-meta">&quot;{p.preferredName}&quot;</div> : null}
                    </td>
                    <td data-label="Edad" className="serving-meta">
                      {p.age !== null ? `${p.age} años` : "—"}
                    </td>
                    <td data-label="Household" className="serving-meta">
                      {p.householdName ?? "—"}
                    </td>
                    <td data-label="Responsables">{p.activeGuardiansCount}</td>
                    <td data-label="Autorizaciones activas">{p.activePickupAuthorizationsCount}</td>
                    <td data-label="Estado">
                      <span className={`serving-chip ${p.status === "active" ? "is-success" : "is-muted"}`}>
                        {STATUS_LABELS[p.status] ?? p.status}
                        {p.medicalAlertFlag ? " · ⚠︎" : ""}
                      </span>
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
