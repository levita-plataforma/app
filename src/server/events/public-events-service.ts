import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { DomainError } from "@/server/errors/domain-error";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Superficie pública de eventos: código usado desde la página del evento sin
 * sesión y la Server Action de inscripción sin sesión. NO usa
 * requireTenantContext/requireCapability (no existe tenant para un
 * visitante anónimo): usa createSupabaseServerClient() directamente, que
 * funciona igual para `anon` porque las RPC públicas ya están graneadas
 * (security definer con superficie mínima, ver ADR 0018 §"Decisión ·
 * Lectura pública sin sesión").
 */

export type PublicEventDetail = {
  eventId: string;
  title: string;
  shortDescription: string | null;
  publicDescription: string | null;
  coverImageUrl: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  locationText: string | null;
  churchName: string;
  registrationStatus: Database["public"]["Enums"]["event_registration_status"];
  capacity: number | null;
  confirmedCount: number;
  contactEmail: string | null;
  contactPhone: string | null;
  registrationType: Database["public"]["Enums"]["event_registration_type"];
};

export async function getPublicEventBySlug(
  churchSlug: string,
  eventSlug: string,
): Promise<PublicEventDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("public_event_by_slug", {
    p_church_slug: churchSlug,
    p_event_slug: eventSlug,
  });

  if (error || !data || data.length === 0) return null;

  const row = data[0];
  return {
    eventId: row.event_id,
    title: row.title,
    shortDescription: row.short_description,
    publicDescription: row.public_description,
    coverImageUrl: row.cover_image_url,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    locationText: row.location_text,
    churchName: row.church_name,
    registrationStatus: row.registration_status,
    capacity: row.capacity,
    confirmedCount: row.confirmed_count,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    registrationType: row.registration_type,
  };
}

export type PublicFormField = {
  fieldKey: string;
  label: string;
  type: Database["public"]["Enums"]["form_field_type"];
  required: boolean;
  helpText: string | null;
  options: unknown;
  sortOrder: number;
};

type PublicFormFieldRow = {
  field_key: string;
  label: string;
  type: Database["public"]["Enums"]["form_field_type"];
  required: boolean;
  help_text: string | null;
  options: unknown;
  sort_order: number;
};

/**
 * Devuelve los campos vigentes del formulario asociado a un evento público,
 * vía la RPC `public.public_form_fields` (migración
 * 20260924000800_form_fields_publicos.sql). Esa función es necesaria porque
 * la política RLS `form_fields_select` solo concede SELECT a `authenticated`
 * — `anon` no puede leer `form_fields` directamente. Devuelve [] si el
 * evento no tiene formulario o no es de lectura pública.
 *
 * NOTA: `public_form_fields` es una función nueva de esta fase, todavía no
 * reflejada en el Database types generado (database.types.ts se regeneró
 * antes de crear esta migración), así que se invoca con `.rpc` sin el
 * autocompletado de tipos de las demás RPC y se castea el resultado.
 */
type PublicFormFieldsRpc = {
  public_form_fields: {
    Args: { p_event_id: string };
    Returns: PublicFormFieldRow[];
  };
};

export async function getPublicFormForEvent(eventId: string): Promise<PublicFormField[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await (
    supabase as unknown as { rpc: <K extends keyof PublicFormFieldsRpc>(fn: K, args: PublicFormFieldsRpc[K]["Args"]) => Promise<{ data: PublicFormFieldsRpc[K]["Returns"] | null; error: { message: string } | null }> }
  ).rpc("public_form_fields", { p_event_id: eventId });

  if (error || !data) return [];

  return (data as PublicFormFieldRow[]).map((row) => ({
    fieldKey: row.field_key,
    label: row.label,
    type: row.type,
    required: row.required,
    helpText: row.help_text,
    options: row.options,
    sortOrder: row.sort_order,
  }));
}

export type RegisterForEventAttendee = {
  fullName: string;
  attendeeType?: Database["public"]["Enums"]["attendee_type"];
  personId?: string;
};

export type RegisterForEventAnswer = {
  fieldKey: string;
  value: unknown;
};

export type RegisterForEventConsent = {
  consentKey: string;
  given: boolean;
};

export type RegisterForEventInput = {
  eventId: string;
  registrationType: Database["public"]["Enums"]["event_registration_type"];
  primaryName: string;
  primaryEmail: string;
  primaryPhone?: string;
  primaryPersonId?: string;
  attendees?: RegisterForEventAttendee[];
  answers?: RegisterForEventAnswer[];
  consents?: RegisterForEventConsent[];
  idempotencyKey?: string;
  /** Campo honeypot anti-bot: si viene relleno, se descarta la inscripción silenciosamente. */
  honeypot?: string;
};

export type RegisterForEventResult = {
  registrationId: string;
  status: Database["public"]["Enums"]["registration_status"];
  registrationCode: string;
  cancelToken: string;
  waitlistPosition: number | null;
  replayed: boolean;
};

/**
 * Rate limiting básico en memoria del proceso (§44: "protección razonable",
 * no un sistema robusto). Limitación DOCUMENTADA: este Map vive en el
 * proceso Node del servidor y no sobrevive a un redeploy ni se comparte
 * entre instancias en un despliegue horizontal (varios pods/lambdas) — cada
 * instancia lleva su propio contador. Es una primera versión razonable para
 * el encargo; un límite robusto compartido (Redis, Upstash, etc.) queda
 * como mejora futura si el volumen de abuso lo justifica.
 *
 * No se implementa el campo de "tiempo mínimo transcurrido" (time-trap)
 * porque el honeypot ya cubre el vector de bots más común (rellenar todos
 * los campos, incluido el oculto) y añadir un segundo mecanismo sin
 * evidencia de que el primero sea insuficiente aumentaría la complejidad sin
 * beneficio claro; se documenta como decisión, no como omisión accidental.
 */
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const rateLimitBuckets = new Map<string, number[]>();

function checkRateLimit(key: string): void {
  const now = Date.now();
  const attempts = (rateLimitBuckets.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (attempts.length >= RATE_LIMIT_MAX_ATTEMPTS) {
    throw new DomainError("RATE_LIMITED", "Demasiados intentos de inscripción. Inténtalo de nuevo en unos minutos.");
  }

  attempts.push(now);
  rateLimitBuckets.set(key, attempts);
}

export async function registerForEvent(
  input: RegisterForEventInput,
): Promise<RegisterForEventResult> {
  // Honeypot: si el campo oculto viene relleno, es un bot. Se devuelve un
  // "éxito" falso (sin llamar la RPC ni tocar la base de datos) para no dar
  // pistas a bots sobre qué falló.
  if (input.honeypot && input.honeypot.trim() !== "") {
    return {
      registrationId: "",
      status: "confirmed",
      registrationCode: "",
      cancelToken: "",
      waitlistPosition: null,
      replayed: false,
    };
  }

  const rateLimitKey = input.primaryEmail.trim().toLowerCase();
  checkRateLimit(rateLimitKey);

  if (!input.primaryName.trim()) {
    throw new DomainError("VALIDATION_ERROR", "El nombre es obligatorio.");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.primaryEmail.trim())) {
    throw new DomainError("VALIDATION_ERROR", "El correo no es válido.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("register_for_event", {
    p_event_id: input.eventId,
    p_registration_type: input.registrationType,
    p_primary_name: input.primaryName.trim(),
    p_primary_email: input.primaryEmail.trim(),
    p_primary_phone: input.primaryPhone || null,
    p_primary_person_id: input.primaryPersonId || null,
    p_attendees: (input.attendees ?? []).map((a) => ({
      full_name: a.fullName,
      attendee_type: a.attendeeType ?? "adult",
      person_id: a.personId ?? null,
    })),
    p_answers: (input.answers ?? []).map((a) => ({ field_key: a.fieldKey, value: a.value })),
    p_consents: (input.consents ?? []).map((c) => ({ consent_key: c.consentKey, given: c.given })),
    p_idempotency_key: input.idempotencyKey || null,
  });

  if (error || !data || data.length === 0) {
    // La RPC también limita el abuso por su cuenta (hotfix F-06: el límite en
    // memoria de este proceso se rodea llamando a la API directamente), y
    // rechaza con 53400. Se traduce al código de dominio correspondiente.
    if (error?.code === "53400") throw new DomainError("RATE_LIMITED", error.message);
    if (error?.code === "P0002") {
      throw new DomainError("RESOURCE_NOT_FOUND", "Evento no encontrado.");
    }
    if (error?.code === "42501") {
      throw new DomainError("FORBIDDEN", "No puedes inscribir a otra persona.");
    }
    throw new DomainError("VALIDATION_ERROR", error?.message ?? "No se pudo completar la inscripción.");
  }

  const row = data[0];
  return {
    registrationId: row.registration_id,
    status: row.status,
    registrationCode: row.registration_code,
    cancelToken: row.cancel_token,
    waitlistPosition: row.waitlist_position,
    replayed: row.replayed,
  };
}

export type PublicConsentDefinition = {
  consentKey: string;
  purposeType: "operational" | "marketing";
  title: string;
  body: string;
  version: number;
};

type PublicConsentDefinitionRow = {
  consent_key: string;
  purpose_type: string;
  title: string;
  body: string;
  version: number;
};

type PublicConsentDefinitionsRpc = {
  public_consent_definitions: {
    Args: { p_church_slug: string };
    Returns: PublicConsentDefinitionRow[];
  };
};

/**
 * Consentimientos activos de UNA iglesia, resueltos por slug, para mostrarlos
 * en el formulario público de inscripción.
 *
 * Usa la RPC `public.public_consent_definitions` (migración
 * 20260925000200_hotfix_consentimientos_publicos.sql). Antes hacía un SELECT
 * directo sobre `consent_definitions` apoyándose en la política
 * `consent_definitions_select_public`, que concedía a `anon` la lectura de
 * TODAS las cláusulas de TODAS las iglesias, sin filtro de church_id: una
 * fuga entre inquilinos, porque el cuerpo del texto suele incluir la razón
 * social y los datos del responsable del tratamiento. Esa política se eliminó
 * y la superficie pública es ahora esta función `security definer` de
 * superficie mínima.
 *
 * Igual que `public_form_fields`, la función es posterior al último
 * `database.types.ts` generado, así que se invoca con `.rpc` sin el
 * autocompletado de tipos y se castea el resultado.
 */
export async function getPublicConsentDefinitions(
  churchSlug: string,
): Promise<PublicConsentDefinition[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await (
    supabase as unknown as { rpc: <K extends keyof PublicConsentDefinitionsRpc>(fn: K, args: PublicConsentDefinitionsRpc[K]["Args"]) => Promise<{ data: PublicConsentDefinitionsRpc[K]["Returns"] | null; error: { message: string } | null }> }
  ).rpc("public_consent_definitions", { p_church_slug: churchSlug });

  if (error || !data) return [];

  return (data as PublicConsentDefinitionRow[]).map((row) => ({
    consentKey: row.consent_key,
    purposeType: row.purpose_type === "marketing" ? "marketing" : "operational",
    title: row.title,
    body: row.body,
    version: row.version,
  }));
}

export async function cancelRegistrationByToken(
  cancelToken: string,
  reason?: string,
): Promise<{ status: Database["public"]["Enums"]["registration_status"]; promotedCount: number }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cancel_registration_by_token", {
    p_cancel_token: cancelToken,
    p_reason: reason ?? null,
  });

  if (error) {
    if (error.code === "P0002") throw new DomainError("RESOURCE_NOT_FOUND", "Inscripción no encontrada.");
    throw new DomainError("INTERNAL_ERROR", "No se pudo cancelar la inscripción.");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new DomainError("INTERNAL_ERROR", "No se pudo cancelar la inscripción.");

  return { status: row.status, promotedCount: row.promoted_count };
}
