"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/server/errors/domain-error";
import { applyStructureToSeries } from "@/server/activities/activities-service";
import {
  addActivityArea,
  addActivityPosition,
  addPlanItem,
  removeActivityArea,
  removeActivityPosition,
  removeActivityPositionRequirement,
  removePlanItem,
  reorderPlanItems,
  saveActivityPositionRequirement,
  updateActivityArea,
  updateActivityPosition,
  updatePlanItem,
  type ActivityPositionInput,
  type PlanItemInput,
  type RequirementInput,
} from "@/server/activities/activity-structure-service";
import type { AreaRequirement } from "@/lib/activities/constants";

/**
 * Acciones de las pestañas Áreas, Puestos y Plan. Envoltorios finos sobre el
 * servicio de estructura: la autorización, el módulo, el estado editable y
 * la validación de valores los comprueba la base de datos en cada RPC.
 */

export type StructureActionState = { error: string | null };

function revalidate() {
  revalidatePath("/app/actividades/[id]", "page");
  revalidatePath("/app/calendario");
}

function fail(err: unknown): { error: string; code: string } {
  if (err instanceof DomainError) return { error: err.message, code: err.code };
  throw err;
}

async function run(fn: () => Promise<unknown>): Promise<StructureActionState> {
  try {
    await fn();
  } catch (err) {
    return { error: fail(err).error };
  }
  revalidate();
  return { error: null };
}

// ---------------------------------------------------------------------------
// Áreas
// ---------------------------------------------------------------------------

export async function addAreaAction(
  activityId: string,
  input: { serviceAreaId: string; requirement: AreaRequirement; notes: string | null; includePositions: boolean },
): Promise<StructureActionState & { positionsAdded: number; positionsSkipped: number }> {
  if (!input.serviceAreaId) return { error: "Elige un área del catálogo.", positionsAdded: 0, positionsSkipped: 0 };
  try {
    const result = await addActivityArea(activityId, {
      serviceAreaId: input.serviceAreaId,
      requirement: input.requirement,
      notes: input.notes?.trim() || null,
      includePositions: input.includePositions,
    });
    revalidate();
    return { error: null, positionsAdded: result.positionsAdded, positionsSkipped: result.positionsSkipped };
  } catch (err) {
    return { error: fail(err).error, positionsAdded: 0, positionsSkipped: 0 };
  }
}

export async function updateAreaAction(
  activityServiceAreaId: string,
  input: { requirement: AreaRequirement; notes: string | null },
): Promise<StructureActionState> {
  return run(() =>
    updateActivityArea(activityServiceAreaId, { requirement: input.requirement, notes: input.notes?.trim() || null }),
  );
}

export async function removeAreaAction(activityServiceAreaId: string): Promise<StructureActionState> {
  return run(() => removeActivityArea(activityServiceAreaId));
}

export async function applyStructureAction(
  activityId: string,
  scope: "future" | "all",
): Promise<StructureActionState & { count: number }> {
  if (scope !== "future" && scope !== "all") return { error: "Elige a qué ocurrencias aplicarla.", count: 0 };
  try {
    const count = await applyStructureToSeries(activityId, scope);
    revalidate();
    return { error: null, count: Number(count) || 0 };
  } catch (err) {
    return { error: fail(err).error, count: 0 };
  }
}

// ---------------------------------------------------------------------------
// Puestos y requisitos
// ---------------------------------------------------------------------------

function cleanPositionInput(input: ActivityPositionInput): ActivityPositionInput {
  const out: ActivityPositionInput = { ...input };
  if (typeof out.name === "string") out.name = out.name.trim();
  if (out.notes !== undefined) out.notes = out.notes?.trim() || null;
  return out;
}

export async function addPositionAction(
  activityServiceAreaId: string,
  input: ActivityPositionInput,
): Promise<StructureActionState> {
  const clean = cleanPositionInput(input);
  if (!clean.servicePositionId && !clean.name) return { error: "Indica el nombre del puesto ad-hoc." };
  return run(() => addActivityPosition(activityServiceAreaId, clean));
}

export async function updatePositionAction(
  activityPositionId: string,
  input: ActivityPositionInput,
): Promise<StructureActionState> {
  const clean = cleanPositionInput(input);
  if (clean.name !== undefined && !clean.name) return { error: "El nombre del puesto no puede quedar vacío." };
  return run(() => updateActivityPosition(activityPositionId, clean));
}

export async function removePositionAction(activityPositionId: string): Promise<StructureActionState> {
  return run(() => removeActivityPosition(activityPositionId));
}

export async function saveRequirementAction(
  activityPositionId: string,
  requirementId: string | null,
  input: RequirementInput,
): Promise<StructureActionState> {
  return run(() => saveActivityPositionRequirement(activityPositionId, requirementId, input));
}

export async function removeRequirementAction(requirementId: string): Promise<StructureActionState> {
  return run(() => removeActivityPositionRequirement(requirementId));
}

// ---------------------------------------------------------------------------
// Orden del servicio
// ---------------------------------------------------------------------------

function cleanPlanInput(input: PlanItemInput): PlanItemInput {
  const out: PlanItemInput = { ...input };
  if (typeof out.title === "string") out.title = out.title.trim();
  if (out.responsibleText !== undefined) out.responsibleText = out.responsibleText?.trim() || null;
  if (out.responsiblePersonId !== undefined) out.responsiblePersonId = out.responsiblePersonId || null;
  if (out.notes !== undefined) out.notes = out.notes?.trim() || null;
  return out;
}

export async function addPlanItemAction(activityId: string, input: PlanItemInput): Promise<StructureActionState> {
  const clean = cleanPlanInput(input);
  if (!clean.title) return { error: "Indica el título del bloque." };
  return run(() => addPlanItem(activityId, clean));
}

export async function updatePlanItemAction(planItemId: string, input: PlanItemInput): Promise<StructureActionState> {
  const clean = cleanPlanInput(input);
  if (clean.title !== undefined && !clean.title) return { error: "El título del bloque no puede quedar vacío." };
  return run(() => updatePlanItem(planItemId, clean));
}

export async function removePlanItemAction(planItemId: string): Promise<StructureActionState> {
  return run(() => removePlanItem(planItemId));
}

export async function reorderPlanAction(
  activityId: string,
  itemIds: string[],
): Promise<StructureActionState & { conflict: boolean }> {
  try {
    await reorderPlanItems(activityId, itemIds);
  } catch (err) {
    const failure = fail(err);
    return { error: failure.error, conflict: failure.code === "CONFLICT" };
  }
  revalidate();
  return { error: null, conflict: false };
}
