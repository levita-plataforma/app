import "server-only";
import { hasCapability } from "@/server/tenant/authorize";
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
 * mostrar u ocultar acciones: cada RPC vuelve a comprobarlo todo.
 */

const CAPABILITY = "assignment.manage";

async function loadManageScope(
  churchId: string,
  activity: Pick<ActivityDetail, "id" | "campusId">,
  areas: ActivityArea[],
): Promise<AssignmentManageScope> {
  const serviceAreaIds = [...new Set(areas.map((a) => a.serviceAreaId).filter((id): id is string => Boolean(id)))];
  const [church, campus, own, ...byArea] = await Promise.all([
    hasCapability(churchId, CAPABILITY),
    activity.campusId ? hasCapability(churchId, CAPABILITY, "campus", activity.campusId) : Promise.resolve(false),
    hasCapability(churchId, CAPABILITY, "activity", activity.id),
    ...serviceAreaIds.map((id) => hasCapability(churchId, CAPABILITY, "service_area", id)),
  ]);
  const byServiceAreaId: Record<string, boolean> = {};
  serviceAreaIds.forEach((id, i) => {
    byServiceAreaId[id] = byArea[i];
  });
  return { all: church || campus || own, byServiceAreaId };
}

function activityAcceptsAssignments(activity: Pick<ActivityDetail, "status" | "scheduleKind" | "endsAt">): boolean {
  if (activity.status !== "planned" && activity.status !== "published") return false;
  if (activity.scheduleKind === "flexible") return true;
  return activity.endsAt !== null && new Date(activity.endsAt).getTime() > Date.now();
}

export async function loadEquipo(
  churchId: string,
  activity: ActivityDetail,
  areas: ActivityArea[],
  servingEnabled: boolean,
): Promise<EquipoData> {
  const managePromise: Promise<AssignmentManageScope> = servingEnabled
    ? loadManageScope(churchId, activity, areas)
    : Promise.resolve({ all: false, byServiceAreaId: {} });

  const reviewPromise = managePromise.then(
    (manage): Promise<{ reviews: AssignmentReview[]; reviewError: boolean }> =>
      manage.all || Object.values(manage.byServiceAreaId).some(Boolean)
        ? reviewActivityAssignments(activity.id).then(
            (reviews) => ({ reviews, reviewError: false }),
            () => ({ reviews: [], reviewError: true }),
          )
        : Promise.resolve({ reviews: [], reviewError: false }),
  );

  const [lists, manage, review] = await Promise.all([
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
    manage,
    acceptsAssignments: servingEnabled && activityAcceptsAssignments(activity),
    loadError: lists.loadError,
    reviewError: review.reviewError,
  };
}
