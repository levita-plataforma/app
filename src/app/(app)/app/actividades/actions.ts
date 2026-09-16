"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import {
  createActivity,
  previewRecurrence,
  type CreateActivityResult,
} from "@/server/activities/activities-service";
import { isActivityType, ACTIVITY_VISIBILITIES, type ActivityVisibility } from "@/lib/activities/constants";
import { optionalText, readRecurrence, readSchedule } from "./_components/form-values";

export type CreateActivityState = { error: string | null };

export type PreviewState =
  | { status: "idle" }
  | { status: "error"; error: string }
  | { status: "ok"; timezone: string; items: { occurrenceDate: string; startsAt: string; endsAt: string }[] };

function revalidateActivities() {
  revalidatePath("/app/actividades");
  revalidatePath("/app/actividades/[id]", "page");
  revalidatePath("/app/calendario");
  revalidatePath("/app");
}

function readVisibility(formData: FormData): ActivityVisibility | undefined {
  const value = String(formData.get("visibility") ?? "");
  return (ACTIVITY_VISIBILITIES as readonly string[]).includes(value) ? (value as ActivityVisibility) : undefined;
}

export async function createActivityAction(_prev: CreateActivityState, formData: FormData): Promise<CreateActivityState> {
  const tenant = await requireTenantContext();
  const type = String(formData.get("type") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return { error: "No se pudo preparar el formulario. Recarga la página." };

  const schedule = readSchedule(formData);
  const recurrence = schedule.scheduleKind === "timed" ? readRecurrence(formData) : null;
  const campusRaw = String(formData.get("campusId") ?? "");

  let result: CreateActivityResult;
  try {
    result = await createActivity(tenant.churchId, {
      requestId,
      type: isActivityType(type) ? type : undefined,
      title: optionalText(formData, "title") ?? undefined,
      description: optionalText(formData, "description"),
      campusId: campusRaw === "" ? null : campusRaw,
      scheduleKind: schedule.scheduleKind,
      localStart: schedule.localStart,
      localEnd: schedule.localEnd,
      durationMinutes: schedule.durationMinutes,
      timezone: optionalText(formData, "timezone"),
      visibility: readVisibility(formData),
      locationText: optionalText(formData, "locationText"),
      organizerPersonId: optionalText(formData, "organizerPersonId"),
      adminNotes: optionalText(formData, "adminNotes"),
      templateId: optionalText(formData, "templateId"),
      recurrence,
    });
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidateActivities();

  const query = new URLSearchParams();
  if (result.skipped.length > 0) {
    query.set(
      "omitidos",
      JSON.stringify(result.skipped.slice(0, 20).map((s) => ({ k: s.kind, n: s.name.slice(0, 80), r: s.reason }))),
    );
    if (result.skipped.length > 20) query.set("omitidosTotal", String(result.skipped.length));
  }
  if (result.occurrences && result.occurrences > 1) query.set("creadas", String(result.occurrences));
  const qs = query.toString();
  redirect(`/app/actividades/${result.activityId}${qs ? `?${qs}` : ""}`);
}

/**
 * Vista previa de repetición. Recibe el FormData del formulario (alta o
 * cambio de repetición) y devuelve instantes + la zona para mostrarlos.
 *
 * La zona NO se resuelve aquí: se pasan a SQL la sede y la zona explícita
 * (solo si el usuario la indicó) y la base de datos decide. Para mostrar las
 * filas se usa la zona que devuelva la RPC o, si no la devuelve, la que el
 * formulario ya resolvió (campo oculto "displayTimezone"). Nunca se convierte
 * hora local a UTC en TS.
 */
export async function previewRecurrenceAction(formData: FormData): Promise<PreviewState> {
  const tenant = await requireTenantContext();
  const schedule = readSchedule(formData);
  const recurrence = readRecurrence(formData);
  if (!recurrence) return { status: "error", error: "Activa la repetición para ver la vista previa." };
  const campusId = optionalText(formData, "campusId");
  const timezone = optionalText(formData, "timezone");

  try {
    const rows = await previewRecurrence(tenant.churchId, {
      campusId,
      timezone,
      localStart: schedule.localStart,
      localEnd: schedule.localEnd,
      durationMinutes: schedule.durationMinutes,
      recurrence,
    });
    const displayTz = rows[0]?.timezone ?? timezone ?? optionalText(formData, "displayTimezone") ?? "UTC";
    const items = rows.map(({ occurrenceDate, startsAt, endsAt }) => ({ occurrenceDate, startsAt, endsAt }));
    return { status: "ok", timezone: displayTz, items };
  } catch (err) {
    if (err instanceof DomainError) return { status: "error", error: err.message };
    throw err;
  }
}
