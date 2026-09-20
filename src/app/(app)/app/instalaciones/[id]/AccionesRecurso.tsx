"use client";

import { useActionState } from "react";
import { archivarRecursoAction, restaurarRecursoAction, type AccionState } from "../actions";
import { dangerButtonStyle, secondaryButtonStyle } from "../ui";

const INICIAL: AccionState = { error: null, ok: null };

/**
 * Archivar y restaurar. Archivar con reservas futuras no se puede: la base lo
 * rechaza y su mensaje dice cuántas hay. Se enseña tal cual en vez de un texto
 * genérico, porque ese mensaje es justo lo que hace falta para resolverlo.
 */
export default function AccionesRecurso({ recurso }: { recurso: { id: string; archivado: boolean } }) {
  const [estadoArchivar, archivar, archivando] = useActionState(archivarRecursoAction, INICIAL);
  const [estadoRestaurar, restaurar, restaurando] = useActionState(restaurarRecursoAction, INICIAL);

  const estado = recurso.archivado ? estadoRestaurar : estadoArchivar;

  return (
    <section className="shell-card" style={{ padding: 16 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 15 }}>Gestión</h2>

      {recurso.archivado ? (
        <form action={restaurar}>
          <input type="hidden" name="resourceId" value={recurso.id} />
          <button type="submit" style={secondaryButtonStyle(restaurando)} disabled={restaurando}>
            {restaurando ? "Restaurando…" : "Restaurar recurso"}
          </button>
        </form>
      ) : (
        <form action={archivar}>
          <input type="hidden" name="resourceId" value={recurso.id} />
          <button type="submit" style={dangerButtonStyle} disabled={archivando}>
            {archivando ? "Archivando…" : "Archivar recurso"}
          </button>
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--shell-text-muted)" }}>
            Un recurso archivado deja de poder reservarse, pero conserva su historial.
          </p>
        </form>
      )}

      {estado.error && (
        <p role="alert" style={{ marginTop: 10, marginBottom: 0, color: "var(--shell-danger)", fontSize: 12.5 }}>
          {estado.error}
        </p>
      )}
      {estado.ok && (
        <p role="status" style={{ marginTop: 10, marginBottom: 0, color: "var(--shell-success)", fontSize: 12.5 }}>
          {estado.ok}
        </p>
      )}
    </section>
  );
}
