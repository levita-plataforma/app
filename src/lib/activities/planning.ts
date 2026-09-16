/**
 * Reglas puras de planning y cobertura (espejo de las funciones SQL
 * app.activity_structure_issues y app.position_coverage_status). Sin imports
 * para poder probarlas con `node --test`.
 *
 * Unidades: minutos. start_offset_minutes es relativo al inicio de la
 * actividad (negativo = antes); si es null, el bloque empieza cuando termina
 * el anterior. Se permiten solapes: se señalan, no se bloquean.
 */

export type PlanTimelineInput = {
  id: string;
  durationMinutes: number | null;
  startOffsetMinutes: number | null;
};

export type PlanTimelineEntry = {
  id: string;
  startMinute: number;
  endMinute: number;
  /** Empieza antes de que termine el bloque anterior. */
  overlapsPrevious: boolean;
  /** Hay un hueco sin planificar desde el final del anterior. */
  gapBeforeMinutes: number;
};

export type PlanTimeline = {
  entries: PlanTimelineEntry[];
  /** Minuto final más tardío respecto al inicio de la actividad. */
  endMinute: number;
  /** Primer minuto (puede ser negativo si hay bloques previos al inicio). */
  startMinute: number;
  totalDurationMinutes: number;
  exceedsActivity: boolean;
};

export function computePlanTimeline(items: PlanTimelineInput[], activityDurationMinutes: number | null): PlanTimeline {
  const entries: PlanTimelineEntry[] = [];
  let cursor = 0;
  let previousEnd: number | null = null;
  let maxEnd = 0;
  let minStart = 0;
  let total = 0;

  for (const item of items) {
    const start = item.startOffsetMinutes ?? cursor;
    const duration = item.durationMinutes ?? 0;
    const end = start + duration;
    entries.push({
      id: item.id,
      startMinute: start,
      endMinute: end,
      overlapsPrevious: previousEnd !== null && start < previousEnd,
      gapBeforeMinutes: previousEnd !== null && start > previousEnd ? start - previousEnd : 0,
    });
    cursor = end;
    previousEnd = end;
    maxEnd = Math.max(maxEnd, end);
    minStart = Math.min(minStart, start);
    total += duration;
  }

  return {
    entries,
    endMinute: maxEnd,
    startMinute: minStart,
    totalDurationMinutes: total,
    exceedsActivity: items.length > 0 && activityDurationMinutes !== null && maxEnd > activityDurationMinutes,
  };
}

export type CoverageStatusValue = "uncovered" | "partially_covered" | "covered" | "overstaffed";

/**
 * Mínimo 0 con 0 asignados = covered (el puesto no exige a nadie).
 * Máximo null = nunca overstaffed.
 */
export function coverageStatus(minPeople: number, maxPeople: number | null, assigned: number): CoverageStatusValue {
  if (maxPeople !== null && assigned > maxPeople) return "overstaffed";
  if (assigned >= minPeople) return "covered";
  if (assigned === 0) return "uncovered";
  return "partially_covered";
}

/** Mueve un elemento de una lista (para reordenar con botones o drag & drop). */
export function moveItem<T>(list: readonly T[], fromIndex: number, toIndex: number): T[] {
  const next = list.slice();
  if (fromIndex < 0 || fromIndex >= next.length) return next;
  const target = Math.max(0, Math.min(toIndex, next.length - 1));
  const [item] = next.splice(fromIndex, 1);
  next.splice(target, 0, item);
  return next;
}
