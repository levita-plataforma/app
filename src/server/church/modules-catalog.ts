/**
 * Módulos que una iglesia puede activar además del núcleo fijo del
 * provisioning (people/serving/events/communications, siempre activos).
 * Única fuente de verdad compartida entre el onboarding
 * (src/app/(app)/acceso/onboarding/PasoModulos.tsx) y la gestión posterior
 * (src/app/(app)/app/configuracion/modulos/), para que ambos ofrezcan
 * siempre el mismo conjunto — nunca un módulo sin ruta funcional real
 * detrás (placeholder, como pastoral/integrations), aunque `church_modules`
 * no lo valide por sí sola (solo comprueba la FK contra el catálogo
 * completo de 13 módulos).
 */
export const ACTIVATABLE_MODULE_KEYS = [
  "groups",
  "discipleship",
  "kids",
  "worship",
  "giving",
  "facilities",
  "analytics",
] as const;

export type ActivatableModuleKey = (typeof ACTIVATABLE_MODULE_KEYS)[number];

export const ACTIVATABLE_MODULE_KEY_SET: ReadonlySet<string> = new Set(ACTIVATABLE_MODULE_KEYS);

export function isActivatableModuleKey(key: string): key is ActivatableModuleKey {
  return ACTIVATABLE_MODULE_KEY_SET.has(key);
}

/**
 * Descripción corta por módulo, compartida entre el onboarding
 * (PasoModulos.tsx) y la gestión posterior (configuracion/modulos). El
 * label/icono ya vive en src/components/shell/nav-items.ts; esto solo añade
 * lo que nav-items no tiene, una frase de una línea para el contexto de
 * activación.
 */
export const ACTIVATABLE_MODULE_DESCRIPTIONS: Record<ActivatableModuleKey, string> = {
  groups: "Crea comunidad.",
  discipleship: "Forma y acompaña.",
  kids: "Check-in, salas y recogida segura.",
  worship: "Canciones, repertorios y atril.",
  giving: "Fondos, campañas y aportaciones.",
  facilities: "Espacios y recursos.",
  analytics: "Toma mejores decisiones.",
};
