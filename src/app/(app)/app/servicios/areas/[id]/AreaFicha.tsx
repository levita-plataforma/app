"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import type { ServiceAreaDetail } from "@/server/serving/service-areas-service";
import type { AreaLeader } from "@/server/serving/service-area-leaders-service";
import type { AreaMember } from "@/server/serving/service-area-members-service";
import {
  AREA_MEMBER_STATUS_LABELS,
  OPERATIONAL_LEVEL_LABELS,
  type AreaMemberStatus,
  type OperationalLevel,
} from "../../labels";
import type { ServicePosition } from "@/server/serving/service-positions-service";
import type { ServiceTeamListItem } from "@/server/serving/service-teams-service";
import type { PersonCredential } from "@/server/serving/credentials-service";
import {
  guardarAreaAction,
  anadirResponsableAction,
  quitarResponsableAction,
  anadirMiembroAction,
  actualizarMiembroAction,
  quitarMiembroAction,
  crearPuestoAction,
  archivarPuestoAction,
  crearEquipoEnAreaAction,
  type AreaFichaState,
} from "./actions";
import { primaryButtonStyle, secondaryButtonStyle, subtleButtonStyle, fullName, formatDate } from "../../ui";

const TABS = ["Resumen", "Personas", "Equipos", "Puestos", "Cualificaciones", "Configuración"] as const;
type Tab = (typeof TABS)[number];

type PersonOption = { id: string; firstName: string; lastName: string | null };

export type AreaFichaProps = {
  area: ServiceAreaDetail;
  leaders: AreaLeader[];
  members: AreaMember[];
  teams: ServiceTeamListItem[];
  positions: ServicePosition[];
  areaQualifications: {
    personId: string;
    personName: string;
    qualificationName: string;
    level: string;
    verified: boolean;
    expiresAt: string | null;
  }[];
  expiringCredentials: PersonCredential[];
  people: PersonOption[];
  campuses: { id: string; name: string }[];
  permissions: {
    canManageArea: boolean;
    canManageLeaders: boolean;
    canManageMembers: boolean;
    canManageTeams: boolean;
    canManagePositions: boolean;
    canReadCredentials: boolean;
  };
};

export default function AreaFicha(props: AreaFichaProps) {
  const { area, permissions } = props;
  const [tab, setTab] = useState<Tab>("Resumen");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<AreaFichaState>) {
    startTransition(async () => {
      const result = await fn();
      setError(result.error);
    });
  }

  const missingRequirements = props.positions.filter((p) => p.critical).length;

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
          <Link
            href="/app/servicios/areas"
            style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}
          >
            ← Áreas de servicio
          </Link>
          <h1 style={{ fontSize: 21, fontWeight: 600, marginTop: 6 }}>{area.name}</h1>
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 2 }}>
            {area.campusName ?? "Toda la iglesia"}
            {area.archivedAt ? " · Archivada" : area.active ? "" : " · Inactiva"}
          </p>
        </div>
      </section>

      {error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      ) : null}

      <nav className="serving-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className="serving-tab"
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "Resumen" ? (
        <ResumenTab
          area={area}
          leaders={props.leaders}
          members={props.members}
          teams={props.teams}
          positions={props.positions}
          criticalPositions={missingRequirements}
          expiringCredentials={props.expiringCredentials}
          canReadCredentials={permissions.canReadCredentials}
        />
      ) : null}

      {tab === "Personas" ? (
        <PersonasTab
          areaId={area.id}
          members={props.members}
          leaders={props.leaders}
          people={props.people}
          canManageMembers={permissions.canManageMembers}
          canManageLeaders={permissions.canManageLeaders}
          pending={pending}
          run={run}
        />
      ) : null}

      {tab === "Equipos" ? (
        <EquiposTab
          areaId={area.id}
          teams={props.teams}
          canManage={permissions.canManageTeams}
          pending={pending}
          run={run}
        />
      ) : null}

      {tab === "Puestos" ? (
        <PuestosTab
          areaId={area.id}
          positions={props.positions}
          canManage={permissions.canManagePositions}
          pending={pending}
          run={run}
        />
      ) : null}

      {tab === "Cualificaciones" ? (
        <CualificacionesTab rows={props.areaQualifications} />
      ) : null}

      {tab === "Configuración" ? (
        <ConfiguracionTab
          area={area}
          campuses={props.campuses}
          canManage={permissions.canManageArea}
          pending={pending}
          run={run}
        />
      ) : null}
    </>
  );
}

function ResumenTab({
  area,
  leaders,
  members,
  teams,
  positions,
  criticalPositions,
  expiringCredentials,
  canReadCredentials,
}: {
  area: ServiceAreaDetail;
  leaders: AreaLeader[];
  members: AreaMember[];
  teams: ServiceTeamListItem[];
  positions: ServicePosition[];
  criticalPositions: number;
  expiringCredentials: PersonCredential[];
  canReadCredentials: boolean;
}) {
  const activeMembers = members.filter((m) => m.status === "active").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {area.description ? (
        <div className="shell-card" style={{ padding: 18, fontSize: 13, color: "var(--shell-text-muted)" }}>
          {area.description}
        </div>
      ) : null}

      <div className="serving-grid">
        <SummaryCard title="Responsables">
          {leaders.length === 0 ? (
            <p className="serving-meta">Sin responsable asignado.</p>
          ) : (
            <ul style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {leaders.map((l) => (
                <li key={l.id} style={{ fontSize: 13 }}>
                  {fullName(l.firstName, l.lastName)}
                  {l.isPrimary ? <span className="serving-chip is-success" style={{ marginLeft: 6 }}>Principal</span> : null}
                </li>
              ))}
            </ul>
          )}
        </SummaryCard>

        <SummaryCard title="Personas">
          <p style={{ fontSize: 24, fontWeight: 600 }}>{activeMembers}</p>
          <p className="serving-meta">
            {members.length} en total · {members.filter((m) => m.status === "training").length} en formación
          </p>
        </SummaryCard>

        <SummaryCard title="Equipos">
          <p style={{ fontSize: 24, fontWeight: 600 }}>{teams.length}</p>
          <p className="serving-meta">Equipos permanentes del área</p>
        </SummaryCard>

        <SummaryCard title="Puestos">
          <p style={{ fontSize: 24, fontWeight: 600 }}>{positions.length}</p>
          <p className="serving-meta">{criticalPositions} marcados como críticos</p>
        </SummaryCard>
      </div>

      {canReadCredentials ? (
        <div className="shell-card list-card">
          <div className="list-card-header">
            <h2>Credenciales próximas a vencer</h2>
          </div>
          {expiringCredentials.length === 0 ? (
            <div className="shell-empty-state" style={{ padding: "28px 12px" }}>
              <h3>Nada pendiente</h3>
              <p>Ninguna credencial de esta área vence en los próximos 30 días.</p>
            </div>
          ) : (
            <div className="people-table-wrap">
              <table className="serving-table">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Credencial</th>
                    <th>Vence</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringCredentials.map((c) => (
                    <tr key={c.id}>
                      <td data-label="Persona">{fullName(c.firstName, c.lastName)}</td>
                      <td data-label="Credencial">{c.credentialTypeName}</td>
                      <td data-label="Vence">{formatDate(c.expiresAt)}</td>
                      <td data-label="Estado">
                        <span className="serving-chip is-warning">Por vencer</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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

function PersonasTab({
  areaId,
  members,
  leaders,
  people,
  canManageMembers,
  canManageLeaders,
  pending,
  run,
}: {
  areaId: string;
  members: AreaMember[];
  leaders: AreaLeader[];
  people: PersonOption[];
  canManageMembers: boolean;
  canManageLeaders: boolean;
  pending: boolean;
  run: (fn: () => Promise<AreaFichaState>) => void;
}) {
  const [personId, setPersonId] = useState("");
  const [level, setLevel] = useState<OperationalLevel>("trainee");
  const [status, setStatus] = useState<AreaMemberStatus>("active");
  const [leaderId, setLeaderId] = useState("");

  const memberIds = new Set(members.map((m) => m.personId));
  const available = people.filter((p) => !memberIds.has(p.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {canManageLeaders ? (
        <div className="shell-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={authLabelStyle}>Responsables del área</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {leaders.length === 0 ? (
              <p className="serving-meta">Sin responsable asignado.</p>
            ) : (
              leaders.map((l) => (
                <span key={l.id} className="serving-chip">
                  {fullName(l.firstName, l.lastName)}
                  <button
                    type="button"
                    aria-label={`Quitar responsable ${fullName(l.firstName, l.lastName)}`}
                    disabled={pending}
                    onClick={() => run(() => quitarResponsableAction(areaId, l.personId))}
                    style={{ ...subtleButtonStyle, fontSize: 13 }}
                  >
                    ×
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="serving-toolbar">
            <select
              value={leaderId}
              onChange={(e) => setLeaderId(e.target.value)}
              aria-label="Persona responsable"
              style={{ ...authInputStyle, minWidth: 180 }}
            >
              <option value="">Selecciona una persona…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {fullName(p.firstName, p.lastName)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending || !leaderId}
              onClick={() => {
                run(() => anadirResponsableAction(areaId, leaderId, leaders.length === 0));
                setLeaderId("");
              }}
              style={secondaryButtonStyle(pending)}
            >
              Añadir responsable
            </button>
          </div>
        </div>
      ) : null}

      {canManageMembers ? (
        <div className="shell-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={authLabelStyle}>Añadir persona al área</p>
          <div className="serving-toolbar">
            <select
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              aria-label="Persona"
              style={{ ...authInputStyle, minWidth: 180 }}
            >
              <option value="">Selecciona una persona…</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {fullName(p.firstName, p.lastName)}
                </option>
              ))}
            </select>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value as OperationalLevel)}
              aria-label="Nivel operativo"
              style={authInputStyle}
            >
              {Object.entries(OPERATIONAL_LEVEL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as AreaMemberStatus)}
              aria-label="Estado"
              style={authInputStyle}
            >
              {Object.entries(AREA_MEMBER_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={pending || !personId}
              onClick={() => {
                run(() => anadirMiembroAction(areaId, personId, { level, status }));
                setPersonId("");
              }}
              style={primaryButtonStyle(pending)}
            >
              Añadir al área
            </button>
          </div>
        </div>
      ) : null}

      {members.length === 0 ? (
        <div className="shell-card shell-empty-state">
          <h3>Todavía no hay personas en esta área</h3>
          <p>Añade a quienes ya sirven aquí e indica su nivel operativo.</p>
        </div>
      ) : (
        <div className="shell-card list-card">
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Estado</th>
                  <th>Nivel</th>
                  <th>Desde</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Persona">
                      <Link
                        href={`/app/personas/${m.personId}`}
                        style={{ fontWeight: 600, color: "var(--shell-text)", textDecoration: "none" }}
                      >
                        {fullName(m.firstName, m.lastName)}
                      </Link>
                    </td>
                    <td data-label="Estado">
                      {canManageMembers ? (
                        <select
                          defaultValue={m.status}
                          aria-label={`Estado de ${fullName(m.firstName, m.lastName)}`}
                          disabled={pending}
                          onChange={(e) =>
                            run(() =>
                              actualizarMiembroAction(areaId, m.personId, {
                                status: e.target.value as AreaMemberStatus,
                              }),
                            )
                          }
                          style={{ ...authInputStyle, padding: "5px 8px", fontSize: 12.5 }}
                        >
                          {Object.entries(AREA_MEMBER_STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="serving-chip">{AREA_MEMBER_STATUS_LABELS[m.status]}</span>
                      )}
                    </td>
                    <td data-label="Nivel">
                      {canManageMembers ? (
                        <select
                          defaultValue={m.level}
                          aria-label={`Nivel de ${fullName(m.firstName, m.lastName)}`}
                          disabled={pending}
                          onChange={(e) =>
                            run(() =>
                              actualizarMiembroAction(areaId, m.personId, {
                                level: e.target.value as OperationalLevel,
                              }),
                            )
                          }
                          style={{ ...authInputStyle, padding: "5px 8px", fontSize: 12.5 }}
                        >
                          {Object.entries(OPERATIONAL_LEVEL_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="serving-chip is-muted">{OPERATIONAL_LEVEL_LABELS[m.level]}</span>
                      )}
                    </td>
                    <td data-label="Desde" className="serving-meta">
                      {formatDate(m.joinedAt)}
                    </td>
                    <td data-label="">
                      {canManageMembers ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => quitarMiembroAction(areaId, m.personId))}
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

function EquiposTab({
  areaId,
  teams,
  canManage,
  pending,
  run,
}: {
  areaId: string;
  teams: ServiceTeamListItem[];
  canManage: boolean;
  pending: boolean;
  run: (fn: () => Promise<AreaFichaState>) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {canManage ? (
        <form
          className="shell-card serving-toolbar"
          style={{ padding: 18 }}
          action={(formData) => run(() => crearEquipoEnAreaAction(areaId, formData))}
        >
          <div style={{ flex: "1 1 180px" }}>
            <label htmlFor="team-name" style={authLabelStyle}>
              Nuevo equipo
            </label>
            <input
              id="team-name"
              name="name"
              required
              placeholder="Equipo A"
              style={{ ...authInputStyle, width: "100%" }}
            />
          </div>
          <div style={{ flex: "1 1 180px" }}>
            <label htmlFor="team-description" style={authLabelStyle}>
              Descripción
            </label>
            <input id="team-description" name="description" style={{ ...authInputStyle, width: "100%" }} />
          </div>
          <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
            Crear equipo
          </button>
        </form>
      ) : null}

      {teams.length === 0 ? (
        <div className="shell-card shell-empty-state">
          <h3>Esta área no tiene equipos</h3>
          <p>Un equipo agrupa a las personas que sirven juntas de forma estable.</p>
        </div>
      ) : (
        <div className="serving-grid">
          {teams.map((team) => (
            <div key={team.id} className="shell-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{team.name}</p>
                <span className={`serving-chip ${team.active ? "is-success" : "is-muted"}`}>
                  {team.active ? "Activo" : "Inactivo"}
                </span>
              </div>
              {team.description ? <p className="serving-meta">{team.description}</p> : null}
              <p className="serving-meta">
                {team.members.length} persona{team.members.length === 1 ? "" : "s"}
              </p>
              <Link
                href="/app/servicios/equipos"
                style={{ fontSize: 12, fontWeight: 600, color: "var(--shell-brand)", textDecoration: "none" }}
              >
                Gestionar equipo →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PuestosTab({
  areaId,
  positions,
  canManage,
  pending,
  run,
}: {
  areaId: string;
  positions: ServicePosition[];
  canManage: boolean;
  pending: boolean;
  run: (fn: () => Promise<AreaFichaState>) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {canManage ? (
        <form
          className="shell-card"
          style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}
          action={(formData) => run(() => crearPuestoAction(areaId, formData))}
        >
          <p style={authLabelStyle}>Nuevo puesto</p>
          <div className="serving-toolbar">
            <input
              name="name"
              required
              aria-label="Nombre del puesto"
              placeholder="Mesa de sonido (FOH)"
              style={{ ...authInputStyle, flex: "1 1 200px" }}
            />
            <input
              name="description"
              aria-label="Descripción del puesto"
              placeholder="Descripción"
              style={{ ...authInputStyle, flex: "1 1 200px" }}
            />
            <input
              name="minPeople"
              type="number"
              min={0}
              defaultValue={1}
              aria-label="Mínimo de personas"
              style={{ ...authInputStyle, width: 90 }}
            />
            <input
              name="maxPeople"
              type="number"
              min={0}
              aria-label="Máximo de personas"
              placeholder="Máx."
              style={{ ...authInputStyle, width: 90 }}
            />
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" name="critical" /> Puesto crítico
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" name="requiresAutonomous" /> Requiere persona autónoma
            </label>
          </div>
          <button type="submit" disabled={pending} style={{ ...primaryButtonStyle(pending), alignSelf: "flex-start" }}>
            Crear puesto
          </button>
        </form>
      ) : null}

      {positions.length === 0 ? (
        <div className="shell-card shell-empty-state">
          <h3>Esta área no tiene puestos definidos</h3>
          <p>Un puesto describe qué hay que cubrir, no quién lo cubre un día concreto.</p>
        </div>
      ) : (
        <div className="shell-card list-card">
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Puesto</th>
                  <th>Personas</th>
                  <th>Requisitos</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Puesto">
                      <Link
                        href={`/app/servicios/areas/${areaId}/puestos/${p.id}`}
                        style={{ fontWeight: 600, color: "var(--shell-text)", textDecoration: "none" }}
                      >
                        {p.name}
                      </Link>
                      {p.critical ? (
                        <span className="serving-chip is-danger" style={{ marginLeft: 6 }}>
                          Crítico
                        </span>
                      ) : null}
                      {p.description ? <div className="serving-meta">{p.description}</div> : null}
                    </td>
                    <td data-label="Personas" className="serving-meta">
                      {p.minPeople}
                      {p.maxPeople ? `–${p.maxPeople}` : "+"}
                    </td>
                    <td data-label="Requisitos" className="serving-meta">
                      {p.requiresAutonomousPerson ? "Exige nivel autónomo" : "Sin exigencia de nivel"}
                    </td>
                    <td data-label="">
                      {canManage ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => archivarPuestoAction(areaId, p.id))}
                          style={subtleButtonStyle}
                        >
                          Archivar
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

function CualificacionesTab({
  rows,
}: {
  rows: AreaFichaProps["areaQualifications"];
}) {
  if (rows.length === 0) {
    return (
      <div className="shell-card shell-empty-state">
        <h3>Nadie de esta área tiene cualificaciones registradas</h3>
        <p>
          Las cualificaciones se definen en el catálogo de la iglesia y se asignan a cada persona
          desde Cualificaciones.
        </p>
        <Link
          href="/app/servicios/cualificaciones"
          style={{ fontSize: 12.5, fontWeight: 600, color: "var(--shell-brand)", textDecoration: "none", marginTop: 8 }}
        >
          Ir a Cualificaciones →
        </Link>
      </div>
    );
  }

  return (
    <div className="shell-card list-card">
      <div className="people-table-wrap">
        <table className="serving-table">
          <thead>
            <tr>
              <th>Persona</th>
              <th>Cualificación</th>
              <th>Nivel</th>
              <th>Verificada</th>
              <th>Vence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.personId}-${i}`}>
                <td data-label="Persona">{row.personName}</td>
                <td data-label="Cualificación">{row.qualificationName}</td>
                <td data-label="Nivel">
                  <span className="serving-chip is-muted">{row.level}</span>
                </td>
                <td data-label="Verificada">
                  <span className={`serving-chip ${row.verified ? "is-success" : "is-warning"}`}>
                    {row.verified ? "Verificada" : "Sin verificar"}
                  </span>
                </td>
                <td data-label="Vence" className="serving-meta">
                  {formatDate(row.expiresAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConfiguracionTab({
  area,
  campuses,
  canManage,
  pending,
  run,
}: {
  area: ServiceAreaDetail;
  campuses: { id: string; name: string }[];
  canManage: boolean;
  pending: boolean;
  run: (fn: () => Promise<AreaFichaState>) => void;
}) {
  return (
    <form
      className="shell-card"
      style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, opacity: canManage ? 1 : 0.7 }}
      action={(formData) => run(() => guardarAreaAction(area.id, formData))}
    >
      <div>
        <label htmlFor="cfg-name" style={authLabelStyle}>
          Nombre
        </label>
        <input
          id="cfg-name"
          name="name"
          defaultValue={area.name}
          required
          disabled={!canManage}
          style={{ ...authInputStyle, width: "100%" }}
        />
      </div>
      <div>
        <label htmlFor="cfg-description" style={authLabelStyle}>
          Descripción
        </label>
        <input
          id="cfg-description"
          name="description"
          defaultValue={area.description ?? ""}
          disabled={!canManage}
          style={{ ...authInputStyle, width: "100%" }}
        />
      </div>
      <div>
        <label htmlFor="cfg-campus" style={authLabelStyle}>
          Sede
        </label>
        <select
          id="cfg-campus"
          name="campusId"
          defaultValue={area.campusId ?? ""}
          disabled={!canManage}
          style={{ ...authInputStyle, width: "100%" }}
        >
          <option value="">Toda la iglesia</option>
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
        <input type="checkbox" name="active" defaultChecked={area.active} disabled={!canManage} /> Área activa
      </label>

      {canManage ? (
        <button type="submit" disabled={pending} style={{ ...primaryButtonStyle(pending), alignSelf: "flex-start" }}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </button>
      ) : (
        <p style={{ fontSize: 12, color: "var(--shell-text-subtle)" }}>
          No tienes permiso para editar esta área.
        </p>
      )}
    </form>
  );
}
