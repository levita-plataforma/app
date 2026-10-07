import type { AccessMode } from "@/server/platform/platform-service";

/** Etiqueta y estilo de cada modo de acceso comercial, compartidos por listado y ficha. */
export const MODO_ETIQUETA: Record<AccessMode, { texto: string; clase: string }> = {
  full: { texto: "Activa", clase: "serving-chip is-success" },
  grace: { texto: "Pago pendiente", clase: "serving-chip is-warning" },
  trial_expired: { texto: "Prueba vencida", clase: "serving-chip is-warning" },
  suspended: { texto: "Suspendida", clase: "serving-chip is-danger" },
  cancelled: { texto: "Cancelada", clase: "serving-chip is-muted" },
  security_blocked: { texto: "Bloqueada (seguridad)", clase: "serving-chip is-danger" },
  none: { texto: "—", clase: "serving-chip is-muted" },
};

export function EstadoTenant({ modo }: { modo: AccessMode }) {
  const e = MODO_ETIQUETA[modo] ?? MODO_ETIQUETA.none;
  return <span className={e.clase}>{e.texto}</span>;
}

export function fechaCorta(valor: string | null | undefined): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleDateString("es-ES", { dateStyle: "medium" });
}
