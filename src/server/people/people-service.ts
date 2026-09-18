import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";

export type PersonListItem = {
  id: string;
  firstName: string;
  lastName: string | null;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  hasAccount: boolean;
  relationship: string;
  campusId: string | null;
  campusName: string | null;
  joinedAt: string;
  archivedAt: string | null;
  tags: { id: string; name: string; color: string | null }[];
};

export type PeopleFilters = {
  search?: string;
  relationship?: string;
  campusId?: string;
  tagId?: string;
  hasAccount?: "yes" | "no";
  archived?: boolean;
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 25;

/**
 * Directorio de personas paginado server-side (encargo de Fase 2 §3-5, §28).
 * Nunca carga el listado completo al cliente.
 */
export async function listPeople(
  churchId: string,
  filters: PeopleFilters = {},
): Promise<{ items: PersonListItem[]; total: number; page: number; pageSize: number }> {
  const supabase = await createSupabaseServerClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = [25, 50, 100].includes(filters.pageSize ?? DEFAULT_PAGE_SIZE)
    ? (filters.pageSize ?? DEFAULT_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("church_people")
    .select(
      "id, relationship, joined_at, archived_at, primary_campus_id, campuses(name), people!church_people_person_id_fkey!inner(id, first_name, last_name, preferred_name, email, phone, user_id)",
      { count: "exact" },
    )
    .eq("church_id", churchId);

  query = filters.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);

  if (filters.relationship) query = query.eq("relationship", filters.relationship);
  if (filters.campusId) query = query.eq("primary_campus_id", filters.campusId);

  if (filters.search && filters.search.trim()) {
    const term = filters.search.trim();
    query = query.or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,preferred_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`,
      { referencedTable: "people" },
    );
  }

  const { data, count, error } = await query
    .order("joined_at", { ascending: false })
    .range(from, to);

  if (error) {
    return { items: [], total: 0, page, pageSize };
  }

  const personIds = (data ?? [])
    .map((row) => {
      const person = Array.isArray(row.people) ? row.people[0] : row.people;
      return person?.id as string | undefined;
    })
    .filter((id): id is string => Boolean(id));

  const tagsByPerson = new Map<string, { id: string; name: string; color: string | null }[]>();
  if (personIds.length > 0) {
    const { data: tagRows } = await supabase
      .from("person_tags")
      .select("person_id, tags(id, name, color)")
      .eq("church_id", churchId)
      .in("person_id", personIds);

    for (const row of tagRows ?? []) {
      const tag = Array.isArray(row.tags) ? row.tags[0] : row.tags;
      if (!tag) continue;
      const list = tagsByPerson.get(row.person_id as string) ?? [];
      list.push(tag as { id: string; name: string; color: string | null });
      tagsByPerson.set(row.person_id as string, list);
    }
  }

  let items: PersonListItem[] = (data ?? []).map((row) => {
    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    const campus = Array.isArray(row.campuses) ? row.campuses[0] : row.campuses;
    const personId = person?.id as string;

    return {
      id: personId,
      firstName: (person?.first_name as string) ?? "",
      lastName: (person?.last_name as string | null) ?? null,
      preferredName: (person?.preferred_name as string | null) ?? null,
      email: (person?.email as string | null) ?? null,
      phone: (person?.phone as string | null) ?? null,
      hasAccount: Boolean(person?.user_id),
      relationship: row.relationship as string,
      campusId: row.primary_campus_id as string | null,
      campusName: (campus?.name as string | null) ?? null,
      joinedAt: row.joined_at as string,
      archivedAt: row.archived_at as string | null,
      tags: tagsByPerson.get(personId) ?? [],
    };
  });

  if (filters.hasAccount) {
    items = items.filter((p) => (filters.hasAccount === "yes" ? p.hasAccount : !p.hasAccount));
  }
  if (filters.tagId) {
    items = items.filter((p) => p.tags.some((t) => t.id === filters.tagId));
  }

  return { items, total: count ?? items.length, page, pageSize };
}

export type CreatePersonInput = {
  firstName: string;
  lastName?: string;
  preferredName?: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  campusId?: string;
  relationship?: string;
  tagIds?: string[];
};

/**
 * Alta manual de persona (encargo §7). Usa una función security definer
 * (`create_person`) que inserta `people` + `church_people` (+ etiquetas) en
 * una sola transacción. Un INSERT directo en `people` desde el cliente
 * falla en RLS porque PostgREST evalúa el RETURNING contra la política de
 * SELECT, que exige que la persona ya esté vinculada — imposible para una
 * persona recién creada (ver migración 20260918000600).
 */
export async function createPerson(
  churchId: string,
  input: CreatePersonInput,
): Promise<{ personId: string }> {
  if (!input.firstName.trim()) {
    throw new DomainError("VALIDATION_ERROR", "El nombre es obligatorio.");
  }

  const supabase = await createSupabaseServerClient();

  const { data: personId, error } = await supabase.rpc("create_person", {
    p_church_id: churchId,
    p_first_name: input.firstName.trim(),
    p_last_name: input.lastName?.trim() || null,
    p_preferred_name: input.preferredName?.trim() || null,
    p_email: input.email?.trim() || null,
    p_phone: input.phone?.trim() || null,
    p_birth_date: input.birthDate || null,
    p_relationship: input.relationship ?? "visitor",
    p_campus_id: input.campusId || null,
    p_tag_ids: input.tagIds?.length ? input.tagIds : null,
  });

  if (error || !personId) {
    throw new DomainError("INTERNAL_ERROR", "No se pudo crear la persona.");
  }

  await auditLog({
    churchId,
    action: "person.created",
    entityType: "people",
    entityId: personId,
    metadata: { source: "manual" },
  });

  return { personId };
}

export type UpdatePersonInput = {
  firstName: string;
  lastName?: string;
  preferredName?: string;
  email?: string;
  phone?: string;
  birthDate?: string;
  campusId?: string;
  relationship?: string;
};

export async function updatePerson(
  churchId: string,
  personId: string,
  input: UpdatePersonInput,
): Promise<void> {
  await requireCapability(churchId, "people.manage");

  if (!input.firstName.trim()) {
    throw new DomainError("VALIDATION_ERROR", "El nombre es obligatorio.");
  }

  const supabase = await createSupabaseServerClient();

  const { error: personError } = await supabase
    .from("people")
    .update({
      first_name: input.firstName.trim(),
      last_name: input.lastName?.trim() || null,
      preferred_name: input.preferredName?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      birth_date: input.birthDate || null,
    })
    .eq("id", personId);

  if (personError) {
    throw new DomainError("INTERNAL_ERROR", "No se pudo actualizar la persona.");
  }

  const { error: churchPeopleError } = await supabase
    .from("church_people")
    .update({
      relationship: input.relationship ?? "visitor",
      primary_campus_id: input.campusId || null,
    })
    .eq("church_id", churchId)
    .eq("person_id", personId);

  if (churchPeopleError) {
    throw new DomainError("INTERNAL_ERROR", "No se pudo actualizar la pertenencia.");
  }

  await auditLog({ churchId, action: "person.updated", entityType: "people", entityId: personId });
}

export async function archivePerson(churchId: string, personId: string): Promise<void> {
  await requireCapability(churchId, "people.archive");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("church_people")
    .update({ archived_at: new Date().toISOString() })
    .eq("church_id", churchId)
    .eq("person_id", personId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo archivar la persona.");

  await auditLog({ churchId, action: "person.archived", entityType: "people", entityId: personId });
}

export async function reactivatePerson(churchId: string, personId: string): Promise<void> {
  await requireCapability(churchId, "people.archive");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("church_people")
    .update({ archived_at: null })
    .eq("church_id", churchId)
    .eq("person_id", personId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo reactivar la persona.");

  await auditLog({ churchId, action: "person.reactivated", entityType: "people", entityId: personId });
}

export type DuplicateCandidate = {
  personId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  matchType: "email" | "phone" | "name_birthdate";
};

export async function findPotentialDuplicates(
  churchId: string,
  input: { email?: string; phone?: string; firstName?: string; lastName?: string; birthDate?: string },
): Promise<DuplicateCandidate[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("find_potential_duplicate_people", {
    p_church_id: churchId,
    p_email: input.email || null,
    p_phone: input.phone || null,
    p_first_name: input.firstName || null,
    p_last_name: input.lastName || null,
    p_birth_date: input.birthDate || null,
  });

  if (error || !data) return [];

  return data.map((row: {
    out_person_id: string;
    out_first_name: string;
    out_last_name: string | null;
    out_email: string | null;
    out_phone: string | null;
    out_match_type: string;
  }) => ({
    personId: row.out_person_id,
    firstName: row.out_first_name,
    lastName: row.out_last_name,
    email: row.out_email,
    phone: row.out_phone,
    matchType: row.out_match_type as DuplicateCandidate["matchType"],
  }));
}
