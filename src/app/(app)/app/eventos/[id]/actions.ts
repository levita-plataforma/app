"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { DomainError } from "@/server/errors/domain-error";
import {
  updateEvent,
  publishEvent,
  unpublishEvent,
  archiveEvent,
  type EventContentInput,
  type EventVisibility,
  type EventRegistrationType,
} from "@/server/events/events-service";
import { adminCancelRegistration } from "@/server/events/registrations-service";

export type EventoFichaState = { error: string | null };
const OK: EventoFichaState = { error: null };

function asState(err: unknown): EventoFichaState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

function revalidateEvent(eventId: string) {
  revalidatePath(`/app/eventos/${eventId}`);
  revalidatePath("/app/eventos");
  revalidatePath("/app/calendario");
}

function optionalText(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (raw === null) return undefined;
  const value = String(raw).trim();
  return value === "" ? undefined : value;
}

export async function guardarEventoAction(eventId: string, formData: FormData): Promise<EventoFichaState> {
  const tenant = await requireTenantContext();

  const visibilityRaw = String(formData.get("eventVisibility") ?? "");
  const registrationTypeRaw = String(formData.get("registrationType") ?? "");
  const capacityRaw = optionalText(formData, "capacity");
  const maxWaitlistRaw = optionalText(formData, "maxWaitlist");

  const input: EventContentInput = {
    visibility: (["internal", "members", "public"] as const).includes(visibilityRaw as EventVisibility)
      ? (visibilityRaw as EventVisibility)
      : undefined,
    registrationEnabled: formData.get("registrationEnabled") === "on",
    registrationOpensAt: optionalText(formData, "registrationOpensAt") ?? null,
    registrationClosesAt: optionalText(formData, "registrationClosesAt") ?? null,
    capacity: capacityRaw ? Number(capacityRaw) : null,
    waitlistEnabled: formData.get("waitlistEnabled") === "on",
    maxWaitlist: maxWaitlistRaw ? Number(maxWaitlistRaw) : null,
    registrationType: (["individual", "household", "group"] as const).includes(
      registrationTypeRaw as EventRegistrationType,
    )
      ? (registrationTypeRaw as EventRegistrationType)
      : undefined,
    coverImageUrl: optionalText(formData, "coverImageUrl") ?? null,
    shortDescription: optionalText(formData, "shortDescription") ?? null,
    publicDescription: optionalText(formData, "publicDescription") ?? null,
    contactEmail: optionalText(formData, "contactEmail") ?? null,
    contactPhone: optionalText(formData, "contactPhone") ?? null,
    confirmationMessage: optionalText(formData, "confirmationMessage") ?? null,
    cancellationPolicy: optionalText(formData, "cancellationPolicy") ?? null,
    formId: optionalText(formData, "formId") ?? null,
  };

  try {
    await updateEvent(tenant.churchId, eventId, input);
  } catch (err) {
    return asState(err);
  }
  revalidateEvent(eventId);
  return OK;
}

export async function publicarEventoAction(eventId: string): Promise<EventoFichaState> {
  const tenant = await requireTenantContext();
  try {
    await publishEvent(tenant.churchId, eventId);
  } catch (err) {
    return asState(err);
  }
  revalidateEvent(eventId);
  return OK;
}

export async function despublicarEventoAction(eventId: string): Promise<EventoFichaState> {
  const tenant = await requireTenantContext();
  try {
    await unpublishEvent(tenant.churchId, eventId);
  } catch (err) {
    return asState(err);
  }
  revalidateEvent(eventId);
  return OK;
}

export async function archivarEventoAction(eventId: string, archiveActivity: boolean): Promise<EventoFichaState> {
  const tenant = await requireTenantContext();
  try {
    await archiveEvent(tenant.churchId, eventId, archiveActivity);
  } catch (err) {
    return asState(err);
  }
  revalidateEvent(eventId);
  return OK;
}

export async function cancelarInscripcionAction(
  eventId: string,
  registrationId: string,
  reason?: string,
): Promise<EventoFichaState> {
  const tenant = await requireTenantContext();
  try {
    await adminCancelRegistration(tenant.churchId, registrationId, reason);
  } catch (err) {
    return asState(err);
  }
  revalidateEvent(eventId);
  return OK;
}

/**
 * Comunicaciones (Fase 6 §33-ish): la RPC pública `notify_event_registrants`
 * construye su propio payload internamente vía `app.event_notification_payload`
 * y no acepta texto libre — solo admite los event_type estándar del check de
 * `notification_events.event_type`. No hay forma de enviar un "mensaje
 * personalizado administrativo" con esta RPC sin fingir que hace algo que no
 * hace, así que aquí solo se exponen los tipos estándar.
 */
export async function enviarComunicacionAction(
  eventId: string,
  eventType: "event.published" | "event.cancelled" | "event.rescheduled" | "event.reminder",
  includeStatuses: ("confirmed" | "waitlisted" | "cancelled")[],
): Promise<EventoFichaState & { sent?: number }> {
  await requireTenantContext();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("notify_event_registrants", {
    p_event_id: eventId,
    p_event_type: eventType,
    p_include_statuses: includeStatuses,
  });

  if (error) {
    if (error.code === "42501") return { error: "No tienes permiso para enviar comunicaciones de este evento." };
    return { error: "No se pudo enviar la comunicación." };
  }

  revalidateEvent(eventId);
  return { error: null, sent: data ?? 0 };
}
