import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { DomainError } from "@/server/errors/domain-error";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Check-in de asistentes (Fase 6 §17-18, §42). Las mutaciones de estado
 * (checkin/undo) se delegan siempre en las RPC transaccionales de
 * `20260924000600_rpc_inscripcion.sql`, que ya auditan internamente
 * (`event.checkin` / `event.checkout_undo`); este servicio nunca duplica esa
 * auditoría.
 */

async function getEventActivityId(churchId: string, eventId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select("activity_id")
    .eq("church_id", churchId)
    .eq("id", eventId)
    .maybeSingle();

  if (error || !data) throw new DomainError("RESOURCE_NOT_FOUND", "Evento no encontrado.");
  return data.activity_id;
}

export type CheckinAttendeeResult = {
  id: string;
  fullName: string;
  attendeeType: Database["public"]["Enums"]["attendee_type"];
  attendanceStatus: Database["public"]["Enums"]["attendance_status"];
  registrationId: string;
  registrationCode: string;
  registrationStatus: Database["public"]["Enums"]["registration_status"];
  primaryEmail: string;
};

type AttendeeSearchRow = {
  id: string;
  full_name: string;
  attendee_type: Database["public"]["Enums"]["attendee_type"];
  attendance_status: Database["public"]["Enums"]["attendance_status"];
  registration_id: string;
  registrations: {
    registration_code: string;
    status: Database["public"]["Enums"]["registration_status"];
    primary_email: string;
  } | null;
};

/**
 * Busca asistentes por nombre, email de la inscripción o código de
 * inscripción, restringido a inscripciones confirmed: no tiene sentido hacer
 * check-in de alguien en waitlist o cancelado.
 */
export async function searchAttendeeForCheckin(
  churchId: string,
  eventId: string,
  query: string,
): Promise<CheckinAttendeeResult[]> {
  const activityId = await getEventActivityId(churchId, eventId);
  await requireCapability(churchId, "event.checkin", "activity", activityId);

  const term = query.trim();
  if (!term) return [];

  const supabase = await createSupabaseServerClient();

  // PostgREST no admite filtrar por columnas de una tabla embedada dentro
  // de un .or() (p. ej. "registrations.primary_email.ilike...."): se
  // resuelve con una consulta previa que localiza las registrations por
  // email/código y se combina con la búsqueda por nombre del asistente.
  const { data: matchingRegs } = await supabase
    .from("registrations")
    .select("id")
    .eq("church_id", churchId)
    .eq("event_id", eventId)
    .eq("status", "confirmed")
    .or(`primary_email.ilike.%${term}%,registration_code.ilike.%${term}%`)
    .limit(25);

  const matchingRegIds = (matchingRegs ?? []).map((r) => r.id as string);

  const orClauses = [`full_name.ilike.%${term}%`];
  if (matchingRegIds.length > 0) {
    orClauses.push(`registration_id.in.(${matchingRegIds.join(",")})`);
  }

  const { data, error } = await supabase
    .from("registration_attendees")
    .select(
      "id, full_name, attendee_type, attendance_status, registration_id, registrations!inner(registration_code, status, primary_email)",
    )
    .eq("church_id", churchId)
    .eq("event_id", eventId)
    .eq("registrations.status", "confirmed")
    .or(orClauses.join(","))
    .limit(25);

  if (error || !data) return [];

  return (data as unknown as AttendeeSearchRow[])
    .filter((row) => row.registrations)
    .map((row) => ({
      id: row.id,
      fullName: row.full_name,
      attendeeType: row.attendee_type,
      attendanceStatus: row.attendance_status,
      registrationId: row.registration_id,
      registrationCode: row.registrations!.registration_code,
      registrationStatus: row.registrations!.status,
      primaryEmail: row.registrations!.primary_email,
    }));
}

export async function checkinAttendee(
  churchId: string,
  attendeeId: string,
): Promise<{ attendanceStatus: Database["public"]["Enums"]["attendance_status"]; checkedInAt: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("checkin_attendee", { p_attendee_id: attendeeId });

  if (error) {
    if (error.code === "42501") throw new DomainError("FORBIDDEN", "No tienes permiso para hacer check-in.");
    if (error.code === "P0002") throw new DomainError("RESOURCE_NOT_FOUND", "Asistente no encontrado.");
    throw new DomainError("INTERNAL_ERROR", "No se pudo registrar el check-in.");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new DomainError("INTERNAL_ERROR", "No se pudo registrar el check-in.");

  // Auditoría 'event.checkin' ya la escribe app.checkin_attendee.
  return { attendanceStatus: row.attendance_status, checkedInAt: row.checked_in_at };
}

export async function undoCheckin(
  churchId: string,
  attendeeId: string,
): Promise<{ attendanceStatus: Database["public"]["Enums"]["attendance_status"] }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("undo_checkin_attendee", { p_attendee_id: attendeeId });

  if (error) {
    if (error.code === "42501") throw new DomainError("FORBIDDEN", "No tienes permiso para deshacer el check-in.");
    if (error.code === "P0002") throw new DomainError("RESOURCE_NOT_FOUND", "Asistente no encontrado.");
    throw new DomainError("INTERNAL_ERROR", "No se pudo deshacer el check-in.");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new DomainError("INTERNAL_ERROR", "No se pudo deshacer el check-in.");

  // Auditoría 'event.checkout_undo' ya la escribe app.undo_checkin_attendee.
  return { attendanceStatus: row.attendance_status };
}

export type CheckinCounts = {
  checkedIn: number;
  expected: number;
};

/**
 * Conteo directo sin caché para polling simple desde el cliente: asistentes
 * con attendance_status='checked_in' frente al total esperado (filas de
 * registration_attendees cuya inscripción está confirmed).
 */
export async function getCheckinCounts(churchId: string, eventId: string): Promise<CheckinCounts> {
  const activityId = await getEventActivityId(churchId, eventId);
  await requireCapability(churchId, "event.checkin", "activity", activityId);

  const supabase = await createSupabaseServerClient();

  const [{ count: checkedIn }, { count: expected }] = await Promise.all([
    supabase
      .from("registration_attendees")
      .select("id", { count: "exact", head: true })
      .eq("church_id", churchId)
      .eq("event_id", eventId)
      .eq("attendance_status", "checked_in"),
    supabase
      .from("registration_attendees")
      .select("id, registrations!inner(status)", { count: "exact", head: true })
      .eq("church_id", churchId)
      .eq("event_id", eventId)
      .eq("registrations.status", "confirmed"),
  ]);

  return { checkedIn: checkedIn ?? 0, expected: expected ?? 0 };
}
