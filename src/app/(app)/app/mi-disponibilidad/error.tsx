"use client";

import LoadErrorState from "../actividades/_components/LoadErrorState";

export default function MiDisponibilidadError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <LoadErrorState error={error} retry={retry} title="No se pudo cargar tu disponibilidad" />;
}
