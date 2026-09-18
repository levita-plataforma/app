"use client";

import { useActionState } from "react";
import Link from "next/link";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";
import { crearFormularioAction, type NuevoFormularioState } from "./actions";
import { primaryButtonStyle, secondaryButtonStyle } from "../ui";

const initialState: NuevoFormularioState = { error: null };

export default function NuevoFormularioForm() {
  const [state, action, pending] = useActionState(crearFormularioAction, initialState);

  return (
    <form
      action={action}
      className="shell-card"
      style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}
      noValidate
    >
      <div>
        <label htmlFor="f-name" style={authLabelStyle}>
          Nombre del formulario
        </label>
        <input
          id="f-name"
          name="name"
          required
          placeholder="Inscripción campamento de jóvenes"
          style={{ ...authInputStyle, width: "100%" }}
        />
      </div>

      <div>
        <label htmlFor="f-description" style={authLabelStyle}>
          Descripción
        </label>
        <input
          id="f-description"
          name="description"
          placeholder="Descripción opcional visible solo para el equipo"
          style={{ ...authInputStyle, width: "100%" }}
        />
      </div>

      <div>
        <label htmlFor="f-purpose" style={authLabelStyle}>
          Finalidad (RGPD)
        </label>
        <textarea
          id="f-purpose"
          name="purpose"
          required
          rows={3}
          placeholder="Explica para qué se usarán los datos recogidos con este formulario (p. ej. gestionar la inscripción y comunicar detalles del evento)."
          style={{ ...authInputStyle, width: "100%", resize: "vertical", fontFamily: "inherit" }}
        />
        <p style={{ fontSize: 11.5, color: "var(--shell-text-subtle)", marginTop: 4 }}>
          Obligatorio: describe la finalidad del tratamiento de los datos que se recojan.
        </p>
      </div>

      {state.error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {state.error}
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={pending} style={primaryButtonStyle(pending)}>
          {pending ? "Creando…" : "Crear formulario"}
        </button>
        <Link href="/app/formularios" style={secondaryButtonStyle()}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
