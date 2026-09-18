import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability, hasCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Gestión administrativa de inscripciones a eventos (Fase 6 §22-24). Las
 * mutaciones de estado (cancelar) se delegan siempre en las RPC ya
 * transaccionales de `20260924000600_rpc_inscripcion.sql`; este servicio
 * nunca actualiza `status`/`waitlist_position` directamente por SQL de
 * cliente para no duplicar la lógica de aforo/promoción de lista de espera.
 */

export type RegistrationStatus = Database["public"]["Enums"]["registration_status"];

export type RegistrationAttendee = {
  id: string;
  fullName: string;
  attendeeType: Database["public"]["Enums"]["attendee_type"];
  attendanceStatus: Database["public"]["Enums"]["attendance_status"];
  checkedInAt: string | null;
};

export type Registration = {
  id: string;
  eventId: string;
  registrationCode: string;
  registrationType: Database["public"]["Enums"]["event_registration_type"];
  primaryName: string;
  primaryEmail: string;
  primaryPhone: string | null;
  status: RegistrationStatus;
  attendeesCount: number;
  waitlistPosition: number | null;
  source: Database["public"]["Enums"]["registration_source"];
  formSubmissionId: string | null;
  registeredAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  attendees: RegistrationAttendee[];
};

type RegistrationRow = {
  id: string;
  event_id: string;
  registration_code: string;
  registration_type: Database["public"]["Enums"]["event_registration_type"];
  primary_name: string;
  primary_email: string;
  primary_phone: string | null;
  status: RegistrationStatus;
  attendees_count: number;
  waitlist_position: number | null;
  source: Database["public"]["Enums"]["registration_source"];
  form_submission_id: string | null;
  registered_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  registration_attendees?:
    | {
        id: string;
        full_name: string;
        attendee_type: Database["public"]["Enums"]["attendee_type"];
        attendance_status: Database["public"]["Enums"]["attendance_status"];
        checked_in_at: string | null;
      }[]
    | null;
};

const REGISTRATION_SELECT = `
  id, event_id, registration_code, registration_type, primary_name, primary_email, primary_phone,
  status, attendees_count, waitlist_position, source, form_submission_id, registered_at, confirmed_at,
  cancelled_at, cancel_reason,
  registration_attendees(id, full_name, attendee_type, attendance_status, checked_in_at)
`;

function mapRegistration(row: RegistrationRow): Registration {
  return {
    id: row.id,
    eventId: row.event_id,
    registrationCode: row.registration_code,
    registrationType: row.registration_type,
    primaryName: row.primary_name,
    primaryEmail: row.primary_email,
    primaryPhone: row.primary_phone,
    status: row.status,
    attendeesCount: row.attendees_count,
    waitlistPosition: row.waitlist_position,
    source: row.source,
    formSubmissionId: row.form_submission_id,
    registeredAt: row.registered_at,
    confirmedAt: row.confirmed_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    attendees: (row.registration_attendees ?? []).map((a) => ({
      id: a.id,
      fullName: a.full_name,
      attendeeType: a.attendee_type,
      attendanceStatus: a.attendance_status,
      checkedInAt: a.checked_in_at,
    })),
  };
}

/**
 * Resuelve el activity_id de un evento (para comprobar capability con scope
 * 'activity', reutilizando el scope ya existente en vez de crear uno nuevo).
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

export type RegistrationFilters = {
  status?: RegistrationStatus;
  search?: string;
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 25;

export async function listRegistrations(
  churchId: string,
  eventId: string,
  filters: RegistrationFilters = {},
): Promise<{ items: Registration[]; total: number; page: number; pageSize: number }> {
  const activityId = await getEventActivityId(churchId, eventId);
  await requireCapability(churchId, "event.registration.manage", "activity", activityId);

  const supabase = await createSupabaseServerClient();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = [25, 50, 100].includes(filters.pageSize ?? DEFAULT_PAGE_SIZE)
    ? (filters.pageSize ?? DEFAULT_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("registrations")
    .select(REGISTRATION_SELECT, { count: "exact" })
    .eq("church_id", churchId)
    .eq("event_id", eventId);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.search) {
    const term = filters.search.trim();
    if (term) {
      query = query.or(
        `primary_name.ilike.%${term}%,primary_email.ilike.%${term}%,registration_code.ilike.%${term}%`,
      );
    }
  }

  const { data, count, error } = await query.order("registered_at", { ascending: false }).range(from, to);
  if (error || !data) return { items: [], total: 0, page, pageSize };

  return {
    items: (data as unknown as RegistrationRow[]).map(mapRegistration),
    total: count ?? data.length,
    page,
    pageSize,
  };
}

export async function getRegistration(churchId: string, registrationId: string): Promise<Registration | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("registrations")
    .select(REGISTRATION_SELECT)
    .eq("church_id", churchId)
    .eq("id", registrationId)
    .maybeSingle();

  if (error || !data) return null;

  const activityId = await getEventActivityId(churchId, (data as unknown as RegistrationRow).event_id);
  await requireCapability(churchId, "event.registration.manage", "activity", activityId);

  return mapRegistration(data as unknown as RegistrationRow);
}

export async function adminCancelRegistration(
  churchId: string,
  registrationId: string,
  reason?: string,
): Promise<{ status: RegistrationStatus; promotedCount: number }> {
  const supabase = await createSupabaseServerClient();

  // La capability se comprueba también dentro de app.admin_cancel_registration
  // (defensa en profundidad); aquí no repetimos la búsqueda de activity_id
  // porque la RPC ya lo hace y lanza 42501 si no autorizado.
  const { data, error } = await supabase.rpc("admin_cancel_registration", {
    p_registration_id: registrationId,
    p_reason: reason ?? null,
  });

  if (error) {
    if (error.code === "42501") throw new DomainError("FORBIDDEN", "No tienes permiso para cancelar esta inscripción.");
    if (error.code === "P0002") throw new DomainError("RESOURCE_NOT_FOUND", "Inscripción no encontrada.");
    throw new DomainError("INTERNAL_ERROR", "No se pudo cancelar la inscripción.");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new DomainError("INTERNAL_ERROR", "No se pudo cancelar la inscripción.");

  // Auditoría 'registration.cancelled' ya la escribe el SQL
  // (app.admin_cancel_registration); no se duplica aquí.
  return { status: row.status, promotedCount: row.promoted_count };
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const SOURCE_LABELS: Record<Database["public"]["Enums"]["registration_source"], string> = {
  public: "Público",
  authenticated: "Autenticado",
  admin: "Admin",
};

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  waitlisted: "Lista de espera",
  cancelled: "Cancelada",
  declined: "Rechazada",
};

type SubmissionAnswerRow = {
  submission_id: string;
  field_key: string;
  classification: Database["public"]["Enums"]["form_field_classification"];
  value: unknown;
};

type FormFieldMeta = { key: string; label: string; classification: Database["public"]["Enums"]["form_field_classification"] };

/**
 * Exportación CSV de inscritos de un evento (encargo Fase 6 §24). Pagina
 * internamente igual que src/server/people/export-service.ts, con el mismo
 * límite práctico de filas. Las respuestas de formulario normal/personal
 * siempre se incluyen; sensitive/restricted solo si además de
 * event.registration.export el exportador tiene form.sensitive.manage.
 */
export async function exportRegistrationsCsv(
  churchId: string,
  eventId: string,
  filters: RegistrationFilters = {},
): Promise<string> {
  await requireCapability(churchId, "event.registration.export");

  const canSeeSensitive = await hasCapability(churchId, "form.sensitive.manage");

  const MAX_ROWS = 5000;
  const supabase = await createSupabaseServerClient();

  const allRows: RegistrationRow[] = [];
  let page = 1;
  const pageSize = 100;
  for (;;) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("registrations")
      .select(REGISTRATION_SELECT)
      .eq("church_id", churchId)
      .eq("event_id", eventId);

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.search) {
      const term = filters.search.trim();
      if (term) {
        query = query.or(
          `primary_name.ilike.%${term}%,primary_email.ilike.%${term}%,registration_code.ilike.%${term}%`,
        );
      }
    }

    const { data, error } = await query.order("registered_at", { ascending: true }).range(from, to);
    if (error || !data || data.length === 0) break;

    allRows.push(...(data as unknown as RegistrationRow[]));
    if (data.length < pageSize || allRows.length >= MAX_ROWS) break;
    page++;
  }

  const rows = allRows.slice(0, MAX_ROWS);

  // Formulario asociado (si existe): campos vigentes + respuestas de las
  // submissions implicadas, en dos consultas en bloque (evita N+1).
  const submissionIds = rows.map((r) => r.form_submission_id).filter((id): id is string => Boolean(id));

  let fieldsByKey: Map<string, FormFieldMeta> = new Map();
  const answersBySubmission: Map<string, Map<string, unknown>> = new Map();

  if (submissionIds.length > 0) {
    const { data: eventRow } = await supabase.from("events").select("form_id").eq("church_id", churchId).eq("id", eventId).maybeSingle();
    const formId = eventRow?.form_id ?? null;

    if (formId) {
      const { data: fieldsData } = await supabase
        .from("form_fields")
        .select("key, label, classification")
        .eq("church_id", churchId)
        .eq("form_id", formId)
        .is("archived_at", null)
        .order("sort_order");

      fieldsByKey = new Map((fieldsData ?? []).map((f) => [f.key, f as FormFieldMeta]));
    }

    const { data: answersData } = await supabase
      .from("form_submission_answers")
      .select("submission_id, field_key, classification, value")
      .eq("church_id", churchId)
      .in("submission_id", submissionIds);

    for (const answer of (answersData ?? []) as SubmissionAnswerRow[]) {
      if (!answersBySubmission.has(answer.submission_id)) {
        answersBySubmission.set(answer.submission_id, new Map());
      }
      answersBySubmission.get(answer.submission_id)!.set(answer.field_key, answer.value);
    }
  }

  const includedFields = Array.from(fieldsByKey.values()).filter(
    (f) => f.classification === "normal" || f.classification === "personal" || canSeeSensitive,
  );

  const header = [
    "Código",
    "Nombre",
    "Email",
    "Teléfono",
    "Estado",
    "Nº asistentes",
    "Fecha de registro",
    "Origen",
    ...includedFields.map((f) => f.label),
  ];

  const csvRows = rows.map((r) => {
    const base = [
      r.registration_code,
      r.primary_name,
      r.primary_email,
      r.primary_phone ?? "",
      STATUS_LABELS[r.status],
      String(r.attendees_count),
      r.registered_at,
      SOURCE_LABELS[r.source],
    ];

    const answers = r.form_submission_id ? answersBySubmission.get(r.form_submission_id) : undefined;
    const fieldValues = includedFields.map((f) => {
      const value = answers?.get(f.key);
      if (value === undefined || value === null) return "";
      return typeof value === "string" ? value : JSON.stringify(value);
    });

    return [...base, ...fieldValues];
  });

  const csv = [header, ...csvRows].map((row) => row.map((cell) => csvEscape(String(cell))).join(",")).join("\n");

  // Auditoría después de generar, para reflejar lo realmente exportado.
  await auditLog({
    churchId,
    action: "event.registration_exported",
    entityType: "events",
    entityId: eventId,
    metadata: { event_id: eventId, row_count: rows.length, included_sensitive: canSeeSensitive && includedFields.some((f) => f.classification === "sensitive" || f.classification === "restricted") },
  });

  return csv;
}
