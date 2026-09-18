"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { LogIn, LogOut, Plus, Trash2, UserPlus, X } from "lucide-react";
import type { KidsSessionDetail, KidsRatioStatus } from "@/server/kids/kids-sessions-service";
import type { KidsSessionStaffMember, KidsStaffRole, StaffEligibility } from "@/server/kids/kids-staff-service";
import { primaryButtonStyle, secondaryButtonStyle, fullName } from "../../ui";
import {
  getRatioStatusAction,
  cerrarSesionAction,
  searchPersonForStaffAction,
  checkStaffEligibilityAction,
  addStaffToSessionAction,
  removeStaffFromSessionAction,
  staffCheckInAction,
  staffCheckOutAction,
  type PersonCandidate,
} from "./actions";

const RATIO_POLL_MS = 10000;

const STATUS_LABELS: Record<KidsSessionDetail["status"], string> = {
  scheduled: "Programada",
  open: "Abierta",
  closed: "Cerrada",
  cancelled: "Cancelada",
};

const ROLE_LABELS: Record<KidsStaffRole, string> = {
  lead: "Responsable",
  assistant: "Ayudante",
  support: "Apoyo",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

function RatioBanner({ ratio }: { ratio: KidsRatioStatus | null }) {
  if (!ratio) {
    return (
      <div className="shell-card" style={{ padding: 14, fontSize: 13, color: "var(--shell-text-muted)" }}>
        No se pudo cargar el estado del ratio.
      </div>
    );
  }

  const config = {
    safe: { label: "RATIO SEGURO", bg: "#e6f4ea", fg: "#1e7e34", border: "#1e7e34" },
    warning: { label: "RATIO EN AVISO", bg: "#fff4e0", fg: "#8a5a00", border: "#8a5a00" },
    blocked: { label: "RATIO INSUFICIENTE", bg: "#fdeaea", fg: "#b3261e", border: "#b3261e" },
  }[ratio.state];

  return (
    <div
      role="status"
      aria-live="polite"
      className="shell-card"
      style={{
        padding: 16,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        background: config.bg,
        border: `2px solid ${config.border}`,
      }}
    >
      <div>
        <p style={{ fontSize: 16, fontWeight: 800, color: config.fg, letterSpacing: 0.3 }}>{config.label}</p>
        <p style={{ fontSize: 12.5, color: config.fg, marginTop: 2 }}>
          {ratio.childrenCheckedIn} menores · {ratio.staffCheckedIn} staff en sala (mínimo {ratio.minAdultsRequired})
        </p>
      </div>
      <div style={{ fontSize: 12.5, color: config.fg, textAlign: "right" }}>
        <p>Ratio: 1 adulto / {ratio.ratioChildrenPerAdult} menores</p>
        <p>Capacidad actual: hasta {ratio.maxChildrenForCurrentStaff} menores con el staff presente</p>
      </div>
    </div>
  );
}

export default function SesionFicha({
  session,
  initialRatio,
  initialStaff,
  permissions,
}: {
  session: KidsSessionDetail;
  initialRatio: KidsRatioStatus | null;
  initialStaff: KidsSessionStaffMember[];
  permissions: { canManage: boolean; canCheckin: boolean; canCheckout: boolean };
}) {
  const [ratio, setRatio] = useState(initialRatio);
  const [staff, setStaff] = useState(initialStaff);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [pending, startAction] = useTransition();

  const refreshRatio = useCallback(() => {
    getRatioStatusAction(session.id).then((res) => {
      if (!res.error) setRatio(res.data ?? null);
    });
  }, [session.id]);

  useEffect(() => {
    const interval = setInterval(refreshRatio, RATIO_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshRatio]);

  function handleClose() {
    if (!window.confirm("¿Cerrar esta sesión? No se podrán registrar más check-in.")) return;
    startAction(async () => {
      const res = await cerrarSesionAction(session.id);
      if (res.error) {
        setError(res.error);
        return;
      }
      window.location.reload();
    });
  }

  function handleStaffAdded(member: KidsSessionStaffMember) {
    setStaff((prev) => [...prev, member]);
    setShowAddStaff(false);
    setMessage(`${fullName(member.firstName, member.lastName)} añadido/a como staff.`);
    refreshRatio();
  }

  function handleRemoveStaff(staffRowId: string, name: string) {
    if (!window.confirm(`¿Quitar a ${name} de la sesión?`)) return;
    startAction(async () => {
      const res = await removeStaffFromSessionAction(session.id, staffRowId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setStaff((prev) => prev.filter((s) => s.id !== staffRowId));
      refreshRatio();
    });
  }

  function handleStaffCheckIn(staffRowId: string) {
    startAction(async () => {
      const res = await staffCheckInAction(session.id, staffRowId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setStaff((prev) => prev.map((s) => (s.id === staffRowId ? { ...s, checkedInAt: new Date().toISOString() } : s)));
      refreshRatio();
    });
  }

  function handleStaffCheckOut(staffRowId: string) {
    startAction(async () => {
      const res = await staffCheckOutAction(session.id, staffRowId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setStaff((prev) => prev.map((s) => (s.id === staffRowId ? { ...s, checkedOutAt: new Date().toISOString() } : s)));
      refreshRatio();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Link href="/app/kids/sesiones" style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}>
          ← Volver a sesiones
        </Link>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginTop: 6 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600 }}>{session.activityTitle || "Sesión Kids"}</h1>
            <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
              {formatDateTime(session.activityStartsAt)} · Sala {session.roomName} ·{" "}
              <span className="serving-chip">{STATUS_LABELS[session.status]}</span>
            </p>
          </div>
          {permissions.canManage && session.status !== "closed" ? (
            <button type="button" style={secondaryButtonStyle(pending)} onClick={handleClose} disabled={pending}>
              Cerrar sesión
            </button>
          ) : null}
        </div>
      </div>

      <RatioBanner ratio={ratio} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {permissions.canCheckin ? (
          <Link href={`/app/kids/sesiones/${session.id}/checkin`} style={{ ...primaryButtonStyle(), minHeight: 44 }}>
            <LogIn size={16} /> Ir a check-in
          </Link>
        ) : null}
        {permissions.canCheckout ? (
          <Link href={`/app/kids/sesiones/${session.id}/checkout`} style={{ ...secondaryButtonStyle(), minHeight: 44 }}>
            <LogOut size={16} /> Ir a check-out
          </Link>
        ) : null}
      </div>

      {error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" style={{ fontSize: 12.5, color: "var(--shell-success, green)" }}>
          {message}
        </p>
      ) : null}

      <div className="shell-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Staff de la sesión</h2>
          {permissions.canManage ? (
            <button type="button" style={secondaryButtonStyle()} onClick={() => setShowAddStaff(true)}>
              <UserPlus size={14} /> Añadir staff
            </button>
          ) : null}
        </div>

        {staff.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--shell-text-muted)" }}>Todavía no hay staff asignado a esta sesión.</p>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", padding: 0 }}>
            {staff.map((member) => {
              const checkedIn = Boolean(member.checkedInAt) && !member.checkedOutAt;
              return (
                <li
                  key={member.id}
                  className="shell-card"
                  style={{ padding: 12, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 600, fontSize: 14 }}>{fullName(member.firstName, member.lastName)}</p>
                    <p style={{ fontSize: 12, color: "var(--shell-text-muted)" }}>
                      {ROLE_LABELS[member.role]}
                      {!member.eligibleAtAssignment ? (
                        <span style={{ color: "var(--shell-danger)", marginLeft: 6 }}>
                          · No era elegible al asignar: {member.eligibilityReasons.join(", ")}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {checkedIn ? (
                      <button
                        type="button"
                        style={{ ...secondaryButtonStyle(pending), minHeight: 44 }}
                        onClick={() => handleStaffCheckOut(member.id)}
                        disabled={pending}
                      >
                        Check-out
                      </button>
                    ) : (
                      <button
                        type="button"
                        style={{ ...primaryButtonStyle(pending), minHeight: 44 }}
                        onClick={() => handleStaffCheckIn(member.id)}
                        disabled={pending}
                      >
                        Check-in
                      </button>
                    )}
                    {permissions.canManage ? (
                      <button
                        type="button"
                        aria-label={`Quitar a ${fullName(member.firstName, member.lastName)}`}
                        style={{ ...secondaryButtonStyle(pending), minHeight: 44 }}
                        onClick={() => handleRemoveStaff(member.id, fullName(member.firstName, member.lastName))}
                        disabled={pending}
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showAddStaff ? (
        <AddStaffModal sessionId={session.id} onClose={() => setShowAddStaff(false)} onAdded={handleStaffAdded} />
      ) : null}
    </div>
  );
}

function AddStaffModal({
  sessionId,
  onClose,
  onAdded,
}: {
  sessionId: string;
  onClose: () => void;
  onAdded: (member: KidsSessionStaffMember) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonCandidate[]>([]);
  const [selected, setSelected] = useState<PersonCandidate | null>(null);
  const [eligibility, setEligibility] = useState<StaffEligibility | null>(null);
  const [role, setRole] = useState<KidsStaffRole>("assistant");
  const [error, setError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [checking, startCheck] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      startSearch(async () => {
        const res = await searchPersonForStaffAction(query);
        setResults(res.data ?? []);
      });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  function selectCandidate(candidate: PersonCandidate) {
    setSelected(candidate);
    setEligibility(null);
    setError(null);
    startCheck(async () => {
      const res = await checkStaffEligibilityAction(candidate.personId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setEligibility(res.data ?? null);
    });
  }

  function confirmAdd() {
    if (!selected || !eligibility?.eligible) return;
    startSubmit(async () => {
      const res = await addStaffToSessionAction(sessionId, selected.personId, role);
      if (res.error) {
        setError(res.error);
        return;
      }
      onAdded({
        id: res.data!.staffId,
        sessionId,
        personId: selected.personId,
        firstName: selected.firstName,
        lastName: selected.lastName,
        role,
        checkedInAt: null,
        checkedOutAt: null,
        eligibleAtAssignment: true,
        eligibilityReasons: [],
      });
    });
  }

  const pending = searching || checking || submitting;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Añadir staff a la sesión"
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
        style={{ padding: 20, maxWidth: 480, width: "100%", display: "flex", flexDirection: "column", gap: 12, maxHeight: "85vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>Añadir staff</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: "none", border: "none", cursor: "pointer" }}>
            <X size={18} />
          </button>
        </div>

        {!selected ? (
          <>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar persona por nombre…"
              aria-label="Buscar persona"
              autoFocus
              style={{ padding: "12px 14px", borderRadius: "var(--shell-radius-md)", border: "1px solid var(--shell-border)", fontSize: 16 }}
            />
            {searching ? <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>Buscando…</p> : null}
            {!searching && query.trim().length >= 2 && results.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>Sin resultados.</p>
            ) : null}
            <ul style={{ display: "flex", flexDirection: "column", gap: 6, listStyle: "none", padding: 0 }}>
              {results.map((candidate) => (
                <li key={candidate.personId}>
                  <button
                    type="button"
                    onClick={() => selectCandidate(candidate)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: 12,
                      minHeight: 44,
                      borderRadius: "var(--shell-radius-md)",
                      border: "1px solid var(--shell-border)",
                      background: "var(--shell-surface)",
                      cursor: "pointer",
                      fontSize: 14,
                    }}
                  >
                    {fullName(candidate.firstName, candidate.lastName)}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 14 }}>
              Persona seleccionada: <strong>{fullName(selected.firstName, selected.lastName)}</strong>
            </p>

            {checking ? (
              <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>Comprobando elegibilidad…</p>
            ) : eligibility ? (
              eligibility.eligible ? (
                <p
                  role="status"
                  style={{ fontSize: 13, fontWeight: 600, color: "#1e7e34", background: "#e6f4ea", padding: 10, borderRadius: "var(--shell-radius-md)" }}
                >
                  Elegible para Kids.
                </p>
              ) : (
                <p
                  role="alert"
                  style={{ fontSize: 13, fontWeight: 600, color: "#b3261e", background: "#fdeaea", padding: 10, borderRadius: "var(--shell-radius-md)" }}
                >
                  No elegible: {eligibility.reasonLabels.join(", ")}
                </p>
              )
            ) : null}

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 }}>
              Rol
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as KidsStaffRole)}
                style={{ padding: "10px 12px", borderRadius: "var(--shell-radius-sm)", border: "1px solid var(--shell-border)", fontSize: 13, minHeight: 44 }}
              >
                <option value="lead">Responsable</option>
                <option value="assistant">Ayudante</option>
                <option value="support">Apoyo</option>
              </select>
            </label>

            {error ? (
              <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
                {error}
              </p>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                style={secondaryButtonStyle(pending)}
                onClick={() => {
                  setSelected(null);
                  setEligibility(null);
                  setError(null);
                }}
                disabled={pending}
              >
                Buscar otra persona
              </button>
              <button
                type="button"
                style={{ ...primaryButtonStyle(pending || !eligibility?.eligible), minHeight: 44 }}
                onClick={confirmAdd}
                disabled={pending || !eligibility?.eligible}
              >
                <Plus size={14} /> {submitting ? "Añadiendo…" : "Confirmar y añadir"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
