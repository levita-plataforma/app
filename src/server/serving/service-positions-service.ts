import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";

/**
 * Puestos operativos dentro de un área (Fase 3 §9). Describen QUÉ hay que
 * cubrir, nunca QUIÉN lo cubre un día concreto (eso sería scheduling, fuera
 * del alcance de esta fase).
 */

export type ServicePosition = {
  id: string;
  areaId: string;
  areaName: string;
  name: string;
  description: string | null;
  active: boolean;
  critical: boolean;
  minPeople: number;
  maxPeople: number | null;
  requiresAutonomousPerson: boolean;
  sortOrder: number;
  campusId: string | null;
  campusName: string | null;
  archivedAt: string | null;
};

export async function listPositions(
  churchId: string,
  areaId?: string,
  includeArchived = false,
): Promise<ServicePosition[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("service_positions")
    .select(
      "id, service_area_id, name, description, active, critical, min_people, max_people, requires_autonomous_person, sort_order, campus_id, archived_at, service_areas(name), campuses(name)",
    )
    .eq("church_id", churchId);

  if (areaId) query = query.eq("service_area_id", areaId);
  if (!includeArchived) query = query.is("archived_at", null);

  const { data, error } = await query.order("sort_order").order("name");
  if (error || !data) return [];

  return data.map(mapPosition);
}

function mapPosition(row: {
  id: string;
  service_area_id: string;
  name: string;
  description: string | null;
  active: boolean;
  critical: boolean;
  min_people: number;
  max_people: number | null;
  requires_autonomous_person: boolean;
  sort_order: number;
  campus_id: string | null;
  archived_at: string | null;
  service_areas: { name: string } | { name: string }[] | null;
  campuses: { name: string } | { name: string }[] | null;
}): ServicePosition {
  const area = Array.isArray(row.service_areas) ? row.service_areas[0] : row.service_areas;
  const campus = Array.isArray(row.campuses) ? row.campuses[0] : row.campuses;
  return {
    id: row.id,
    areaId: row.service_area_id,
    areaName: area?.name ?? "",
    name: row.name,
    description: row.description,
    active: row.active,
    critical: row.critical,
    minPeople: row.min_people,
    maxPeople: row.max_people,
    requiresAutonomousPerson: row.requires_autonomous_person,
    sortOrder: row.sort_order,
    campusId: row.campus_id,
    campusName: campus?.name ?? null,
    archivedAt: row.archived_at,
  };
}

export async function getPosition(churchId: string, positionId: string): Promise<ServicePosition | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_positions")
    .select(
      "id, service_area_id, name, description, active, critical, min_people, max_people, requires_autonomous_person, sort_order, campus_id, archived_at, service_areas(name), campuses(name)",
    )
    .eq("church_id", churchId)
    .eq("id", positionId)
    .maybeSingle();

  if (error || !data) return null;
  return mapPosition(data);
}

export type CreatePositionInput = {
  name: string;
  description?: string;
  critical?: boolean;
  minPeople?: number;
  maxPeople?: number | null;
  requiresAutonomousPerson?: boolean;
  campusId?: string;
};

export async function createPosition(
  churchId: string,
  areaId: string,
  input: CreatePositionInput,
): Promise<{ positionId: string }> {
  await requireCapability(churchId, "service_positions.manage", "service_area", areaId);

  const name = input.name.trim();
  if (!name) throw new DomainError("VALIDATION_ERROR", "El nombre del puesto es obligatorio.");

  const minPeople = input.minPeople ?? 1;
  const maxPeople = input.maxPeople ?? null;
  if (minPeople < 0) throw new DomainError("VALIDATION_ERROR", "El mínimo de personas no puede ser negativo.");
  if (maxPeople !== null && maxPeople < minPeople) {
    throw new DomainError("VALIDATION_ERROR", "El máximo de personas no puede ser menor que el mínimo.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_positions")
    .insert({
      church_id: churchId,
      service_area_id: areaId,
      name,
      description: input.description?.trim() || null,
      critical: input.critical ?? false,
      min_people: minPeople,
      max_people: maxPeople,
      requires_autonomous_person: input.requiresAutonomousPerson ?? false,
      campus_id: input.campusId || null,
    })
    .select("id")
    .single();

  if (error || !data) throw new DomainError("INTERNAL_ERROR", "No se pudo crear el puesto.");

  await auditLog({
    churchId,
    action: "service_position.created",
    entityType: "service_positions",
    entityId: data.id,
    metadata: { name, service_area_id: areaId },
  });

  return { positionId: data.id };
}

export type UpdatePositionInput = CreatePositionInput & { active?: boolean };

export async function updatePosition(
  churchId: string,
  positionId: string,
  input: Partial<UpdatePositionInput>,
): Promise<void> {
  const position = await getPosition(churchId, positionId);
  if (!position) throw new DomainError("RESOURCE_NOT_FOUND", "El puesto no existe.");
  await requireCapability(churchId, "service_positions.manage", "service_area", position.areaId);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new DomainError("VALIDATION_ERROR", "El nombre del puesto es obligatorio.");
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = input.description.trim() || null;
  if (input.critical !== undefined) patch.critical = input.critical;
  if (input.minPeople !== undefined) patch.min_people = input.minPeople;
  if (input.maxPeople !== undefined) patch.max_people = input.maxPeople;
  if (input.requiresAutonomousPerson !== undefined) {
    patch.requires_autonomous_person = input.requiresAutonomousPerson;
  }
  if (input.campusId !== undefined) patch.campus_id = input.campusId || null;
  if (input.active !== undefined) patch.active = input.active;
  if (Object.keys(patch).length === 0) return;

  const min = (patch.min_people as number | undefined) ?? position.minPeople;
  const max = patch.max_people === undefined ? position.maxPeople : (patch.max_people as number | null);
  if (max !== null && max < min) {
    throw new DomainError("VALIDATION_ERROR", "El máximo de personas no puede ser menor que el mínimo.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("service_positions")
    .update(patch)
    .eq("church_id", churchId)
    .eq("id", positionId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo actualizar el puesto.");

  await auditLog({
    churchId,
    action: "service_position.updated",
    entityType: "service_positions",
    entityId: positionId,
    metadata: patch,
  });
}

export async function archivePosition(churchId: string, positionId: string): Promise<void> {
  const position = await getPosition(churchId, positionId);
  if (!position) throw new DomainError("RESOURCE_NOT_FOUND", "El puesto no existe.");
  await requireCapability(churchId, "service_positions.manage", "service_area", position.areaId);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("service_positions")
    .update({ archived_at: new Date().toISOString(), active: false })
    .eq("church_id", churchId)
    .eq("id", positionId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo archivar el puesto.");

  await auditLog({
    churchId,
    action: "service_position.archived",
    entityType: "service_positions",
    entityId: positionId,
  });
}
