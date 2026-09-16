"use client";

import LoadErrorState from "./_components/LoadErrorState";

export default function ActividadesError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <LoadErrorState error={error} retry={retry} title="No se pudieron cargar las actividades" />;
}
