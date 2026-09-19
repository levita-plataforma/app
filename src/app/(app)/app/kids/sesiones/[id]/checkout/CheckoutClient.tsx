"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { AuthorizedPickup } from "@/server/kids/kids-checkin-service";
import {
  primaryButtonStyle,
  secondaryButtonStyle,
  normalizePickupCode,
  isPickupCodeValid,
  PICKUP_CODE_LENGTH,
} from "../../../ui";
import { buscarCheckinPorCodigoAction, confirmarCheckoutAction, type PickupLookupResult } from "./actions";

const AUTH_TYPE_LABELS: Record<AuthorizedPickup["authorizationType"], string> = {
  permanent: "Autorización permanente",
  date_range: "Autorización por fechas",
  one_time: "Autorización de un solo uso",
};

type Step = "code" | "pickup" | "denied" | "done";

/**
 * Check-out empezando por el código, que es como llega la familia a la
 * puerta. Lo que cambió con el hotfix 20260928001000 es quién resuelve el
 * código: antes la pantalla recalculaba la huella en Node contra una
 * columna que era legible —y por eso se pudo recuperar un código real—, y
 * ahora lo hace `public.kids_lookup_pickup`, que exige kids.checkout y solo
 * devuelve el nombre del menor, su sala y si tiene aviso médico. La salida
 * en sí la sigue registrando `kids_checkout`, que lo revalida todo.
 */
export default function CheckoutClient({
  sessionId,
  activityTitle,
  roomName,
}: {
  sessionId: string;
  activityTitle: string;
  roomName: string;
}) {
  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<PickupLookupResult | null>(null);
  const [selectedAuthId, setSelectedAuthId] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checkingCode, startCodeLookup] = useTransition();
  const [confirming, startConfirm] = useTransition();

  const codeReady = isPickupCodeValid(code);

  function reset() {
    setStep("code");
    setCode("");
    setLookup(null);
    setSelectedAuthId(null);
    setManualName("");
    setError(null);
  }

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startCodeLookup(async () => {
      const res = await buscarCheckinPorCodigoAction(sessionId, code);
      if (res.error || !res.data) {
        setError(res.error ?? "Código no válido o ya utilizado.");
        return;
      }
      setLookup(res.data);
      setStep("pickup");
    });
  }

  function confirm(pickupPersonName: string, authorizedPickupId?: string) {
    setError(null);
    setSelectedAuthId(authorizedPickupId ?? null);
    startConfirm(async () => {
      const res = await confirmarCheckoutAction(sessionId, code, pickupPersonName, authorizedPickupId);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (!res.data?.authorized) {
        setStep("denied");
        return;
      }
      setStep("done");
    });
  }

  function handleConfirmManual() {
    const name = manualName.trim();
    if (!name) {
      setError("Escribe el nombre de quien recoge.");
      return;
    }
    confirm(name);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560, margin: "0 auto" }}>
      <div>
        <Link
          href={`/app/kids/sesiones/${sessionId}`}
          style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}
        >
          ← Volver a la sesión
        </Link>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>
          Check-out — {activityTitle} · {roomName}
        </h1>
      </div>

      {step === "code" ? (
        <form onSubmit={handleLookup} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14 }}>
            Código de recogida
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(normalizePickupCode(e.target.value))}
              placeholder="Ej. K7RM2XQF"
              aria-label="Código de recogida"
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              maxLength={PICKUP_CODE_LENGTH}
              style={{
                padding: "18px 16px",
                borderRadius: "var(--shell-radius-md)",
                border: "1px solid var(--shell-border)",
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: 4,
                textAlign: "center",
                textTransform: "uppercase",
              }}
            />
            <span style={{ fontSize: 12, color: "var(--shell-text-muted)" }}>
              {PICKUP_CODE_LENGTH} caracteres. No lleva las letras I ni O, ni los números 0 ni 1.
            </span>
          </label>

          {error ? (
            <p role="alert" style={{ fontSize: 14, fontWeight: 600, color: "var(--shell-danger)" }}>
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={checkingCode || !codeReady}
            style={{ ...primaryButtonStyle(checkingCode), minHeight: 52, fontSize: 16, justifyContent: "center" }}
          >
            {checkingCode ? "Buscando…" : "Buscar check-in"}
          </button>
        </form>
      ) : null}

      {step === "pickup" && lookup ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="shell-card" style={{ padding: 16 }}>
            <p style={{ fontSize: 13, color: "var(--shell-text-muted)" }}>Menor localizado</p>
            <p style={{ fontSize: 18, fontWeight: 700 }}>{lookup.kidName}</p>
            {lookup.roomName ? (
              <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 2 }}>Sala {lookup.roomName}</p>
            ) : null}
          </div>

          {/* El aviso médico es un indicador, no el detalle: quien tenga
              kids.sensitive.read encontrará las notas en la ficha del menor.
              Se enseña antes de entregar al niño, que es cuando sirve. */}
          {lookup.medicalAlert ? (
            <div
              role="alert"
              className="shell-card"
              style={{
                padding: 14,
                border: "2px solid #8a5a00",
                background: "#fff4e0",
                color: "#8a5a00",
                fontSize: 14,
                fontWeight: 700,
                lineHeight: 1.4,
              }}
            >
              ⚠︎ Este menor tiene un aviso médico. Consúltalo con la persona responsable de la sala antes de
              entregarlo. El detalle está en su ficha y solo lo ve quien tiene permiso para las notas sensibles.
            </div>
          ) : null}

          <p style={{ fontSize: 14, fontWeight: 600 }}>¿Quién está recogiendo?</p>

          {lookup.authorizedPickups.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>Selecciona una persona autorizada:</p>
              <ul style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", padding: 0 }}>
                {lookup.authorizedPickups.map((auth) => (
                  <li key={auth.id}>
                    <button
                      type="button"
                      disabled={confirming}
                      onClick={() => confirm(auth.authorizedNameSnapshot, auth.id)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: 14,
                        minHeight: 52,
                        borderRadius: "var(--shell-radius-md)",
                        border: "1px solid var(--shell-border)",
                        background: "var(--shell-surface)",
                        cursor: confirming ? "wait" : "pointer",
                        fontSize: 15,
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>{auth.authorizedNameSnapshot}</span>
                      {auth.relationText ? (
                        <span style={{ color: "var(--shell-text-muted)" }}> · {auth.relationText}</span>
                      ) : null}
                      <br />
                      <span style={{ fontSize: 12, color: "var(--shell-text-muted)" }}>
                        {AUTH_TYPE_LABELS[auth.authorizationType]}
                        {confirming && selectedAuthId === auth.id ? " · confirmando…" : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: "var(--shell-text-muted)" }}>
              Este menor no tiene autorizaciones de recogida activas.
            </p>
          )}

          <div className="shell-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
              O si la persona no está en la lista, escribe su nombre: la recogida quedará registrada como no autorizada
              y el menor no podrá salir sin que alguien con permiso anule la validación.
            </p>
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Nombre de quien recoge"
              aria-label="Nombre de quien recoge (no autorizado en la lista)"
              style={{
                padding: "14px 14px",
                borderRadius: "var(--shell-radius-md)",
                border: "1px solid var(--shell-border)",
                fontSize: 16,
              }}
            />
            <button
              type="button"
              disabled={confirming || manualName.trim().length === 0}
              onClick={handleConfirmManual}
              style={{ ...secondaryButtonStyle(confirming), minHeight: 48, justifyContent: "center" }}
            >
              {confirming ? "Comprobando…" : "Continuar con este nombre"}
            </button>
          </div>

          {error ? (
            <p role="alert" style={{ fontSize: 14, fontWeight: 600, color: "var(--shell-danger)" }}>
              {error}
            </p>
          ) : null}

          <button type="button" style={secondaryButtonStyle()} onClick={reset}>
            Cancelar y volver a introducir código
          </button>
        </div>
      ) : null}

      {step === "denied" ? (
        <div
          role="alert"
          className="shell-card"
          style={{
            padding: 24,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            border: "2px solid #b3261e",
            background: "#fdeaea",
          }}
        >
          <p style={{ fontSize: 22, fontWeight: 800, color: "#b3261e" }}>⚠ RECOGIDA NO AUTORIZADA</p>
          <p style={{ fontSize: 14, color: "#8a1c17" }}>
            Esta persona no tiene una autorización de recogida activa para este menor. El menor NO puede salir con esta
            persona. Escala esta situación a alguien con permiso para anular la validación de recogida.
          </p>
          <button
            type="button"
            style={{ ...secondaryButtonStyle(), justifyContent: "center", minHeight: 48 }}
            onClick={reset}
          >
            Volver a empezar
          </button>
        </div>
      ) : null}

      {step === "done" ? (
        <div
          role="status"
          className="shell-card"
          style={{
            padding: 24,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            border: "2px solid var(--shell-brand)",
          }}
        >
          <p style={{ fontSize: 20, fontWeight: 700 }}>Check-out registrado</p>
          <p style={{ fontSize: 14, color: "var(--shell-text-muted)" }}>{lookup?.kidName} ha salido de la sesión.</p>
          <button
            type="button"
            style={{ ...primaryButtonStyle(), justifyContent: "center", minHeight: 48 }}
            onClick={reset}
          >
            Hacer otro check-out
          </button>
        </div>
      ) : null}
    </div>
  );
}
