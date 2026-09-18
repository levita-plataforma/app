/**
 * Etiquetas y límites compartidos por la pantalla «Mi disponibilidad».
 * Este módulo lo usan componentes de cliente, así que no puede importar nada
 * de `src/server` (donde todo es `server-only`).
 */

/** Índice = weekday de la base de datos: 0 = lunes … 6 = domingo. */
export const WEEKDAY_LABELS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
] as const;

export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday] ?? "Día";
}

/** Igual que el `check` de la base de datos. */
export const REASON_MAX = 300;

/** Tope de la interfaz para el máximo de actividades al mes: no lo pide la
 *  base de datos (solo exige >= 0), pero más que eso no es una preferencia. */
export const MAX_ACTIVITIES_LIMIT = 60;
