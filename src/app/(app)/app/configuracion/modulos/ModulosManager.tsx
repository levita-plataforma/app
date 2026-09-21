"use client";

import { useState, useTransition } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, UserRound, GraduationCap, Baby, Music4, Coins, Building2, BarChart3, LayoutGrid } from "lucide-react";
import { activarModuloAction } from "./actions";

export type ModuloRow = {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
};

// Un componente de icono (función) no se puede pasar de un Server Component
// a un Client Component como prop — no es serializable a través del límite
// RSC. Se pasa solo la clave (string) y se resuelve aquí, del lado cliente,
// con el mismo icono que ya usa NAV_ITEMS para cada módulo.
const MODULE_ICONS: Record<string, LucideIcon> = {
  groups: UserRound,
  discipleship: GraduationCap,
  kids: Baby,
  worship: Music4,
  giving: Coins,
  facilities: Building2,
  analytics: BarChart3,
};

function iconFor(key: string): LucideIcon {
  return MODULE_ICONS[key] ?? LayoutGrid;
}

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
        {modules.map((m) => {
          const Icon = iconFor(m.key);
          return (
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
                <Icon aria-hidden="true" />
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
          );
        })}
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
