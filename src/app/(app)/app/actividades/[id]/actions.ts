"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import {
  duplicateActivity,
  getActivity,
  transitionActivityStatus,
  updateActivity,
  updateActivitySeries,
  updateActivitySeriesRule,
  type UpdateActivityInput,
} from "@/server/activities/activities-service";
import {
  ACTIVITY_VISIBILITIES,
  isActivityStatus,
  isActivityType,
  type ActivityStatus,
  type ActivityVisibility,
} from "@/lib/activities/constants";
import { optionalText, readRecurrence, readSchedule } from "../_components/form-values";

export type FichaActionState = { error: string | null; message?: string | null };

function revalidateActivities() {
  revalidatePath("/app/actividades");
  revalidatePath("/app/actividades/[id]", "page");
  revalidatePath("/app/calendario");
  revalidatePath("/app");
}

function fail(err: unknown): FichaActionState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

function readVisibility(formData: FormData): ActivityVisibility | undefined {
  const value = String(formData.get("visibility") ?? "");
  return (ACTIVITY_VISIBILITIES as readonly string[]).includes(value) ? (value as ActivityVisibility) : undefined;
}

/**
 * Guarda la edición. Con scope "future"/"all" edita la serie (solo campos
 * permitidos, sin fechas); sin scope o "this", solo esta actividad/ocurrencia.
 */
export async function updateActivityAction(
  activityId: string,
  _prev: FichaActionState,
  formData: FormData,
): Promise<FichaActionState> {
  await requireTenantContext();
  const scope = String(formData.get("scope") ?? "this");
  const type = String(formData.get("type") ?? "");
  const campusRaw = String(formData.get("campusId") ?? "");
  const common = {
    title: String(formData.get("title") ?? "").trim(),
    description: optionalText(formData, "description"),
    type: isActivityType(type) ? type : undefined,
    visibility: readVisibility(formData),
    locationText: optionalText(formData, "locationText"),
    organizerPersonId: optionalText(formData, "organizerPersonId"),
    campusId: campusRaw === "" ? null : campusRaw,
  };

  try {
    if (scope === "future" || scope === "all") {
      const timeDirty = formData.get("timeDirty") === "1";
      const startTime = String(formData.get("startTime") ?? "").trim();
      const duration = Number(formData.get("durationMinutes") ?? "");
      const result = await updateActivitySeries(
        activityId,
        {
          ...common,
          localStartTime: timeDirty && startTime ? startTime : undefined,
          durationMinutes: timeDirty && Number.isFinite(duration) && duration > 0 ? Math.trunc(duration) : undefined,
        },
        scope,
      );
      revalidateActivities();
      return {
        error: null,
        message: `Serie actualizada: ${result.updated} ocurrencia${result.updated === 1 ? "" : "s"} modificada${result.updated === 1 ? "" : "s"}.`,
      };
    }

    const input: UpdateActivityInput = { ...common };
    if (formData.get("scheduleDirty") === "1") {
      const schedule = readSchedule(formData);
      input.scheduleKind = schedule.scheduleKind;
      input.localStart = schedule.localStart;
      input.localEnd = schedule.localEnd;
      input.durationMinutes = schedule.durationMinutes;
      const tz = optionalText(formData, "timezone");
      if (tz) input.timezone = tz;
      else if (campusRaw !== String(formData.get("originalCampusId") ?? "")) input.timezone = null;
    }
    if (formData.has("adminNotes")) input.adminNotes = optionalText(formData, "adminNotes");
    await updateActivity(activityId, input);
  } catch (err) {
    return fail(err);
  }
  revalidateActivities();
  return { error: null, message: "Cambios guardados." };
}

export async function saveAdminNotesAction(
  activityId: string,
  _prev: FichaActionState,
  formData: FormData,
): Promise<FichaActionState> {
  await requireTenantContext();
  try {
    await updateActivity(activityId, { adminNotes: optionalText(formData, "adminNotes") });
  } catch (err) {
    return fail(err);
  }
  revalidateActivities();
  return { error: null, message: "Notas guardadas." };
}

export async function transitionActivityAction(
  activityId: string,
  to: ActivityStatus,
  reason?: string | null,
): Promise<FichaActionState> {
  await requireTenantContext();
  if (!isActivityStatus(to)) return { error: "Estado no válido." };
  try {
    await transitionActivityStatus(activityId, to, reason ?? null);
  } catch (err) {
    return fail(err);
  }
  revalidateActivities();
  return { error: null };
}

export async function changeSeriesRuleAction(
  activityId: string,
  _prev: FichaActionState,
  formData: FormData,
): Promise<FichaActionState> {
  const tenant = await requireTenantContext();
  const rule = readRecurrence(formData);
  if (!rule) return { error: "Indica la regla de repetición." };

  let result: Awaited<ReturnType<typeof updateActivitySeriesRule>>;
  try {
    result = await updateActivitySeriesRule(activityId, rule);
  } catch (err) {
    return fail(err);
  }
  revalidateActivities();

  const stillExists = await getActivity(tenant.churchId, activityId);
  if (!stillExists) {
    redirect(result.firstActivityId ? `/app/actividades/${result.firstActivityId}` : "/app/actividades");
  }
  const parts = [
    `${result.created} creada${result.created === 1 ? "" : "s"}`,
    `${result.updated} actualizada${result.updated === 1 ? "" : "s"}`,
    `${result.removed} eliminada${result.removed === 1 ? "" : "s"}`,
    `${result.cancelled} cancelada${result.cancelled === 1 ? "" : "s"} (estaban publicadas)`,
  ];
  return { error: null, message: `Repetición actualizada: ${parts.join(", ")}.` };
}

export async function duplicateActivityAction(
  activityId: string,
  _prev: FichaActionState,
  formData: FormData,
): Promise<FichaActionState> {
  await requireTenantContext();
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) return { error: "No se pudo preparar el formulario. Recarga la página." };
  const date = String(formData.get("newDate") ?? "").trim();
  const time = String(formData.get("newTime") ?? "").trim();

  let newId: string;
  try {
    const result = await duplicateActivity(activityId, {
      requestId,
      localStart: date && time ? `${date}T${time}` : null,
      title: optionalText(formData, "title"),
    });
    newId = result.activityId;
  } catch (err) {
    return fail(err);
  }
  revalidateActivities();
  redirect(`/app/actividades/${newId}`);
}
