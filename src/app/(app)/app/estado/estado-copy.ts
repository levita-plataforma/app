import type { ChurchAccessMode } from "@/server/tenant/tenant-context";

/**
 * Textos de la superficie de recuperación (Fase 15 A2). Son fijos por estado:
 * no vienen de la base ni muestran el motivo interno de seguridad. No hay botones
 * de pago: la activación todavía no está disponible en esta pantalla.
 */
export type EstadoCopy = {
  title: string;
  summary: string;
  nextSteps: string[];
};

export const ESTADO_COPY: Record<ChurchAccessMode, EstadoCopy> = {
  full: {
    title: "Iglesia activa",
    summary: "LEVITA funciona con normalidad.",
    nextSteps: [],
  },
  grace: {
    title: "Pago pendiente",
    summary:
      "Puedes seguir usando LEVITA mientras se resuelve el pago. Si el plazo termina sin resolverlo, la iglesia se suspende. Tus datos se conservan.",
    nextSteps: ["Revisa el pago con quien administra la facturación de la iglesia."],
  },
  trial_expired: {
    title: "Tu prueba ha terminado",
    summary:
      "Tus datos se conservan. Mientras la iglesia no esté activada, no se puede usar LEVITA para gestionar personas, actividades, grupos ni Kids.",
    nextSteps: [
      "Tus datos siguen guardados y no se borran.",
      "Puedes exportar tus datos.",
      "Para activar la iglesia, contacta con soporte. La activación todavía no está disponible en esta pantalla.",
    ],
  },
  suspended: {
    title: "Iglesia suspendida",
    summary:
      "No se puede usar LEVITA mientras la iglesia esté suspendida. Tus datos se conservan.",
    nextSteps: [
      "Tus datos siguen guardados.",
      "Puedes exportar tus datos.",
      "Para reactivar la iglesia, contacta con soporte.",
    ],
  },
  cancelled: {
    title: "Iglesia dada de baja",
    summary:
      "Los datos se conservan durante el periodo de retención. Después se eliminan según la política de retención.",
    nextSteps: [
      "Puedes exportar tus datos durante el periodo de retención.",
      "La fecha de fin de retención aparece abajo.",
    ],
  },
  security_blocked: {
    title: "Acceso restringido por seguridad",
    summary:
      "Esta iglesia tiene una restricción de seguridad. Mientras esté vigente, no se muestran datos de la iglesia.",
    nextSteps: [
      "Contacta con soporte para revisar la situación.",
      "No hay exportación disponible mientras la restricción esté vigente.",
    ],
  },
};
