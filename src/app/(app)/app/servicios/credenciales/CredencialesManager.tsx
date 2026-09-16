"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Lock } from "lucide-react";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import type { CredentialType, PersonCredential } from "@/server/serving/credentials-service";
import { CREDENTIAL_STATUS_LABELS, type CredentialStatus } from "../labels";
import {
  crearTipoCredencialAction,
  editarTipoCredencialAction,
  archivarTipoCredencialAction,
  registrarCredencialAction,
  verificarCredencialAction,
  revocarCredencialAction,
  actualizarCredencialAction,
  type CredencialesState,
} from "./actions";
import { primaryButtonStyle, secondaryButtonStyle, subtleButtonStyle, fullName, formatDate } from "../ui";

const initialState: CredencialesState = { error: null };

type PersonOption = { id: string; firstName: string; lastName: string | null };

function statusChipClass(credential: PersonCredential): string {
  if (credential.status === "valid") {
    if (credential.expiresAt && new Date(credential.expiresAt) < new Date()) return "is-danger";
    return "is-success";
  }
  if (credential.status === "pending") return "is-warning";
  return "is-danger";
}

export default function CredencialesManager({
  credentialTypes,
  credentials,
  people,
  canManage,
  canSeeSensitive,
}: {
  credentialTypes: CredentialType[];
  credentials: PersonCredential[];
  people: PersonOption[];
  canManage: boolean;
  canSeeSensitive: boolean;
}) {
  const [typeState, typeAction, creatingType] = useActionState(crearTipoCredencialAction, initialState);
  const [assignState, assignAction, assigning] = useActionState(registrarCredencialAction, initialState);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<CredencialesState>) {
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

      {!canSeeSensitive ? (
        <p style={{ fontSize: 12, color: "var(--shell-text-subtle)", display: "flex", alignItems: "center", gap: 6 }}>
          <Lock size={13} /> No ves las credenciales marcadas como sensibles (protección de menores y
          equivalentes).
        </p>
      ) : null}

      <div className="shell-card list-card">
        <div className="list-card-header">
          <h2>Tipos de credencial</h2>
        </div>
        {credentialTypes.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "32px 12px" }}>
            <h3>Todavía no hay tipos definidos</h3>
            <p>
              Define qué acreditaciones necesita tu iglesia. LEVITA guarda el estado y la vigencia,
              nunca el documento.
            </p>
          </div>
        ) : (
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Vencimiento</th>
                  <th>Sensible</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {credentialTypes.map((t) => (
                  <tr key={t.id}>
                    <td data-label="Tipo">
                      <span style={{ fontWeight: 600 }}>{t.name}</span>
                      {t.description ? <div className="serving-meta">{t.description}</div> : null}
                    </td>
                    <td data-label="Vencimiento" className="serving-meta">
                      {t.requiresExpiry ? "Obligatorio" : "No aplica"}
                    </td>
                    <td data-label="Sensible">
                      {t.sensitive ? (
                        <span className="serving-chip is-danger">
                          <Lock size={11} /> Sensible
                        </span>
                      ) : (
                        <span className="serving-chip is-muted">Normal</span>
                      )}
                    </td>
                    <td data-label="Estado">
                      <span className={`serving-chip ${t.active ? "is-success" : "is-muted"}`}>
                        {t.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td data-label="">
                      {canManage ? (
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => editarTipoCredencialAction(t.id, { active: !t.active }))}
                            style={subtleButtonStyle}
                          >
                            {t.active ? "Desactivar" : "Activar"}
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => archivarTipoCredencialAction(t.id))}
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
        )}

        {canManage ? (
          showTypeForm ? (
            <form
              action={typeAction}
              style={{ padding: 18, borderTop: "1px solid var(--shell-border)", display: "flex", flexDirection: "column", gap: 12 }}
              noValidate
            >
              <div>
                <label htmlFor="ct-name" style={authLabelStyle}>
                  Nombre del tipo
                </label>
                <input
                  id="ct-name"
                  name="name"
                  required
                  placeholder="Certificado de delitos sexuales"
                  style={{ ...authInputStyle, width: "100%" }}
                />
              </div>
              <div>
                <label htmlFor="ct-desc" style={authLabelStyle}>
                  Descripción
                </label>
                <input id="ct-desc" name="description" style={{ ...authInputStyle, width: "100%" }} />
              </div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" name="requiresExpiry" defaultChecked /> Requiere vencimiento
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" name="sensitive" /> Sensible (protección de menores)
                </label>
              </div>
              {typeState.error ? (
                <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
                  {typeState.error}
                </p>
              ) : null}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={creatingType} style={primaryButtonStyle(creatingType)}>
                  {creatingType ? "Creando…" : "Crear tipo"}
                </button>
                <button type="button" onClick={() => setShowTypeForm(false)} style={secondaryButtonStyle()}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div style={{ padding: 16, borderTop: "1px solid var(--shell-border)" }}>
              <button type="button" onClick={() => setShowTypeForm(true)} style={secondaryButtonStyle()}>
                <Plus size={14} /> Nuevo tipo de credencial
              </button>
            </div>
          )
        ) : null}
      </div>

      {canManage && credentialTypes.length > 0 ? (
        <form action={assignAction} className="shell-card serving-toolbar" style={{ padding: 18 }} noValidate>
          <div style={{ flex: "1 1 150px" }}>
            <label htmlFor="cred-person" style={authLabelStyle}>
              Persona
            </label>
            <select id="cred-person" name="personId" required style={{ ...authInputStyle, width: "100%" }}>
              <option value="">Selecciona…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {fullName(p.firstName, p.lastName)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 150px" }}>
            <label htmlFor="cred-type" style={authLabelStyle}>
              Tipo
            </label>
            <select id="cred-type" name="credentialTypeId" required style={{ ...authInputStyle, width: "100%" }}>
              <option value="">Selecciona…</option>
              {credentialTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cred-status" style={authLabelStyle}>
              Estado
            </label>
            <select id="cred-status" name="status" style={authInputStyle}>
              {Object.entries(CREDENTIAL_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cred-issued" style={authLabelStyle}>
              Emitida
            </label>
            <input id="cred-issued" name="issuedAt" type="date" style={authInputStyle} />
          </div>
          <div>
            <label htmlFor="cred-expires" style={authLabelStyle}>
              Vence
            </label>
            <input id="cred-expires" name="expiresAt" type="date" style={authInputStyle} />
          </div>
          <div>
            <label htmlFor="cred-reference" style={authLabelStyle}>
              Referencia
            </label>
            <input
              id="cred-reference"
              name="reference"
              placeholder="Nº de expediente"
              style={authInputStyle}
            />
          </div>
          {assignState.error ? (
            <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)", width: "100%" }}>
              {assignState.error}
            </p>
          ) : null}
          <button type="submit" disabled={assigning} style={primaryButtonStyle(assigning)}>
            {assigning ? "Registrando…" : "Registrar"}
          </button>
        </form>
      ) : null}

      <div className="shell-card list-card">
        <div className="list-card-header">
          <h2>Credenciales de personas</h2>
        </div>
        {credentials.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "32px 12px" }}>
            <h3>No hay credenciales que mostrar</h3>
            <p>Ajusta los filtros o registra la primera credencial.</p>
          </div>
        ) : (
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Credencial</th>
                  <th>Estado</th>
                  <th>Vence</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {credentials.map((c) => (
                  <tr key={c.id}>
                    <td data-label="Persona">
                      <Link
                        href={`/app/personas/${c.personId}`}
                        style={{ fontWeight: 600, color: "var(--shell-text)", textDecoration: "none" }}
                      >
                        {fullName(c.firstName, c.lastName)}
                      </Link>
                    </td>
                    <td data-label="Credencial">
                      {c.credentialTypeName}
                      {c.sensitive ? (
                        <span className="serving-chip is-danger" style={{ marginLeft: 6 }}>
                          <Lock size={11} /> Sensible
                        </span>
                      ) : null}
                    </td>
                    <td data-label="Estado">
                      {canManage ? (
                        <select
                          defaultValue={c.status}
                          aria-label={`Estado de ${c.credentialTypeName}`}
                          disabled={pending}
                          onChange={(e) =>
                            run(() =>
                              actualizarCredencialAction(c.id, {
                                status: e.target.value as CredentialStatus,
                              }),
                            )
                          }
                          style={{ ...authInputStyle, padding: "5px 8px", fontSize: 12.5 }}
                        >
                          {Object.entries(CREDENTIAL_STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`serving-chip ${statusChipClass(c)}`}>
                          {CREDENTIAL_STATUS_LABELS[c.status]}
                        </span>
                      )}
                    </td>
                    <td data-label="Vence" className="serving-meta">
                      {formatDate(c.expiresAt)}
                    </td>
                    <td data-label="">
                      {canManage ? (
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {c.status !== "valid" ? (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => run(() => verificarCredencialAction(c.id))}
                              style={subtleButtonStyle}
                            >
                              Verificar
                            </button>
                          ) : null}
                          {c.status !== "revoked" ? (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => run(() => revocarCredencialAction(c.id))}
                              style={subtleButtonStyle}
                            >
                              Revocar
                            </button>
                          ) : null}
                        </div>
                      ) : null}
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
