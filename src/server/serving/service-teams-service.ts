import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";

/**
 * Equipos permanentes dentro de un área (Fase 3 §8). No implementan
 * rotación ni calendario: eso queda explícitamente fuera de esta fase.
 */

export type TeamMember = {
  id: string;
  personId: string;
  firstName: string;
  lastName: string | null;
  isLeader: boolean;
  joinedAt: string;
};

export type ServiceTeamListItem = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  areaId: string;
  areaName: string;
  campusId: string | null;
  campusName: string | null;
  archivedAt: string | null;
  members: TeamMember[];
};

export type ServiceTeamFilters = {
  search?: string;
  areaId?: string;
  campusId?: string;
  archived?: boolean;
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 25;

export async function listTeams(
  churchId: string,
  filters: ServiceTeamFilters = {},
): Promise<{ items: ServiceTeamListItem[]; total: number; page: number; pageSize: number }> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = [25, 50, 100].includes(filters.pageSize ?? DEFAULT_PAGE_SIZE)
    ? (filters.pageSize ?? DEFAULT_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("service_teams")
    .select(
      "id, name, description, active, sort_order, service_area_id, campus_id, archived_at, service_areas(name), campuses(name)",
      { count: "exact" },
    )
    .eq("church_id", churchId);

  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filters.areaId) query = query.eq("service_area_id", filters.areaId);
  if (filters.campusId) query = query.eq("campus_id", filters.campusId);
  if (filters.search?.trim()) query = query.ilike("name", `%${filters.search.trim()}%`);

  const { data, count, error } = await query.order("name").range(from, to);
  if (error || !data) return { items: [], total: 0, page, pageSize };

  const membersByTeam = await loadTeamMembers(churchId, data.map((t) => t.id as string));

  const items: ServiceTeamListItem[] = data.map((row) => {
    const area = Array.isArray(row.service_areas) ? row.service_areas[0] : row.service_areas;
    const campus = Array.isArray(row.campuses) ? row.campuses[0] : row.campuses;
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      active: row.active,
      sortOrder: row.sort_order,
      areaId: row.service_area_id,
      areaName: (area?.name as string) ?? "",
      campusId: row.campus_id,
      campusName: (campus?.name as string | null) ?? null,
      archivedAt: row.archived_at,
      members: membersByTeam.get(row.id) ?? [],
    };
  });

  return { items, total: count ?? items.length, page, pageSize };
}

async function loadTeamMembers(churchId: string, teamIds: string[]) {
  const byTeam = new Map<string, TeamMember[]>();
  if (teamIds.length === 0) return byTeam;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("service_team_members")
    .select("id, service_team_id, person_id, is_leader, joined_at, people(first_name, last_name)")
    .eq("church_id", churchId)
    .in("service_team_id", teamIds)
    .is("left_at", null);

  for (const row of data ?? []) {
    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    const list = byTeam.get(row.service_team_id as string) ?? [];
    list.push({
      id: row.id as string,
      personId: row.person_id as string,
      firstName: (person?.first_name as string) ?? "",
      lastName: (person?.last_name as string | null) ?? null,
      isLeader: Boolean(row.is_leader),
      joinedAt: row.joined_at as string,
    });
    byTeam.set(row.service_team_id as string, list);
  }
  return byTeam;
}

export async function getTeam(churchId: string, teamId: string): Promise<ServiceTeamListItem | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_teams")
    .select(
      "id, name, description, active, sort_order, service_area_id, campus_id, archived_at, service_areas(name), campuses(name)",
    )
    .eq("church_id", churchId)
    .eq("id", teamId)
    .maybeSingle();

  if (error || !data) return null;

  const membersByTeam = await loadTeamMembers(churchId, [teamId]);
  const area = Array.isArray(data.service_areas) ? data.service_areas[0] : data.service_areas;
  const campus = Array.isArray(data.campuses) ? data.campuses[0] : data.campuses;

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    active: data.active,
    sortOrder: data.sort_order,
    areaId: data.service_area_id,
    areaName: (area?.name as string) ?? "",
    campusId: data.campus_id,
    campusName: (campus?.name as string | null) ?? null,
    archivedAt: data.archived_at,
    members: membersByTeam.get(teamId) ?? [],
  };
}

/** Equipos a los que pertenece una persona, para la ficha de persona. */
export async function listTeamsForPerson(
  churchId: string,
  personId: string,
): Promise<{ teamId: string; teamName: string; areaName: string; isLeader: boolean }[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_team_members")
    .select("service_team_id, is_leader, service_teams(name, service_areas(name))")
    .eq("church_id", churchId)
    .eq("person_id", personId)
    .is("left_at", null);

  if (error || !data) return [];

  return data.map((row) => {
    const team = Array.isArray(row.service_teams) ? row.service_teams[0] : row.service_teams;
    const area = Array.isArray(team?.service_areas) ? team?.service_areas[0] : team?.service_areas;
    return {
      teamId: row.service_team_id as string,
      teamName: (team?.name as string) ?? "",
      areaName: (area?.name as string) ?? "",
      isLeader: Boolean(row.is_leader),
    };
  });
}

export type CreateTeamInput = {
  areaId: string;
  name: string;
  description?: string;
  campusId?: string;
};

export async function createTeam(churchId: string, input: CreateTeamInput): Promise<{ teamId: string }> {
  if (!input.areaId) throw new DomainError("VALIDATION_ERROR", "Selecciona un área de servicio.");
  await requireCapability(churchId, "service_teams.manage", "service_area", input.areaId);

  const name = input.name.trim();
  if (!name) throw new DomainError("VALIDATION_ERROR", "El nombre del equipo es obligatorio.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_teams")
    .insert({
      church_id: churchId,
      service_area_id: input.areaId,
      name,
      description: input.description?.trim() || null,
      campus_id: input.campusId || null,
    })
    .select("id")
    .single();

  if (error || !data) throw new DomainError("INTERNAL_ERROR", "No se pudo crear el equipo.");

  await auditLog({
    churchId,
    action: "service_team.created",
    entityType: "service_teams",
    entityId: data.id,
    metadata: { name, service_area_id: input.areaId },
  });

  return { teamId: data.id };
}

export type UpdateTeamInput = {
  name?: string;
  description?: string;
  campusId?: string | null;
  active?: boolean;
  areaId?: string;
};

export async function updateTeam(churchId: string, teamId: string, input: UpdateTeamInput): Promise<void> {
  const team = await getTeam(churchId, teamId);
  if (!team) throw new DomainError("RESOURCE_NOT_FOUND", "El equipo no existe.");
  await requireCapability(churchId, "service_teams.manage", "service_area", team.areaId);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new DomainError("VALIDATION_ERROR", "El nombre del equipo es obligatorio.");
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = input.description.trim() || null;
  if (input.campusId !== undefined) patch.campus_id = input.campusId || null;
  if (input.active !== undefined) patch.active = input.active;
  if (input.areaId !== undefined) patch.service_area_id = input.areaId;
  if (Object.keys(patch).length === 0) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("service_teams")
    .update(patch)
    .eq("church_id", churchId)
    .eq("id", teamId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo actualizar el equipo.");

  await auditLog({
    churchId,
    action: "service_team.updated",
    entityType: "service_teams",
    entityId: teamId,
    metadata: patch,
  });
}

export async function archiveTeam(churchId: string, teamId: string): Promise<void> {
  const team = await getTeam(churchId, teamId);
  if (!team) throw new DomainError("RESOURCE_NOT_FOUND", "El equipo no existe.");
  await requireCapability(churchId, "service_teams.manage", "service_area", team.areaId);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("service_teams")
    .update({ archived_at: new Date().toISOString(), active: false })
    .eq("church_id", churchId)
    .eq("id", teamId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo archivar el equipo.");

  await auditLog({
    churchId,
    action: "service_team.updated",
    entityType: "service_teams",
    entityId: teamId,
    metadata: { archived: true },
  });
}

export async function addTeamMember(
  churchId: string,
  teamId: string,
  personId: string,
  isLeader = false,
): Promise<void> {
  const team = await getTeam(churchId, teamId);
  if (!team) throw new DomainError("RESOURCE_NOT_FOUND", "El equipo no existe.");
  await requireCapability(churchId, "service_teams.manage", "service_area", team.areaId);

  if (!personId) throw new DomainError("VALIDATION_ERROR", "Selecciona una persona.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("service_team_members").insert({
    church_id: churchId,
    service_team_id: teamId,
    person_id: personId,
    is_leader: isLeader,
  });

  if (error) {
    if (error.code === "23505") throw new DomainError("CONFLICT", "Esa persona ya está en el equipo.");
    throw new DomainError("INTERNAL_ERROR", "No se pudo añadir la persona al equipo.");
  }

  await auditLog({
    churchId,
    action: "service_team.member_added",
    entityType: "service_teams",
    entityId: teamId,
    metadata: { person_id: personId, is_leader: isLeader },
  });
}

export async function removeTeamMember(churchId: string, teamId: string, personId: string): Promise<void> {
  const team = await getTeam(churchId, teamId);
  if (!team) throw new DomainError("RESOURCE_NOT_FOUND", "El equipo no existe.");
  await requireCapability(churchId, "service_teams.manage", "service_area", team.areaId);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("service_team_members")
    .update({ left_at: new Date().toISOString(), status: "inactive" })
    .eq("church_id", churchId)
    .eq("service_team_id", teamId)
    .eq("person_id", personId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo quitar la persona del equipo.");

  await auditLog({
    churchId,
    action: "service_team.member_removed",
    entityType: "service_teams",
    entityId: teamId,
    metadata: { person_id: personId },
  });
}
