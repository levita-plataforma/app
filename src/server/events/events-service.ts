import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";
import { createActivity, transitionActivityStatus } from "@/server/activities/activities-service";
import { toDomainError } from "@/server/activities/rpc";
import { generateUniqueEventSlug, RESERVED_SLUGS, slugify } from "@/server/events/event-slug-service";
import type { ActivityVisibility } from "@/lib/activities/constants";

/**
 * Eventos (Fase 6). `events` extiende 1:1 una `activity` de tipo 'event'
 * (ADR 0018): `activities` sigue siendo la única fuente de fecha, hora,
 * timezone, campus, estado temporal y visibilidad base. Este servicio solo
 * gestiona lo exclusivo de evento (publicación pública, inscripción, aforo,
 * contenido de la página pública).
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type EventVisibility = "internal" | "members" | "public";
export type EventRegistrationType = "individual" | "household" | "group";

export type EventListItem = {
  id: string;
  activityId: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  campusId: string | null;
  campusName: string | null;
  activityStatus: string;
  visibility: EventVisibility;
  registrationEnabled: boolean;
  capacity: number | null;
  confirmedCount: number;
  waitlistCount: number;
  publicSlug: string;
  archivedAt: string | null;
};

export type EventListFilters = {
  /** próximos: starts_at futuro; pasados: starts_at pasado (según activities.starts_at). */
  when?: "upcoming" | "past";
  activityStatus?: "draft" | "planned" | "published" | "completed" | "cancelled" | "archived";
  visibility?: EventVisibility;
  campusId?: string;
  registrationEnabled?: boolean;
  /** Solo eventos con aforo lleno (capacity no nulo y confirmados >= capacity). */
  full?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 25;

function normalizePageSize(pageSize?: number): number {
  return [25, 50, 100].includes(pageSize ?? DEFAULT_PAGE_SIZE) ? (pageSize ?? DEFAULT_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
}

type EventRow = {
  id: string;
  activity_id: string;
  public_slug: string;
  visibility: string;
  registration_enabled: boolean;
  capacity: number | null;
  archived_at: string | null;
  activities: {
    title: string;
    starts_at: string | null;
    ends_at: string | null;
    status: string;
    campus_id: string | null;
    campuses: { name: string } | { name: string }[] | null;
  } | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export async function listEvents(
  churchId: string,
  filters: EventListFilters = {},
): Promise<{ items: EventListItem[]; total: number; page: number; pageSize: number }> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = normalizePageSize(filters.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("events")
    .select(
      "id, activity_id, public_slug, visibility, registration_enabled, capacity, archived_at, activities!inner(title, starts_at, ends_at, status, campus_id, campuses(name))",
      { count: "exact" },
    )
    .eq("church_id", churchId)
    .is("archived_at", null);

  if (filters.activityStatus) query = query.eq("activities.status", filters.activityStatus);
  if (filters.visibility) query = query.eq("visibility", filters.visibility);
  if (filters.campusId) query = query.eq("activities.campus_id", filters.campusId);
  if (filters.registrationEnabled !== undefined) query = query.eq("registration_enabled", filters.registrationEnabled);
  if (filters.when === "upcoming") query = query.gt("activities.starts_at", new Date().toISOString());
  else if (filters.when === "past") query = query.lt("activities.starts_at", new Date().toISOString());
  if (filters.search?.trim()) query = query.ilike("activities.title", `%${filters.search.trim()}%`);

  const { data, count, error } = await query
    .order("starts_at", { ascending: true, referencedTable: "activities" })
    .range(from, to);

  if (error) throw toDomainError(error, "No se pudieron cargar los eventos.");

  const rows = (data ?? []) as unknown as EventRow[];
  const eventIds = rows.map((r) => r.id);
  const counts = await loadRegistrationCounts(churchId, eventIds);

  let items: EventListItem[] = rows.map((row) => {
    const activity = row.activities;
    const campus = activity ? one(activity.campuses) : null;
    const count = counts.get(row.id) ?? { confirmed: 0, waitlisted: 0 };
    return {
      id: row.id,
      activityId: row.activity_id,
      title: activity?.title ?? "",
      startsAt: activity?.starts_at ?? null,
      endsAt: activity?.ends_at ?? null,
      campusId: activity?.campus_id ?? null,
      campusName: campus?.name ?? null,
      activityStatus: activity?.status ?? "draft",
      visibility: (row.visibility as EventVisibility) ?? "internal",
      registrationEnabled: row.registration_enabled,
      capacity: row.capacity,
      confirmedCount: count.confirmed,
      waitlistCount: count.waitlisted,
      publicSlug: row.public_slug,
      archivedAt: row.archived_at,
    };
  });

  // "Completos" depende del recuento real de inscritos, no de una columna:
  // se filtra en aplicación tras calcular confirmedCount.
  if (filters.full) items = items.filter((item) => item.capacity !== null && item.confirmedCount >= item.capacity);

  return { items, total: count ?? items.length, page, pageSize };
}

/**
 * Cuenta inscritos confirmed (suma de attendees_count) y waitlisted por
 * evento. Se agrupa en aplicación (PostgREST no expone group by), asumible
 * al volumen de una página (25-100 eventos).
 */
async function loadRegistrationCounts(
  churchId: string,
  eventIds: string[],
): Promise<Map<string, { confirmed: number; waitlisted: number }>> {
  const result = new Map<string, { confirmed: number; waitlisted: number }>();
  if (eventIds.length === 0) return result;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("registrations")
    .select("event_id, status, attendees_count")
    .eq("church_id", churchId)
    .in("event_id", eventIds)
    .in("status", ["confirmed", "waitlisted"]);

  for (const row of data ?? []) {
    const entry = result.get(row.event_id) ?? { confirmed: 0, waitlisted: 0 };
    if (row.status === "confirmed") entry.confirmed += row.attendees_count;
    else if (row.status === "waitlisted") entry.waitlisted += 1;
    result.set(row.event_id, entry);
  }
  return result;
}

export type EventDetail = {
  id: string;
  churchId: string;
  activityId: string;
  publicSlug: string;
  visibility: EventVisibility;
  registrationEnabled: boolean;
  registrationStatusOverride: "open" | "closed" | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  capacity: number | null;
  waitlistEnabled: boolean;
  maxWaitlist: number | null;
  registrationType: EventRegistrationType;
  coverImageUrl: string | null;
  shortDescription: string | null;
  publicDescription: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  confirmationMessage: string | null;
  cancellationPolicy: string | null;
  formId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  activity: {
    title: string;
    status: string;
    startsAt: string | null;
    endsAt: string | null;
    timezone: string;
    campusId: string | null;
    locationText: string | null;
  } | null;
};

const EVENT_DETAIL_COLUMNS =
  "id, church_id, activity_id, public_slug, visibility, registration_enabled, registration_status_override, registration_opens_at, registration_closes_at, capacity, waitlist_enabled, max_waitlist, registration_type, cover_image_url, short_description, public_description, contact_email, contact_phone, confirmation_message, cancellation_policy, form_id, archived_at, created_at, updated_at, activities(title, status, starts_at, ends_at, timezone, campus_id, location_text)";

type EventDetailRow = {
  id: string;
  church_id: string;
  activity_id: string;
  public_slug: string;
  visibility: string;
  registration_enabled: boolean;
  registration_status_override: string | null;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  capacity: number | null;
  waitlist_enabled: boolean;
  max_waitlist: number | null;
  registration_type: EventRegistrationType;
  cover_image_url: string | null;
  short_description: string | null;
  public_description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  confirmation_message: string | null;
  cancellation_policy: string | null;
  form_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  activities:
    | {
        title: string;
        status: string;
        starts_at: string | null;
        ends_at: string | null;
        timezone: string;
        campus_id: string | null;
        location_text: string | null;
      }
    | {
        title: string;
        status: string;
        starts_at: string | null;
        ends_at: string | null;
        timezone: string;
        campus_id: string | null;
        location_text: string | null;
      }[]
    | null;
};

function mapEventDetail(row: EventDetailRow): EventDetail {
  const activity = one(row.activities);
  return {
    id: row.id,
    churchId: row.church_id,
    activityId: row.activity_id,
    publicSlug: row.public_slug,
    visibility: row.visibility as EventVisibility,
    registrationEnabled: row.registration_enabled,
    registrationStatusOverride: row.registration_status_override as "open" | "closed" | null,
    registrationOpensAt: row.registration_opens_at,
    registrationClosesAt: row.registration_closes_at,
    capacity: row.capacity,
    waitlistEnabled: row.waitlist_enabled,
    maxWaitlist: row.max_waitlist,
    registrationType: row.registration_type,
    coverImageUrl: row.cover_image_url,
    shortDescription: row.short_description,
    publicDescription: row.public_description,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    confirmationMessage: row.confirmation_message,
    cancellationPolicy: row.cancellation_policy,
    formId: row.form_id,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    activity: activity
      ? {
          title: activity.title,
          status: activity.status,
          startsAt: activity.starts_at,
          endsAt: activity.ends_at,
          timezone: activity.timezone,
          campusId: activity.campus_id,
          locationText: activity.location_text,
        }
      : null,
  };
}

export async function getEvent(churchId: string, eventId: string): Promise<EventDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_DETAIL_COLUMNS)
    .eq("church_id", churchId)
    .eq("id", eventId)
    .maybeSingle();

  if (error) throw toDomainError(error, "No se pudo cargar el evento.");
  if (!data) return null;

  return mapEventDetail(data as unknown as EventDetailRow);
}

// ---------------------------------------------------------------------------
// Validación compartida
// ---------------------------------------------------------------------------

export type EventContentInput = {
  visibility?: EventVisibility;
  registrationEnabled?: boolean;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  capacity?: number | null;
  waitlistEnabled?: boolean;
  maxWaitlist?: number | null;
  registrationType?: EventRegistrationType;
  coverImageUrl?: string | null;
  shortDescription?: string | null;
  publicDescription?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  confirmationMessage?: string | null;
  cancellationPolicy?: string | null;
  formId?: string | null;
};

function validateCoverImageUrl(url: string | null | undefined): string | null | undefined {
  if (url === undefined) return undefined;
  if (url === null || url.trim() === "") return null;
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) {
    throw new DomainError("VALIDATION_ERROR", "La imagen de portada debe ser una URL https.");
  }
  if (trimmed.length > 2000) {
    throw new DomainError("VALIDATION_ERROR", "La URL de la imagen de portada es demasiado larga.");
  }
  return trimmed;
}

function toEventPatch(input: EventContentInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (input.visibility !== undefined) patch.visibility = input.visibility;
  if (input.registrationEnabled !== undefined) patch.registration_enabled = input.registrationEnabled;
  if (input.registrationOpensAt !== undefined) patch.registration_opens_at = input.registrationOpensAt;
  if (input.registrationClosesAt !== undefined) patch.registration_closes_at = input.registrationClosesAt;
  if (input.capacity !== undefined) patch.capacity = input.capacity;
  if (input.waitlistEnabled !== undefined) patch.waitlist_enabled = input.waitlistEnabled;
  if (input.maxWaitlist !== undefined) patch.max_waitlist = input.maxWaitlist;
  if (input.registrationType !== undefined) patch.registration_type = input.registrationType;
  const coverImageUrl = validateCoverImageUrl(input.coverImageUrl);
  if (coverImageUrl !== undefined) patch.cover_image_url = coverImageUrl;
  if (input.shortDescription !== undefined) patch.short_description = input.shortDescription?.trim() || null;
  if (input.publicDescription !== undefined) patch.public_description = input.publicDescription?.trim() || null;
  if (input.contactEmail !== undefined) patch.contact_email = input.contactEmail?.trim() || null;
  if (input.contactPhone !== undefined) patch.contact_phone = input.contactPhone?.trim() || null;
  if (input.confirmationMessage !== undefined) patch.confirmation_message = input.confirmationMessage?.trim() || null;
  if (input.cancellationPolicy !== undefined) patch.cancellation_policy = input.cancellationPolicy?.trim() || null;
  if (input.formId !== undefined) patch.form_id = input.formId;
  return patch;
}

// ---------------------------------------------------------------------------
// Creación
// ---------------------------------------------------------------------------

export async function createEventFromActivity(
  churchId: string,
  activityId: string,
  input: EventContentInput,
): Promise<{ eventId: string }> {
  await requireCapability(churchId, "event.create");

  const supabase = await createSupabaseServerClient();

  // El trigger app.events_activity_type_guard ya lo garantiza en DB; se
  // valida también aquí para dar un error de dominio claro en vez de dejar
  // que falle el trigger con un mensaje SQL genérico.
  const { data: activity, error: activityError } = await supabase
    .from("activities")
    .select("id, type, title")
    .eq("church_id", churchId)
    .eq("id", activityId)
    .maybeSingle();

  if (activityError) throw toDomainError(activityError, "No se pudo verificar la actividad.");
  if (!activity) throw new DomainError("RESOURCE_NOT_FOUND", "La actividad no existe.");
  if (activity.type !== "event") {
    throw new DomainError("VALIDATION_ERROR", "Solo una actividad de tipo evento puede tener comportamiento de evento.");
  }

  const publicSlug = await generateUniqueEventSlug(churchId, activity.title, supabase);
  const patch = toEventPatch(input);

  const { data, error } = await supabase
    .from("events")
    .insert({
      church_id: churchId,
      activity_id: activityId,
      public_slug: publicSlug,
      ...patch,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") throw new DomainError("CONFLICT", "Esta actividad ya tiene un evento asociado.");
    throw toDomainError(error!, "No se pudo crear el evento.");
  }

  await auditLog({
    churchId,
    action: "event.created",
    entityType: "events",
    entityId: data.id,
    metadata: { activity_id: activityId, public_slug: publicSlug },
  });

  return { eventId: data.id };
}

export type CreateEventActivityInput = {
  requestId: string;
  title: string;
  description?: string | null;
  campusId?: string | null;
  localStart: string;
  localEnd: string;
  timezone?: string | null;
  visibility?: ActivityVisibility;
  locationText?: string | null;
  organizerPersonId?: string | null;
};

/**
 * Crea la activity (type='event') vía RPC app.create_activity y, sobre ella,
 * la fila events, en dos pasos secuenciales. Cada RPC/insert ya es atómico
 * por sí mismo: si el segundo paso falla, la activity queda creada y el
 * administrador puede reintentar createEventFromActivity sobre ella sin
 * perder el trabajo del primer paso.
 */
export async function createEventFromScratch(
  churchId: string,
  activityInput: CreateEventActivityInput,
  eventInput: EventContentInput,
): Promise<{ activityId: string; eventId: string }> {
  await requireCapability(churchId, "event.create");

  // Formato exacto esperado por app.create_activity: local_start/local_end
  // como timestamps SIN timezone ("YYYY-MM-DD HH:MM:SS"), más timezone,
  // title, type y schedule_kind. NO usar starts_at/ends_at directamente.
  const { activityId } = await createActivity(churchId, {
    requestId: activityInput.requestId,
    type: "event",
    title: activityInput.title,
    description: activityInput.description,
    campusId: activityInput.campusId,
    scheduleKind: "timed",
    localStart: activityInput.localStart,
    localEnd: activityInput.localEnd,
    timezone: activityInput.timezone,
    visibility: activityInput.visibility,
    locationText: activityInput.locationText,
    organizerPersonId: activityInput.organizerPersonId,
  });

  const { eventId } = await createEventFromActivity(churchId, activityId, eventInput);

  return { activityId, eventId };
}

// ---------------------------------------------------------------------------
// Actualización / ciclo de vida
// ---------------------------------------------------------------------------

async function getEventActivityId(churchId: string, eventId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select("activity_id")
    .eq("church_id", churchId)
    .eq("id", eventId)
    .maybeSingle();

  if (error) throw toDomainError(error, "No se pudo cargar el evento.");
  if (!data) throw new DomainError("RESOURCE_NOT_FOUND", "El evento no existe.");
  return data.activity_id;
}

export async function updateEvent(churchId: string, eventId: string, input: EventContentInput): Promise<void> {
  const activityId = await getEventActivityId(churchId, eventId);
  await requireCapability(churchId, "event.manage", "activity", activityId);

  const patch = toEventPatch(input);
  if (Object.keys(patch).length === 0) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("events").update(patch).eq("church_id", churchId).eq("id", eventId);

  if (error) {
    if (error.code === "23505") throw new DomainError("CONFLICT", "Ya existe un evento con esos datos.");
    throw toDomainError(error, "No se pudo actualizar el evento.");
  }

  await auditLog({ churchId, action: "event.updated", entityType: "events", entityId: eventId, metadata: patch });
}

export async function publishEvent(churchId: string, eventId: string): Promise<void> {
  const activityId = await getEventActivityId(churchId, eventId);
  await requireCapability(churchId, "event.publish", "activity", activityId);

  await transitionActivityStatus(activityId, "published");

  await auditLog({ churchId, action: "event.published", entityType: "events", entityId: eventId, metadata: { activity_id: activityId } });
}

export async function unpublishEvent(churchId: string, eventId: string): Promise<void> {
  const activityId = await getEventActivityId(churchId, eventId);
  await requireCapability(churchId, "event.publish", "activity", activityId);

  await transitionActivityStatus(activityId, "planned");

  await auditLog({
    churchId,
    action: "event.published",
    entityType: "events",
    entityId: eventId,
    metadata: { activity_id: activityId, unpublished: true },
  });
}

export async function archiveEvent(churchId: string, eventId: string, archiveActivity = false): Promise<void> {
  const activityId = await getEventActivityId(churchId, eventId);
  await requireCapability(churchId, "event.manage", "activity", activityId);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("events")
    .update({ archived_at: new Date().toISOString() })
    .eq("church_id", churchId)
    .eq("id", eventId);

  if (error) throw toDomainError(error, "No se pudo archivar el evento.");

  if (archiveActivity) {
    await transitionActivityStatus(activityId, "archived");
  }

  await auditLog({
    churchId,
    action: "event.archived",
    entityType: "events",
    entityId: eventId,
    metadata: { activity_id: activityId, archived_activity: archiveActivity },
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export type EventsDashboard = {
  upcomingEventsCount: number;
  openRegistrationsCount: number;
  upcomingRegisteredCount: number;
  fullEventsCount: number;
  pendingWaitlistCount: number;
};

export async function getEventsDashboard(churchId: string): Promise<EventsDashboard> {
  const supabase = await createSupabaseServerClient();
  const nowIso = new Date().toISOString();

  const { data: upcomingActivities, error: upcomingError } = await supabase
    .from("activities")
    .select("id")
    .eq("church_id", churchId)
    .eq("type", "event")
    .eq("status", "published")
    .gt("starts_at", nowIso);

  if (upcomingError) throw toDomainError(upcomingError, "No se pudo cargar el panel de eventos.");

  const upcomingActivityIds = (upcomingActivities ?? []).map((a) => a.id);
  const upcomingEventsCount = upcomingActivityIds.length;

  if (upcomingActivityIds.length === 0) {
    const { count: pendingWaitlistCount } = await supabase
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("church_id", churchId)
      .eq("status", "waitlisted");

    return {
      upcomingEventsCount: 0,
      openRegistrationsCount: 0,
      upcomingRegisteredCount: 0,
      fullEventsCount: 0,
      pendingWaitlistCount: pendingWaitlistCount ?? 0,
    };
  }

  const { data: eventsForUpcoming, error: eventsError } = await supabase
    .from("events")
    .select("id, registration_enabled, capacity, registration_status_override, registration_opens_at, registration_closes_at")
    .eq("church_id", churchId)
    .in("activity_id", upcomingActivityIds)
    .is("archived_at", null);

  if (eventsError) throw toDomainError(eventsError, "No se pudo cargar el panel de eventos.");

  const relevantEvents = eventsForUpcoming ?? [];
  const eventIds = relevantEvents.map((e) => e.id);

  const counts = await loadRegistrationCounts(churchId, eventIds);

  let openRegistrationsCount = 0;
  let upcomingRegisteredCount = 0;
  let fullEventsCount = 0;

  for (const event of relevantEvents) {
    const count = counts.get(event.id) ?? { confirmed: 0, waitlisted: 0 };
    upcomingRegisteredCount += count.confirmed;

    if (!event.registration_enabled) continue;

    const isFull = event.capacity !== null && count.confirmed >= event.capacity;
    if (isFull) {
      fullEventsCount += 1;
      continue;
    }

    // Estado calculado sin llamar a la RPC por evento (evita N+1): misma
    // lógica que app.event_registration_status salvo el caso 'full', ya
    // cubierto arriba con el recuento real.
    const now = new Date();
    if (event.registration_status_override === "closed") continue;
    if (event.registration_opens_at && now < new Date(event.registration_opens_at)) continue;
    if (event.registration_closes_at && now > new Date(event.registration_closes_at)) continue;

    openRegistrationsCount += 1;
  }

  const { count: pendingWaitlistCount } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("church_id", churchId)
    .eq("status", "waitlisted");

  return {
    upcomingEventsCount,
    openRegistrationsCount,
    upcomingRegisteredCount,
    fullEventsCount,
    pendingWaitlistCount: pendingWaitlistCount ?? 0,
  };
}

// Re-exportado para que otras capas puedan validar/generar slugs manuales
// sin importar directamente el módulo interno.
export { slugify, RESERVED_SLUGS };
