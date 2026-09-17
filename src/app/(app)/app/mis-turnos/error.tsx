"use client";

import LoadErrorState from "../actividades/_components/LoadErrorState";

export default function MisTurnosError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <LoadErrorState error={error} retry={retry} title="No se pudieron cargar tus turnos" />;
}
