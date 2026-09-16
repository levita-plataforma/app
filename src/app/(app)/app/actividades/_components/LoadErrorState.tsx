"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { primaryButtonStyle } from "@/app/(app)/app/servicios/ui";

/**
 * Estado de error honesto para los límites de error (error.tsx) de
 * Actividades y Calendario: si un servicio lanza, se dice que la carga falló
 * en lugar de mostrar un "no hay datos" que parecería real.
 */
export default function LoadErrorState({
  error,
  retry,
  title,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  title: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="shell-card shell-empty-state" role="alert">
      <AlertTriangle size={18} aria-hidden="true" />
      <h3>{title}</h3>
      <p>Ha fallado la carga de los datos; no significa que no haya información. Vuelve a intentarlo en unos segundos.</p>
      {error.digest ? <p className="serving-meta">Referencia: {error.digest}</p> : null}
      <button type="button" style={primaryButtonStyle()} onClick={() => retry()}>
        Reintentar
      </button>
    </div>
  );
}
