import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { DomainError } from "@/server/errors/domain-error";
import { callActivityRpc, toDomainError } from "@/server/activities/rpc";
import type { GroupAttendanceStatus } from "@/lib/groups/constants";

/**
 * Reuniones de grupo y asistencia (Fase 7). La reunión es una `activity` de
 * tipo `group_meeting` con una extensión 1:0..1 (ADR 0018): fecha, hora, zona
 * horaria y lugar salen de la actividad y no se duplican aquí.
 *
 * Una reunión cancelada se reconoce por `cancelledAt`, NO por el estado de la
 * actividad: la reunión no recorre la máquina de estados de `activities`
 * (ADR 0019), porque cancelarla por esa vía exigiría a quien lleva un grupo
 * permisos sobre el calendario de toda la iglesia.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type GroupMeetingItem = {
  id: string;
  activityId: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  locationText: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  attendanceRecordedAt: string | null;
  /** Personas marcadas como presentes. */
  attendanceCount: number;
  /** Solo llega a quien puede gestionar la reunión; si no, nulo. */
  leaderNotes: string | null;
};

export type GroupMeetingRecurrence = {
  frequency: "weekly" | "monthly";
  interval?: number;
  weekdays?: number[];
  untilDate?: string;
  count?: number;
};

export type ScheduleGroupMeetingInput = {
  title?: string | null;
  description?: string | null;
  /** Hora local "YYYY-MM-DDTHH:MM"; la base la convierte a instante. */
  localStart: string;
  localEnd?: string | null;
  durationMinutes?: number | null;
  timezone?: string | null;
  locationText?: string | null;
  recurrence?: GroupMeetingRecurrence | null;
};

export type ScheduleGroupMeetingResult = {
  groupMeetingId: string;
  activityId: string;
  seriesId: string | null;
  occurrences: number;
};

export type AttendanceEntry = {
  personId: string;
  status: GroupAttendanceStatus;
  isGuest?: boolean;
  notes?: string | null;
};

export type RecordedAttendance = {
  personId: string;
  status: GroupAttendanceStatus;
  isGuest: boolean;
  notes: string | null;
};

const MAX_MEETINGS = 200;

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

type MeetingRpcRow = {
  group_meeting_id: string;
  activity_id: string;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  location_text: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  attendance_recorded_at: string | null;
  attendance_count: number | null;
  leader_notes: string | null;
};

export async function listGroupMeetings(
  groupId: string,
  options: { from?: string; to?: string; limit?: number } = {},
): Promise<GroupMeetingItem[]> {
  const rows = await callActivityRpc<MeetingRpcRow[]>(
    "list_group_meetings",
    {
      p_group_id: groupId,
      p_from: options.from ?? null,
      p_to: options.to ?? null,
      p_limit: Math.min(Math.max(options.limit ?? 50, 1), MAX_MEETINGS),
    },
    "No se pudieron cargar las reuniones del grupo.",
  );

  return (rows ?? []).map((row) => ({
    id: row.group_meeting_id,
    activityId: row.activity_id,
    title: row.title ?? "",
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone ?? "UTC",
    locationText: row.location_text,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    attendanceRecordedAt: row.attendance_recorded_at,
    attendanceCount: Number(row.attendance_count ?? 0),
    leaderNotes: row.leader_notes,
  }));
}

export async function getGroupMeeting(groupId: string, meetingId: string): Promise<GroupMeetingItem | null> {
  // No hay RPC de una sola reunión: se lee la lista del grupo, que ya aplica
  // la misma comprobación de acceso, y se busca la que interesa.
  const meetings = await listGroupMeetings(groupId, { limit: MAX_MEETINGS });
  return meetings.find((meeting) => meeting.id === meetingId) ?? null;
}

/** Asistencia ya registrada de una reunión, para precargar el formulario. */
export async function getMeetingAttendance(
  churchId: string,
  meetingId: string,
): Promise<Map<string, RecordedAttendance>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("group_attendance")
    .select("person_id, status, is_guest, notes")
    .eq("church_id", churchId)
    .eq("group_meeting_id", meetingId);

  if (error) throw toDomainError(error, "No se pudo cargar la asistencia registrada.");

  const result = new Map<string, RecordedAttendance>();
  for (const row of data ?? []) {
    result.set(row.person_id as string, {
      personId: row.person_id as string,
      status: row.status as GroupAttendanceStatus,
      isGuest: Boolean(row.is_guest),
      notes: (row.notes as string | null) ?? null,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;

function requireLocalDateTime(value: string | null | undefined, field: string): string {
  const trimmed = (value ?? "").trim();
  if (!LOCAL_DATETIME.test(trimmed)) {
    throw new DomainError("VALIDATION_ERROR", `Indica ${field} con su fecha y su hora.`);
  }
  return trimmed;
}

function toRecurrencePayload(recurrence: GroupMeetingRecurrence): Record<string, unknown> {
  const payload: Record<string, unknown> = { frequency: recurrence.frequency };
  if (recurrence.interval !== undefined) payload.interval = recurrence.interval;
  if (recurrence.weekdays?.length) payload.weekdays = recurrence.weekdays;
  if (recurrence.untilDate) payload.until_date = recurrence.untilDate;
  else if (recurrence.count !== undefined) payload.count = recurrence.count;
  return payload;
}

function toSchedulePayload(input: ScheduleGroupMeetingInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    local_start: requireLocalDateTime(input.localStart, "el comienzo de la reunión"),
  };
  if (input.localEnd?.trim()) {
    payload.local_end = requireLocalDateTime(input.localEnd, "el final de la reunión");
  } else if (input.durationMinutes) {
    if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1) {
      throw new DomainError("VALIDATION_ERROR", "La duración debe ser de al menos un minuto.");
    }
    payload.duration_minutes = input.durationMinutes;
  }
  if (input.timezone?.trim()) payload.timezone = input.timezone.trim();
  if (input.locationText !== undefined) payload.location_text = input.locationText?.trim() || null;
  return payload;
}

export async function scheduleGroupMeeting(
  groupId: string,
  input: ScheduleGroupMeetingInput,
): Promise<ScheduleGroupMeetingResult> {
  const payload = toSchedulePayload(input);
  if (input.title?.trim()) payload.title = input.title.trim();
  if (input.description !== undefined) payload.description = input.description?.trim() || null;
  if (input.recurrence) payload.recurrence = toRecurrencePayload(input.recurrence);

  const result = await callActivityRpc<{
    group_meeting_id: string;
    activity_id: string;
    series_id: string | null;
    occurrences: number;
  } | null>("schedule_group_meeting", { p_group_id: groupId, p_input: payload }, "No se pudo convocar la reunión.");

  if (!result) throw new DomainError("INTERNAL_ERROR", "No se pudo convocar la reunión.");

  return {
    groupMeetingId: result.group_meeting_id,
    activityId: result.activity_id,
    seriesId: result.series_id ?? null,
    occurrences: Number(result.occurrences ?? 1),
  };
}

export async function rescheduleGroupMeeting(
  meetingId: string,
  input: Pick<ScheduleGroupMeetingInput, "localStart" | "localEnd" | "durationMinutes" | "locationText">,
): Promise<void> {
  await callActivityRpc<null>(
    "reschedule_group_meeting",
    { p_group_meeting_id: meetingId, p_input: toSchedulePayload(input) },
    "No se pudo cambiar la fecha de la reunión.",
  );
}

export async function cancelGroupMeeting(meetingId: string, reason?: string | null): Promise<void> {
  await callActivityRpc<null>(
    "cancel_group_meeting",
    { p_group_meeting_id: meetingId, p_reason: reason?.trim() || null },
    "No se pudo cancelar la reunión.",
  );
}

/**
 * Registrar asistencia es idempotente: repetir la llamada corrige lo anotado,
 * no duplica. Solo se admite a quien participa en el grupo; para el resto hay
 * que marcarlo expresamente como invitado.
 */
export async function recordGroupAttendance(meetingId: string, entries: AttendanceEntry[]): Promise<number> {
  if (entries.length === 0) {
    throw new DomainError("VALIDATION_ERROR", "Marca al menos una persona antes de guardar la asistencia.");
  }

  const count = await callActivityRpc<number>(
    "record_group_attendance",
    {
      p_group_meeting_id: meetingId,
      p_entries: entries.map((entry) => ({
        person_id: entry.personId,
        status: entry.status,
        is_guest: entry.isGuest ?? false,
        notes: entry.notes?.trim() || null,
      })),
    },
    "No se pudo guardar la asistencia.",
  );

  return count ?? 0;
}
