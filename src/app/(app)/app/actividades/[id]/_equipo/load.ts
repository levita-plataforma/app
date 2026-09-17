import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import type { ActivityDetail } from "@/server/activities/activities-service";
import type { ActivityArea } from "@/server/activities/activity-structure-service";
import {
  listActivityAssignments,
  listSubstitutionRequests,
  reviewActivityAssignments,
  type ActivityAssignment,
  type AssignmentReview,
  type SubstitutionRequest,
} from "@/server/assignments/assignments-service";
import type { AssignmentManageScope, EquipoData } from "./types";

/**
 * Carga de la pestaña Equipo. Los permisos calculados aquí solo sirven para
 * mostrar u ocultar acciones: cada RPC vuelve a comprobarlo todo. Nada de lo
 * que se carga aquí debe tumbar la ficha: cada fallo se marca en EquipoData.
 */

const CAPABILITY = "assignment.manage";
const NO_MANAGE: AssignmentManageScope = { all: false, byServiceAreaId: {} };

/**
 * Como hasCapability, pero sin ocultar los errores: si la comprobación falla
 * lanza, para que la pestaña distinga «sin permiso» de «no se pudo comprobar».
 */
async function checkCapability(churchId: string, scopeType: string, scopeId?: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("has_capability", {
    p_church_id: churchId,
    p_capability: CAPABILITY,
    p_scope_type: scopeType,
    p_scope_id: scopeId ?? null,
  });
  if (error) throw new Error(`No se pudo comprobar ${CAPABILITY} (${scopeType}): ${error.message}`);
  return Boolean(data);
}

async function loadManageScope(
  churchId: string,
  activity: Pick<ActivityDetail, "id" | "campusId">,
  areas: ActivityArea[],
): Promise<AssignmentManageScope> {
  const serviceAreaIds = [...new Set(areas.map((a) => a.serviceAreaId).filter((id): id is string => Boolean(id)))];
  const [church, campus, own, ...byArea] = await Promise.all([
    checkCapability(churchId, "church"),
    activity.campusId ? checkCapability(churchId, "campus", activity.campusId) : Promise.resolve(false),
    checkCapability(churchId, "activity", activity.id),
    ...serviceAreaIds.map((id) => checkCapability(churchId, "service_area", id)),
  ]);
  const byServiceAreaId: Record<string, boolean> = {};
  serviceAreaIds.forEach((id, i) => {
    byServiceAreaId[id] = byArea[i];
  });
  return { all: church || campus || own, byServiceAreaId };
}

/**
 * Misma regla que app.activity_accepts_assignments_unchecked: planificada o
 * publicada y, con horario, fin en el futuro; flexible, sin fin o con el fin
 * en el futuro.
 */
function activityAcceptsAssignments(activity: Pick<ActivityDetail, "status" | "scheduleKind" | "endsAt">): boolean {
  if (activity.status !== "planned" && activity.status !== "published") return false;
  const endsInFuture = activity.endsAt !== null && new Date(activity.endsAt).getTime() > Date.now();
  if (activity.scheduleKind === "flexible") return activity.endsAt === null || endsInFuture;
  return endsInFuture;
}

export async function loadEquipo(
  churchId: string,
  activity: ActivityDetail,
  areas: ActivityArea[],
  servingEnabled: boolean,
): Promise<EquipoData> {
  const managePromise: Promise<{ manage: AssignmentManageScope; permissionsError: boolean }> = servingEnabled
    ? loadManageScope(churchId, activity, areas).then(
        (manage) => ({ manage, permissionsError: false }),
        () => ({ manage: NO_MANAGE, permissionsError: true }),
      )
    : Promise.resolve({ manage: NO_MANAGE, permissionsError: false });

  const reviewPromise = managePromise.then(
    ({ manage }): Promise<{ reviews: AssignmentReview[]; reviewError: boolean }> =>
      manage.all || Object.values(manage.byServiceAreaId).some(Boolean)
        ? reviewActivityAssignments(activity.id).then(
            (reviews) => ({ reviews, reviewError: false }),
            () => ({ reviews: [], reviewError: true }),
          )
        : Promise.resolve({ reviews: [], reviewError: false }),
  );

  const [lists, scope, review] = await Promise.all([
    // Si fallan las lecturas, la ficha sigue cargando y la pestaña lo indica.
    Promise.all([listActivityAssignments(activity.id), listSubstitutionRequests(activity.id)]).then(
      ([assignments, substitutions]) => ({ assignments, substitutions, loadError: false }),
      () => ({ assignments: [] as ActivityAssignment[], substitutions: [] as SubstitutionRequest[], loadError: true }),
    ),
    managePromise,
    reviewPromise,
  ]);

  return {
    assignments: lists.assignments,
    substitutions: lists.substitutions,
    reviews: review.reviews,
    manage: scope.manage,
    acceptsAssignments: servingEnabled && activityAcceptsAssignments(activity),
    loadError: lists.loadError,
    reviewError: review.reviewError,
    permissionsError: scope.permissionsError,
  };
}

/** Datos de la pestaña cuando su carga no se pudo completar (la ficha sigue funcionando). */
export function failedEquipo(): EquipoData {
  return {
    assignments: [],
    substitutions: [],
    reviews: [],
    manage: NO_MANAGE,
    acceptsAssignments: false,
    loadError: true,
    reviewError: false,
    permissionsError: false,
  };
}
