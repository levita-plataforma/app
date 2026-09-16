import type { ScheduleKind } from "@/lib/activities/constants";
import { RECURRENCE_LIMITS } from "@/lib/activities/constants";
import type { RecurrenceInput } from "@/server/activities/activities-service";

/**
 * Valores de formulario compartidos por alta, edición y cambio de repetición.
 * Puro y seguro para cliente/servidor: solo compone cadenas LOCALES
 * ("YYYY-MM-DDTHH:MM"); la conversión a instante la hace la base de datos.
 */

export type EndMode = "duration" | "end";

export type ScheduleValues = {
  scheduleKind: ScheduleKind;
  startDate: string;
  startTime: string;
  endMode: EndMode;
  endDate: string;
  endTime: string;
  durationMinutes: string;
  windowStart: string;
  windowEnd: string;
};

export type RecurrenceValues = {
  enabled: boolean;
  frequency: "weekly" | "monthly";
  interval: string;
  /** Vacío = día de la semana de la fecha de inicio. */
  weekdays: number[];
  monthlyMode: "day_of_month" | "nth_weekday";
  /** "" = automático desde la fecha de inicio. */
  monthDay: string;
  fallback: "skip" | "last_day";
  weekOfMonth: string;
  monthWeekday: string;
  endKind: "until" | "count";
  untilDate: string;
  count: string;
};

export const EMPTY_RECURRENCE: RecurrenceValues = {
  enabled: false,
  frequency: "weekly",
  interval: "1",
  weekdays: [],
  monthlyMode: "day_of_month",
  monthDay: "",
  fallback: "skip",
  weekOfMonth: "",
  monthWeekday: "",
  endKind: "count",
  untilDate: "",
  count: "10",
};

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function optionalText(formData: FormData, key: string): string | null {
  return text(formData, key) || null;
}

function optionalInt(formData: FormData, key: string): number | undefined {
  const raw = text(formData, key);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

export type ScheduleInput = {
  scheduleKind: ScheduleKind;
  localStart: string | null;
  localEnd: string | null;
  durationMinutes: number | null;
};

/** Lee los campos de horario (nombres de ScheduleFields). */
export function readSchedule(formData: FormData): ScheduleInput {
  const scheduleKind: ScheduleKind = text(formData, "scheduleKind") === "flexible" ? "flexible" : "timed";
  if (scheduleKind === "flexible") {
    const windowStart = text(formData, "windowStart");
    const windowEnd = text(formData, "windowEnd");
    return {
      scheduleKind,
      localStart: windowStart ? `${windowStart}T00:00` : null,
      // La ventana termina al final del día indicado (hora local).
      localEnd: windowEnd ? `${windowEnd}T23:59` : null,
      durationMinutes: null,
    };
  }
  const startDate = text(formData, "startDate");
  const startTime = text(formData, "startTime");
  const localStart = startDate && startTime ? `${startDate}T${startTime}` : null;
  if (text(formData, "endMode") === "end") {
    const endDate = text(formData, "endDate") || startDate;
    const endTime = text(formData, "endTime");
    return { scheduleKind, localStart, localEnd: endDate && endTime ? `${endDate}T${endTime}` : null, durationMinutes: null };
  }
  return { scheduleKind, localStart, localEnd: null, durationMinutes: optionalInt(formData, "durationMinutes") ?? null };
}

/** Lee la regla de repetición (nombres rec_* de RecurrenceFields). null si no se repite. */
export function readRecurrence(formData: FormData): RecurrenceInput | null {
  if (text(formData, "rec_enabled") !== "on") return null;
  const frequency = text(formData, "rec_frequency") === "monthly" ? "monthly" : "weekly";
  const rule: RecurrenceInput = { frequency, interval: optionalInt(formData, "rec_interval") ?? 1 };

  if (frequency === "weekly") {
    const weekdays = formData
      .getAll("rec_weekdays")
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
    if (weekdays.length > 0) rule.weekdays = [...new Set(weekdays)].sort((a, b) => a - b);
  } else {
    const mode = text(formData, "rec_monthly_mode") === "nth_weekday" ? "nth_weekday" : "day_of_month";
    rule.monthly_mode = mode;
    if (mode === "day_of_month") {
      const day = optionalInt(formData, "rec_month_day");
      if (day !== undefined) rule.month_day = day;
      rule.month_day_fallback = text(formData, "rec_fallback") === "last_day" ? "last_day" : "skip";
    } else {
      const week = optionalInt(formData, "rec_week_of_month");
      const weekday = optionalInt(formData, "rec_month_weekday");
      if (week !== undefined) rule.week_of_month = week;
      if (weekday !== undefined) rule.month_weekday = weekday;
    }
  }

  if (text(formData, "rec_end") === "until") {
    const until = text(formData, "rec_until");
    if (until) rule.until_date = until;
  } else {
    const count = optionalInt(formData, "rec_count");
    if (count !== undefined) rule.count = Math.min(Math.max(count, 1), RECURRENCE_LIMITS.maxOccurrences);
  }
  return rule;
}

/** Día del mes, semana del mes (1–5) y día ISO de una clave "YYYY-MM-DD". */
export function monthPartsOfKey(key: string): { day: number; week: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const day = Number(match[3]);
  return { day, week: Math.min(Math.floor((day - 1) / 7) + 1, 5) };
}

export function isValidTimeZone(value: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+)*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat("es-ES", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
