"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import { isLocalDateTime, isLocalTime } from "@/server/availability/church-time";
import {
  deleteMyUnavailabilityPeriod,
  deleteMyWeeklyUnavailability,
  saveMyServingPreference,
  saveMyUnavailabilityPeriod,
  saveMyWeeklyUnavailability,
} from "@/server/availability/availability-service";
import { MAX_ACTIVITIES_LIMIT, REASON_MAX } from "./labels";

/**
 * Acciones de «Mi disponibilidad». Envoltorios finos: la iglesia y la persona
 * salen siempre del contexto del servidor (nunca de lo que envía el
 * navegador) y las RPC de `20260923000100_disponibilidad.sql` vuelven a
 * comprobar pertenencia, propiedad y validaciones. Lo que se valida aquí es
 * solo para dar un mensaje claro antes de ir a la base de datos.
 */

export type DisponibilidadResult = { ok: true } | { ok: false; error: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalid(message: string): DisponibilidadResult {
  return { ok: false, error: message };
}

function revalidate() {
  revalidatePath("/app/mi-disponibilidad");
}

async function run(work: () => Promise<void>): Promise<DisponibilidadResult> {
  try {
    await work();
    revalidate();
    return { ok: true };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Motivo: opcional, privado y acotado como en la base de datos. */
function cleanReason(reason: unknown): { value: string | null } | { error: string } {
  if (reason === undefined || reason === null) return { value: null };
  if (typeof reason !== "string") return { error: "El motivo no es válido." };
  const trimmed = reason.trim();
  if (trimmed.length === 0) return { value: null };
  if (trimmed.length > REASON_MAX) {
    return { error: `El motivo no puede superar los ${REASON_MAX} caracteres.` };
  }
  return { value: trimmed };
}

// ---------------------------------------------------------------------------
// Periodos
// ---------------------------------------------------------------------------

export type GuardarPeriodoInput = {
  id?: string | null;
  /** "YYYY-MM-DDTHH:MM" en la zona horaria de la iglesia. */
  startsLocal: string;
  endsLocal: string;
  reason?: string | null;
};

export async function guardarPeriodoAction(input: GuardarPeriodoInput): Promise<DisponibilidadResult> {
  const tenant = await requireTenantContext();

  if (input.id !== undefined && input.id !== null && !UUID_RE.test(String(input.id))) {
    return invalid("El periodo no es válido. Recarga la página.");
  }
  if (!isLocalDateTime(input.startsLocal) || !isLocalDateTime(input.endsLocal)) {
    return invalid("Indica la fecha y la hora de inicio y de fin.");
  }
  // Ambas cadenas están en la misma zona y el mismo formato, así que
  // compararlas como texto ordena igual que comparar los instantes.
  if (input.endsLocal <= input.startsLocal) {
    return invalid("El fin del periodo debe ser posterior al inicio.");
  }
  const reason = cleanReason(input.reason);
  if ("error" in reason) return invalid(reason.error);

  return run(async () => {
    await saveMyUnavailabilityPeriod(tenant.churchId, {
      id: input.id ?? null,
      startsLocal: input.startsLocal,
      endsLocal: input.endsLocal,
      reason: reason.value,
    });
  });
}

export async function eliminarPeriodoAction(id: string): Promise<DisponibilidadResult> {
  await requireTenantContext();
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return invalid("El periodo no es válido. Recarga la página.");
  }
  return run(async () => {
    await deleteMyUnavailabilityPeriod(id);
  });
}

// ---------------------------------------------------------------------------
// Pauta semanal
// ---------------------------------------------------------------------------

export type GuardarPautaInput = {
  /** 0 = lunes … 6 = domingo. */
  weekday: number;
  /** "HH:MM" en la zona horaria de la iglesia. */
  startsTime: string;
  endsTime: string;
  reason?: string | null;
};

export async function guardarPautaAction(input: GuardarPautaInput): Promise<DisponibilidadResult> {
  const tenant = await requireTenantContext();

  if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) {
    return invalid("Elige un día de la semana.");
  }
  if (!isLocalTime(input.startsTime) || !isLocalTime(input.endsTime)) {
    return invalid("Indica la hora de inicio y la de fin.");
  }
  if (input.endsTime <= input.startsTime) {
    return invalid("La hora de fin debe ser posterior a la de inicio.");
  }
  const reason = cleanReason(input.reason);
  if ("error" in reason) return invalid(reason.error);

  return run(async () => {
    await saveMyWeeklyUnavailability(tenant.churchId, {
      weekday: input.weekday,
      startsTime: input.startsTime,
      endsTime: input.endsTime,
      reason: reason.value,
    });
  });
}

export async function eliminarPautaAction(id: string): Promise<DisponibilidadResult> {
  await requireTenantContext();
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return invalid("La pauta no es válida. Recarga la página.");
  }
  return run(async () => {
    await deleteMyWeeklyUnavailability(id);
  });
}

// ---------------------------------------------------------------------------
// Frecuencia
// ---------------------------------------------------------------------------

/** `serviceAreaId` nulo: preferencia general. `max` nulo: sin límite. */
export async function guardarFrecuenciaAction(
  serviceAreaId: string | null,
  max: number | null,
): Promise<DisponibilidadResult> {
  const tenant = await requireTenantContext();

  if (serviceAreaId !== null && (typeof serviceAreaId !== "string" || !UUID_RE.test(serviceAreaId))) {
    return invalid("El área de servicio no es válida. Recarga la página.");
  }
  if (max !== null) {
    if (!Number.isInteger(max) || max < 0) {
      return invalid("El máximo de actividades al mes tiene que ser un número entero de 0 en adelante.");
    }
    if (max > MAX_ACTIVITIES_LIMIT) {
      return invalid(`Como máximo se pueden indicar ${MAX_ACTIVITIES_LIMIT} actividades al mes.`);
    }
  }

  return run(async () => {
    await saveMyServingPreference(tenant.churchId, serviceAreaId, max);
  });
}
