"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import type { KidsSessionDetail, KidsSessionStatus } from "@/server/kids/kids-sessions-service";
import type { KidsRoom } from "@/server/kids/kids-rooms-service";
import type { ActivitySummary } from "@/server/activities/activities-service";
import { primaryButtonStyle, secondaryButtonStyle } from "../ui";
import { listUpcomingActivitiesAction, crearSesionDesdeActividadAction } from "./actions";

const STATUS_LABELS: Record<KidsSessionStatus, string> = {
  scheduled: "Programada",
  open: "Abierta",
  closed: "Cerrada",
  cancelled: "Cancelada",
};

const STATUS_CHIP: Record<KidsSessionStatus, string> = {
  scheduled: "serving-chip",
  open: "serving-chip is-success",
  closed: "serving-chip is-muted",
  cancelled: "serving-chip is-danger",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

const selectStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "var(--shell-radius-sm)",
  border: "1px solid var(--shell-border)",
  fontSize: 13,
};

export default function SesionesManager({
  initialSessions,
  rooms,
  canManage,
  filters,
}: {
  initialSessions: KidsSessionDetail[];
  rooms: KidsRoom[];
  canManage: boolean;
  filters: { status?: string; roomId?: string; from?: string; to?: string };
}) {
  const [showNew, setShowNew] = useState(false);
  const hasFilters = Boolean(filters.status || filters.roomId || filters.from || filters.to);

  return (
    <>
      <section style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Sesiones Kids</h1>
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
            Abre sesiones de sala para una actividad, gestiona el staff y controla el check-in/checkout.
          </p>
        </div>
        {canManage ? (
          <button type="button" style={primaryButtonStyle()} onClick={() => setShowNew(true)}>
            <Plus size={14} /> Nueva sesión desde actividad
          </button>
        ) : null}
      </section>

      <form className="shell-card serving-toolbar" style={{ padding: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
        <select name="status" defaultValue={filters.status ?? ""} aria-label="Estado" style={selectStyle}>
          <option value="">Todos los estados</option>
          <option value="scheduled">Programada</option>
          <option value="open">Abierta</option>
          <option value="closed">Cerrada</option>
          <option value="cancelled">Cancelada</option>
        </select>
        <select name="roomId" defaultValue={filters.roomId ?? ""} aria-label="Sala" style={selectStyle}>
          <option value="">Todas las salas</option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={filters.from ?? ""} aria-label="Desde" style={selectStyle} />
        <input type="date" name="to" defaultValue={filters.to ?? ""} aria-label="Hasta" style={selectStyle} />
        <button type="submit" style={secondaryButtonStyle()}>
          Filtrar
        </button>
        {hasFilters ? (
          <Link href="/app/kids/sesiones" style={{ fontSize: 12, alignSelf: "center", color: "var(--shell-text-subtle)" }}>
            Limpiar filtros
          </Link>
        ) : null}
      </form>

      {initialSessions.length === 0 ? (
        <div className="shell-card shell-empty-state" style={{ padding: "48px 24px" }}>
          <h3>{hasFilters ? "No hay sesiones con estos filtros" : "Todavía no hay sesiones Kids"}</h3>
          <p>{hasFilters ? "Prueba a quitar algún filtro." : "Crea una sesión a partir de una actividad próxima."}</p>
        </div>
      ) : (
        <div className="shell-card list-card">
          <div className="people-table-wrap">
            <table className="serving-table">
              <thead>
                <tr>
                  <th>Actividad</th>
                  <th>Fecha</th>
                  <th>Sala</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {initialSessions.map((session) => (
                  <tr key={session.id}>
                    <td data-label="Actividad">
                      <Link
                        href={`/app/kids/sesiones/${session.id}`}
                        style={{ fontWeight: 600, color: "var(--shell-text)", textDecoration: "none" }}
                      >
                        {session.activityTitle || "Actividad"}
                      </Link>
                    </td>
                    <td data-label="Fecha" className="serving-meta">
                      {formatDateTime(session.activityStartsAt)}
                    </td>
                    <td data-label="Sala" className="serving-meta">
                      {session.roomName}
                    </td>
                    <td data-label="Estado">
                      <span className={STATUS_CHIP[session.status]}>{STATUS_LABELS[session.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNew ? <NuevaSesionModal rooms={rooms} onClose={() => setShowNew(false)} /> : null}
    </>
  );
}

function NuevaSesionModal({ rooms, onClose }: { rooms: KidsRoom[]; onClose: () => void }) {
  const router = useRouter();
  const [activities, setActivities] = useState<ActivitySummary[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [activityId, setActivityId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startAction] = useTransition();

  useEffect(() => {
    listUpcomingActivitiesAction().then((res) => {
      if (!res.error) setActivities(res.data ?? []);
      setLoadingActivities(false);
    });
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activityId || !roomId) {
      setError("Selecciona una actividad y una sala.");
      return;
    }
    const selectedActivity = activities.find((a) => a.id === activityId);
    startAction(async () => {
      const res = await crearSesionDesdeActividadAction(activityId, roomId, selectedActivity?.campusId ?? undefined);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push(`/app/kids/sesiones/${res.data?.sessionId}`);
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nueva sesión desde actividad"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        className="shell-card"
        style={{ padding: 20, maxWidth: 460, width: "100%", display: "flex", flexDirection: "column", gap: 14 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Nueva sesión desde actividad</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: "none", border: "none", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
            Actividad
            <select
              value={activityId}
              onChange={(e) => setActivityId(e.target.value)}
              style={{ ...selectStyle, minHeight: 44 }}
              disabled={loadingActivities}
              required
            >
              <option value="">{loadingActivities ? "Cargando actividades…" : "Selecciona una actividad"}</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} — {formatDateTime(a.startsAt)}
                </option>
              ))}
            </select>
            {!loadingActivities && activities.length === 0 ? (
              <span style={{ color: "var(--shell-text-muted)", fontSize: 12 }}>
                No hay actividades próximas planificadas o publicadas.
              </span>
            ) : null}
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
            Sala
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)} style={{ ...selectStyle, minHeight: 44 }} required>
              <option value="">Selecciona una sala</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
            {rooms.length === 0 ? (
              <span style={{ color: "var(--shell-text-muted)", fontSize: 12 }}>Todavía no hay salas Kids activas.</span>
            ) : null}
          </label>

          {error ? (
            <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
              {error}
            </p>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" style={secondaryButtonStyle(pending)} onClick={onClose} disabled={pending}>
              Cancelar
            </button>
            <button type="submit" style={{ ...primaryButtonStyle(pending), minHeight: 44 }} disabled={pending}>
              {pending ? "Creando…" : "Crear sesión"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
