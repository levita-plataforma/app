"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import type { KidsProfile, KidsSensitiveNotes } from "@/server/kids/kids-profiles-service";
import type { KidGuardian, SuggestedGuardian } from "@/server/kids/kid-guardians-service";
import type { PickupAuthorization, PickupAuthorizationType } from "@/server/kids/kid-pickup-service";
import type { KidsIncident } from "@/server/kids/kids-incidents-service";
import {
  anadirResponsableAction,
  quitarResponsableAction,
  sugerirGuardianesAction,
  crearAutorizacionAction,
  revocarAutorizacionAction,
  crearIncidenciaAction,
  guardarConfiguracionAction,
  archivarPerfilAction,
  type FichaState,
  type CrearAutorizacionInput,
  type CrearIncidenciaInput,
} from "./actions";
import { primaryButtonStyle, secondaryButtonStyle, subtleButtonStyle, fullName, formatDate } from "../../ui";

const PICKUP_STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  expired: "Expirada",
  revoked: "Revocada",
  used: "Usada",
  pending: "Pendiente",
};

const PICKUP_TYPE_LABELS: Record<string, string> = {
  permanent: "Permanente",
  date_range: "Rango de fechas",
  one_time: "Puntual",
};

type BaseTab = "Resumen" | "Responsables" | "Autorizaciones" | "Configuración";
type Tab = BaseTab | "Incidencias";

export type KidFichaProps = {
  profile: KidsProfile;
  guardians: KidGuardian[];
  pickupAuthorizations: PickupAuthorization[];
  incidents: KidsIncident[];
  /**
   * Notas de accesibilidad y de emergencia. Llegan en `null` cuando quien
   * mira no tiene kids.sensitive.read: ya no son columnas del perfil, viven
   * en `kids_sensitive_notes` con su propia RLS, así que el servidor ni
   * siquiera las trae.
   */
  sensitiveNotes: KidsSensitiveNotes | null;
  permissions: {
    canManageProfile: boolean;
    canManageGuardians: boolean;
    canManagePickup: boolean;
    canReadIncidents: boolean;
    canManageIncidents: boolean;
    canReadSensitive: boolean;
  };
};

export default function KidFicha({
  profile,
  guardians,
  pickupAuthorizations,
  incidents,
  sensitiveNotes,
  permissions,
}: KidFichaProps) {
  const [tab, setTab] = useState<Tab>("Resumen");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<FichaState>) {
    startTransition(async () => {
      const result = await fn();
      setError(result.error);
    });
  }

  // El tab de Incidencias solo se muestra si el servidor concedió
  // kids.incident.read; no depende de CSS: si el permiso falta, la pestaña
  // ni siquiera aparece en la lista ni tiene contenido para renderizar.
  const tabs: Tab[] = permissions.canReadIncidents
    ? ["Resumen", "Responsables", "Autorizaciones", "Incidencias", "Configuración"]
    : ["Resumen", "Responsables", "Autorizaciones", "Configuración"];

  return (
    <>
      <section
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <Link href="/app/kids/menores" style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}>
            ← Menores
          </Link>
          <h1 style={{ fontSize: 21, fontWeight: 600, marginTop: 6 }}>
            {fullName(profile.firstName, profile.lastName)}
          </h1>
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 2 }}>
            {profile.age !== null ? `${profile.age} años` : "Edad desconocida"}
            {profile.medicalAlertFlag ? " · ⚠︎ Alerta médica" : ""}
            {profile.status !== "active" ? ` · ${profile.status === "archived" ? "Archivado" : "Inactivo"}` : ""}
          </p>
        </div>
      </section>

      {error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      ) : null}

      <nav className="serving-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="serving-tab">
            {t}
          </button>
        ))}
      </nav>

      {tab === "Resumen" ? (
        <ResumenTab profile={profile} guardiansCount={guardians.length} sensitiveNotes={sensitiveNotes} />
      ) : null}

      {tab === "Responsables" ? (
        <ResponsablesTab
          kidPersonId={profile.personId}
          guardians={guardians}
          canManage={permissions.canManageGuardians}
          pending={pending}
          run={run}
        />
      ) : null}

      {tab === "Autorizaciones" ? (
        <AutorizacionesTab
          kidPersonId={profile.personId}
          authorizations={pickupAuthorizations}
          canManage={permissions.canManagePickup}
          pending={pending}
          run={run}
        />
      ) : null}

      {tab === "Incidencias" && permissions.canReadIncidents ? (
        <IncidenciasTab
          kidPersonId={profile.personId}
          incidents={incidents}
          canManage={permissions.canManageIncidents}
          pending={pending}
          run={run}
        />
      ) : null}

      {tab === "Configuración" ? (
        <ConfiguracionTab
          profile={profile}
          sensitiveNotes={sensitiveNotes}
          canManage={permissions.canManageProfile}
          canSeeSensitive={permissions.canReadSensitive}
          pending={pending}
          run={run}
        />
      ) : null}
    </>
  );
}

function ResumenTab({
  profile,
  guardiansCount,
  sensitiveNotes,
}: {
  profile: KidsProfile;
  guardiansCount: number;
  sensitiveNotes: KidsSensitiveNotes | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="serving-grid">
        <SummaryCard title="Nombre preferido">
          <p style={{ fontSize: 15 }}>{profile.preferredName ?? "—"}</p>
        </SummaryCard>
        <SummaryCard title="Fecha de nacimiento">
          <p style={{ fontSize: 15 }}>{formatDate(profile.birthDate)}</p>
        </SummaryCard>
        <SummaryCard title="Responsables">
          <p style={{ fontSize: 24, fontWeight: 600 }}>{guardiansCount}</p>
        </SummaryCard>
        <SummaryCard title="Alerta médica">
          <p style={{ fontSize: 15 }}>{profile.medicalAlertFlag ? "Sí" : "No"}</p>
        </SummaryCard>
      </div>

      {/* Las notas llegan en null si quien mira no tiene
          kids.sensitive.read: la RLS de kids_sensitive_notes no le devuelve
          la fila. Aquí solo se pinta lo que haya llegado. */}
      {sensitiveNotes?.accessibilityNotes || sensitiveNotes?.emergencyNotes ? (
        <div className="shell-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          {sensitiveNotes.accessibilityNotes ? (
            <div>
              <p style={authLabelStyle}>Notas de accesibilidad</p>
              <p style={{ fontSize: 13 }}>{sensitiveNotes.accessibilityNotes}</p>
            </div>
          ) : null}
          {sensitiveNotes.emergencyNotes ? (
            <div>
              <p style={authLabelStyle}>Notas de emergencia</p>
              <p style={{ fontSize: 13 }}>{sensitiveNotes.emergencyNotes}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="shell-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 6 }}>
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--shell-text-subtle)" }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function ResponsablesTab({
  kidPersonId,
  guardians,
  canManage,
  pending,
  run,
}: {
  kidPersonId: string;
  guardians: KidGuardian[];
  canManage: boolean;
  pending: boolean;
  run: (fn: () => Promise<FichaState>) => void;
}) {
  const [suggestions, setSuggestions] = useState<SuggestedGuardian[] | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [manualPersonId, setManualPersonId] = useState("");
  const [relationshipType, setRelationshipType] = useState("");

  async function loadSuggestions() {
    setLoadingSuggestions(true);
    const result = await sugerirGuardianesAction(kidPersonId);
    setSuggestions(result.suggestions);
    setLoadingSuggestions(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {canManage ? (
        <div className="shell-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <p style={authLabelStyle}>Sugerencias desde el household</p>
            <button type="button" disabled={loadingSuggestions} onClick={loadSuggestions} style={secondaryButtonStyle(loadingSuggestions)}>
              {loadingSuggestions ? "Buscando…" : "Sugerir desde household"}
            </button>
          </div>

          {suggestions !== null ? (
            suggestions.length === 0 ? (
              <p className="serving-meta">No hay otras personas en el household de este menor.</p>
            ) : (
              <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {suggestions.map((s) => (
                  <li
                    key={s.personId}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 13 }}
                  >
                    <span>
                      {fullName(s.firstName, s.lastName)}{" "}
                      <span className="serving-meta">({s.relationshipType})</span>
                    </span>
                    {s.alreadyGuardian ? (
                      <span className="serving-chip is-muted">Ya es responsable</span>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            anadirResponsableAction(kidPersonId, s.personId, {
                              relationshipType: s.relationshipType,
                            }),
                          )
                        }
                        style={secondaryButtonStyle(pending)}
                      >
                        Añadir como responsable
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )
          ) : null}
          <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
            Ninguna sugerencia se añade automáticamente: cada una requiere confirmación explícita.
          </p>
        </div>
      ) : null}

      {canManage ? (
        <div className="shell-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={authLabelStyle}>Añadir responsable manualmente</p>
          <div className="serving-toolbar">
            <input
              value={manualPersonId}
              onChange={(e) => setManualPersonId(e.target.value)}
              placeholder="ID de la persona adulta"
              aria-label="ID de la persona adulta"
              style={{ ...authInputStyle, flex: "1 1 220px" }}
            />
            <input
              value={relationshipType}
              onChange={(e) => setRelationshipType(e.target.value)}
              placeholder="Relación (ej. madre, padre, tutor)"
              aria-label="Tipo de relación"
              style={{ ...authInputStyle, flex: "1 1 200px" }}
            />
            <button
              type="button"
              disabled={pending || !manualPersonId.trim() || !relationshipType.trim()}
              onClick={() => {
                run(() => anadirResponsableAction(kidPersonId, manualPersonId.trim(), { relationshipType: relationshipType.trim() }));
                setManualPersonId("");
                setRelationshipType("");
              }}
              style={primaryButtonStyle(pending)}
            >
              Añadir
            </button>
          </div>
        </div>
      ) : null}

      {guardians.length === 0 ? (
        <div className="shell-card shell-empty-state">
          <h3>Sin responsables registrados</h3>
          <p>Añade al menos un responsable legal o de contacto de emergencia.</p>
        </div>
      ) : (
        <div className="shell-card list-card">
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Responsable</th>
                  <th>Relación</th>
                  <th>Tutor legal</th>
                  <th>Contacto emergencia</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {guardians.map((g) => (
                  <tr key={g.id}>
                    <td data-label="Responsable">{fullName(g.guardianFirstName, g.guardianLastName)}</td>
                    <td data-label="Relación" className="serving-meta">
                      {g.relationshipType}
                    </td>
                    <td data-label="Tutor legal">
                      <span className={`serving-chip ${g.legalGuardian ? "is-success" : "is-muted"}`}>
                        {g.legalGuardian ? "Sí" : "No"}
                      </span>
                    </td>
                    <td data-label="Contacto emergencia">
                      <span className={`serving-chip ${g.emergencyContact ? "is-success" : "is-muted"}`}>
                        {g.emergencyContact ? "Sí" : "No"}
                      </span>
                    </td>
                    <td data-label="">
                      {canManage ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => quitarResponsableAction(kidPersonId, g.guardianPersonId))}
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
        </div>
      )}
    </div>
  );
}

function AutorizacionesTab({
  kidPersonId,
  authorizations,
  canManage,
  pending,
  run,
}: {
  kidPersonId: string;
  authorizations: PickupAuthorization[];
  canManage: boolean;
  pending: boolean;
  run: (fn: () => Promise<FichaState>) => void;
}) {
  const [mode, setMode] = useState<"existing" | "external">("existing");
  const [authorizedPersonId, setAuthorizedPersonId] = useState("");
  const [authorizedName, setAuthorizedName] = useState("");
  const [relationText, setRelationText] = useState("");
  const [authorizationType, setAuthorizationType] = useState<PickupAuthorizationType>("permanent");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");

  function submit() {
    const input: CrearAutorizacionInput = {
      mode,
      authorizedPersonId: mode === "existing" ? authorizedPersonId.trim() : undefined,
      authorizedNameSnapshot: mode === "external" ? authorizedName.trim() : undefined,
      relationText: relationText.trim() || undefined,
      authorizationType,
      validFrom: validFrom || undefined,
      validUntil: validUntil || undefined,
    };
    run(() => crearAutorizacionAction(kidPersonId, input));
    setAuthorizedPersonId("");
    setAuthorizedName("");
    setRelationText("");
    setValidFrom("");
    setValidUntil("");
  }

  const canSubmit = mode === "existing" ? authorizedPersonId.trim().length > 0 : authorizedName.trim().length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {canManage ? (
        <div className="shell-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={authLabelStyle}>Nueva autorización de recogida</p>

          <div role="tablist" style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "existing"}
              onClick={() => setMode("existing")}
              className="serving-tab"
            >
              Persona ya registrada
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "external"}
              onClick={() => setMode("external")}
              className="serving-tab"
            >
              Persona externa
            </button>
          </div>

          {mode === "existing" ? (
            <div>
              <label htmlFor="auth-person-id" style={authLabelStyle}>
                ID de la persona autorizada
              </label>
              <input
                id="auth-person-id"
                value={authorizedPersonId}
                onChange={(e) => setAuthorizedPersonId(e.target.value)}
                placeholder="ID de una persona ya registrada en LEVITA"
                style={{ ...authInputStyle, width: "100%" }}
              />
            </div>
          ) : (
            <div>
              <label htmlFor="auth-name" style={authLabelStyle}>
                Nombre de la persona externa
              </label>
              <input
                id="auth-name"
                value={authorizedName}
                onChange={(e) => setAuthorizedName(e.target.value)}
                placeholder="Nombre completo (no se crea en Personas)"
                style={{ ...authInputStyle, width: "100%" }}
              />
              <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)", marginTop: 4 }}>
                Esta persona nunca se convierte en un registro de Personas: solo se guarda su nombre.
              </p>
            </div>
          )}

          <div className="serving-toolbar">
            <input
              value={relationText}
              onChange={(e) => setRelationText(e.target.value)}
              placeholder="Relación (ej. abuela, vecino)"
              aria-label="Relación con el menor"
              style={{ ...authInputStyle, flex: "1 1 200px" }}
            />
            <select
              value={authorizationType}
              onChange={(e) => setAuthorizationType(e.target.value as PickupAuthorizationType)}
              aria-label="Tipo de autorización"
              style={authInputStyle}
            >
              <option value="permanent">Permanente</option>
              <option value="date_range">Rango de fechas</option>
              <option value="one_time">Puntual</option>
            </select>
          </div>

          {authorizationType !== "permanent" ? (
            <div className="serving-toolbar">
              <div>
                <label htmlFor="auth-valid-from" style={authLabelStyle}>
                  Desde
                </label>
                <input
                  id="auth-valid-from"
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  style={authInputStyle}
                />
              </div>
              {authorizationType === "date_range" ? (
                <div>
                  <label htmlFor="auth-valid-until" style={authLabelStyle}>
                    Hasta
                  </label>
                  <input
                    id="auth-valid-until"
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    style={authInputStyle}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <button type="button" disabled={pending || !canSubmit} onClick={submit} style={{ ...primaryButtonStyle(pending), alignSelf: "flex-start" }}>
            Crear autorización
          </button>
        </div>
      ) : null}

      {authorizations.length === 0 ? (
        <div className="shell-card shell-empty-state">
          <h3>Sin autorizaciones de recogida</h3>
          <p>Registra quién puede recoger a este menor.</p>
        </div>
      ) : (
        <div className="shell-card list-card">
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Autorizado</th>
                  <th>Relación</th>
                  <th>Tipo</th>
                  <th>Vigencia</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {authorizations.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Autorizado">{a.authorizedNameSnapshot}</td>
                    <td data-label="Relación" className="serving-meta">
                      {a.relationText ?? "—"}
                    </td>
                    <td data-label="Tipo" className="serving-meta">
                      {PICKUP_TYPE_LABELS[a.authorizationType] ?? a.authorizationType}
                    </td>
                    <td data-label="Vigencia" className="serving-meta">
                      {formatDate(a.validFrom)} – {a.validUntil ? formatDate(a.validUntil) : "sin fin"}
                    </td>
                    <td data-label="Estado">
                      <span
                        className={`serving-chip ${
                          a.status === "active" ? "is-success" : a.status === "revoked" ? "is-danger" : "is-muted"
                        }`}
                      >
                        {PICKUP_STATUS_LABELS[a.status] ?? a.status}
                      </span>
                    </td>
                    <td data-label="">
                      {canManage && a.status === "active" ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => revocarAutorizacionAction(kidPersonId, a.id))}
                          style={subtleButtonStyle}
                        >
                          Revocar
                        </button>
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

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  minor: "Menor",
  medical: "Médica",
  behavioral: "Conductual",
  security: "Seguridad",
  pickup: "Recogida",
  other: "Otra",
};

const INCIDENT_SEVERITY_LABELS: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
};

function IncidenciasTab({
  kidPersonId,
  incidents,
  canManage,
  pending,
  run,
}: {
  kidPersonId: string;
  incidents: KidsIncident[];
  canManage: boolean;
  pending: boolean;
  run: (fn: () => Promise<FichaState>) => void;
}) {
  const [incidentType, setIncidentType] = useState<CrearIncidenciaInput["incidentType"]>("other");
  const [severity, setSeverity] = useState<CrearIncidenciaInput["severity"]>("low");
  const [description, setDescription] = useState("");
  const [actionsTaken, setActionsTaken] = useState("");
  const [showForm, setShowForm] = useState(false);

  function submit() {
    run(() =>
      crearIncidenciaAction(kidPersonId, {
        incidentType,
        severity,
        description,
        actionsTaken: actionsTaken.trim() || undefined,
      }),
    );
    setDescription("");
    setActionsTaken("");
    setIncidentType("other");
    setSeverity("low");
    setShowForm(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {canManage ? (
        <div className="shell-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={authLabelStyle}>Registrar incidencia</p>
            {!showForm ? (
              <button type="button" onClick={() => setShowForm(true)} style={secondaryButtonStyle()}>
                Nueva incidencia
              </button>
            ) : null}
          </div>

          {showForm ? (
            <>
              <div className="serving-toolbar">
                <div>
                  <label htmlFor="incident-type" style={authLabelStyle}>
                    Tipo
                  </label>
                  <select
                    id="incident-type"
                    value={incidentType}
                    onChange={(e) => setIncidentType(e.target.value as CrearIncidenciaInput["incidentType"])}
                    style={authInputStyle}
                  >
                    {Object.entries(INCIDENT_TYPE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="incident-severity" style={authLabelStyle}>
                    Severidad
                  </label>
                  <select
                    id="incident-severity"
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as CrearIncidenciaInput["severity"])}
                    style={authInputStyle}
                  >
                    {Object.entries(INCIDENT_SEVERITY_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="incident-description" style={authLabelStyle}>
                  Descripción
                </label>
                <textarea
                  id="incident-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  style={{ ...authInputStyle, width: "100%", resize: "vertical" }}
                />
              </div>

              <div>
                <label htmlFor="incident-actions" style={authLabelStyle}>
                  Acciones tomadas (opcional)
                </label>
                <textarea
                  id="incident-actions"
                  value={actionsTaken}
                  onChange={(e) => setActionsTaken(e.target.value)}
                  rows={2}
                  style={{ ...authInputStyle, width: "100%", resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  disabled={pending || description.trim().length === 0}
                  onClick={submit}
                  style={primaryButtonStyle(pending)}
                >
                  Guardar incidencia
                </button>
                <button type="button" onClick={() => setShowForm(false)} style={secondaryButtonStyle()}>
                  Cancelar
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {incidents.length === 0 ? (
        <div className="shell-card shell-empty-state">
          <h3>Sin incidencias registradas</h3>
          <p>Las incidencias de este menor aparecerán aquí.</p>
        </div>
      ) : (
        <div className="shell-card list-card">
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Severidad</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => (
                  <tr key={incident.id}>
                    <td data-label="Fecha" className="serving-meta">
                      {formatDate(incident.occurredAt)}
                    </td>
                    <td data-label="Tipo">{INCIDENT_TYPE_LABELS[incident.incidentType] ?? incident.incidentType}</td>
                    <td data-label="Severidad">
                      <span
                        className={`serving-chip ${
                          incident.severity === "high" ? "is-danger" : incident.severity === "medium" ? "is-warning" : "is-muted"
                        }`}
                      >
                        {INCIDENT_SEVERITY_LABELS[incident.severity] ?? incident.severity}
                      </span>
                    </td>
                    <td data-label="Estado">
                      <span className={`serving-chip ${incident.status === "resolved" ? "is-success" : "is-warning"}`}>
                        {incident.status === "resolved" ? "Resuelta" : "Abierta"}
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

function ConfiguracionTab({
  profile,
  sensitiveNotes,
  canManage,
  canSeeSensitive,
  pending,
  run,
}: {
  profile: KidsProfile;
  sensitiveNotes: KidsSensitiveNotes | null;
  canManage: boolean;
  canSeeSensitive: boolean;
  pending: boolean;
  run: (fn: () => Promise<FichaState>) => void;
}) {
  const [preferredName, setPreferredName] = useState(profile.preferredName ?? "");
  const [medicalAlertFlag, setMedicalAlertFlag] = useState(profile.medicalAlertFlag);
  const [accessibilityNotes, setAccessibilityNotes] = useState(sensitiveNotes?.accessibilityNotes ?? "");
  const [emergencyNotes, setEmergencyNotes] = useState(sensitiveNotes?.emergencyNotes ?? "");
  const [confirmArchive, setConfirmArchive] = useState(false);

  function save() {
    run(() =>
      guardarConfiguracionAction(profile.personId, {
        preferredName,
        medicalAlertFlag,
        ...(canSeeSensitive ? { accessibilityNotes, emergencyNotes } : {}),
      }),
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        className="shell-card"
        style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, opacity: canManage ? 1 : 0.7 }}
      >
        <div>
          <label htmlFor="cfg-preferred-name" style={authLabelStyle}>
            Nombre preferido
          </label>
          <input
            id="cfg-preferred-name"
            value={preferredName}
            onChange={(e) => setPreferredName(e.target.value)}
            disabled={!canManage}
            style={{ ...authInputStyle, width: "100%" }}
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
          <input
            type="checkbox"
            checked={medicalAlertFlag}
            onChange={(e) => setMedicalAlertFlag(e.target.checked)}
            disabled={!canManage}
          />
          Alerta médica activa
        </label>

        {canSeeSensitive ? (
          <>
            <div>
              <label htmlFor="cfg-accessibility" style={authLabelStyle}>
                Notas de accesibilidad
              </label>
              <textarea
                id="cfg-accessibility"
                value={accessibilityNotes}
                onChange={(e) => setAccessibilityNotes(e.target.value)}
                disabled={!canManage}
                rows={3}
                style={{ ...authInputStyle, width: "100%", resize: "vertical" }}
              />
            </div>
            <div>
              <label htmlFor="cfg-emergency" style={authLabelStyle}>
                Notas de emergencia
              </label>
              <textarea
                id="cfg-emergency"
                value={emergencyNotes}
                onChange={(e) => setEmergencyNotes(e.target.value)}
                disabled={!canManage}
                rows={3}
                style={{ ...authInputStyle, width: "100%", resize: "vertical" }}
              />
            </div>
          </>
        ) : (
          <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
            No tienes permiso para ver ni editar las notas de accesibilidad o emergencia
            (kids.sensitive.read).
          </p>
        )}

        {canManage ? (
          <button type="button" disabled={pending} onClick={save} style={{ ...primaryButtonStyle(pending), alignSelf: "flex-start" }}>
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
        ) : (
          <p style={{ fontSize: 12, color: "var(--shell-text-subtle)" }}>No tienes permiso para editar este perfil.</p>
        )}
      </div>

      {canManage ? (
        <div className="shell-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={authLabelStyle}>Archivar perfil</p>
          <p className="serving-meta">
            Archivar este perfil lo marca como inactivo. Los datos históricos (incidencias,
            autorizaciones, responsables) se conservan.
          </p>
          {confirmArchive ? (
            <div style={{ display: "flex", gap: 8 }}>
              <form
                action={async () => {
                  await archivarPerfilAction(profile.personId);
                }}
              >
                <button type="submit" style={secondaryButtonStyle()}>
                  Confirmar archivado
                </button>
              </form>
              <button type="button" onClick={() => setConfirmArchive(false)} style={secondaryButtonStyle()}>
                Cancelar
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmArchive(true)} style={{ ...secondaryButtonStyle(), alignSelf: "flex-start" }}>
              Archivar perfil
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
