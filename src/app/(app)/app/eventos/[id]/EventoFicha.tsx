"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import type { EventDetail } from "@/server/events/events-service";
import type { Registration } from "@/server/events/registrations-service";
import type { FormDetail } from "@/server/forms/forms-service";
import { ACTIVITY_STATUS_INFO } from "@/lib/activities/constants";
import {
  primaryButtonStyle,
  secondaryButtonStyle,
  subtleButtonStyle,
  formatDateTime,
  EVENT_VISIBILITY_LABELS,
  EVENT_REGISTRATION_TYPE_LABELS,
  REGISTRATION_STATUS_LABELS,
} from "../ui";
import {
  guardarEventoAction,
  publicarEventoAction,
  despublicarEventoAction,
  archivarEventoAction,
  cancelarInscripcionAction,
  enviarComunicacionAction,
  type EventoFichaState,
} from "./actions";

const TABS = ["Resumen", "Inscripciones", "Asistentes", "Formulario", "Comunicaciones", "Configuración", "Historial"] as const;
type Tab = (typeof TABS)[number];

type AuditEntry = { id: string; action: string; created_at: string; metadata: Record<string, unknown>; actor_person_id: string | null };

export type EventoFichaProps = {
  event: EventDetail;
  registrations: Registration[];
  registrationsTotal: number;
  registrationsPage: number;
  registrationsPageSize: number;
  form: FormDetail | null;
  campuses: { id: string; name: string }[];
  auditEntries: AuditEntry[];
  permissions: { canManage: boolean; canPublish: boolean; canCheckin: boolean; canExport: boolean };
};

export default function EventoFicha(props: EventoFichaProps) {
  const { event, permissions } = props;
  const [tab, setTab] = useState<Tab>("Resumen");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<EventoFichaState>) {
    startTransition(async () => {
      const result = await fn();
      setError(result.error);
    });
  }

  const statusInfo = event.activity ? ACTIVITY_STATUS_INFO[event.activity.status as keyof typeof ACTIVITY_STATUS_INFO] : null;
  const confirmedCount = props.registrations.filter((r) => r.status === "confirmed").reduce((s, r) => s + r.attendeesCount, 0);
  const waitlistCount = props.registrations.filter((r) => r.status === "waitlisted").length;

  return (
    <>
      <section style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <Link href="/app/eventos" style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}>
            ← Eventos
          </Link>
          <h1 style={{ fontSize: 21, fontWeight: 600, marginTop: 6 }}>{event.activity?.title ?? "Evento"}</h1>
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 2 }}>
            {formatDateTime(event.activity?.startsAt ?? null)}
            {event.archivedAt ? " · Archivado" : ""}
          </p>
        </div>
        {permissions.canCheckin ? (
          <Link href={`/app/eventos/${event.id}/checkin`} style={primaryButtonStyle()}>
            Check-in
          </Link>
        ) : null}
      </section>

      {error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      ) : null}

      <nav className="serving-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="serving-tab">
            {t}
          </button>
        ))}
      </nav>

      {tab === "Resumen" ? (
        <ResumenTab event={event} statusLabel={statusInfo?.label ?? event.activity?.status ?? "—"} confirmedCount={confirmedCount} waitlistCount={waitlistCount} />
      ) : null}

      {tab === "Inscripciones" ? (
        <InscripcionesTab
          eventId={event.id}
          registrations={props.registrations}
          total={props.registrationsTotal}
          page={props.registrationsPage}
          pageSize={props.registrationsPageSize}
          canManage={permissions.canManage}
          canExport={permissions.canExport}
          pending={pending}
          run={run}
        />
      ) : null}

      {tab === "Asistentes" ? <AsistentesTab registrations={props.registrations} /> : null}

      {tab === "Formulario" ? <FormularioTab form={props.form} /> : null}

      {tab === "Comunicaciones" ? (
        <ComunicacionesTab eventId={event.id} canManage={permissions.canManage} pending={pending} run={run} />
      ) : null}

      {tab === "Configuración" ? (
        <ConfiguracionTab
          event={event}
          canManage={permissions.canManage}
          canPublish={permissions.canPublish}
          pending={pending}
          run={run}
        />
      ) : null}

      {tab === "Historial" ? <HistorialTab entries={props.auditEntries} /> : null}
    </>
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

function ResumenTab({
  event,
  statusLabel,
  confirmedCount,
  waitlistCount,
}: {
  event: EventDetail;
  statusLabel: string;
  confirmedCount: number;
  waitlistCount: number;
}) {
  const occupancy = event.capacity ? Math.round((confirmedCount / event.capacity) * 100) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {event.shortDescription ? (
        <div className="shell-card" style={{ padding: 18, fontSize: 13, color: "var(--shell-text-muted)" }}>
          {event.shortDescription}
        </div>
      ) : null}

      <div className="serving-grid">
        <SummaryCard title="Estado">
          <p style={{ fontSize: 18, fontWeight: 600 }}>{statusLabel}</p>
          <p className="serving-meta">{EVENT_VISIBILITY_LABELS[event.visibility] ?? event.visibility}</p>
        </SummaryCard>

        <SummaryCard title="Fecha y sede">
          <p style={{ fontSize: 13 }}>
            {event.activity?.startsAt ? new Date(event.activity.startsAt).toLocaleString("es-ES") : "Sin fecha"}
          </p>
          <p className="serving-meta">{event.activity?.locationText ?? "Sin ubicación indicada"}</p>
        </SummaryCard>

        <SummaryCard title="Aforo">
          <p style={{ fontSize: 24, fontWeight: 600 }}>
            {confirmedCount}
            {event.capacity !== null ? `/${event.capacity}` : ""}
          </p>
          <p className="serving-meta">{occupancy !== null ? `${occupancy}% de ocupación` : "Aforo ilimitado"}</p>
        </SummaryCard>

        <SummaryCard title="Lista de espera">
          <p style={{ fontSize: 24, fontWeight: 600 }}>{waitlistCount}</p>
          <p className="serving-meta">{event.waitlistEnabled ? "Habilitada" : "Deshabilitada"}</p>
        </SummaryCard>

        <SummaryCard title="Inscripción">
          <p style={{ fontSize: 13 }}>{event.registrationEnabled ? "Habilitada" : "Deshabilitada"}</p>
          <p className="serving-meta">{EVENT_REGISTRATION_TYPE_LABELS[event.registrationType] ?? event.registrationType}</p>
        </SummaryCard>
      </div>
    </div>
  );
}

function InscripcionesTab({
  eventId,
  registrations,
  total,
  page,
  pageSize,
  canManage,
  canExport,
  pending,
  run,
}: {
  eventId: string;
  registrations: Registration[];
  total: number;
  page: number;
  pageSize: number;
  canManage: boolean;
  canExport: boolean;
  pending: boolean;
  run: (fn: () => Promise<EventoFichaState>) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <form method="get" className="shell-card serving-toolbar" style={{ padding: 14 }}>
        <input
          type="search"
          name="q"
          placeholder="Buscar por nombre, email o código…"
          aria-label="Buscar inscripción"
          style={{ ...authInputStyle, flex: "1 1 200px" }}
        />
        <select name="status" defaultValue="" aria-label="Estado" style={{ ...authInputStyle, minWidth: 160 }}>
          <option value="">Todos los estados</option>
          {Object.entries(REGISTRATION_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit" style={secondaryButtonStyle()}>
          Filtrar
        </button>
        {canExport ? (
          <a href={`/app/eventos/${eventId}/exportar`} style={secondaryButtonStyle()}>
            Exportar CSV
          </a>
        ) : null}
      </form>

      {registrations.length === 0 ? (
        <div className="shell-card shell-empty-state">
          <h3>No hay inscripciones</h3>
          <p>Todavía nadie se ha inscrito, o ningún registro coincide con el filtro.</p>
        </div>
      ) : (
        <div className="shell-card list-card">
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Estado</th>
                  <th>Asistentes</th>
                  <th>Fecha</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {registrations.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Código" className="serving-meta">
                      {r.registrationCode}
                    </td>
                    <td data-label="Nombre">{r.primaryName}</td>
                    <td data-label="Email" className="serving-meta">
                      {r.primaryEmail}
                    </td>
                    <td data-label="Estado">
                      <span
                        className={`serving-chip ${r.status === "confirmed" ? "is-success" : r.status === "waitlisted" ? "is-warning" : r.status === "cancelled" ? "is-danger" : "is-muted"}`}
                      >
                        {REGISTRATION_STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                    <td data-label="Asistentes">{r.attendeesCount}</td>
                    <td data-label="Fecha" className="serving-meta">
                      {formatDateTime(r.registeredAt)}
                    </td>
                    <td data-label="">
                      {canManage && r.status !== "cancelled" ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => cancelarInscripcionAction(eventId, r.id))}
                          style={subtleButtonStyle}
                        >
                          Cancelar
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

      {totalPages > 1 ? (
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
          Página {page} de {totalPages} · {total} inscripciones en total
        </p>
      ) : null}
    </div>
  );
}

function AsistentesTab({ registrations }: { registrations: Registration[] }) {
  const attendees = registrations
    .filter((r) => r.status === "confirmed")
    .flatMap((r) => r.attendees.map((a) => ({ ...a, registrationCode: r.registrationCode, primaryEmail: r.primaryEmail })));

  if (attendees.length === 0) {
    return (
      <div className="shell-card shell-empty-state">
        <h3>No hay asistentes confirmados</h3>
        <p>Los asistentes aparecen aquí cuando hay inscripciones confirmadas con personas asociadas.</p>
      </div>
    );
  }

  return (
    <div className="shell-card list-card">
      <div className="people-table-wrap">
        <table className="serving-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Inscripción</th>
              <th>Asistencia</th>
              <th>Check-in</th>
            </tr>
          </thead>
          <tbody>
            {attendees.map((a) => (
              <tr key={a.id}>
                <td data-label="Nombre">{a.fullName}</td>
                <td data-label="Tipo" className="serving-meta">
                  {a.attendeeType === "adult" ? "Adulto" : "Menor"}
                </td>
                <td data-label="Inscripción" className="serving-meta">
                  {a.registrationCode}
                </td>
                <td data-label="Asistencia">
                  <span className={`serving-chip ${a.attendanceStatus === "checked_in" ? "is-success" : "is-muted"}`}>
                    {a.attendanceStatus === "checked_in" ? "Asistió" : "Pendiente"}
                  </span>
                </td>
                <td data-label="Check-in" className="serving-meta">
                  {formatDateTime(a.checkedInAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FormularioTab({ form }: { form: FormDetail | null }) {
  if (!form) {
    return (
      <div className="shell-card shell-empty-state">
        <h3>Este evento no tiene formulario asociado</h3>
        <p>Puedes asignar uno desde la pestaña Configuración.</p>
      </div>
    );
  }

  return (
    <div className="shell-card list-card">
      <div className="list-card-header">
        <h2>{form.name}</h2>
        <Link href={`/app/formularios/${form.id}`}>Gestionar formulario →</Link>
      </div>
      {form.description ? <p style={{ padding: "0 18px", fontSize: 13, color: "var(--shell-text-muted)" }}>{form.description}</p> : null}
      <div className="people-table-wrap">
        <table className="serving-table">
          <thead>
            <tr>
              <th>Campo</th>
              <th>Tipo</th>
              <th>Obligatorio</th>
              <th>Clasificación</th>
            </tr>
          </thead>
          <tbody>
            {form.fields.map((f) => (
              <tr key={f.id}>
                <td data-label="Campo">{f.label}</td>
                <td data-label="Tipo" className="serving-meta">
                  {f.type}
                </td>
                <td data-label="Obligatorio">{f.required ? "Sí" : "No"}</td>
                <td data-label="Clasificación" className="serving-meta">
                  {f.classification}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const COMM_TYPES: { value: "event.published" | "event.cancelled" | "event.rescheduled" | "event.reminder"; label: string }[] = [
  { value: "event.published", label: "Evento publicado" },
  { value: "event.reminder", label: "Recordatorio" },
  { value: "event.rescheduled", label: "Evento reprogramado" },
  { value: "event.cancelled", label: "Evento cancelado" },
];

function ComunicacionesTab({
  eventId,
  canManage,
  pending,
  run,
}: {
  eventId: string;
  canManage: boolean;
  pending: boolean;
  run: (fn: () => Promise<EventoFichaState>) => void;
}) {
  const [lastSent, setLastSent] = useState<string | null>(null);

  function send(eventType: (typeof COMM_TYPES)[number]["value"], statuses: ("confirmed" | "waitlisted" | "cancelled")[]) {
    run(async () => {
      const result = await enviarComunicacionAction(eventId, eventType, statuses);
      if (!result.error) setLastSent(`Comunicación enviada a ${result.sent ?? 0} inscripción(es).`);
      return { error: result.error };
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="shell-card" style={{ padding: 18 }}>
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
          Estas notificaciones usan la plantilla estándar de cada tipo de evento. No es posible enviar un mensaje
          personalizado con texto libre: la función de notificaciones construye el contenido internamente y no acepta
          un payload personalizado.
        </p>
      </div>

      {lastSent ? (
        <p role="status" style={{ fontSize: 12.5, color: "var(--shell-success, green)" }}>
          {lastSent}
        </p>
      ) : null}

      <div className="serving-grid">
        {COMM_TYPES.map((ct) => (
          <div key={ct.value} className="shell-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 600 }}>{ct.label}</p>
            <p className="serving-meta">Envía a inscripciones confirmadas y en lista de espera.</p>
            <button
              type="button"
              disabled={pending || !canManage}
              onClick={() => send(ct.value, ["confirmed", "waitlisted"])}
              style={secondaryButtonStyle(pending)}
            >
              Enviar
            </button>
          </div>
        ))}

        <div className="shell-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10, opacity: 0.6 }}>
          <p style={{ fontSize: 13, fontWeight: 600 }}>Mensaje personalizado</p>
          <p className="serving-meta">Próximamente. La RPC actual no admite texto libre.</p>
          <button type="button" disabled style={secondaryButtonStyle(true)}>
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfiguracionTab({
  event,
  canManage,
  canPublish,
  pending,
  run,
}: {
  event: EventDetail;
  canManage: boolean;
  canPublish: boolean;
  pending: boolean;
  run: (fn: () => Promise<EventoFichaState>) => void;
}) {
  const [registrationEnabled, setRegistrationEnabled] = useState(event.registrationEnabled);
  const [waitlistEnabled, setWaitlistEnabled] = useState(event.waitlistEnabled);
  const isPublished = event.activity?.status === "published";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {canPublish ? (
        <div className="shell-card" style={{ padding: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {isPublished ? (
            <button type="button" disabled={pending} onClick={() => run(() => despublicarEventoAction(event.id))} style={secondaryButtonStyle(pending)}>
              Despublicar
            </button>
          ) : (
            <button type="button" disabled={pending} onClick={() => run(() => publicarEventoAction(event.id))} style={primaryButtonStyle(pending)}>
              Publicar evento
            </button>
          )}
          {!event.archivedAt ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm("¿Archivar este evento?")) run(() => archivarEventoAction(event.id, false));
              }}
              style={subtleButtonStyle}
            >
              Archivar evento
            </button>
          ) : null}
        </div>
      ) : null}

      <form
        className="shell-card"
        style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, opacity: canManage ? 1 : 0.7 }}
        action={(formData) => run(() => guardarEventoAction(event.id, formData))}
      >
        <div>
          <label htmlFor="cfg-eventVisibility" style={authLabelStyle}>
            Visibilidad del evento
          </label>
          <select
            id="cfg-eventVisibility"
            name="eventVisibility"
            defaultValue={event.visibility}
            disabled={!canManage}
            style={{ ...authInputStyle, width: "100%" }}
          >
            <option value="internal">Interno</option>
            <option value="members">Miembros</option>
            <option value="public">Público</option>
          </select>
        </div>

        <div>
          <label htmlFor="cfg-shortDescription" style={authLabelStyle}>
            Descripción corta
          </label>
          <input
            id="cfg-shortDescription"
            name="shortDescription"
            defaultValue={event.shortDescription ?? ""}
            disabled={!canManage}
            style={{ ...authInputStyle, width: "100%" }}
          />
        </div>

        <div>
          <label htmlFor="cfg-publicDescription" style={authLabelStyle}>
            Descripción pública
          </label>
          <textarea
            id="cfg-publicDescription"
            name="publicDescription"
            rows={4}
            defaultValue={event.publicDescription ?? ""}
            disabled={!canManage}
            style={{ ...authInputStyle, width: "100%" }}
          />
        </div>

        <div>
          <label htmlFor="cfg-coverImageUrl" style={authLabelStyle}>
            Imagen de portada (URL https)
          </label>
          <input
            id="cfg-coverImageUrl"
            name="coverImageUrl"
            type="url"
            defaultValue={event.coverImageUrl ?? ""}
            disabled={!canManage}
            style={{ ...authInputStyle, width: "100%" }}
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
          <input
            type="checkbox"
            name="registrationEnabled"
            checked={registrationEnabled}
            disabled={!canManage}
            onChange={(e) => setRegistrationEnabled(e.target.checked)}
          />
          Permitir inscripción
        </label>

        {registrationEnabled ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingLeft: 4, borderLeft: "2px solid var(--shell-border)" }}>
            <div className="serving-toolbar">
              <div style={{ flex: "1 1 180px" }}>
                <label htmlFor="cfg-registrationOpensAt" style={authLabelStyle}>
                  Apertura de inscripción
                </label>
                <input
                  id="cfg-registrationOpensAt"
                  name="registrationOpensAt"
                  type="datetime-local"
                  defaultValue={event.registrationOpensAt?.slice(0, 16) ?? ""}
                  disabled={!canManage}
                  style={{ ...authInputStyle, width: "100%" }}
                />
              </div>
              <div style={{ flex: "1 1 180px" }}>
                <label htmlFor="cfg-registrationClosesAt" style={authLabelStyle}>
                  Cierre de inscripción
                </label>
                <input
                  id="cfg-registrationClosesAt"
                  name="registrationClosesAt"
                  type="datetime-local"
                  defaultValue={event.registrationClosesAt?.slice(0, 16) ?? ""}
                  disabled={!canManage}
                  style={{ ...authInputStyle, width: "100%" }}
                />
              </div>
            </div>

            <div className="serving-toolbar">
              <div style={{ flex: "1 1 120px" }}>
                <label htmlFor="cfg-capacity" style={authLabelStyle}>
                  Aforo
                </label>
                <input
                  id="cfg-capacity"
                  name="capacity"
                  type="number"
                  min={0}
                  defaultValue={event.capacity ?? ""}
                  disabled={!canManage}
                  style={{ ...authInputStyle, width: "100%" }}
                />
              </div>
              <div style={{ flex: "1 1 180px" }}>
                <label htmlFor="cfg-registrationType" style={authLabelStyle}>
                  Tipo de inscripción
                </label>
                <select
                  id="cfg-registrationType"
                  name="registrationType"
                  defaultValue={event.registrationType}
                  disabled={!canManage}
                  style={{ ...authInputStyle, width: "100%" }}
                >
                  <option value="individual">Individual</option>
                  <option value="household">Familiar</option>
                  <option value="group">Grupo</option>
                </select>
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
              <input
                type="checkbox"
                name="waitlistEnabled"
                checked={waitlistEnabled}
                disabled={!canManage}
                onChange={(e) => setWaitlistEnabled(e.target.checked)}
              />
              Habilitar lista de espera
            </label>

            {waitlistEnabled ? (
              <div style={{ maxWidth: 200 }}>
                <label htmlFor="cfg-maxWaitlist" style={authLabelStyle}>
                  Máximo en lista de espera
                </label>
                <input
                  id="cfg-maxWaitlist"
                  name="maxWaitlist"
                  type="number"
                  min={0}
                  defaultValue={event.maxWaitlist ?? ""}
                  disabled={!canManage}
                  style={{ ...authInputStyle, width: "100%" }}
                />
              </div>
            ) : null}

            <div className="serving-toolbar">
              <div style={{ flex: "1 1 180px" }}>
                <label htmlFor="cfg-contactEmail" style={authLabelStyle}>
                  Email de contacto
                </label>
                <input
                  id="cfg-contactEmail"
                  name="contactEmail"
                  type="email"
                  defaultValue={event.contactEmail ?? ""}
                  disabled={!canManage}
                  style={{ ...authInputStyle, width: "100%" }}
                />
              </div>
              <div style={{ flex: "1 1 180px" }}>
                <label htmlFor="cfg-contactPhone" style={authLabelStyle}>
                  Teléfono de contacto
                </label>
                <input
                  id="cfg-contactPhone"
                  name="contactPhone"
                  defaultValue={event.contactPhone ?? ""}
                  disabled={!canManage}
                  style={{ ...authInputStyle, width: "100%" }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="cfg-confirmationMessage" style={authLabelStyle}>
                Mensaje de confirmación
              </label>
              <textarea
                id="cfg-confirmationMessage"
                name="confirmationMessage"
                rows={2}
                defaultValue={event.confirmationMessage ?? ""}
                disabled={!canManage}
                style={{ ...authInputStyle, width: "100%" }}
              />
            </div>

            <div>
              <label htmlFor="cfg-cancellationPolicy" style={authLabelStyle}>
                Política de cancelación
              </label>
              <textarea
                id="cfg-cancellationPolicy"
                name="cancellationPolicy"
                rows={2}
                defaultValue={event.cancellationPolicy ?? ""}
                disabled={!canManage}
                style={{ ...authInputStyle, width: "100%" }}
              />
            </div>
          </div>
        ) : null}

        {canManage ? (
          <button type="submit" disabled={pending} style={{ ...primaryButtonStyle(pending), alignSelf: "flex-start" }}>
            {pending ? "Guardando…" : "Guardar cambios"}
          </button>
        ) : (
          <p style={{ fontSize: 12, color: "var(--shell-text-subtle)" }}>No tienes permiso para editar este evento.</p>
        )}
      </form>
    </div>
  );
}

function HistorialTab({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="shell-card shell-empty-state">
        <h3>Próximamente</h3>
        <p>El historial detallado de este evento no está disponible todavía, o no tienes permiso para verlo.</p>
      </div>
    );
  }

  return (
    <div className="shell-card list-card">
      <div className="people-table-wrap">
        <table className="serving-table">
          <thead>
            <tr>
              <th>Acción</th>
              <th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td data-label="Acción">{e.action}</td>
                <td data-label="Fecha" className="serving-meta">
                  {formatDateTime(e.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
