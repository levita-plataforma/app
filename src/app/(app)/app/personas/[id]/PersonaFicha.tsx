"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  actualizarDatosAction,
  archivarAction,
  reactivarAction,
  alternarTagAction,
  guardarCampoPersonalizadoAction,
  anadirAFamiliaAction,
  quitarDeFamiliaAction,
  invitarAPersonaAction,
} from "./actions";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import type { CustomFieldDefinition } from "@/server/people/custom-fields-service";
import type { Household } from "@/server/people/households-service";

type Person = {
  id: string;
  firstName: string;
  lastName: string | null;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  hasAccount: boolean;
  source: string;
  createdAt: string;
};

type Membership = {
  relationship: string;
  campusId: string | null;
  campusName: string | null;
  joinedAt: string;
  archivedAt: string | null;
};

type Tag = { id: string; name: string; color: string | null };

const TABS = ["Resumen", "Datos personales", "Familia", "Etiquetas", "Campos personalizados", "Acceso", "Actividad", "Servicio"] as const;
type Tab = (typeof TABS)[number];

/**
 * Datos de servicio de la persona (Fase 3). Los tipos se declaran aquí en
 * forma plana porque este componente es de cliente: los servicios de
 * `src/server/serving` son server-only y no pueden importarse en el bundle.
 */
export type ServingInfo = {
  enabled: boolean;
  areas: { areaId: string; areaName: string; status: string; level: string }[];
  teams: { teamId: string; teamName: string; areaName: string; isLeader: boolean }[];
  qualifications: {
    id: string;
    name: string;
    level: string;
    verified: boolean;
    expiresAt: string | null;
  }[];
  credentials: {
    id: string;
    typeName: string;
    sensitive: boolean;
    status: string;
    expiresAt: string | null;
  }[];
};

const AREA_STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  training: "En formación",
  inactive: "Inactivo",
  suspended: "Suspendido",
};

const LEVEL_LABELS: Record<string, string> = {
  trainee: "En formación",
  assisted: "Asistido",
  autonomous: "Autónomo",
  leader: "Responsable",
  basic: "Básico",
  intermediate: "Intermedio",
  advanced: "Avanzado",
  expert: "Experto",
};

const CREDENTIAL_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  valid: "Válida",
  expired: "Vencida",
  rejected: "Rechazada",
  revoked: "Revocada",
};

export default function PersonaFicha(props: {
  canManage: boolean;
  person: Person;
  membership: Membership;
  churchName: string;
  campuses: { id: string; name: string }[];
  tags: Tag[];
  allTags: Tag[];
  households: Household[];
  customFieldDefinitions: CustomFieldDefinition[];
  customFieldValues: { fieldId: string; value: unknown }[];
  auditEvents: { id: string; action: string; createdAt: string; metadata: Record<string, unknown> }[];
  serving: ServingInfo;
}) {
  const { person, membership, canManage } = props;
  const [tab, setTab] = useState<Tab>("Resumen");
  const [pending, startTransition] = useTransition();
  const [archivedLocally, setArchivedLocally] = useState(Boolean(membership.archivedAt));
  const [feedback, setFeedback] = useState<string | null>(null);

  function handleArchiveToggle() {
    startTransition(async () => {
      const result = archivedLocally ? await reactivarAction(person.id) : await archivarAction(person.id);
      if (result.error) setFeedback(result.error);
      else setArchivedLocally(!archivedLocally);
    });
  }

  return (
    <>
      <section style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span className="people-avatar" style={{ width: 48, height: 48, fontSize: 16 }}>
            {[person.firstName, person.lastName].filter(Boolean).map((n) => n![0]).join("").toUpperCase()}
          </span>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600 }}>
              {person.firstName} {person.lastName ?? ""}
            </h1>
            <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
              {props.churchName} · {membership.campusName ?? "Sin sede"} {archivedLocally ? "· Archivada" : ""}
            </p>
          </div>
        </div>

        {canManage ? (
          <button
            type="button"
            disabled={pending}
            onClick={handleArchiveToggle}
            style={{
              padding: "8px 16px",
              borderRadius: "var(--shell-radius-sm)",
              border: "1px solid var(--shell-border)",
              background: "var(--shell-surface)",
              color: archivedLocally ? "var(--shell-success)" : "var(--shell-danger)",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: pending ? "wait" : "pointer",
            }}
          >
            {archivedLocally ? "Reactivar" : "Archivar"}
          </button>
        ) : null}
      </section>

      {feedback ? <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>{feedback}</p> : null}

      <nav style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--shell-border)", overflowX: "auto" }}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              padding: "10px 14px",
              fontSize: 12.5,
              fontWeight: 600,
              background: "none",
              border: "none",
              borderBottom: tab === t ? "2px solid var(--shell-brand)" : "2px solid transparent",
              color: tab === t ? "var(--shell-text)" : "var(--shell-text-muted)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "Resumen" && <ResumenTab person={person} membership={membership} />}
      {tab === "Datos personales" && (
        <DatosPersonalesTab person={person} membership={membership} campuses={props.campuses} canManage={canManage} />
      )}
      {tab === "Familia" && (
        <FamiliaTab personId={person.id} households={props.households} canManage={canManage} />
      )}
      {tab === "Etiquetas" && (
        <EtiquetasTab personId={person.id} assigned={props.tags} allTags={props.allTags} canManage={canManage} />
      )}
      {tab === "Campos personalizados" && (
        <CamposTab
          personId={person.id}
          definitions={props.customFieldDefinitions}
          values={props.customFieldValues}
          canManage={canManage}
        />
      )}
      {tab === "Acceso" && <AccesoTab person={person} />}
      {tab === "Actividad" && <ActividadTab events={props.auditEvents} />}
      {tab === "Servicio" && <ServicioTab serving={props.serving} />}
    </>
  );
}

function ResumenTab({ person, membership }: { person: Person; membership: Membership }) {
  return (
    <div className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
      <SummaryRow label="Estado" value={membership.relationship} />
      <SummaryRow label="Sede" value={membership.campusName ?? "—"} />
      <SummaryRow label="Correo" value={person.email ?? "—"} />
      <SummaryRow label="Teléfono" value={person.phone ?? "—"} />
      <SummaryRow label="Tiene cuenta" value={person.hasAccount ? "Sí" : "No"} />
      <SummaryRow label="Fecha de alta" value={new Date(membership.joinedAt).toLocaleDateString("es-ES")} />
      <SummaryRow label="Origen" value={{ manual: "Manual", import: "Importación", registration: "Registro", invitation: "Invitación", integration: "Integración" }[person.source] ?? person.source} />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ color: "var(--shell-text-muted)" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function DatosPersonalesTab({
  person,
  membership,
  campuses,
  canManage,
}: {
  person: Person;
  membership: Membership;
  campuses: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await actualizarDatosAction(person.id, formData);
      setError(result.error);
      setSuccess(Boolean(result.success));
    });
  }

  const rowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };

  return (
    <form
      action={handleSubmit}
      className="shell-card"
      style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, opacity: canManage ? 1 : 0.7 }}
    >
      <div style={rowStyle}>
        <div>
          <label style={authLabelStyle}>Nombre</label>
          <input name="firstName" defaultValue={person.firstName} required disabled={!canManage} style={authInputStyle} />
        </div>
        <div>
          <label style={authLabelStyle}>Apellidos</label>
          <input name="lastName" defaultValue={person.lastName ?? ""} disabled={!canManage} style={authInputStyle} />
        </div>
      </div>
      <div>
        <label style={authLabelStyle}>Nombre preferido</label>
        <input name="preferredName" defaultValue={person.preferredName ?? ""} disabled={!canManage} style={authInputStyle} />
      </div>
      <div style={rowStyle}>
        <div>
          <label style={authLabelStyle}>Correo</label>
          <input name="email" type="email" defaultValue={person.email ?? ""} disabled={!canManage} style={authInputStyle} />
        </div>
        <div>
          <label style={authLabelStyle}>Teléfono</label>
          <input name="phone" type="tel" defaultValue={person.phone ?? ""} disabled={!canManage} style={authInputStyle} />
        </div>
      </div>
      <div style={rowStyle}>
        <div>
          <label style={authLabelStyle}>Fecha de nacimiento</label>
          <input name="birthDate" type="date" defaultValue={person.birthDate ?? ""} disabled={!canManage} style={authInputStyle} />
        </div>
        <div>
          <label style={authLabelStyle}>Sede</label>
          <select name="campusId" defaultValue={membership.campusId ?? ""} disabled={!canManage} style={authInputStyle}>
            <option value="">Sin especificar</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label style={authLabelStyle}>Estado</label>
        <select name="relationship" defaultValue={membership.relationship} disabled={!canManage} style={authInputStyle}>
          <option value="visitor">Visitante</option>
          <option value="connected">Conectado</option>
          <option value="member">Miembro</option>
          <option value="server">Voluntario</option>
          <option value="leader">Líder</option>
          <option value="inactive">Inactivo</option>
        </select>
      </div>

      {error ? <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>{error}</p> : null}
      {success ? <p role="status" style={{ fontSize: 12.5, color: "var(--shell-success)" }}>Cambios guardados.</p> : null}

      {canManage ? (
        <button
          type="submit"
          disabled={pending}
          style={{ alignSelf: "flex-start", padding: "9px 18px", borderRadius: "var(--shell-radius-sm)", border: "none", background: "var(--shell-text)", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: pending ? "wait" : "pointer" }}
        >
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
      ) : (
        <p style={{ fontSize: 12, color: "var(--shell-text-subtle)" }}>No tienes permiso para editar esta ficha.</p>
      )}
    </form>
  );
}

function FamiliaTab({ personId, households, canManage }: { personId: string; households: Household[]; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const currentHousehold = households.find((h) => h.members.some((m) => m.personId === personId));
  const otherHouseholds = households.filter((h) => h.id !== currentHousehold?.id);

  function handleAdd(householdId: string) {
    startTransition(async () => {
      const result = await anadirAFamiliaAction(personId, householdId, "other");
      setError(result.error);
    });
  }

  function handleRemove(householdId: string) {
    startTransition(async () => {
      const result = await quitarDeFamiliaAction(personId, householdId);
      setError(result.error);
    });
  }

  return (
    <div className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      {error ? <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>{error}</p> : null}

      {currentHousehold ? (
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{currentHousehold.name}</p>
          <ul style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "var(--shell-text-muted)" }}>
            {currentHousehold.members.map((m) => (
              <li key={m.personId}>{m.firstName} {m.lastName ?? ""}{m.isPrimaryContact ? " (contacto principal)" : ""}</li>
            ))}
          </ul>
          {canManage ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => handleRemove(currentHousehold.id)}
              style={{ marginTop: 10, fontSize: 12, color: "var(--shell-danger)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Quitar de esta familia
            </button>
          ) : null}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--shell-text-muted)" }}>Esta persona no pertenece a ninguna familia todavía.</p>
      )}

      {canManage && otherHouseholds.length > 0 ? (
        <div>
          <p style={authLabelStyle}>Añadir a una familia existente</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
            {otherHouseholds.map((h) => (
              <button
                key={h.id}
                type="button"
                disabled={pending}
                onClick={() => handleAdd(h.id)}
                style={{ fontSize: 12, padding: "6px 12px", borderRadius: 999, border: "1px solid var(--shell-border)", background: "var(--shell-surface)", cursor: "pointer" }}
              >
                {h.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EtiquetasTab({
  personId,
  assigned,
  allTags,
  canManage,
}: {
  personId: string;
  assigned: Tag[];
  allTags: Tag[];
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const assignedIds = new Set(assigned.map((t) => t.id));

  function toggle(tagId: string, isAssigned: boolean) {
    startTransition(async () => {
      const result = await alternarTagAction(personId, tagId, !isAssigned);
      setError(result.error);
    });
  }

  return (
    <div className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      {error ? <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>{error}</p> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {allTags.map((tag) => {
          const isAssigned = assignedIds.has(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              disabled={!canManage || pending}
              onClick={() => toggle(tag.id, isAssigned)}
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                padding: "6px 14px",
                borderRadius: 999,
                border: isAssigned ? "none" : "1px solid var(--shell-border)",
                background: isAssigned ? (tag.color ?? "var(--shell-brand)") : "var(--shell-surface)",
                color: isAssigned ? "#fff" : "var(--shell-text)",
                cursor: canManage ? "pointer" : "default",
              }}
            >
              {tag.name}
            </button>
          );
        })}
        {allTags.length === 0 ? <p style={{ fontSize: 13, color: "var(--shell-text-muted)" }}>Todavía no hay etiquetas creadas.</p> : null}
      </div>
    </div>
  );
}

function CamposTab({
  personId,
  definitions,
  values,
  canManage,
}: {
  personId: string;
  definitions: CustomFieldDefinition[];
  values: { fieldId: string; value: unknown }[];
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const valueByField = new Map(values.map((v) => [v.fieldId, v.value]));

  function handleSave(fieldId: string, raw: string, type: CustomFieldDefinition["fieldType"]) {
    let value: unknown = raw;
    if (type === "number") value = Number(raw);
    if (type === "boolean") value = raw === "true";
    startTransition(async () => {
      const result = await guardarCampoPersonalizadoAction(personId, fieldId, value);
      setError(result.error);
    });
  }

  if (definitions.length === 0) {
    return (
      <div className="shell-card shell-empty-state">
        <h3>No hay campos personalizados definidos</h3>
        <p>Puedes crearlos desde Configuración → Personas → Campos.</p>
      </div>
    );
  }

  return (
    <div className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      {error ? <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>{error}</p> : null}
      {definitions.map((field) => (
        <div key={field.id}>
          <label style={authLabelStyle}>
            {field.name}
            {field.isSensitive ? " 🔒" : ""}
          </label>
          {field.fieldType === "select" ? (
            <select
              defaultValue={(valueByField.get(field.id) as string) ?? ""}
              disabled={!canManage}
              onBlur={(e) => handleSave(field.id, e.target.value, field.fieldType)}
              style={authInputStyle}
            >
              <option value="">Sin especificar</option>
              {(field.options ?? []).map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : field.fieldType === "boolean" ? (
            <select
              defaultValue={String(valueByField.get(field.id) ?? "")}
              disabled={!canManage}
              onBlur={(e) => handleSave(field.id, e.target.value, field.fieldType)}
              style={authInputStyle}
            >
              <option value="">Sin especificar</option>
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          ) : (
            <input
              type={field.fieldType === "number" ? "number" : field.fieldType === "date" ? "date" : "text"}
              defaultValue={(valueByField.get(field.id) as string) ?? ""}
              disabled={!canManage}
              onBlur={(e) => handleSave(field.id, e.target.value, field.fieldType)}
              style={authInputStyle}
            />
          )}
        </div>
      ))}
      {pending ? <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)" }}>Guardando…</p> : null}
    </div>
  );
}

function AccesoTab({ person }: { person: Person }) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState(person.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  function handleInvite() {
    startTransition(async () => {
      const result = await invitarAPersonaAction(person.id, email);
      setError(result.error);
      setLink(result.invitationLink ?? null);
    });
  }

  if (person.hasAccount) {
    return (
      <div className="shell-card" style={{ padding: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--shell-success)" }}>Esta persona ya tiene una cuenta en LEVITA.</p>
      </div>
    );
  }

  return (
    <div className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 13, color: "var(--shell-text-muted)" }}>
        Esta persona todavía no tiene cuenta. Puedes invitarla a crear acceso a LEVITA.
      </p>
      <div>
        <label style={authLabelStyle}>Correo de invitación</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} style={authInputStyle} />
      </div>
      {error ? <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>{error}</p> : null}
      {link ? (
        <div style={{ fontSize: 12.5, background: "var(--shell-active-bg)", padding: 12, borderRadius: "var(--shell-radius-sm)" }}>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>Enlace de invitación generado:</p>
          <code style={{ wordBreak: "break-all" }}>{link}</code>
        </div>
      ) : null}
      <button
        type="button"
        disabled={pending || !email}
        onClick={handleInvite}
        style={{ alignSelf: "flex-start", padding: "9px 18px", borderRadius: "var(--shell-radius-sm)", border: "none", background: "var(--shell-brand)", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: pending ? "wait" : "pointer" }}
      >
        {pending ? "Enviando…" : "Invitar a LEVITA"}
      </button>
    </div>
  );
}

function ServicioTab({ serving }: { serving: ServingInfo }) {
  if (!serving.enabled) {
    return (
      <div className="shell-card shell-empty-state">
        <h3>El módulo Servicios no está activo</h3>
        <p>Actívalo desde Configuración para ver áreas, equipos y cualificaciones de esta persona.</p>
      </div>
    );
  }

  const hasAnything =
    serving.areas.length > 0 ||
    serving.teams.length > 0 ||
    serving.qualifications.length > 0 ||
    serving.credentials.length > 0;

  if (!hasAnything) {
    return (
      <div className="shell-card shell-empty-state">
        <h3>Esta persona todavía no sirve en ningún área</h3>
        <p>Añádela a un área de servicio desde la ficha del área correspondiente.</p>
        <Link
          href="/app/servicios/areas"
          style={{ fontSize: 12.5, fontWeight: 600, color: "var(--shell-brand)", textDecoration: "none", marginTop: 8 }}
        >
          Ir a Áreas de servicio →
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ fontSize: 13.5, fontWeight: 600 }}>Áreas de servicio</p>
        {serving.areas.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>No pertenece a ningún área.</p>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {serving.areas.map((a) => (
              <li
                key={a.areaId}
                style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 13 }}
              >
                <Link
                  href={`/app/servicios/areas/${a.areaId}`}
                  style={{ fontWeight: 600, color: "var(--shell-text)", textDecoration: "none" }}
                >
                  {a.areaName}
                </Link>
                <span style={{ display: "flex", gap: 6 }}>
                  <span className="serving-chip is-muted">{LEVEL_LABELS[a.level] ?? a.level}</span>
                  <span className={`serving-chip ${a.status === "active" ? "is-success" : "is-warning"}`}>
                    {AREA_STATUS_LABELS[a.status] ?? a.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ fontSize: 13.5, fontWeight: 600 }}>Equipos</p>
        {serving.teams.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>No forma parte de ningún equipo.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {serving.teams.map((t) => (
              <span key={t.teamId} className={`serving-chip ${t.isLeader ? "is-success" : ""}`}>
                {t.teamName} · {t.areaName}
                {t.isLeader ? " · Líder" : ""}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ fontSize: 13.5, fontWeight: 600 }}>Cualificaciones</p>
        {serving.qualifications.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>Sin cualificaciones registradas.</p>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {serving.qualifications.map((q) => (
              <li
                key={q.id}
                style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 13 }}
              >
                <span style={{ fontWeight: 600 }}>{q.name}</span>
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className="serving-chip is-muted">{LEVEL_LABELS[q.level] ?? q.level}</span>
                  <span className={`serving-chip ${q.verified ? "is-success" : "is-warning"}`}>
                    {q.verified ? "Verificada" : "Sin verificar"}
                  </span>
                  {q.expiresAt ? (
                    <span style={{ fontSize: 12, color: "var(--shell-text-muted)" }}>
                      Vence {new Date(q.expiresAt).toLocaleDateString("es-ES")}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ fontSize: 13.5, fontWeight: 600 }}>Credenciales</p>
        <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
          LEVITA guarda el estado y la vigencia, nunca el documento. Las credenciales sensibles solo
          son visibles con el permiso correspondiente.
        </p>
        {serving.credentials.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>Sin credenciales visibles.</p>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {serving.credentials.map((c) => (
              <li
                key={c.id}
                style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", fontSize: 13 }}
              >
                <span style={{ fontWeight: 600 }}>
                  {c.typeName}
                  {c.sensitive ? " 🔒" : ""}
                </span>
                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className={`serving-chip ${c.status === "valid" ? "is-success" : c.status === "pending" ? "is-warning" : "is-danger"}`}>
                    {CREDENTIAL_STATUS_LABELS[c.status] ?? c.status}
                  </span>
                  {c.expiresAt ? (
                    <span style={{ fontSize: 12, color: "var(--shell-text-muted)" }}>
                      Vence {new Date(c.expiresAt).toLocaleDateString("es-ES")}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ActividadTab({ events }: { events: { id: string; action: string; createdAt: string; metadata: Record<string, unknown> }[] }) {
  if (events.length === 0) {
    return (
      <div className="shell-card shell-empty-state">
        <h3>Sin actividad registrada</h3>
        <p>Los cambios auditables sobre esta persona aparecerán aquí.</p>
      </div>
    );
  }

  return (
    <div className="shell-card" style={{ padding: 20 }}>
      <ul style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {events.map((e) => (
          <li key={e.id} style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--shell-border)", paddingBottom: 8 }}>
            <span>{e.action}</span>
            <span style={{ color: "var(--shell-text-muted)" }}>{new Date(e.createdAt).toLocaleString("es-ES")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
