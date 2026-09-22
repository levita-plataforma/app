"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { salirAction } from "./salir";

/** Cierra la sesión y vuelve a la pantalla de acceso. */
export default function BotonSalir() {
  const [pendiente, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => salirAction())}
      disabled={pendiente}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "none",
        border: "none",
        padding: "6px 8px",
        font: "inherit",
        fontSize: 12,
        color: "var(--shell-text-muted)",
        cursor: pendiente ? "default" : "pointer",
        borderRadius: "var(--shell-radius-sm)",
      }}
    >
      <LogOut size={14} aria-hidden="true" />
      {pendiente ? "Saliendo…" : "Salir"}
    </button>
  );
}
