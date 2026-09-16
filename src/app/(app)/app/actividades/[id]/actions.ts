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
  const organizerRaw = String(formData.get("organizerPersonId") ?? "").trim();
  // Sede y responsable solo se envían si cambiaron: la sede actual puede estar
  // archivada o el responsable fuera de la lista, y reenviarlos (o perderlos)
  // alteraría la actividad o la serie sin que el usuario lo pida.
  const campusChanged = campusRaw !== String(formData.get("originalCampusId") ?? "");
  const organizerChanged = organizerRaw !== String(formData.get("originalOrganizerPersonId") ?? "");
  const common = {
    title: String(formData.get("title") ?? "").trim(),
    description: optionalText(formData, "description"),
    type: isActivityType(type) ? type : undefined,
    visibility: readVisibility(formData),
    locationText: optionalText(formData, "locationText"),
    organizerPersonId: organizerChanged ? organizerRaw || null : undefined,
    campusId: campusChanged ? (campusRaw === "" ? null : campusRaw) : undefined,
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
      else if (campusChanged) input.timezone = null;
    }
    // Solo si el usuario las cambió: evita sobrescribirlas con un valor desfasado.
    if (formData.has("adminNotes") && formData.get("adminNotesDirty") === "1") {
      input.adminNotes = optionalText(formData, "adminNotes");
    }
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
  if (formData.get("adminNotesDirty") !== "1") return { error: null, message: "No hay cambios en las notas." };
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

  let stillExists: boolean;
  try {
    stillExists = Boolean(await getActivity(tenant.churchId, activityId));
  } catch (err) {
    // La regla ya se aplicó; si no se puede comprobar la ocurrencia, se informa sin redirigir.
    if (err instanceof DomainError) {
      return { error: null, message: "Repetición actualizada. Recarga la página para ver el resultado." };
    }
    throw err;
  }
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
