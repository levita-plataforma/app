import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";

/**
 * Áreas de servicio (Fase 3 §2-§4). Un área es una unidad operativa de la
 * iglesia (Sonido, Bienvenida...), no un rol global: el liderazgo se
 * expresa en service_area_leaders y el permiso efectivo se evalúa con
 * scope_type='service_area' en app.has_capability.
 */

export type ServiceAreaListItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  accentColor: string | null;
  active: boolean;
  sortOrder: number;
  campusId: string | null;
  campusName: string | null;
  archivedAt: string | null;
  leaders: { personId: string; firstName: string; lastName: string | null; isPrimary: boolean }[];
  memberCount: number;
  positionCount: number;
};

export type ServiceAreaFilters = {
  search?: string;
  campusId?: string;
  active?: boolean;
  archived?: boolean;
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 25;

function normalizePageSize(pageSize?: number): number {
  return [25, 50, 100].includes(pageSize ?? DEFAULT_PAGE_SIZE)
    ? (pageSize ?? DEFAULT_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
}

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function listServiceAreas(
  churchId: string,
  filters: ServiceAreaFilters = {},
): Promise<{ items: ServiceAreaListItem[]; total: number; page: number; pageSize: number }> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = normalizePageSize(filters.pageSize);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("service_areas")
    .select(
      "id, name, slug, description, icon, accent_color, active, sort_order, campus_id, archived_at, campuses(name)",
      { count: "exact" },
    )
    .eq("church_id", churchId);

  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filters.active !== undefined) query = query.eq("active", filters.active);
  if (filters.campusId) query = query.eq("campus_id", filters.campusId);
  if (filters.search?.trim()) query = query.ilike("name", `%${filters.search.trim()}%`);

  const { data, count, error } = await query
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .range(from, to);

  if (error || !data) return { items: [], total: 0, page, pageSize };

  const areaIds = data.map((a) => a.id as string);
  const [leadersByArea, memberCounts, positionCounts] = await Promise.all([
    loadLeaders(churchId, areaIds),
    countByArea(churchId, "service_area_members", areaIds, true),
    countByArea(churchId, "service_positions", areaIds, false),
  ]);

  const items: ServiceAreaListItem[] = data.map((row) => {
    const campus = Array.isArray(row.campuses) ? row.campuses[0] : row.campuses;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      icon: row.icon,
      accentColor: row.accent_color,
      active: row.active,
      sortOrder: row.sort_order,
      campusId: row.campus_id,
      campusName: (campus?.name as string | null) ?? null,
      archivedAt: row.archived_at,
      leaders: leadersByArea.get(row.id) ?? [],
      memberCount: memberCounts.get(row.id) ?? 0,
      positionCount: positionCounts.get(row.id) ?? 0,
    };
  });

  return { items, total: count ?? items.length, page, pageSize };
}

async function loadLeaders(churchId: string, areaIds: string[]) {
  const byArea = new Map<string, { personId: string; firstName: string; lastName: string | null; isPrimary: boolean }[]>();
  if (areaIds.length === 0) return byArea;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("service_area_leaders")
    .select("service_area_id, person_id, is_primary, people(first_name, last_name)")
    .eq("church_id", churchId)
    .in("service_area_id", areaIds)
    .is("ends_at", null);

  for (const row of data ?? []) {
    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    const list = byArea.get(row.service_area_id as string) ?? [];
    list.push({
      personId: row.person_id as string,
      firstName: (person?.first_name as string) ?? "",
      lastName: (person?.last_name as string | null) ?? null,
      isPrimary: Boolean(row.is_primary),
    });
    byArea.set(row.service_area_id as string, list);
  }
  return byArea;
}

/**
 * Cuenta filas agrupadas por área. PostgREST no expone group by, así que se
 * traen los identificadores mínimos y se agrupa en aplicación: el volumen
 * por página (25-100 áreas) lo hace irrelevante.
 */
async function countByArea(
  churchId: string,
  table: "service_area_members" | "service_positions",
  areaIds: string[],
  activeOnly: boolean,
) {
  const counts = new Map<string, number>();
  if (areaIds.length === 0) return counts;

  const supabase = await createSupabaseServerClient();
  const base = supabase
    .from(table)
    .select("service_area_id")
    .eq("church_id", churchId)
    .in("service_area_id", areaIds);

  const query =
    table === "service_area_members"
      ? activeOnly
        ? base.is("left_at", null).eq("status", "active")
        : base.is("left_at", null)
      : base.is("archived_at", null);

  const { data } = await query;
  for (const row of data ?? []) {
    const areaId = row.service_area_id as string;
    counts.set(areaId, (counts.get(areaId) ?? 0) + 1);
  }
  return counts;
}

export type ServiceAreaDetail = ServiceAreaListItem;

export async function getServiceArea(churchId: string, areaId: string): Promise<ServiceAreaDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_areas")
    .select(
      "id, name, slug, description, icon, accent_color, active, sort_order, campus_id, archived_at, campuses(name)",
    )
    .eq("church_id", churchId)
    .eq("id", areaId)
    .maybeSingle();

  if (error || !data) return null;

  const [leadersByArea, memberCounts, positionCounts] = await Promise.all([
    loadLeaders(churchId, [areaId]),
    countByArea(churchId, "service_area_members", [areaId], true),
    countByArea(churchId, "service_positions", [areaId], false),
  ]);

  const campus = Array.isArray(data.campuses) ? data.campuses[0] : data.campuses;

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    description: data.description,
    icon: data.icon,
    accentColor: data.accent_color,
    active: data.active,
    sortOrder: data.sort_order,
    campusId: data.campus_id,
    campusName: (campus?.name as string | null) ?? null,
    archivedAt: data.archived_at,
    leaders: leadersByArea.get(areaId) ?? [],
    memberCount: memberCounts.get(areaId) ?? 0,
    positionCount: positionCounts.get(areaId) ?? 0,
  };
}

export type CreateServiceAreaInput = {
  name: string;
  description?: string;
  icon?: string;
  accentColor?: string;
  campusId?: string;
  templateKey?: string;
};

export async function createServiceArea(
  churchId: string,
  input: CreateServiceAreaInput,
): Promise<{ areaId: string }> {
  await requireCapability(churchId, "service_area.manage");

  const name = input.name.trim();
  if (!name) throw new DomainError("VALIDATION_ERROR", "El nombre del área es obligatorio.");

  const supabase = await createSupabaseServerClient();

  const { data: last } = await supabase
    .from("service_areas")
    .select("sort_order")
    .eq("church_id", churchId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("service_areas")
    .insert({
      church_id: churchId,
      name,
      slug: slugify(name) || `area-${Date.now()}`,
      description: input.description?.trim() || null,
      icon: input.icon?.trim() || null,
      accent_color: input.accentColor?.trim() || null,
      campus_id: input.campusId || null,
      sort_order: (last?.sort_order ?? 0) + 1,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") throw new DomainError("CONFLICT", "Ya existe un área de servicio con ese nombre.");
    throw new DomainError("INTERNAL_ERROR", "No se pudo crear el área de servicio.");
  }

  await auditLog({
    churchId,
    action: "service_area.created",
    entityType: "service_areas",
    entityId: data.id,
    metadata: { name, template_key: input.templateKey ?? null },
  });

  return { areaId: data.id };
}

export type UpdateServiceAreaInput = {
  name?: string;
  description?: string;
  icon?: string;
  accentColor?: string;
  campusId?: string | null;
  active?: boolean;
};

export async function updateServiceArea(
  churchId: string,
  areaId: string,
  input: UpdateServiceAreaInput,
): Promise<void> {
  await requireCapability(churchId, "service_area.manage", "service_area", areaId);

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new DomainError("VALIDATION_ERROR", "El nombre del área es obligatorio.");
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = input.description.trim() || null;
  if (input.icon !== undefined) patch.icon = input.icon.trim() || null;
  if (input.accentColor !== undefined) patch.accent_color = input.accentColor.trim() || null;
  if (input.campusId !== undefined) patch.campus_id = input.campusId || null;
  if (input.active !== undefined) patch.active = input.active;

  if (Object.keys(patch).length === 0) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("service_areas")
    .update(patch)
    .eq("church_id", churchId)
    .eq("id", areaId);

  if (error) {
    if (error.code === "23505") throw new DomainError("CONFLICT", "Ya existe un área de servicio con ese nombre.");
    throw new DomainError("INTERNAL_ERROR", "No se pudo actualizar el área de servicio.");
  }

  await auditLog({
    churchId,
    action: "service_area.updated",
    entityType: "service_areas",
    entityId: areaId,
    metadata: patch,
  });
}

export async function archiveServiceArea(churchId: string, areaId: string): Promise<void> {
  await requireCapability(churchId, "service_area.manage", "service_area", areaId);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("service_areas")
    .update({ archived_at: new Date().toISOString(), active: false })
    .eq("church_id", churchId)
    .eq("id", areaId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo archivar el área de servicio.");

  await auditLog({
    churchId,
    action: "service_area.archived",
    entityType: "service_areas",
    entityId: areaId,
  });
}

export async function restoreServiceArea(churchId: string, areaId: string): Promise<void> {
  await requireCapability(churchId, "service_area.manage", "service_area", areaId);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("service_areas")
    .update({ archived_at: null, active: true })
    .eq("church_id", churchId)
    .eq("id", areaId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo restaurar el área de servicio.");

  await auditLog({
    churchId,
    action: "service_area.updated",
    entityType: "service_areas",
    entityId: areaId,
    metadata: { restored: true },
  });
}

export async function reorderServiceAreas(churchId: string, orderedIds: string[]): Promise<void> {
  await requireCapability(churchId, "service_area.manage");

  const supabase = await createSupabaseServerClient();

  for (const [index, areaId] of orderedIds.entries()) {
    const { error } = await supabase
      .from("service_areas")
      .update({ sort_order: index + 1 })
      .eq("church_id", churchId)
      .eq("id", areaId);

    if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo reordenar las áreas de servicio.");
  }

  await auditLog({
    churchId,
    action: "service_area.updated",
    entityType: "service_areas",
    metadata: { reordered: orderedIds.length },
  });
}

export type ServiceAreaTemplate = {
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
};

/**
 * Catálogo global de plantillas sugeridas (sin church_id). Es una ayuda al
 * crear un área, nunca una imposición: la iglesia puede ignorarlo.
 */
export async function listServiceAreaTemplates(): Promise<ServiceAreaTemplate[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("service_area_templates")
    .select("key, name, description, icon, sort_order")
    .order("sort_order");

  if (error || !data) return [];

  return data.map((t) => ({
    key: t.key,
    name: t.name,
    description: t.description,
    icon: t.icon,
    sortOrder: t.sort_order,
  }));
}
