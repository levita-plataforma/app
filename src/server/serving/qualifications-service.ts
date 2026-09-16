import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Catálogo de cualificaciones y asignación a personas (Fase 3 §11-§12).
 * Una cualificación describe una capacidad verificable ("Mesa de sonido"),
 * no un permiso: los permisos siguen viviendo en capabilities.
 */

// Etiquetas en español: app/(app)/app/servicios/labels.ts (client-safe).
export type QualificationLevel = Database["public"]["Enums"]["qualification_level"];

export type Qualification = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  active: boolean;
  expiryRequired: boolean;
  archivedAt: string | null;
  peopleCount: number;
};

export type QualificationFilters = {
  search?: string;
  category?: string;
  archived?: boolean;
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 25;

export async function listQualifications(
  churchId: string,
  filters: QualificationFilters = {},
): Promise<{ items: Qualification[]; total: number; page: number; pageSize: number }> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = [25, 50, 100].includes(filters.pageSize ?? DEFAULT_PAGE_SIZE)
    ? (filters.pageSize ?? DEFAULT_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("qualifications")
    .select("id, name, description, category, active, expiry_required, archived_at", { count: "exact" })
    .eq("church_id", churchId);

  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.search?.trim()) query = query.ilike("name", `%${filters.search.trim()}%`);

  const { data, count, error } = await query.order("name").range(from, to);
  if (error || !data) return { items: [], total: 0, page, pageSize };

  const counts = new Map<string, number>();
  const ids = data.map((q) => q.id as string);
  if (ids.length > 0) {
    const { data: assignments } = await supabase
      .from("person_qualifications")
      .select("qualification_id")
      .eq("church_id", churchId)
      .in("qualification_id", ids);
    for (const row of assignments ?? []) {
      const key = row.qualification_id as string;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const items: Qualification[] = data.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    active: row.active,
    expiryRequired: row.expiry_required,
    archivedAt: row.archived_at,
    peopleCount: counts.get(row.id) ?? 0,
  }));

  return { items, total: count ?? items.length, page, pageSize };
}

export type CreateQualificationInput = {
  name: string;
  description?: string;
  category?: string;
  expiryRequired?: boolean;
};

export async function createQualification(
  churchId: string,
  input: CreateQualificationInput,
): Promise<{ qualificationId: string }> {
  await requireCapability(churchId, "qualification.manage");

  const name = input.name.trim();
  if (!name) throw new DomainError("VALIDATION_ERROR", "El nombre de la cualificación es obligatorio.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("qualifications")
    .insert({
      church_id: churchId,
      name,
      description: input.description?.trim() || null,
      category: input.category?.trim() || null,
      expiry_required: input.expiryRequired ?? false,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") throw new DomainError("CONFLICT", "Ya existe una cualificación con ese nombre.");
    throw new DomainError("INTERNAL_ERROR", "No se pudo crear la cualificación.");
  }

  await auditLog({
    churchId,
    action: "qualification.created",
    entityType: "qualifications",
    entityId: data.id,
    metadata: { name },
  });

  return { qualificationId: data.id };
}

export type UpdateQualificationInput = CreateQualificationInput & { active?: boolean };

export async function updateQualification(
  churchId: string,
  qualificationId: string,
  input: Partial<UpdateQualificationInput>,
): Promise<void> {
  await requireCapability(churchId, "qualification.manage");

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new DomainError("VALIDATION_ERROR", "El nombre de la cualificación es obligatorio.");
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = input.description.trim() || null;
  if (input.category !== undefined) patch.category = input.category.trim() || null;
  if (input.expiryRequired !== undefined) patch.expiry_required = input.expiryRequired;
  if (input.active !== undefined) patch.active = input.active;
  if (Object.keys(patch).length === 0) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("qualifications")
    .update(patch)
    .eq("church_id", churchId)
    .eq("id", qualificationId);

  if (error) {
    if (error.code === "23505") throw new DomainError("CONFLICT", "Ya existe una cualificación con ese nombre.");
    throw new DomainError("INTERNAL_ERROR", "No se pudo actualizar la cualificación.");
  }

  await auditLog({
    churchId,
    action: "qualification.created",
    entityType: "qualifications",
    entityId: qualificationId,
    metadata: { updated: Object.keys(patch) },
  });
}

export async function archiveQualification(churchId: string, qualificationId: string): Promise<void> {
  await requireCapability(churchId, "qualification.manage");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("qualifications")
    .update({ archived_at: new Date().toISOString(), active: false })
    .eq("church_id", churchId)
    .eq("id", qualificationId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo archivar la cualificación.");

  await auditLog({
    churchId,
    action: "qualification.created",
    entityType: "qualifications",
    entityId: qualificationId,
    metadata: { archived: true },
  });
}

export type PersonQualification = {
  id: string;
  personId: string;
  firstName: string;
  lastName: string | null;
  qualificationId: string;
  qualificationName: string;
  level: QualificationLevel;
  verified: boolean;
  verifiedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
};

export async function listPersonQualifications(
  churchId: string,
  personId: string,
): Promise<PersonQualification[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("person_qualifications")
    .select(
      "id, person_id, qualification_id, level, verified, verified_at, expires_at, notes, qualifications(name)",
    )
    .eq("church_id", churchId)
    .eq("person_id", personId);

  if (error || !data) return [];

  return data.map((row) => {
    const qualification = Array.isArray(row.qualifications) ? row.qualifications[0] : row.qualifications;
    return {
      id: row.id,
      personId: row.person_id,
      firstName: "",
      lastName: null,
      qualificationId: row.qualification_id,
      qualificationName: (qualification?.name as string) ?? "",
      level: row.level,
      verified: row.verified,
      verifiedAt: row.verified_at,
      expiresAt: row.expires_at,
      notes: row.notes,
    };
  });
}

/**
 * Cualificaciones de un conjunto de personas en una sola consulta: evita el
 * N+1 al pintar la pestaña de cualificaciones de un área.
 */
export async function listQualificationsForPeople(
  churchId: string,
  personIds: string[],
): Promise<PersonQualification[]> {
  if (personIds.length === 0) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("person_qualifications")
    .select(
      "id, person_id, qualification_id, level, verified, verified_at, expires_at, notes, qualifications(name), people(first_name, last_name)",
    )
    .eq("church_id", churchId)
    .in("person_id", personIds);

  if (error || !data) return [];

  return data.map((row) => {
    const qualification = Array.isArray(row.qualifications) ? row.qualifications[0] : row.qualifications;
    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    return {
      id: row.id,
      personId: row.person_id,
      firstName: (person?.first_name as string) ?? "",
      lastName: (person?.last_name as string | null) ?? null,
      qualificationId: row.qualification_id,
      qualificationName: (qualification?.name as string) ?? "",
      level: row.level,
      verified: row.verified,
      verifiedAt: row.verified_at,
      expiresAt: row.expires_at,
      notes: row.notes,
    };
  });
}

/**
 * Todas las asignaciones de la iglesia, paginadas: es la vista de gestión
 * de "personas cualificadas".
 */
export async function listAllPersonQualifications(
  churchId: string,
  filters: { qualificationId?: string; page?: number; pageSize?: number } = {},
): Promise<{ items: PersonQualification[]; total: number; page: number; pageSize: number }> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = [25, 50, 100].includes(filters.pageSize ?? DEFAULT_PAGE_SIZE)
    ? (filters.pageSize ?? DEFAULT_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("person_qualifications")
    .select(
      "id, person_id, qualification_id, level, verified, verified_at, expires_at, notes, qualifications(name), people(first_name, last_name)",
      { count: "exact" },
    )
    .eq("church_id", churchId);

  if (filters.qualificationId) query = query.eq("qualification_id", filters.qualificationId);

  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
  if (error || !data) return { items: [], total: 0, page, pageSize };

  const items = data.map((row) => {
    const qualification = Array.isArray(row.qualifications) ? row.qualifications[0] : row.qualifications;
    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    return {
      id: row.id,
      personId: row.person_id,
      firstName: (person?.first_name as string) ?? "",
      lastName: (person?.last_name as string | null) ?? null,
      qualificationId: row.qualification_id,
      qualificationName: (qualification?.name as string) ?? "",
      level: row.level,
      verified: row.verified,
      verifiedAt: row.verified_at,
      expiresAt: row.expires_at,
      notes: row.notes,
    };
  });

  return { items, total: count ?? items.length, page, pageSize };
}

/** Personas que tienen asignada una cualificación concreta. */
export async function listPeopleWithQualification(
  churchId: string,
  qualificationId: string,
): Promise<PersonQualification[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("person_qualifications")
    .select(
      "id, person_id, qualification_id, level, verified, verified_at, expires_at, notes, qualifications(name), people(first_name, last_name)",
    )
    .eq("church_id", churchId)
    .eq("qualification_id", qualificationId);

  if (error || !data) return [];

  return data.map((row) => {
    const qualification = Array.isArray(row.qualifications) ? row.qualifications[0] : row.qualifications;
    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    return {
      id: row.id,
      personId: row.person_id,
      firstName: (person?.first_name as string) ?? "",
      lastName: (person?.last_name as string | null) ?? null,
      qualificationId: row.qualification_id,
      qualificationName: (qualification?.name as string) ?? "",
      level: row.level,
      verified: row.verified,
      verifiedAt: row.verified_at,
      expiresAt: row.expires_at,
      notes: row.notes,
    };
  });
}

export type AssignQualificationInput = {
  level?: QualificationLevel;
  expiresAt?: string | null;
  notes?: string;
  verified?: boolean;
};

export async function assignQualification(
  churchId: string,
  personId: string,
  qualificationId: string,
  input: AssignQualificationInput = {},
): Promise<void> {
  await requireCapability(churchId, "qualification.manage");

  if (!personId) throw new DomainError("VALIDATION_ERROR", "Selecciona una persona.");
  if (!qualificationId) throw new DomainError("VALIDATION_ERROR", "Selecciona una cualificación.");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("person_qualifications").insert({
    church_id: churchId,
    person_id: personId,
    qualification_id: qualificationId,
    level: input.level ?? "basic",
    expires_at: input.expiresAt || null,
    notes: input.notes?.trim() || null,
    verified: input.verified ?? false,
  });

  if (error) {
    if (error.code === "23505") throw new DomainError("CONFLICT", "Esa persona ya tiene esta cualificación.");
    throw new DomainError("INTERNAL_ERROR", "No se pudo asignar la cualificación.");
  }

  await auditLog({
    churchId,
    action: "qualification.assigned",
    entityType: "person_qualifications",
    entityId: qualificationId,
    metadata: { person_id: personId, level: input.level ?? "basic" },
  });
}

export async function updatePersonQualification(
  churchId: string,
  personId: string,
  qualificationId: string,
  input: AssignQualificationInput,
): Promise<void> {
  await requireCapability(churchId, "qualification.manage");

  const patch: Record<string, unknown> = {};
  if (input.level !== undefined) patch.level = input.level;
  if (input.expiresAt !== undefined) patch.expires_at = input.expiresAt || null;
  if (input.notes !== undefined) patch.notes = input.notes.trim() || null;
  if (Object.keys(patch).length === 0) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("person_qualifications")
    .update(patch)
    .eq("church_id", churchId)
    .eq("person_id", personId)
    .eq("qualification_id", qualificationId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo actualizar la cualificación.");

  await auditLog({
    churchId,
    action: "qualification.assigned",
    entityType: "person_qualifications",
    entityId: qualificationId,
    metadata: { person_id: personId, updated: Object.keys(patch) },
  });
}

export async function verifyQualification(
  churchId: string,
  personId: string,
  qualificationId: string,
): Promise<void> {
  await requireCapability(churchId, "qualification.manage");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("person_qualifications")
    .update({ verified: true, verified_at: new Date().toISOString(), verified_by: user?.id ?? null })
    .eq("church_id", churchId)
    .eq("person_id", personId)
    .eq("qualification_id", qualificationId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo verificar la cualificación.");

  await auditLog({
    churchId,
    action: "qualification.verified",
    entityType: "person_qualifications",
    entityId: qualificationId,
    metadata: { person_id: personId },
  });
}

export async function removePersonQualification(
  churchId: string,
  personId: string,
  qualificationId: string,
): Promise<void> {
  await requireCapability(churchId, "qualification.manage");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("person_qualifications")
    .delete()
    .eq("church_id", churchId)
    .eq("person_id", personId)
    .eq("qualification_id", qualificationId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo quitar la cualificación.");

  await auditLog({
    churchId,
    action: "qualification.assigned",
    entityType: "person_qualifications",
    entityId: qualificationId,
    metadata: { person_id: personId, removed: true },
  });
}
