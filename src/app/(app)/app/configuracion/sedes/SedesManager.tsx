"use client";

import { useRef, useState, useTransition } from "react";
import { Star, Plus } from "lucide-react";
import {
  crearSedeAction,
  marcarPrincipalAction,
  archivarSedeAction,
  type SedesState,
} from "./actions";
import { authInputStyle, authLabelStyle } from "@/components/shell/AuthCard";

type Campus = {
  id: string;
  name: string;
  address: string | null;
  is_primary: boolean;
  status: string;
};

export default function SedesManager({ campuses, canManage }: { campuses: Campus[]; canManage: boolean }) {
  const [showForm, setShowForm] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [createPending, startCreateTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleCrearSede(formData: FormData) {
    startCreateTransition(async () => {
      const result: SedesState = await crearSedeAction(
        { error: null },
        formData,
      );
      setCreateError(result.error);
      if (result.success) {
        formRef.current?.reset();
        setShowForm(false);
      }
    });
  }

  function handleMarcarPrincipal(campusId: string) {
    startTransition(async () => {
      const result = await marcarPrincipalAction(campusId);
      setActionError(result.error);
    });
  }

  function handleArchivar(campusId: string) {
    startTransition(async () => {
      const result = await archivarSedeAction(campusId);
      setActionError(result.error);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {actionError ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>{actionError}</p>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {campuses.map((campus) => (
          <div key={campus.id} className="shell-card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                {campus.name}
                {campus.is_primary ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--shell-brand)", fontWeight: 600 }}>
                    <Star size={12} fill="currentColor" /> Principal
                  </span>
                ) : null}
              </p>
              {campus.address ? (
                <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>{campus.address}</p>
              ) : null}
            </div>

            {canManage ? (
              <div style={{ display: "flex", gap: 8 }}>
                {!campus.is_primary ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleMarcarPrincipal(campus.id)}
                    style={secondaryButtonStyle}
                  >
                    Marcar principal
                  </button>
                ) : null}
                {!campus.is_primary ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleArchivar(campus.id)}
                    style={{ ...secondaryButtonStyle, color: "var(--shell-danger)" }}
                  >
                    Archivar
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {canManage ? (
        showForm ? (
          <form
            ref={formRef}
            action={handleCrearSede}
            className="shell-card"
            style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}
            noValidate
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="new-campus-name" style={authLabelStyle}>Nombre de la sede</label>
              <input id="new-campus-name" name="name" required style={authInputStyle} placeholder="Sede Norte" />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="new-campus-address" style={authLabelStyle}>Dirección (opcional)</label>
              <input id="new-campus-address" name="address" style={authInputStyle} />
            </div>
            {createError ? (
              <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>{createError}</p>
            ) : null}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={createPending} style={primaryButtonStyle(createPending)}>
                {createPending ? "Creando…" : "Crear sede"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={secondaryButtonStyle}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            style={{ ...secondaryButtonStyle, alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6 }}
          >
            <Plus size={14} /> Añadir sede
          </button>
        )
      ) : null}
    </div>
  );
}

const secondaryButtonStyle: React.CSSProperties = {
  padding: "7px 12px",
  borderRadius: "var(--shell-radius-sm)",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-surface)",
  color: "var(--shell-text)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

const primaryButtonStyle = (pending: boolean): React.CSSProperties => ({
  padding: "8px 16px",
  borderRadius: "var(--shell-radius-sm)",
  border: "none",
  background: "var(--shell-text)",
  color: "#fff",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.7 : 1,
});
