"use client";

import { useState, useTransition } from "react";
import { reintentarBorradoAction } from "./actions";

/**
 * Reintento de una operación concreta.
 *
 * El botón se deshabilita mientras la petición está en vuelo: sin eso, dos
 * clics seguidos mandan dos reintentos, y aunque este en concreto es
 * idempotente, acostumbrar la consola a disparar dos veces es justo lo que no
 * conviene en una pantalla donde algún día habrá operaciones que no lo sean.
 *
 * Tras reintentar no dice «resuelto», dice que se volverá a intentar: el
 * borrado ocurre en la pasada siguiente del proceso, y afirmar lo contrario
 * sería inventarse un resultado.
 */
export default function ReintentarBoton({ id, familia }: { id: string; familia: string }) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState(false);

  if (hecho) {
    return (
      <p role="status" style={{ margin: 0, fontSize: 11.5, color: "var(--shell-text-muted)" }}>
        Encolado otra vez. Se intentará en la próxima pasada del proceso, no ahora mismo.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        className="shell-button"
        disabled={pendiente}
        style={{ alignSelf: "flex-start", fontSize: 12 }}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const r = await reintentarBorradoAction(id);
            if (r.error) setError(r.error);
            else setHecho(true);
          });
        }}
      >
        {pendiente ? "Reintentando…" : `Reintentar ${familia === "borrado_ficheros" ? "el borrado" : ""}`.trim()}
      </button>
      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 11.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
