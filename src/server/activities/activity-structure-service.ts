import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { callActivityRpc, one } from "@/server/activities/rpc";
import { coverageStatus, type CoverageStatusValue } from "@/lib/activities/planning";
import type { AreaRequirement, PlanItemType } from "@/lib/activities/constants";

/**
 * Estructura de servicio de una actividad (áreas, puestos, requisitos) y su
 * orden del servicio. Reutiliza el catálogo de Serving: las filas por
 * actividad son copias con snapshot; los cambios del catálogo no alteran
 * actividades ya preparadas. Sin asignaciones en Fase 4: assignedCount = 0.
 */

export type RequirementOrigin = "inherited" | "added";

export type ActivityPositionRequirement = {
  id: string;
  origin: RequirementOrigin;
  requirementType: "qualification" | "credential" | "minimum_level";
  strictness: "required" | "recommended";
  qualificationId: string | null;
  credentialTypeId: string | null;
  /** Nombre visible: catálogo actual o snapshot si no es visible/ya no existe. */
  targetName: string | null;
  minLevel: "basic" | "intermediate" | "advanced" | "expert" | null;
  minOperationalLevel: "trainee" | "assisted" | "autonomous" | "leader" | null;
  requiresCurrentValidity: boolean;
  disabled: boolean;
  /** Heredado cuyos valores difieren del snapshot del catálogo. */
  overridden: boolean;
  catalogSnapshot: Record<string, unknown> | null;
};

export type ActivityPosition = {
  id: string;
  activityServiceAreaId: string;
  servicePositionId: string | null;
  isAdHoc: boolean;
  name: string;
  description: string | null;
  critical: boolean;
  minPeople: number;
  maxPeople: number | null;
  requiresAutonomousPerson: boolean;
  notes: string | null;
  sortOrder: number;
  catalogSnapshot: Record<string, unknown> | null;
  snapshotTakenAt: string | null;
  /** Fase 4: siempre 0 (las asignaciones llegan en Fase 5). */
  assignedCount: number;
  coverage: CoverageStatusValue;
  requirements: ActivityPositionRequirement[];
};

export type ActivityArea = {
  id: string;
  serviceAreaId: string | null;
  areaName: string;
  areaCampusId: string | null;
  requirement: AreaRequirement;
  notes: string | null;
  sortOrder: number;
  positions: ActivityPosition[];
};

export type ActivityPlanItem = {
  id: string;
  itemType: PlanItemType;
  title: string;
  durationMinutes: number | null;
  startOffsetMinutes: number | null;
  responsibleText: string | null;
  responsiblePersonId: string | null;
  responsiblePersonName: string | null;
  notes: string | null;
  sortOrder: number;
};

export type StructureSummary = {
  areas: number;
  requiredAreas: number;
  positions: number;
  criticalPositions: number;
  minPeopleTotal: number;
  /** Cobertura estructural: puestos cuyo mínimo exige personas. */
  positionsRequiringPeople: number;
  assignedPeople: number;
};

const REQUIREMENT_COMPARE_KEYS = ["strictness", "min_level", "min_operational_level", "requires_current_validity"] as const;

export async function getActivityStructure(activityId: string): Promise<{ areas: ActivityArea[]; summary: StructureSummary }> {
  const supabase = await createSupabaseServerClient();

  const [{ data: areaRows }, { data: positionRows }, { data: requirementRows }] = await Promise.all([
    supabase
      .from("activity_service_areas")
      .select("id, service_area_id, area_name, area_campus_id, requirement, notes, sort_order")
      .eq("activity_id", activityId)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("activity_positions")
      .select(
        "id, activity_service_area_id, service_position_id, name, description, critical, min_people, max_people, requires_autonomous_person, notes, sort_order, catalog_snapshot, snapshot_taken_at",
      )
      .eq("activity_id", activityId)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("activity_position_requirements")
      .select(
        "id, activity_position_id, origin, requirement_type, strictness, qualification_id, credential_type_id, min_level, min_operational_level, requires_current_validity, disabled, catalog_snapshot, qualifications(name), credential_types(name)",
      )
      .eq("activity_id", activityId)
      .order("created_at"),
  ]);

  const requirementsByPosition = new Map<string, ActivityPositionRequirement[]>();
  for (const r of (requirementRows ?? []) as Record<string, unknown>[]) {
    const snapshot = (r.catalog_snapshot as Record<string, unknown> | null) ?? null;
    const overridden =
      r.origin === "inherited" &&
      snapshot !== null &&
      REQUIREMENT_COMPARE_KEYS.some((k) => (snapshot[k] ?? null) !== (r[k] ?? null));
    const requirement: ActivityPositionRequirement = {
      id: r.id as string,
      origin: r.origin as RequirementOrigin,
      requirementType: r.requirement_type as ActivityPositionRequirement["requirementType"],
      strictness: r.strictness as ActivityPositionRequirement["strictness"],
      qualificationId: (r.qualification_id as string | null) ?? null,
      credentialTypeId: (r.credential_type_id as string | null) ?? null,
      targetName:
        one(r.qualifications as { name: string } | null)?.name ??
        one(r.credential_types as { name: string } | null)?.name ??
        ((snapshot?.qualification_name ?? snapshot?.credential_type_name) as string | undefined) ??
        null,
      minLevel: (r.min_level as ActivityPositionRequirement["minLevel"]) ?? null,
      minOperationalLevel: (r.min_operational_level as ActivityPositionRequirement["minOperationalLevel"]) ?? null,
      requiresCurrentValidity: Boolean(r.requires_current_validity),
      disabled: Boolean(r.disabled),
      overridden,
      catalogSnapshot: snapshot,
    };
    const list = requirementsByPosition.get(r.activity_position_id as string) ?? [];
    list.push(requirement);
    requirementsByPosition.set(r.activity_position_id as string, list);
  }

  const positionsByArea = new Map<string, ActivityPosition[]>();
  for (const p of (positionRows ?? []) as Record<string, unknown>[]) {
    const minPeople = Number(p.min_people);
    const maxPeople = p.max_people === null ? null : Number(p.max_people);
    const position: ActivityPosition = {
      id: p.id as string,
      activityServiceAreaId: p.activity_service_area_id as string,
      servicePositionId: (p.service_position_id as string | null) ?? null,
      isAdHoc: p.catalog_snapshot === null,
      name: p.name as string,
      description: (p.description as string | null) ?? null,
      critical: Boolean(p.critical),
      minPeople,
      maxPeople,
      requiresAutonomousPerson: Boolean(p.requires_autonomous_person),
      notes: (p.notes as string | null) ?? null,
      sortOrder: Number(p.sort_order),
      catalogSnapshot: (p.catalog_snapshot as Record<string, unknown> | null) ?? null,
      snapshotTakenAt: (p.snapshot_taken_at as string | null) ?? null,
      assignedCount: 0,
      coverage: coverageStatus(minPeople, maxPeople, 0),
      requirements: requirementsByPosition.get(p.id as string) ?? [],
    };
    const list = positionsByArea.get(position.activityServiceAreaId) ?? [];
    list.push(position);
    positionsByArea.set(position.activityServiceAreaId, list);
  }

  const areas: ActivityArea[] = ((areaRows ?? []) as Record<string, unknown>[]).map((a) => ({
    id: a.id as string,
    serviceAreaId: (a.service_area_id as string | null) ?? null,
    areaName: a.area_name as string,
    areaCampusId: (a.area_campus_id as string | null) ?? null,
    requirement: a.requirement as AreaRequirement,
    notes: (a.notes as string | null) ?? null,
    sortOrder: Number(a.sort_order),
    positions: positionsByArea.get(a.id as string) ?? [],
  }));

  const allPositions = areas.flatMap((a) => a.positions);
  return {
    areas,
    summary: {
      areas: areas.length,
      requiredAreas: areas.filter((a) => a.requirement === "required").length,
      positions: allPositions.length,
      criticalPositions: allPositions.filter((p) => p.critical).length,
      minPeopleTotal: allPositions.reduce((sum, p) => sum + p.minPeople, 0),
      positionsRequiringPeople: allPositions.filter((p) => p.minPeople > 0).length,
      assignedPeople: 0,
    },
  };
}

export async function getActivityPlan(activityId: string): Promise<ActivityPlanItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("activity_plan_items")
    .select(
      "id, item_type, title, duration_minutes, start_offset_minutes, responsible_text, responsible_person_id, notes, sort_order, people(first_name, last_name, preferred_name)",
    )
    .eq("activity_id", activityId)
    .order("sort_order");
  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((row) => {
    const person = one(row.people as { first_name: string; last_name: string | null; preferred_name: string | null } | null);
    return {
      id: row.id as string,
      itemType: row.item_type as PlanItemType,
      title: row.title as string,
      durationMinutes: (row.duration_minutes as number | null) ?? null,
      startOffsetMinutes: (row.start_offset_minutes as number | null) ?? null,
      responsibleText: (row.responsible_text as string | null) ?? null,
      responsiblePersonId: (row.responsible_person_id as string | null) ?? null,
      responsiblePersonName: person
        ? [person.preferred_name || person.first_name, person.last_name].filter(Boolean).join(" ")
        : null,
      notes: (row.notes as string | null) ?? null,
      sortOrder: row.sort_order as number,
    };
  });
}

// ---------------------------------------------------------------------------
// Áreas
// ---------------------------------------------------------------------------

export async function addActivityArea(
  activityId: string,
  input: { serviceAreaId: string; requirement?: AreaRequirement; notes?: string | null; includePositions?: boolean },
): Promise<{ activityServiceAreaId: string; positionsAdded: number; positionsSkipped: number }> {
  const data = await callActivityRpc<{ activity_service_area_id: string; positions_added: number; positions_skipped: number }>(
    "add_activity_area",
    {
      p_activity_id: activityId,
      p_service_area_id: input.serviceAreaId,
      p_requirement: input.requirement ?? "required",
      p_notes: input.notes ?? null,
      p_include_positions: input.includePositions ?? true,
    },
    "No se pudo añadir el área.",
  );
  return {
    activityServiceAreaId: data.activity_service_area_id,
    positionsAdded: data.positions_added,
    positionsSkipped: data.positions_skipped,
  };
}

export async function updateActivityArea(
  activityServiceAreaId: string,
  input: Partial<{ requirement: AreaRequirement; notes: string | null; sortOrder: number }>,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (input.requirement !== undefined) payload.requirement = input.requirement;
  if (input.notes !== undefined) payload.notes = input.notes;
  if (input.sortOrder !== undefined) payload.sort_order = input.sortOrder;
  await callActivityRpc("update_activity_area", { p_activity_service_area_id: activityServiceAreaId, p_input: payload }, "No se pudo guardar el área.");
}

export async function removeActivityArea(activityServiceAreaId: string): Promise<void> {
  await callActivityRpc("remove_activity_area", { p_activity_service_area_id: activityServiceAreaId }, "No se pudo retirar el área.");
}

// ---------------------------------------------------------------------------
// Puestos
// ---------------------------------------------------------------------------

export type ActivityPositionInput = Partial<{
  servicePositionId: string | null;
  name: string;
  description: string | null;
  critical: boolean;
  minPeople: number;
  maxPeople: number | null;
  requiresAutonomousPerson: boolean;
  notes: string | null;
  sortOrder: number;
}>;

function positionPayload(input: ActivityPositionInput): Record<string, unknown> {
  const map: Record<string, string> = {
    servicePositionId: "service_position_id",
    minPeople: "min_people",
    maxPeople: "max_people",
    requiresAutonomousPerson: "requires_autonomous_person",
    sortOrder: "sort_order",
  };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    out[map[key] ?? key] = value;
  }
  return out;
}

/** servicePositionId = copia del catálogo; sin él, puesto ad-hoc (name obligatorio). */
export async function addActivityPosition(activityServiceAreaId: string, input: ActivityPositionInput): Promise<string> {
  return callActivityRpc<string>(
    "add_activity_position",
    { p_activity_service_area_id: activityServiceAreaId, p_input: positionPayload(input) },
    "No se pudo añadir el puesto.",
  );
}

export async function updateActivityPosition(activityPositionId: string, input: ActivityPositionInput): Promise<void> {
  const { servicePositionId: _ignored, ...rest } = input;
  void _ignored;
  await callActivityRpc(
    "update_activity_position",
    { p_activity_position_id: activityPositionId, p_input: positionPayload(rest) },
    "No se pudo guardar el puesto.",
  );
}

export async function removeActivityPosition(activityPositionId: string): Promise<void> {
  await callActivityRpc("remove_activity_position", { p_activity_position_id: activityPositionId }, "No se pudo retirar el puesto.");
}

// ---------------------------------------------------------------------------
// Requisitos (herencia + overrides)
// ---------------------------------------------------------------------------

export type RequirementInput = Partial<{
  requirementType: "qualification" | "credential" | "minimum_level";
  strictness: "required" | "recommended";
  qualificationId: string | null;
  credentialTypeId: string | null;
  minLevel: ActivityPositionRequirement["minLevel"];
  minOperationalLevel: ActivityPositionRequirement["minOperationalLevel"];
  requiresCurrentValidity: boolean;
  /** Solo requisitos heredados: los anula para esta actividad. */
  disabled: boolean;
}>;

/** requirementId null = añadir requisito propio; si no, override del existente. */
export async function saveActivityPositionRequirement(
  activityPositionId: string,
  requirementId: string | null,
  input: RequirementInput,
): Promise<string> {
  const map: Record<string, string> = {
    requirementType: "requirement_type",
    qualificationId: "qualification_id",
    credentialTypeId: "credential_type_id",
    minLevel: "min_level",
    minOperationalLevel: "min_operational_level",
    requiresCurrentValidity: "requires_current_validity",
  };
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    payload[map[key] ?? key] = value;
  }
  return callActivityRpc<string>(
    "save_activity_position_requirement",
    { p_activity_position_id: activityPositionId, p_requirement_id: requirementId, p_input: payload },
    "No se pudo guardar el requisito.",
  );
}

/** Solo requisitos añadidos; los heredados se desactivan con disabled. */
export async function removeActivityPositionRequirement(requirementId: string): Promise<void> {
  await callActivityRpc("remove_activity_position_requirement", { p_requirement_id: requirementId }, "No se pudo retirar el requisito.");
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export type PlanItemInput = Partial<{
  itemType: PlanItemType;
  title: string;
  durationMinutes: number | null;
  startOffsetMinutes: number | null;
  responsibleText: string | null;
  responsiblePersonId: string | null;
  notes: string | null;
  /** Índice de inserción (solo al añadir); por defecto al final. */
  position: number;
}>;

function planPayload(input: PlanItemInput): Record<string, unknown> {
  const map: Record<string, string> = {
    itemType: "item_type",
    durationMinutes: "duration_minutes",
    startOffsetMinutes: "start_offset_minutes",
    responsibleText: "responsible_text",
    responsiblePersonId: "responsible_person_id",
  };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    out[map[key] ?? key] = value;
  }
  return out;
}

export async function addPlanItem(activityId: string, input: PlanItemInput): Promise<string> {
  return callActivityRpc<string>("add_activity_plan_item", { p_activity_id: activityId, p_input: planPayload(input) }, "No se pudo añadir el bloque.");
}

export async function updatePlanItem(planItemId: string, input: PlanItemInput): Promise<void> {
  const { position: _ignored, ...rest } = input;
  void _ignored;
  await callActivityRpc("update_activity_plan_item", { p_plan_item_id: planItemId, p_input: planPayload(rest) }, "No se pudo guardar el bloque.");
}

export async function removePlanItem(planItemId: string): Promise<void> {
  await callActivityRpc("remove_activity_plan_item", { p_plan_item_id: planItemId }, "No se pudo eliminar el bloque.");
}

/** Reordenación atómica: itemIds debe contener todos los bloques actuales. */
export async function reorderPlanItems(activityId: string, itemIds: string[]): Promise<void> {
  await callActivityRpc(
    "reorder_activity_plan_items",
    { p_activity_id: activityId, p_item_ids: itemIds },
    "No se pudo guardar el nuevo orden.",
  );
}
