import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { DomainError } from "@/server/errors/domain-error";
import { logger } from "@/server/logger/logger";
import { localToInstant } from "./church-time";

/**
 * Disponibilidad y frecuencia de servicio de la propia persona (Fase 5,
 * DI-01, migración `20260923000100_disponibilidad.sql`).
 *
 * Todo lo de aquí es de la persona autenticada y de nadie más:
 *
 * - Las **lecturas** van con el cliente del usuario; RLS solo deja ver las
 *   filas propias (`*_select_own`). El motivo es un dato privado y nunca sale
 *   de estas lecturas: `app.person_unavailability`, que es lo que ve quien
 *   coordina, no lo devuelve.
 * - Las **escrituras** van solo por las RPC de la migración, que resuelven
 *   ellas mismas la persona (`app.current_person_id`), validan y auditan sin
 *   guardar el motivo.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type UnavailabilityPeriod = {
  id: string;
  /** Instante ISO (UTC); se muestra en la zona de la iglesia. */
  startsAt: string;
  endsAt: string;
  /** Privado: solo lo ve la propia persona. */
  reason: string | null;
};

export type WeeklyUnavailability = {
  id: string;
  /** 0 = lunes … 6 = domingo, como en la base de datos. */
  weekday: number;
  /** "HH:MM" en la zona de la iglesia. */
  startsTime: string;
  endsTime: string;
  reason: string | null;
};

/**
 * Preferencia de frecuencia de un ámbito. `isSet` distingue «no hay fila»
 * (el área hereda el máximo general) de «hay fila sin máximo» (el área no
 * tiene límite, aunque el general sí).
 */
export type FrequencyPreference = {
  serviceAreaId: string | null;
  maxActivitiesPerMonth: number | null;
  isSet: boolean;
};

export type AreaFrequencyPreference = FrequencyPreference & {
  serviceAreaId: string;
  serviceAreaName: string;
};

export type AvailabilityOverview = {
  /** Zona horaria de la iglesia: todo lo que se escribe y se muestra va en ella. */
  timezone: string;
  upcomingPeriods: UnavailabilityPeriod[];
  pastPeriods: UnavailabilityPeriod[];
  weekly: WeeklyUnavailability[];
  global: FrequencyPreference;
  areas: AreaFrequencyPreference[];
};

export type SavePeriodInput = {
  /** Nulo o ausente: alta. Con id: edición del periodo propio. */
  id?: string | null;
  /** "YYYY-MM-DDTHH:MM" en la zona de la iglesia. */
  startsLocal: string;
  endsLocal: string;
  reason?: string | null;
};

export type SaveWeeklyInput = {
  weekday: number;
  /** "HH:MM" en la zona de la iglesia. */
  startsTime: string;
  endsTime: string;
  reason?: string | null;
};

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

type PostgrestLikeError = { code?: string; message: string };

/** Los mensajes de las RPC ya están escritos para la persona; si suena a
 *  error técnico (constraint, tipo, permiso de PostgreSQL) se sustituye. */
const TECHNICAL_MESSAGE =
  /violates|duplicate key|null value|invalid input|syntax|column|relation|function|operator|permission denied/i;

function toDomainError(error: PostgrestLikeError, fallback: string): DomainError {
  const message = TECHNICAL_MESSAGE.test(error.message) ? null : error.message;

  switch (error.code) {
    case "42501":
      return new DomainError(
        "FORBIDDEN",
        message ?? "No puedes cambiar tu disponibilidad en esta iglesia.",
      );
    case "P0002":
      return new DomainError("RESOURCE_NOT_FOUND", message ?? "Eso ya no existe. Recarga la página.");
    case "22023":
    case "23514":
    case "23502":
    case "23503":
    case "22007":
    case "22008":
    case "22P02":
      return new DomainError("VALIDATION_ERROR", message ?? "Revisa los datos: algún valor no es válido.");
    default:
      logger.error("Error inesperado en una RPC de disponibilidad", {
        code: error.code,
        error: error.message,
      });
      return new DomainError("INTERNAL_ERROR", fallback);
  }
}

async function callRpc<T>(fn: string, args: Record<string, unknown>, fallback: string): Promise<T> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw toDomainError(error, fallback);
  return data as T;
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
/** Ventana de «pasados recientes»: lo anterior deja de ser útil en pantalla. */
const PAST_WINDOW_DAYS = 120;
const PAST_LIMIT = 20;
const UPCOMING_LIMIT = 100;

const DEFAULT_TIMEZONE = "Europe/Madrid";

function isUsableTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export async function getChurchTimezone(churchId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("churches").select("timezone").eq("id", churchId).maybeSingle();
  const timezone = (data?.timezone as string | null | undefined) ?? null;
  return timezone && isUsableTimeZone(timezone) ? timezone : DEFAULT_TIMEZONE;
}

type PeriodRow = { id: string; starts_at: string; ends_at: string; reason: string | null };
type WeeklyRow = {
  id: string;
  weekday: number;
  starts_time: string;
  ends_time: string;
  reason: string | null;
};
type PreferenceRow = { service_area_id: string | null; max_activities_per_month: number | null };
type MembershipRow = {
  service_area_id: string;
  service_areas:
    | { id: string; name: string; active: boolean; archived_at: string | null }
    | { id: string; name: string; active: boolean; archived_at: string | null }[]
    | null;
};

function mapPeriod(row: PeriodRow): UnavailabilityPeriod {
  return { id: row.id, startsAt: row.starts_at, endsAt: row.ends_at, reason: row.reason };
}

/** PostgreSQL devuelve `time` como "HH:MM:SS"; el input espera "HH:MM". */
function trimTime(value: string): string {
  return value.slice(0, 5);
}

function mapWeekly(row: WeeklyRow): WeeklyUnavailability {
  return {
    id: row.id,
    weekday: row.weekday,
    startsTime: trimTime(row.starts_time),
    endsTime: trimTime(row.ends_time),
    reason: row.reason,
  };
}

/** Normaliza la relación incrustada de PostgREST (objeto o array de uno). */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Todo lo que necesita la pantalla «Mi disponibilidad», en paralelo. Si una
 * lectura falla, RLS o la red, lanza: la pantalla tiene su propio límite de
 * error y es preferible decir que no se pudo cargar a mostrar listas vacías
 * que parecerían reales.
 */
export async function loadMyAvailability(
  churchId: string,
  personId: string,
): Promise<AvailabilityOverview> {
  const supabase = await createSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const sinceIso = new Date(Date.now() - PAST_WINDOW_DAYS * DAY_MS).toISOString();

  const [timezone, upcoming, past, weekly, preferences, memberships] = await Promise.all([
    getChurchTimezone(churchId),
    supabase
      .from("person_unavailability_periods")
      .select("id, starts_at, ends_at, reason")
      .eq("church_id", churchId)
      .eq("person_id", personId)
      .gt("ends_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(UPCOMING_LIMIT),
    supabase
      .from("person_unavailability_periods")
      .select("id, starts_at, ends_at, reason")
      .eq("church_id", churchId)
      .eq("person_id", personId)
      .lte("ends_at", nowIso)
      .gte("ends_at", sinceIso)
      .order("starts_at", { ascending: false })
      .limit(PAST_LIMIT),
    supabase
      .from("person_unavailability_weekly")
      .select("id, weekday, starts_time, ends_time, reason")
      .eq("church_id", churchId)
      .eq("person_id", personId)
      .order("weekday", { ascending: true })
      .order("starts_time", { ascending: true }),
    supabase
      .from("person_serving_preferences")
      .select("service_area_id, max_activities_per_month")
      .eq("church_id", churchId)
      .eq("person_id", personId),
    supabase
      .from("service_area_members")
      .select("service_area_id, service_areas(id, name, active, archived_at)")
      .eq("church_id", churchId)
      .eq("person_id", personId)
      .eq("status", "active")
      .is("left_at", null),
  ]);

  for (const result of [upcoming, past, weekly, preferences, memberships]) {
    if (result.error) {
      logger.error("No se pudo cargar la disponibilidad de la persona", { error: result.error.message });
      throw new DomainError("INTERNAL_ERROR", "No se pudo cargar tu disponibilidad.");
    }
  }

  const preferenceRows = (preferences.data ?? []) as PreferenceRow[];
  const globalRow = preferenceRows.find((row) => row.service_area_id === null) ?? null;
  const byArea = new Map(
    preferenceRows
      .filter((row) => row.service_area_id !== null)
      .map((row) => [row.service_area_id as string, row.max_activities_per_month]),
  );

  const areas: AreaFrequencyPreference[] = ((memberships.data ?? []) as MembershipRow[])
    .map((row) => {
      const area = one(row.service_areas);
      if (!area || area.archived_at !== null || !area.active) return null;
      return {
        serviceAreaId: area.id,
        serviceAreaName: area.name,
        maxActivitiesPerMonth: byArea.get(area.id) ?? null,
        isSet: byArea.has(area.id),
      } satisfies AreaFrequencyPreference;
    })
    .filter((area): area is AreaFrequencyPreference => area !== null)
    .sort((a, b) => a.serviceAreaName.localeCompare(b.serviceAreaName, "es"));

  return {
    timezone,
    upcomingPeriods: ((upcoming.data ?? []) as PeriodRow[]).map(mapPeriod),
    pastPeriods: ((past.data ?? []) as PeriodRow[]).map(mapPeriod),
    weekly: ((weekly.data ?? []) as WeeklyRow[]).map(mapWeekly),
    global: {
      serviceAreaId: null,
      maxActivitiesPerMonth: globalRow?.max_activities_per_month ?? null,
      isSet: globalRow !== null,
    },
    areas,
  };
}

// ---------------------------------------------------------------------------
// Escritura (solo por RPC)
// ---------------------------------------------------------------------------

/**
 * Alta o edición de un periodo. Las horas llegan en hora local de la iglesia
 * y se convierten aquí al instante que espera la RPC. La comprobación de que
 * el fin es posterior al inicio se repite en la RPC (SQLSTATE 22023) y en el
 * `check` de la tabla: esta solo sirve para dar un mensaje mejor.
 */
export async function saveMyUnavailabilityPeriod(
  churchId: string,
  input: SavePeriodInput,
): Promise<{ id: string; created: boolean }> {
  const timezone = await getChurchTimezone(churchId);
  const startsAt = localToInstant(input.startsLocal, timezone);
  const endsAt = localToInstant(input.endsLocal, timezone);

  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new DomainError("VALIDATION_ERROR", "El fin del periodo debe ser posterior al inicio.");
  }

  const result = await callRpc<{ id: string; created: boolean }>(
    "set_my_unavailability_period",
    {
      p_input: {
        church_id: churchId,
        id: input.id ?? null,
        starts_at: startsAt,
        ends_at: endsAt,
        reason: input.reason ?? null,
      },
    },
    "No se pudo guardar el periodo.",
  );
  return { id: result.id, created: Boolean(result.created) };
}

/** Idempotente: la RPC devuelve `deleted: false` si ya no existe o no es tuyo. */
export async function deleteMyUnavailabilityPeriod(id: string): Promise<{ deleted: boolean }> {
  const result = await callRpc<{ deleted: boolean }>(
    "delete_my_unavailability_period",
    { p_id: id },
    "No se pudo eliminar el periodo.",
  );
  return { deleted: Boolean(result.deleted) };
}

export async function saveMyWeeklyUnavailability(
  churchId: string,
  input: SaveWeeklyInput,
): Promise<{ id: string; created: boolean }> {
  if (input.endsTime <= input.startsTime) {
    throw new DomainError("VALIDATION_ERROR", "La hora de fin debe ser posterior a la de inicio.");
  }

  const result = await callRpc<{ id: string; created: boolean }>(
    "set_my_weekly_unavailability",
    {
      p_input: {
        church_id: churchId,
        weekday: input.weekday,
        starts_time: input.startsTime,
        ends_time: input.endsTime,
        reason: input.reason ?? null,
      },
    },
    "No se pudo guardar la pauta semanal.",
  );
  return { id: result.id, created: Boolean(result.created) };
}

export async function deleteMyWeeklyUnavailability(id: string): Promise<{ deleted: boolean }> {
  const result = await callRpc<{ deleted: boolean }>(
    "delete_my_weekly_unavailability",
    { p_id: id },
    "No se pudo eliminar la pauta semanal.",
  );
  return { deleted: Boolean(result.deleted) };
}

/**
 * Máximo de actividades al mes. `serviceAreaId` nulo es la preferencia
 * general; `max` nulo es «sin límite». Ojo con la diferencia que fija la
 * migración: un área sin fila hereda el máximo general, mientras que un área
 * con fila y máximo nulo queda expresamente sin límite.
 */
export async function saveMyServingPreference(
  churchId: string,
  serviceAreaId: string | null,
  max: number | null,
): Promise<void> {
  await callRpc<unknown>(
    "set_my_serving_preference",
    {
      p_church_id: churchId,
      p_service_area_id: serviceAreaId,
      p_max_activities_per_month: max,
    },
    "No se pudo guardar tu preferencia.",
  );
}
