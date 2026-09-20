import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { DomainError } from "@/server/errors/domain-error";
import { logger } from "@/server/logger/logger";

/**
 * Llamada a las RPC de actividades con traducción de errores SQL a errores de
 * dominio. Las funciones app.* lanzan mensajes ya pensados para el usuario
 * (en español) con SQLSTATE concretos; los errores de constraints o de tipos
 * se sustituyen por un mensaje genérico para no exponer detalles internos.
 */

type PostgrestLikeError = { code?: string; message: string; details?: string | null };

const TECHNICAL_MESSAGE = /violates|duplicate key|null value|invalid input|syntax|column|relation|function|operator|permission denied/i;

export function toDomainError(error: PostgrestLikeError, fallback: string): DomainError {
  const technical = TECHNICAL_MESSAGE.test(error.message);
  const message = technical ? null : error.message;

  switch (error.code) {
    case "42501":
      return new DomainError("FORBIDDEN", message ?? "No tienes permiso para realizar esta acción.");
    case "53400":
      return new DomainError("RATE_LIMITED", message ?? "Se ha alcanzado un límite. Inténtalo de nuevo más tarde.");
    case "P0002":
      return new DomainError("RESOURCE_NOT_FOUND", message ?? "El elemento no existe.");
    case "23505":
      return new DomainError("CONFLICT", message ?? "Ya existe un elemento con esos datos.");
    case "23P01":
      // Violación de restricción de exclusión: hoy solo la usa la ocupación de
      // recursos (Fase 10), y su mensaje ya dice qué franja choca y a qué hora.
      // Sin este caso caería en el default y esa explicación se perdería,
      // sustituida por un texto genérico y un registro de error inesperado.
      return new DomainError("CONFLICT", message ?? "Ese horario ya está ocupado.");
    case "PT409":
    case "55P03":
      return new DomainError("CONFLICT", message ?? "Los datos han cambiado. Recarga e inténtalo de nuevo.");
    case "22023":
    case "23514":
    case "23502":
    case "23503":
    case "22P02":
    case "22007":
    case "22008":
    case "22003":
      return new DomainError("VALIDATION_ERROR", message ?? "Revisa los datos: algún valor no es válido.");
    default:
      logger.error("Error inesperado en RPC de actividades", { code: error.code, error: error.message });
      return new DomainError("INTERNAL_ERROR", fallback);
  }
}

export async function callActivityRpc<T>(fn: string, args: Record<string, unknown>, fallback: string): Promise<T> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw toDomainError(error, fallback);
  return data as T;
}

/** Normaliza relaciones embebidas de PostgREST (objeto o array de uno). */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function newRequestId(): string {
  return crypto.randomUUID();
}
