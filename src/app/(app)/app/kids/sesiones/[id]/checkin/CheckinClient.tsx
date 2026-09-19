"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Search, Check } from "lucide-react";
import type { KidCheckinCandidate, CheckinKidResult } from "@/server/kids/kids-checkin-service";
import type { KidsRatioView } from "@/server/kids/kids-sessions-service";
import { primaryButtonStyle, fullName, ratioTone } from "../../../ui";
import { buscarMenorCheckinAction, confirmarCheckinAction, ratioStatusCheckinAction } from "./actions";

const RATIO_POLL_MS = 10000;

/**
 * El estado del ratio ya no es un adorno: desde el hotfix de seguridad,
 * `app.kids_checkin` rechaza el check-in cuando faltan adultos o cuando se
 * superaría el ratio de la sala. La franja avisa antes; el rechazo, si
 * llega, se enseña con el mensaje que manda la base, que dice cuántos
 * adultos hay y cuántos hacen falta.
 */
function RatioStrip({ view }: { view: KidsRatioView }) {
  if (view.kind === "forbidden") {
    return (
      <div role="status" className="shell-card" style={{ padding: 12, fontSize: 12.5, color: "var(--shell-text-muted)" }}>
        No tienes permiso para ver el estado del ratio de esta sala. El check-in lo seguirá comprobando la base.
      </div>
    );
  }

  if (view.kind === "unavailable") return null;

  const ratio = view.ratio;
  const config = ratioTone(ratio.state);

  return (
    <div
      role="status"
      aria-live="polite"
      className="shell-card"
      style={{
        padding: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        flexWrap: "wrap",
        background: config.bg,
        position: "sticky",
        top: "env(safe-area-inset-top, 0px)",
        zIndex: 5,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 800, color: config.fg }}>{config.doorLabel}</span>
      <span style={{ fontSize: 12.5, color: config.fg }}>
        {ratio.childrenCheckedIn} menores · {ratio.staffCheckedIn} de {ratio.minAdultsRequired} adultos mínimos (máx.
        actual: {ratio.maxChildrenForCurrentStaff} menores)
      </span>
    </div>
  );
}

export default function CheckinClient({
  sessionId,
  activityTitle,
  roomName,
  initialRatio,
}: {
  sessionId: string;
  activityTitle: string;
  roomName: string;
  initialRatio: KidsRatioView;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KidCheckinCandidate[]>([]);
  const [ratio, setRatio] = useState<KidsRatioView>(initialRatio);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ name: string; result: CheckinKidResult } | null>(null);
  const [searching, startSearch] = useTransition();
  const [acting, startAction] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshRatio = useCallback(() => {
    ratioStatusCheckinAction(sessionId).then((res) => {
      if (!res.error && res.data) setRatio(res.data);
    });
  }, [sessionId]);

  useEffect(() => {
    const interval = setInterval(refreshRatio, RATIO_POLL_MS);
    return () => clearInterval(interval);
  }, [refreshRatio]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }
      startSearch(async () => {
        const res = await buscarMenorCheckinAction(sessionId, query);
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
  }, [query, sessionId]);

  function doCheckin(candidate: KidCheckinCandidate) {
    const name = fullName(candidate.firstName, candidate.lastName);
    startAction(async () => {
      const res = await confirmarCheckinAction(sessionId, candidate.personId);
      if (res.error) {
        setError(res.error);
        // El rechazo casi siempre viene del ratio o del aforo: se vuelve a
        // pedir el estado para que la franja de arriba cuadre con el motivo.
        refreshRatio();
        return;
      }
      setError(null);
      setLastResult({ name, result: res.data! });
      setResults([]);
      setQuery("");
      refreshRatio();
    });
  }

  function nextChild() {
    setLastResult(null);
    setQuery("");
    setResults([]);
    setError(null);
  }

  if (lastResult) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560, margin: "0 auto" }}>
        <RatioStrip view={ratio} />
        <div
          className="shell-card"
          style={{
            padding: 28,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            border: "2px solid var(--shell-brand)",
          }}
        >
          <p style={{ fontSize: 16, fontWeight: 600 }}>{lastResult.name}: check-in registrado</p>
          <p style={{ fontSize: 13, color: "var(--shell-text-muted)" }}>
            Apunta o recuerda este código: solo se muestra una vez y hace falta para el check-out.
          </p>
          <div
            style={{
              fontSize: 56,
              fontWeight: 800,
              letterSpacing: 6,
              padding: "20px 12px",
              borderRadius: "var(--shell-radius-md)",
              background: "var(--shell-brand)",
              color: "#fff",
              wordBreak: "break-all",
            }}
          >
            {lastResult.result.pickupCode ?? "—"}
          </div>
          {lastResult.result.replayed ? (
            <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
              Este menor ya tenía un check-in activo en esta sesión; se ha reutilizado el mismo registro.
            </p>
          ) : null}
          <button
            type="button"
            style={{ ...primaryButtonStyle(), minHeight: 48, fontSize: 15, justifyContent: "center" }}
            onClick={nextChild}
          >
            Buscar el siguiente menor
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 560, margin: "0 auto" }}>
      <div>
        <Link href={`/app/kids/sesiones/${sessionId}`} style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}>
          ← Volver a la sesión
        </Link>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>
          Check-in — {activityTitle} · {roomName}
        </h1>
      </div>

      <RatioStrip view={ratio} />

      <div style={{ position: "relative" }}>
        <Search size={18} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--shell-text-subtle)" }} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar menor por nombre…"
          aria-label="Buscar menor para check-in"
          autoFocus
          style={{
            width: "100%",
            padding: "16px 16px 16px 42px",
            borderRadius: "var(--shell-radius-md)",
            border: "1px solid var(--shell-border)",
            fontSize: 17,
            minHeight: 52,
          }}
        />
      </div>

      {/* El rechazo del check-in se lee de pie, con una familia delante: va
          en tarjeta y con el mensaje completo de la base, que dice cuántos
          adultos hay en la sala y cuántos hacen falta. */}
      {error ? (
        <div
          role="alert"
          className="shell-card"
          style={{
            padding: 16,
            border: "2px solid #b3261e",
            background: "#fdeaea",
            color: "#8a1c17",
            fontSize: 15,
            fontWeight: 600,
            lineHeight: 1.4,
          }}
        >
          {error}
        </div>
      ) : null}

      {searching ? <p style={{ fontSize: 13, color: "var(--shell-text-muted)" }}>Buscando…</p> : null}

      {!searching && query.trim().length >= 2 && results.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--shell-text-muted)" }}>Sin resultados.</p>
      ) : null}

      <ul style={{ display: "flex", flexDirection: "column", gap: 10, listStyle: "none", padding: 0 }}>
        {results.map((candidate) => {
          const name = fullName(candidate.firstName, candidate.lastName);
          return (
            <li
              key={candidate.personId}
              className="shell-card"
              style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
            >
              <span style={{ fontWeight: 600, fontSize: 16 }}>{name}</span>
              <button
                type="button"
                disabled={acting}
                onClick={() => doCheckin(candidate)}
                style={{ ...primaryButtonStyle(acting), minHeight: 48, fontSize: 15, flexShrink: 0 }}
                aria-label={`Registrar check-in de ${name}`}
              >
                <Check size={18} /> Check-in
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
