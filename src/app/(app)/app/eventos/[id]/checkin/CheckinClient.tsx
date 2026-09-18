"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Search, Check, Undo2 } from "lucide-react";
import type { CheckinAttendeeResult, CheckinCounts } from "@/server/events/checkin-service";
import { buscarAsistenteAction, marcarAsistenciaAction, deshacerAsistenciaAction, contadorCheckinAction } from "./actions";
import { primaryButtonStyle, secondaryButtonStyle } from "../../ui";

const POLL_INTERVAL_MS = 7000;

export default function CheckinClient({ eventId, eventTitle }: { eventId: string; eventTitle: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CheckinAttendeeResult[]>([]);
  const [counts, setCounts] = useState<CheckinCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const [acting, startAction] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshCounts = useCallback(() => {
    contadorCheckinAction(eventId).then((res) => {
      if (!res.error && res.data) setCounts(res.data);
    });
  }, [eventId]);

  useEffect(() => {
    refreshCounts();
    const interval = setInterval(refreshCounts, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshCounts]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      startSearch(async () => {
        const res = await buscarAsistenteAction(eventId, query);
        if (res.error) {
          setError(res.error);
          setResults([]);
        } else {
          setError(null);
          setResults(res.data ?? []);
        }
      });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, eventId]);

  function doCheckin(attendeeId: string, name: string) {
    startAction(async () => {
      const res = await marcarAsistenciaAction(attendeeId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      setMessage(`${name}: check-in registrado.`);
      setResults((prev) => prev.map((r) => (r.id === attendeeId ? { ...r, attendanceStatus: "checked_in" } : r)));
      refreshCounts();
    });
  }

  function doUndo(attendeeId: string, name: string) {
    startAction(async () => {
      const res = await deshacerAsistenciaAction(attendeeId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      setMessage(`${name}: check-in deshecho.`);
      setResults((prev) => prev.map((r) => (r.id === attendeeId ? { ...r, attendanceStatus: "registered" } : r)));
      refreshCounts();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 520, margin: "0 auto" }}>
      <div>
        <Link href={`/app/eventos/${eventId}`} style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}>
          ← Volver al evento
        </Link>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>Check-in — {eventTitle}</h1>
      </div>

      <div
        className="shell-card"
        style={{
          padding: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: "env(safe-area-inset-top, 0px)",
          zIndex: 5,
        }}
        role="status"
        aria-live="polite"
      >
        <span style={{ fontSize: 13, color: "var(--shell-text-muted)" }}>Asistentes</span>
        <span style={{ fontSize: 22, fontWeight: 700 }}>
          {counts ? `${counts.checkedIn}/${counts.expected}` : "…"}
        </span>
      </div>

      <div style={{ position: "relative" }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--shell-text-subtle)" }} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, email o código…"
          aria-label="Buscar asistente"
          autoFocus
          style={{
            width: "100%",
            padding: "14px 14px 14px 38px",
            borderRadius: "var(--shell-radius-md)",
            border: "1px solid var(--shell-border)",
            fontSize: 16,
          }}
        />
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

      {searching ? <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>Buscando…</p> : null}

      {!searching && query.trim().length >= 2 && results.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>Sin resultados.</p>
      ) : null}

      <ul style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", padding: 0 }}>
        {results.map((attendee) => {
          const checkedIn = attendee.attendanceStatus === "checked_in";
          return (
            <li
              key={attendee.id}
              className="shell-card"
              style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {attendee.fullName}
                </p>
                <p style={{ fontSize: 12, color: "var(--shell-text-muted)" }}>
                  {attendee.registrationCode} · {attendee.attendeeType === "adult" ? "Adulto" : "Menor"}
                </p>
              </div>
              {checkedIn ? (
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => doUndo(attendee.id, attendee.fullName)}
                  style={{ ...secondaryButtonStyle(acting), flexShrink: 0, minHeight: 44 }}
                  aria-label={`Deshacer check-in de ${attendee.fullName}`}
                >
                  <Undo2 size={16} /> Deshacer
                </button>
              ) : (
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => doCheckin(attendee.id, attendee.fullName)}
                  style={{ ...primaryButtonStyle(acting), flexShrink: 0, minHeight: 44 }}
                  aria-label={`Marcar asistencia de ${attendee.fullName}`}
                >
                  <Check size={16} /> Check-in
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
