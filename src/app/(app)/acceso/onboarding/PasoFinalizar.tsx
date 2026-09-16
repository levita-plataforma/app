"use client";

import { useTransition } from "react";
import { finalizarOnboardingAction } from "./actions";
import { authPrimaryButtonStyle } from "@/components/shell/AuthCard";

export default function PasoFinalizar({ churchName }: { churchName: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, textAlign: "center" }}>
      <div style={{ fontSize: 40 }}>🎉</div>
      <div>
        <h1 style={{ fontSize: 19, fontWeight: 600, marginBottom: 4 }}>¡Tu iglesia está lista!</h1>
        <p style={{ fontSize: 13, color: "var(--shell-text-muted)" }}>
          {churchName} ya tiene su espacio en LEVITA. Ahora puedes invitar a tu equipo y preparar tu primer servicio.
        </p>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => finalizarOnboardingAction())}
        style={authPrimaryButtonStyle(pending)}
      >
        {pending ? "Entrando…" : "Ir a mi panel"}
      </button>
    </div>
  );
}
