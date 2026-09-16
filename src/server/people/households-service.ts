import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";

export type Household = {
  id: string;
  name: string;
  primaryAddress: string | null;
  archivedAt: string | null;
  members: {
    personId: string;
    firstName: string;
    lastName: string | null;
    relationshipType: string;
    isPrimaryContact: boolean;
  }[];
};

export async function listHouseholds(churchId: string): Promise<Household[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("households")
    .select(
      "id, name, primary_address, archived_at, household_members(person_id, relationship_type, is_primary_contact, people(first_name, last_name))",
    )
    .eq("church_id", churchId)
    .is("archived_at", null)
    .order("name");

  if (error || !data) return [];

  return data.map((h) => ({
    id: h.id,
    name: h.name,
    primaryAddress: h.primary_address,
    archivedAt: h.archived_at,
    members: (h.household_members ?? []).map((m) => {
      const person = Array.isArray(m.people) ? m.people[0] : m.people;
      return {
        personId: m.person_id,
        firstName: (person?.first_name as string) ?? "",
        lastName: (person?.last_name as string | null) ?? null,
        relationshipType: m.relationship_type,
        isPrimaryContact: m.is_primary_contact,
      };
    }),
  }));
}

export async function createHousehold(
  churchId: string,
  name: string,
  primaryAddress?: string,
): Promise<{ householdId: string }> {
  await requireCapability(churchId, "people.manage");

  if (!name.trim()) throw new DomainError("VALIDATION_ERROR", "El nombre de la familia es obligatorio.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("households")
    .insert({ church_id: churchId, name: name.trim(), primary_address: primaryAddress?.trim() || null })
    .select("id")
    .single();

  if (error || !data) throw new DomainError("INTERNAL_ERROR", "No se pudo crear la familia.");

  await auditLog({ churchId, action: "household.created", entityType: "households", entityId: data.id, metadata: { name } });

  return { householdId: data.id };
}

export async function addHouseholdMember(
  churchId: string,
  householdId: string,
  personId: string,
  relationshipType: string,
  isPrimaryContact = false,
): Promise<void> {
  await requireCapability(churchId, "people.manage");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("household_members")
    .insert({ church_id: churchId, household_id: householdId, person_id: personId, relationship_type: relationshipType, is_primary_contact: isPrimaryContact });

  if (error) {
    if (error.code === "23505") throw new DomainError("CONFLICT", "Esa persona ya pertenece a esta familia.");
    throw new DomainError("INTERNAL_ERROR", "No se pudo añadir a la persona a la familia.");
  }

  await auditLog({
    churchId,
    action: "household.member_added",
    entityType: "households",
    entityId: householdId,
    metadata: { person_id: personId },
  });
}

export async function removeHouseholdMember(
  churchId: string,
  householdId: string,
  personId: string,
): Promise<void> {
  await requireCapability(churchId, "people.manage");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("household_members")
    .delete()
    .eq("church_id", churchId)
    .eq("household_id", householdId)
    .eq("person_id", personId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo quitar a la persona de la familia.");

  await auditLog({
    churchId,
    action: "household.member_removed",
    entityType: "households",
    entityId: householdId,
    metadata: { person_id: personId },
  });
}

export async function archiveHousehold(churchId: string, householdId: string): Promise<void> {
  await requireCapability(churchId, "people.manage");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("households")
    .update({ archived_at: new Date().toISOString() })
    .eq("church_id", churchId)
    .eq("id", householdId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo archivar la familia.");

  await auditLog({ churchId, action: "household.updated", entityType: "households", entityId: householdId, metadata: { archived: true } });
}
