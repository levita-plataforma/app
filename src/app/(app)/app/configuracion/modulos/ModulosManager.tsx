"use client";

import { useState, useTransition } from "react";
import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { activarModuloAction } from "./actions";

export type ModuloRow = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  enabled: boolean;
};

export default function ModulosManager({ modules, canManage }: { modules: ModuloRow[]; canManage: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleActivar(moduleKey: string) {
    setError(null);
    setPendingKey(moduleKey);
    startTransition(async () => {
      const result = await activarModuloAction(moduleKey);
      setError(result.error);
      setPendingKey(null);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error ? <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>{error}</p> : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {modules.map((m) => (
          <div
            key={m.key}
            className="shell-card"
            style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                className="module-icon"
                style={{ background: "var(--shell-active-bg)", color: "var(--shell-brand)" }}
              >
                <m.icon aria-hidden="true" />
              </span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{m.label}</p>
                <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>{m.description}</p>
              </div>
            </div>

            {m.enabled ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: "var(--shell-success)",
                }}
              >
                <Check size={13} /> Activo
              </span>
            ) : canManage ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => handleActivar(m.key)}
                style={primaryButtonStyle(pending && pendingKey === m.key)}
              >
                {pending && pendingKey === m.key ? "Activando…" : "Activar"}
              </button>
            ) : (
              <span style={{ fontSize: 11.5, color: "var(--shell-text-subtle)" }}>No activo</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const primaryButtonStyle = (pending: boolean): React.CSSProperties => ({
  padding: "7px 14px",
  borderRadius: "var(--shell-radius-sm)",
  border: "none",
  background: "var(--shell-text)",
  color: "#fff",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.7 : 1,
});
