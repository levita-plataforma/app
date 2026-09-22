"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";

/**
 * Alta y baja del segundo factor para una cuenta de operación.
 *
 * Decisión de Carlos (21-sep-2026): recomendado, no obligatorio. Por eso esto
 * es una pantalla que se visita, no una puerta que se cruza. El aviso del panel
 * lleva aquí.
 *
 * El flujo va por el cliente del navegador porque el código TOTP lo teclea la
 * persona y la clave secreta no debe pasar por nuestro servidor: se la da
 * Supabase directamente a su navegador, se guarda en su aplicación de
 * autenticación y aquí solo se ve mientras dura el alta.
 */

type Factor = { id: string; status: string; friendly_name?: string };

export default function GestionMfa({ factoresIniciales }: { factoresIniciales: Factor[] }) {
  // El estado inicial viene del servidor, no de un efecto: así no hay un
  // parpadeo de «Cargando…» en cada visita para decir lo mismo que la página ya
  // sabía al renderizarse. A partir de ahí, cada acción refresca la lista.
  const [factores, setFactores] = useState<Factor[]>(factoresIniciales);
  const [alta, setAlta] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const supabase = createSupabaseBrowserClient();

  async function recargar() {
    const { data, error: err } = await supabase.auth.mfa.listFactors();
    if (err) {
      setError("No se pudo consultar el estado del segundo factor.");
      return;
    }
    setFactores((data?.all ?? []) as Factor[]);
  }

  const verificados = factores.filter((f) => f.status === "verified");

  function empezarAlta() {
    setError(null);
    setAviso(null);
    startTransition(async () => {
      // Un alta anterior a medias impide crear otra: se limpia antes.
      for (const f of factores.filter((x) => x.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }

      const { data, error: err } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Operación ${new Date().toLocaleDateString("es-ES")}`,
      });

      if (err || !data) {
        setError(err?.message ?? "No se pudo empezar el alta del segundo factor.");
        return;
      }

      setAlta({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      await recargar();
    });
  }

  function confirmar() {
    if (!alta) return;
    setError(null);
    startTransition(async () => {
      const { data: reto, error: errReto } = await supabase.auth.mfa.challenge({ factorId: alta.factorId });
      if (errReto || !reto) {
        setError(errReto?.message ?? "No se pudo pedir el código.");
        return;
      }

      const { error: errVer } = await supabase.auth.mfa.verify({
        factorId: alta.factorId,
        challengeId: reto.id,
        code: codigo.trim(),
      });

      if (errVer) {
        // El motivo más común es un código caducado: duran 30 segundos.
        setError("Ese código no es válido. Prueba con el siguiente que muestre la aplicación.");
        return;
      }

      setAlta(null);
      setCodigo("");
      setAviso("Segundo factor activado. A partir de ahora te lo pedirá al entrar.");
      await recargar();
    });
  }

  function quitar(factorId: string) {
    setError(null);
    setAviso(null);
    startTransition(async () => {
      const { error: err } = await supabase.auth.mfa.unenroll({ factorId });
      if (err) {
        setError(err.message);
        return;
      }
      setAviso("Segundo factor desactivado.");
      await recargar();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      ) : null}
      {aviso ? (
        <p role="status" style={{ fontSize: 12.5, color: "var(--shell-success, var(--shell-text))" }}>
          {aviso}
        </p>
      ) : null}

      <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {verificados.length > 0 ? (
            <ShieldCheck size={18} aria-hidden="true" />
          ) : (
            <ShieldAlert size={18} aria-hidden="true" />
          )}
          <p style={{ fontSize: 14, fontWeight: 600 }}>
            {verificados.length > 0 ? "Segundo factor activado" : "Sin segundo factor"}
          </p>
        </div>

        {verificados.length === 0 ? (
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
            Tu cuenta de operación puede ver y modificar datos de todas las iglesias. Si alguien consigue tu
            contraseña, eso es lo que se lleva. Un segundo factor lo impide y se configura una vez.
          </p>
        ) : (
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
            Al entrar se te pedirá el código de tu aplicación de autenticación.
          </p>
        )}

        {verificados.length === 0 && !alta ? (
          <div>
            <button type="button" onClick={empezarAlta} disabled={pendiente} className="shell-button">
              {pendiente ? "Preparando…" : "Activar segundo factor"}
            </button>
          </div>
        ) : null}

        {verificados.map((f) => (
          <div key={f.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 12.5 }}>{f.friendly_name ?? "Aplicación de autenticación"}</span>
            <button type="button" onClick={() => quitar(f.id)} disabled={pendiente} className="shell-button">
              Desactivar
            </button>
          </div>
        ))}
      </section>

      {alta ? (
        <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 600 }}>Escanea este código</p>
          <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
            Con Google Authenticator, 1Password, Authy o la aplicación que uses. Después escribe el código de seis
            cifras que aparezca.
          </p>

          {/* El QR llega como data URI desde Supabase; no sale de tu navegador. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={alta.qr}
            alt="Código QR para configurar el segundo factor"
            style={{ width: 200, height: 200, background: "#fff", padding: 8, borderRadius: 8 }}
          />

          <details>
            <summary style={{ fontSize: 12.5, cursor: "pointer" }}>No puedo escanear el código</summary>
            <p style={{ fontSize: 12, fontFamily: "monospace", marginTop: 8, wordBreak: "break-all" }}>
              {alta.secret}
            </p>
          </details>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600 }}>Código de seis cifras</span>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                style={{ fontSize: 16, letterSpacing: 4, padding: "8px 10px", width: 140 }}
              />
            </label>
            <button
              type="button"
              onClick={confirmar}
              disabled={pendiente || codigo.length !== 6}
              className="shell-button"
            >
              {pendiente ? "Comprobando…" : "Confirmar"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
