"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
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

/** Zona que usará la base de datos: indicada → sede → iglesia (solo para mostrar). */
async function resolveDisplayTimezone(churchId: string, campusId: string | null, override: string | null): Promise<string> {
  if (override) return override;
  const supabase = await createSupabaseServerClient();
  if (campusId) {
    const { data } = await supabase
      .from("campuses")
      .select("timezone")
      .eq("church_id", churchId)
      .eq("id", campusId)
      .maybeSingle();
    const tz = (data?.timezone as string | null)?.trim();
    if (tz) return tz;
  }
  const { data } = await supabase.from("churches").select("timezone").eq("id", churchId).maybeSingle();
  return (data?.timezone as string | null) ?? "UTC";
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
 */
export async function previewRecurrenceAction(formData: FormData): Promise<PreviewState> {
  const tenant = await requireTenantContext();
  const schedule = readSchedule(formData);
  const recurrence = readRecurrence(formData);
  if (!recurrence) return { status: "error", error: "Activa la repetición para ver la vista previa." };
  const campusId = optionalText(formData, "campusId");
  const timezone = optionalText(formData, "timezone");

  try {
    const [items, displayTz] = await Promise.all([
      previewRecurrence(tenant.churchId, {
        campusId,
        timezone,
        localStart: schedule.localStart,
        localEnd: schedule.localEnd,
        durationMinutes: schedule.durationMinutes,
        recurrence,
      }),
      resolveDisplayTimezone(tenant.churchId, campusId, timezone),
    ]);
    return { status: "ok", timezone: displayTz, items };
  } catch (err) {
    if (err instanceof DomainError) return { status: "error", error: err.message };
    throw err;
  }
}
