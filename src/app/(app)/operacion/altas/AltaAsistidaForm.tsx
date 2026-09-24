"use client";

import Link from "next/link";
import { useActionState } from "react";
import { crearAltaAsistidaAction, type AltaAsistidaState } from "./actions";
import { authInputStyle, authLabelStyle, authPrimaryButtonStyle } from "@/components/shell/AuthCard";

const initialState: AltaAsistidaState = { error: null };

export default function AltaAsistidaForm() {
  const [state, formAction, pending] = useActionState(crearAltaAsistidaAction, initialState);

  return (
    <div className="shell-card" style={{ padding: "24px 28px" }}>
      <form action={formAction} style={{ display: "flex", flexDirection: "column", gap: 14 }} noValidate>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="name" style={authLabelStyle}>Nombre de la iglesia</label>
          <input id="name" name="name" required style={authInputStyle} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="slug" style={authLabelStyle}>Identificador (slug)</label>
          <input id="slug" name="slug" required pattern="[a-z0-9-]+" style={authInputStyle} placeholder="iglesia-central" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="ownerEmail" style={authLabelStyle}>Correo del propietario</label>
          <input id="ownerEmail" name="ownerEmail" type="email" required style={authInputStyle} />
        </div>

        {state.error ? (
          <div role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)", display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={{ margin: 0 }}>{state.error}</p>
            {state.iglesiaExistenteId ? (
              <Link href={`/operacion/iglesias/${state.iglesiaExistenteId}`} style={{ color: "inherit" }}>
                Abrir la iglesia que ya usa ese identificador
              </Link>
            ) : null}
          </div>
        ) : null}

        {state.invitationLink ? (
          <div style={{ fontSize: 12.5, background: "var(--shell-active-bg)", padding: 12, borderRadius: "var(--shell-radius-sm)", display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ fontWeight: 600, margin: 0 }}>Iglesia creada. Este es el enlace de invitación:</p>
            <code style={{ wordBreak: "break-all" }}>{state.invitationLink}</code>

            {/*
              Lo que faltaba decir, y es lo que hace que el alta sirva o no:
              nadie envía ese correo. El transporte de email está desactivado,
              así que si el operador cierra esta pantalla creyendo que la
              invitación ya va camino del propietario, no llegará nunca. Y el
              token no se puede recuperar: solo se guarda su huella.
            */}
            <p style={{ margin: 0, color: "var(--shell-text-muted)" }}>
              <strong>No se ha enviado ningún correo.</strong> Cópialo y hazlo llegar tú al propietario. Este
              enlace se muestra una sola vez —solo se guarda su huella, no el enlace— y caduca a los 7 días.
            </p>

            <button
              type="button"
              className="shell-button"
              style={{ alignSelf: "flex-start", fontSize: 12 }}
              onClick={() => {
                void navigator.clipboard?.writeText(state.invitationLink ?? "");
              }}
            >
              Copiar enlace
            </button>
          </div>
        ) : null}

        <button type="submit" disabled={pending} style={authPrimaryButtonStyle(pending)}>
          {pending ? "Creando…" : "Crear alta asistida"}
        </button>
      </form>
    </div>
  );
}
