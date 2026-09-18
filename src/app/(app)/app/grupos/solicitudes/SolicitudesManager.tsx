"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { GROUP_JOIN_REQUEST_STATUS_INFO } from "@/lib/groups/constants";
import type { GroupJoinRequestItem } from "@/server/groups/groups-service";
import { pedirPlazaAction, resolverSolicitudAction, retirarSolicitudAction, type SolicitudesState } from "./actions";
import {
  CHIP_CLASS,
  cardStyle,
  dangerButtonStyle,
  formatDate,
  inputStyle,
  primaryButtonStyle,
  sectionTitleStyle,
  selectStyle,
  subtleButtonStyle,
} from "../ui";

export type GrupoAbierto = { id: string; name: string };

export default function SolicitudesManager({
  pending: pendingRequests,
  resolved,
  mine,
  openGroups,
  canResolve,
}: {
  pending: GroupJoinRequestItem[];
  resolved: GroupJoinRequestItem[];
  mine: GroupJoinRequestItem[];
  openGroups: GrupoAbierto[];
  canResolve: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [group, setGroup] = useState("");
  const [message, setMessage] = useState("");

  function run(action: () => Promise<SolicitudesState>) {
    startTransition(async () => {
      const result = await action();
      setError(result.error);
    });
  }

  return (
    <>
      {error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      ) : null}

      {canResolve ? (
        <div className="shell-card" style={cardStyle}>
          <h2 style={sectionTitleStyle}>Pendientes de resolver ({pendingRequests.length})</h2>
          {pendingRequests.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
              No hay solicitudes esperando respuesta.
            </p>
          ) : (
            <div className="people-table-wrap">
              <table className="serving-table">
                <thead>
                  <tr>
                    <th>Persona</th>
                    <th>Grupo</th>
                    <th>Mensaje</th>
                    <th>Pedida</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {pendingRequests.map((request) => (
                    <tr key={request.id}>
                      <td data-label="Persona" style={{ fontWeight: 600 }}>
                        {request.personName}
                      </td>
                      <td data-label="Grupo">
                        <Link href={`/app/grupos/${request.groupId}`} style={{ color: "var(--shell-text)" }}>
                          {request.groupName}
                        </Link>
                      </td>
                      <td data-label="Mensaje" className="serving-meta">
                        {request.message ?? "—"}
                      </td>
                      <td data-label="Pedida" className="serving-meta">
                        {formatDate(request.createdAt)}
                      </td>
                      <td data-label="">
                        <div style={{ display: "flex", gap: 10 }}>
                          <button
                            type="button"
                            disabled={busy}
                            style={subtleButtonStyle}
                            onClick={() => run(() => resolverSolicitudAction(request.id, true))}
                          >
                            Aceptar
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            style={dangerButtonStyle}
                            onClick={() => run(() => resolverSolicitudAction(request.id, false))}
                          >
                            Rechazar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      <div className="shell-card" style={cardStyle}>
        <h2 style={sectionTitleStyle}>Pedir plaza en un grupo</h2>
        <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
          Solo aparecen los grupos que admiten solicitudes. El responsable del grupo recibirá el aviso en su bandeja de
          LEVITA y decidirá.
        </p>
        {openGroups.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
            Ahora mismo no hay ningún grupo abierto a solicitudes.
          </p>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select
              value={group}
              onChange={(event) => setGroup(event.target.value)}
              aria-label="Grupo"
              style={{ ...selectStyle, flex: "1 1 220px" }}
            >
              <option value="">Elige un grupo…</option>
              {openGroups.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={500}
              placeholder="Mensaje para quien lo lleva (opcional)"
              aria-label="Mensaje"
              style={{ ...inputStyle, flex: "1 1 240px", width: "auto" }}
            />
            <button
              type="button"
              disabled={busy || !group}
              style={primaryButtonStyle(busy)}
              onClick={() => {
                if (!group) return;
                const chosen = group;
                const text = message;
                setMessage("");
                run(() => pedirPlazaAction(chosen, text || undefined));
              }}
            >
              Pedir plaza
            </button>
          </div>
        )}
      </div>

      <div className="shell-card" style={cardStyle}>
        <h2 style={sectionTitleStyle}>Mis solicitudes</h2>
        {mine.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>No has pedido plaza en ningún grupo.</p>
        ) : (
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Estado</th>
                  <th>Pedida</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {mine.map((request) => {
                  const info = GROUP_JOIN_REQUEST_STATUS_INFO[request.status];
                  return (
                    <tr key={request.id}>
                      <td data-label="Grupo" style={{ fontWeight: 600 }}>
                        {request.groupName}
                      </td>
                      <td data-label="Estado">
                        <span className={CHIP_CLASS[info.tone]}>{info.label}</span>
                        {request.decisionNote ? (
                          <span style={{ display: "block", fontSize: 11.5, color: "var(--shell-text-subtle)" }}>
                            {request.decisionNote}
                          </span>
                        ) : null}
                      </td>
                      <td data-label="Pedida" className="serving-meta">
                        {formatDate(request.createdAt)}
                      </td>
                      <td data-label="">
                        {request.status === "pending" ? (
                          <button
                            type="button"
                            disabled={busy}
                            style={subtleButtonStyle}
                            onClick={() => run(() => retirarSolicitudAction(request.id))}
                          >
                            Retirar
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canResolve && resolved.length > 0 ? (
        <div className="shell-card" style={cardStyle}>
          <h2 style={sectionTitleStyle}>Ya resueltas</h2>
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Grupo</th>
                  <th>Estado</th>
                  <th>Resuelta</th>
                </tr>
              </thead>
              <tbody>
                {resolved.map((request) => {
                  const info = GROUP_JOIN_REQUEST_STATUS_INFO[request.status];
                  return (
                    <tr key={request.id}>
                      <td data-label="Persona" style={{ fontWeight: 600 }}>
                        {request.personName}
                      </td>
                      <td data-label="Grupo" className="serving-meta">
                        {request.groupName}
                      </td>
                      <td data-label="Estado">
                        <span className={CHIP_CLASS[info.tone]}>{info.label}</span>
                      </td>
                      <td data-label="Resuelta" className="serving-meta">
                        {formatDate(request.decidedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
