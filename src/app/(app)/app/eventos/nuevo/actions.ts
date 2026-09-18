"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import {
  createEventFromActivity,
  createEventFromScratch,
  type EventContentInput,
  type EventVisibility,
  type EventRegistrationType,
} from "@/server/events/events-service";
import type { ActivityVisibility } from "@/lib/activities/constants";

export type NuevoEventoState = { error: string | null };

function revalidateEvents() {
  revalidatePath("/app/eventos");
  revalidatePath("/app/calendario");
}

function optionalText(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (raw === null) return undefined;
  const value = String(raw).trim();
  return value === "" ? undefined : value;
}

function readEventContent(formData: FormData): EventContentInput {
  const visibilityRaw = String(formData.get("eventVisibility") ?? "");
  const registrationTypeRaw = String(formData.get("registrationType") ?? "");
  const capacityRaw = optionalText(formData, "capacity");
  const maxWaitlistRaw = optionalText(formData, "maxWaitlist");

  return {
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
}

/** Crea el evento desde cero (activity + events en un solo flujo). */
export async function crearEventoDesdeCeroAction(
  _prev: NuevoEventoState,
  formData: FormData,
): Promise<NuevoEventoState> {
  const tenant = await requireTenantContext();
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return { error: "No se pudo preparar el formulario. Recarga la página." };

  const title = optionalText(formData, "title");
  if (!title) return { error: "El título es obligatorio." };

  const localStart = optionalText(formData, "localStart");
  const localEnd = optionalText(formData, "localEnd");
  if (!localStart || !localEnd) return { error: "Indica fecha y hora de inicio y fin." };

  const activityVisibilityRaw = String(formData.get("activityVisibility") ?? "members");

  let eventId: string;
  try {
    const result = await createEventFromScratch(
      tenant.churchId,
      {
        requestId,
        title,
        description: optionalText(formData, "description") ?? null,
        campusId: optionalText(formData, "campusId") ?? null,
        localStart,
        localEnd,
        timezone: optionalText(formData, "timezone") ?? null,
        visibility: activityVisibilityRaw as ActivityVisibility,
        locationText: optionalText(formData, "locationText") ?? null,
        organizerPersonId: optionalText(formData, "organizerPersonId") ?? null,
      },
      readEventContent(formData),
    );
    eventId = result.eventId;
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidateEvents();
  redirect(`/app/eventos/${eventId}`);
}

/** Crea el comportamiento de evento sobre una activity type='event' ya existente. */
export async function crearEventoDesdeActividadAction(
  _prev: NuevoEventoState,
  formData: FormData,
): Promise<NuevoEventoState> {
  const tenant = await requireTenantContext();
  const activityId = optionalText(formData, "activityId");
  if (!activityId) return { error: "Selecciona una actividad." };

  let eventId: string;
  try {
    const result = await createEventFromActivity(tenant.churchId, activityId, readEventContent(formData));
    eventId = result.eventId;
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidateEvents();
  redirect(`/app/eventos/${eventId}`);
}
