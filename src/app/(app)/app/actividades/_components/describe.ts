import { WEEKDAY_LABELS, WEEK_OF_MONTH_LABELS, type ChipTone } from "@/lib/activities/constants";
import type { ActivitySeriesInfo } from "@/server/activities/activities-service";

/** Utilidades de presentación puras (cliente y servidor). */

export function chipClass(tone: ChipTone): string {
  return tone === "default" ? "serving-chip" : `serving-chip is-${tone}`;
}

function pluralWeekday(n: number): string {
  const name = (WEEKDAY_LABELS[n]?.long ?? "").toLowerCase();
  return name.endsWith("s") ? name : `${name}s`;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** Fecha civil "YYYY-MM-DD" legible, sin conversión de zona. */
export function formatDateKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** "Cada 2 semanas los domingos · hasta 31 dic 2026". */
export function describeSeries(series: Pick<
  ActivitySeriesInfo,
  | "frequency"
  | "intervalCount"
  | "weekdays"
  | "monthlyMode"
  | "monthDay"
  | "weekOfMonth"
  | "monthWeekday"
  | "monthDayFallback"
  | "untilDate"
  | "occurrenceCount"
>): string {
  const n = series.intervalCount || 1;
  let text: string;
  if (series.frequency === "weekly") {
    text = n === 1 ? "Cada semana" : `Cada ${n} semanas`;
    const days = (series.weekdays ?? []).map(pluralWeekday);
    if (days.length > 0) text += ` los ${joinList(days)}`;
  } else {
    text = n === 1 ? "Cada mes" : `Cada ${n} meses`;
    if (series.monthlyMode === "nth_weekday" && series.weekOfMonth && series.monthWeekday) {
      const week = WEEK_OF_MONTH_LABELS[series.weekOfMonth] ?? "";
      text += ` el ${week} ${(WEEKDAY_LABELS[series.monthWeekday]?.long ?? "").toLowerCase()}`;
    } else if (series.monthDay) {
      text += ` el día ${series.monthDay}`;
      if (series.monthDay > 28) {
        text += series.monthDayFallback === "last_day" ? " (o el último día del mes)" : " (se omiten los meses sin ese día)";
      }
    }
  }
  if (series.untilDate) text += ` · hasta ${formatDateKey(series.untilDate)}`;
  else if (series.occurrenceCount) text += ` · ${series.occurrenceCount} ocurrencias`;
  return text;
}

export const HISTORY_ACTION_LABELS: Record<string, string> = {
  "activity.created": "Actividad creada",
  "activity.updated": "Actividad modificada",
  "activity.published": "Publicada",
  "activity.cancelled": "Cancelada",
  "activity.completed": "Marcada como completada",
  "activity.archived": "Archivada",
  "activity.status_changed": "Cambio de estado",
  "activity.duplicated": "Duplicada",
  "activity.area_added": "Área añadida",
  "activity.area_updated": "Área modificada",
  "activity.area_removed": "Área quitada",
  "activity.position_added": "Puesto añadido",
  "activity.position_updated": "Puesto modificado",
  "activity.position_removed": "Puesto quitado",
  "activity.requirement_saved": "Requisito de puesto guardado",
  "activity.requirement_removed": "Requisito de puesto quitado",
  "activity.plan_item_added": "Bloque del orden añadido",
  "activity.plan_item_updated": "Bloque del orden modificado",
  "activity.plan_item_removed": "Bloque del orden quitado",
  "activity.plan_reordered": "Orden del servicio reordenado",
  "activity_template.created": "Plantilla creada",
  "activity_template.updated": "Plantilla modificada",
  "activity_template.archived": "Plantilla archivada",
  "activity_template.restored": "Plantilla restaurada",
};
