"use client";

import { useActionState, useState, useTransition } from "react";
import { crearIglesiaAction, comprobarSlugAction, type OnboardingState } from "./actions";
import { authInputStyle, authLabelStyle, authPrimaryButtonStyle } from "@/components/shell/AuthCard";

const initialState: OnboardingState = { error: null };

const labelStyle = { ...authLabelStyle, marginBottom: 6, display: "block" };
const fieldWrapStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const rowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };

export default function PasoIglesia({ defaultEmail }: { defaultEmail: string }) {
  const [state, formAction, pending] = useActionState(crearIglesiaAction, initialState);
  const [slug, setSlug] = useState("");
  const [slugStatus, setSlugStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [isPending, startTransition] = useTransition();
  // crypto.randomUUID(), no useId(): useId() es determinista por posición
  // en el árbol de React, no un identificador único real, y provocaba que
  // reintentos de un formulario nuevo colisionaran con la idempotency_key
  // de un envío anterior no relacionado.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  function handleNameChange(name: string) {
    startTransition(async () => {
      if (!name.trim()) {
        setSlug("");
        setSlugStatus("idle");
        return;
      }
      setSlugStatus("checking");
      const result = await comprobarSlugAction(name);
      setSlug(result.slug);
      setSlugStatus(result.available ? "available" : "taken");
    });
  }

  return (
    <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 20 }} noValidate>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="slug" value={slug} />

      <div>
        <h1 style={{ fontSize: 19, fontWeight: 600, marginBottom: 4 }}>Cuéntanos sobre tu iglesia</h1>
        <p style={{ fontSize: 13, color: "var(--shell-text-muted)" }}>
          Estos datos configuran tu espacio en LEVITA. Podrás cambiarlos después.
        </p>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={sectionTitleStyle}>Datos de la iglesia</p>

        <div style={fieldWrapStyle}>
          <label htmlFor="name" style={labelStyle}>Nombre de la iglesia</label>
          <input
            id="name"
            name="name"
            required
            style={authInputStyle}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Iglesia Comunidad Vida"
          />
          {slugStatus !== "idle" ? (
            <p style={{ fontSize: 11.5, color: slugStatus === "taken" ? "var(--shell-danger)" : "var(--shell-text-muted)" }}>
              {slugStatus === "checking" && "Comprobando disponibilidad…"}
              {slugStatus === "available" && `Disponible: levita.app/i/${slug}`}
              {slugStatus === "taken" && "Ese nombre genera un identificador ya usado, prueba con otro."}
            </p>
          ) : null}
        </div>

        <div style={rowStyle}>
          <div style={fieldWrapStyle}>
            <label htmlFor="country" style={labelStyle}>País</label>
            <select id="country" name="country" defaultValue="España" style={authInputStyle}>
              <option value="España">España</option>
              <option value="México">México</option>
              <option value="Argentina">Argentina</option>
              <option value="Colombia">Colombia</option>
              <option value="Otro">Otro</option>
            </select>
          </div>
          <div style={fieldWrapStyle}>
            <label htmlFor="timezone" style={labelStyle}>Zona horaria</label>
            <select id="timezone" name="timezone" defaultValue="Europe/Madrid" style={authInputStyle}>
              <option value="Europe/Madrid">Europe/Madrid</option>
              <option value="Atlantic/Canary">Atlantic/Canary</option>
              <option value="America/Mexico_City">America/Mexico_City</option>
              <option value="America/Bogota">America/Bogota</option>
              <option value="America/Argentina/Buenos_Aires">America/Argentina/Buenos_Aires</option>
            </select>
          </div>
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={sectionTitleStyle}>Sede principal</p>
        <div style={fieldWrapStyle}>
          <label htmlFor="campusAddress" style={labelStyle}>Dirección</label>
          <input id="campusAddress" name="campusAddress" style={authInputStyle} placeholder="Calle Mayor, 1" />
        </div>
        <div style={rowStyle}>
          <div style={fieldWrapStyle}>
            <label htmlFor="campusCity" style={labelStyle}>Ciudad</label>
            <input id="campusCity" name="campusCity" style={authInputStyle} />
          </div>
          <div style={fieldWrapStyle}>
            <label htmlFor="campusProvince" style={labelStyle}>Provincia</label>
            <input id="campusProvince" name="campusProvince" style={authInputStyle} />
          </div>
        </div>
        <div style={fieldWrapStyle}>
          <label htmlFor="campusPostalCode" style={labelStyle}>Código postal</label>
          <input id="campusPostalCode" name="campusPostalCode" style={authInputStyle} />
        </div>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={sectionTitleStyle}>Tu perfil (propietario)</p>
        <div style={rowStyle}>
          <div style={fieldWrapStyle}>
            <label htmlFor="ownerFirstName" style={labelStyle}>Nombre</label>
            <input id="ownerFirstName" name="ownerFirstName" required style={authInputStyle} />
          </div>
          <div style={fieldWrapStyle}>
            <label htmlFor="ownerLastName" style={labelStyle}>Apellidos</label>
            <input id="ownerLastName" name="ownerLastName" style={authInputStyle} />
          </div>
        </div>
        <div style={fieldWrapStyle}>
          <label htmlFor="ownerEmail" style={labelStyle}>Correo</label>
          <input id="ownerEmail" name="ownerEmail" type="email" required defaultValue={defaultEmail} style={authInputStyle} />
        </div>
        <div style={fieldWrapStyle}>
          <label htmlFor="ownerPhone" style={labelStyle}>Teléfono (opcional)</label>
          <input id="ownerPhone" name="ownerPhone" type="tel" style={authInputStyle} />
        </div>
      </section>

      {state.error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || isPending || slugStatus === "taken" || slugStatus === "checking"}
        style={authPrimaryButtonStyle(pending)}
      >
        {pending ? "Creando tu iglesia…" : "Continuar"}
      </button>
    </form>
  );
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--shell-text-subtle)",
};
