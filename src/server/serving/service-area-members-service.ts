import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Pertenencia de personas a áreas de servicio (Fase 3 §6-§7). El nivel
 * operativo es por área: la misma persona puede ser autonomous en Sonido y
 * trainee en Multimedia.
 */

// Las etiquetas en español viven en app/(app)/app/servicios/labels.ts,
// porque los componentes de cliente las necesitan y este módulo es
// server-only.
export type AreaMemberStatus = Database["public"]["Enums"]["service_area_member_status"];
export type OperationalLevel = Database["public"]["Enums"]["service_operational_level"];

export type AreaMember = {
  id: string;
  personId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  status: AreaMemberStatus;
  level: OperationalLevel;
  notes: string | null;
  joinedAt: string;
  leftAt: string | null;
};

export type AreaMemberFilters = {
  status?: AreaMemberStatus;
  level?: OperationalLevel;
  includeLeft?: boolean;
};

export async function listAreaMembers(
  churchId: string,
  areaId: string,
  filters: AreaMemberFilters = {},
): Promise<AreaMember[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("service_area_members")
    .select("id, person_id, status, level, notes, joined_at, left_at, people(first_name, last_name, email)")
    .eq("church_id", churchId)
    .eq("service_area_id", areaId);

  if (!filters.includeLeft) query = query.is("left_at", null);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.level) query = query.eq("level", filters.level);

  const { data, error } = await query.order("joined_at", { ascending: false });
  if (error || !data) return [];

  return data.map((row) => {
    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    return {
      id: row.id,
      personId: row.person_id,
      firstName: (person?.first_name as string) ?? "",
      lastName: (person?.last_name as string | null) ?? null,
      email: (person?.email as string | null) ?? null,
      status: row.status,
      level: row.level,
      notes: row.notes,
      joinedAt: row.joined_at,
      leftAt: row.left_at,
    };
  });
}

/** Áreas a las que pertenece una persona, para la ficha de persona. */
export async function listAreasForPerson(
  churchId: string,
  personId: string,
): Promise<(AreaMember & { areaId: string; areaName: string })[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_area_members")
    .select("id, person_id, service_area_id, status, level, notes, joined_at, left_at, service_areas(name)")
    .eq("church_id", churchId)
    .eq("person_id", personId)
    .is("left_at", null);

  if (error || !data) return [];

  return data.map((row) => {
    const area = Array.isArray(row.service_areas) ? row.service_areas[0] : row.service_areas;
    return {
      id: row.id,
      personId: row.person_id,
      firstName: "",
      lastName: null,
      email: null,
      status: row.status,
      level: row.level,
      notes: row.notes,
      joinedAt: row.joined_at,
      leftAt: row.left_at,
      areaId: row.service_area_id,
      areaName: (area?.name as string) ?? "",
    };
  });
}

export type AddAreaMemberInput = {
  status?: AreaMemberStatus;
  level?: OperationalLevel;
  notes?: string;
};

export async function addAreaMember(
  churchId: string,
  areaId: string,
  personId: string,
  input: AddAreaMemberInput = {},
): Promise<void> {
  await requireCapability(churchId, "service_members.manage", "service_area", areaId);

  if (!personId) throw new DomainError("VALIDATION_ERROR", "Selecciona una persona.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("service_area_members").insert({
    church_id: churchId,
    service_area_id: areaId,
    person_id: personId,
    status: input.status ?? "active",
    level: input.level ?? "trainee",
    notes: input.notes?.trim() || null,
  });

  if (error) {
    if (error.code === "23505") throw new DomainError("CONFLICT", "Esa persona ya pertenece al área.");
    throw new DomainError("INTERNAL_ERROR", "No se pudo añadir la persona al área.");
  }

  await auditLog({
    churchId,
    action: "service_area.member_added",
    entityType: "service_areas",
    entityId: areaId,
    metadata: { person_id: personId, status: input.status ?? "active", level: input.level ?? "trainee" },
  });
}

export type UpdateAreaMemberInput = {
  status?: AreaMemberStatus;
  level?: OperationalLevel;
  notes?: string;
};

export async function updateAreaMember(
  churchId: string,
  areaId: string,
  personId: string,
  input: UpdateAreaMemberInput,
): Promise<void> {
  await requireCapability(churchId, "service_members.manage", "service_area", areaId);

  const patch: Record<string, unknown> = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.level !== undefined) patch.level = input.level;
  if (input.notes !== undefined) patch.notes = input.notes.trim() || null;
  if (Object.keys(patch).length === 0) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("service_area_members")
    .update(patch)
    .eq("church_id", churchId)
    .eq("service_area_id", areaId)
    .eq("person_id", personId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo actualizar la pertenencia al área.");

  await auditLog({
    churchId,
    action: "service_area.updated",
    entityType: "service_area_members",
    entityId: areaId,
    metadata: { person_id: personId, updated: Object.keys(patch) },
  });
}

export async function removeAreaMember(churchId: string, areaId: string, personId: string): Promise<void> {
  await requireCapability(churchId, "service_members.manage", "service_area", areaId);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("service_area_members")
    .update({ left_at: new Date().toISOString(), status: "inactive" })
    .eq("church_id", churchId)
    .eq("service_area_id", areaId)
    .eq("person_id", personId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo quitar la persona del área.");

  await auditLog({
    churchId,
    action: "service_area.member_removed",
    entityType: "service_areas",
    entityId: areaId,
    metadata: { person_id: personId },
  });
}
