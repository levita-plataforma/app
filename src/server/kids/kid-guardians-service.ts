import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";

/**
 * Relación menor↔responsable (Fase 8 §5). `household_members != kid_guardians`:
 * pertenecer al mismo household nunca autoriza automáticamente nada, es solo
 * una sugerencia para pre-rellenar el alta manual (§3).
 *
 * Lectura: la policy `kid_guardians_select` deja pasar a quien tenga
 * `kids.read` O sea el propio `guardian_person_id` (vía
 * `app.current_person_ids()`). El código de aplicación no necesita
 * replicar esa condición: basta con no exigir aquí una capability más
 * estricta que la que ya impone RLS, para no bloquear al propio guardian.
 */

export type KidGuardian = {
  id: string;
  kidPersonId: string;
  guardianPersonId: string;
  guardianFirstName: string;
  guardianLastName: string | null;
  relationshipType: string;
  legalGuardian: boolean;
  emergencyContact: boolean;
  canView: boolean;
  active: boolean;
  validFrom: string;
  validUntil: string | null;
};

type GuardianRow = {
  id: string;
  kid_person_id: string;
  guardian_person_id: string;
  relationship_type: string;
  legal_guardian: boolean;
  emergency_contact: boolean;
  can_view: boolean;
  active: boolean;
  valid_from: string;
  valid_until: string | null;
  people: { first_name: string; last_name: string | null } | { first_name: string; last_name: string | null }[] | null;
};

function mapGuardian(row: GuardianRow): KidGuardian {
  const person = Array.isArray(row.people) ? row.people[0] : row.people;
  return {
    id: row.id,
    kidPersonId: row.kid_person_id,
    guardianPersonId: row.guardian_person_id,
    guardianFirstName: person?.first_name ?? "",
    guardianLastName: person?.last_name ?? null,
    relationshipType: row.relationship_type,
    legalGuardian: row.legal_guardian,
    emergencyContact: row.emergency_contact,
    canView: row.can_view,
    active: row.active,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
  };
}

const GUARDIAN_SELECT =
  "id, kid_person_id, guardian_person_id, relationship_type, legal_guardian, emergency_contact, can_view, active, valid_from, valid_until, people!kid_guardians_guardian_person_id_fkey(first_name, last_name)";

/**
 * Lista los guardianes activos de un menor. No exige una capability propia:
 * RLS ya decide quién puede ver la fila (kids.read o ser el propio
 * guardian_person_id). Si el caller no tiene ninguno de los dos, Supabase
 * simplemente devuelve una lista vacía.
 */
export async function listGuardiansForKid(churchId: string, kidPersonId: string): Promise<KidGuardian[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("kid_guardians")
    .select(GUARDIAN_SELECT)
    .eq("church_id", churchId)
    .eq("kid_person_id", kidPersonId)
    .eq("active", true)
    .order("created_at");

  if (error || !data) return [];
  return (data as GuardianRow[]).map(mapGuardian);
}

export type SuggestedGuardian = {
  personId: string;
  firstName: string;
  lastName: string | null;
  relationshipType: string;
  householdId: string;
  alreadyGuardian: boolean;
  suggestion: true;
};

/**
 * Sugiere posibles guardianes a partir del household del menor. Nunca
 * inserta nada en kid_guardians: son solo candidatos para que un admin
 * confirme explícitamente cada uno en el formulario de alta (§5).
 */
export async function suggestGuardiansFromHousehold(
  churchId: string,
  kidPersonId: string,
): Promise<SuggestedGuardian[]> {
  await requireCapability(churchId, "kids.read");

  const supabase = await createSupabaseServerClient();

  const { data: memberships, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("church_id", churchId)
    .eq("person_id", kidPersonId);

  if (membershipError || !memberships || memberships.length === 0) return [];

  const householdIds = memberships.map((m) => m.household_id);

  const { data: householdMembers, error: membersError } = await supabase
    .from("household_members")
    .select("person_id, household_id, relationship_type, people(first_name, last_name)")
    .eq("church_id", churchId)
    .in("household_id", householdIds)
    .neq("person_id", kidPersonId);

  if (membersError || !householdMembers) return [];

  const { data: existingGuardians } = await supabase
    .from("kid_guardians")
    .select("guardian_person_id")
    .eq("church_id", churchId)
    .eq("kid_person_id", kidPersonId)
    .eq("active", true);

  const existingIds = new Set((existingGuardians ?? []).map((g) => g.guardian_person_id));

  return householdMembers.map((m) => {
    const person = Array.isArray(m.people) ? m.people[0] : m.people;
    return {
      personId: m.person_id,
      firstName: (person?.first_name as string) ?? "",
      lastName: (person?.last_name as string | null) ?? null,
      relationshipType: m.relationship_type,
      householdId: m.household_id,
      alreadyGuardian: existingIds.has(m.person_id),
      suggestion: true as const,
    };
  });
}

export type AddGuardianInput = {
  relationshipType: string;
  legalGuardian?: boolean;
  emergencyContact?: boolean;
  canView?: boolean;
  validFrom?: string;
  validUntil?: string;
};

export async function addGuardian(
  churchId: string,
  kidPersonId: string,
  guardianPersonId: string,
  input: AddGuardianInput,
): Promise<{ guardianId: string }> {
  await requireCapability(churchId, "kids.guardians.manage");

  const relationshipType = input.relationshipType?.trim();
  if (!relationshipType) throw new DomainError("VALIDATION_ERROR", "El tipo de relación es obligatorio.");
  if (kidPersonId === guardianPersonId) {
    throw new DomainError("VALIDATION_ERROR", "El menor y el responsable no pueden ser la misma persona.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("kid_guardians")
    .insert({
      church_id: churchId,
      kid_person_id: kidPersonId,
      guardian_person_id: guardianPersonId,
      relationship_type: relationshipType,
      legal_guardian: input.legalGuardian ?? false,
      emergency_contact: input.emergencyContact ?? false,
      can_view: input.canView ?? true,
      valid_from: input.validFrom || undefined,
      valid_until: input.validUntil || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") throw new DomainError("CONFLICT", "Esta persona ya es responsable de este menor.");
    throw new DomainError("INTERNAL_ERROR", "No se pudo añadir al responsable.");
  }

  await auditLog({
    churchId,
    action: "kids.guardian_added",
    entityType: "kid_guardians",
    entityId: data.id,
    metadata: { kid_person_id: kidPersonId, guardian_person_id: guardianPersonId, relationship_type: relationshipType },
  });

  return { guardianId: data.id };
}

export async function removeGuardian(churchId: string, kidPersonId: string, guardianPersonId: string): Promise<void> {
  await requireCapability(churchId, "kids.guardians.manage");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("kid_guardians")
    .update({ active: false })
    .eq("church_id", churchId)
    .eq("kid_person_id", kidPersonId)
    .eq("guardian_person_id", guardianPersonId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo quitar al responsable.");

  await auditLog({
    churchId,
    action: "kids.guardian_removed",
    entityType: "kid_guardians",
    metadata: { kid_person_id: kidPersonId, guardian_person_id: guardianPersonId },
  });
}

export type UpdateGuardianInput = {
  relationshipType?: string;
  legalGuardian?: boolean;
  emergencyContact?: boolean;
  canView?: boolean;
  validUntil?: string | null;
};

export async function updateGuardian(
  churchId: string,
  guardianRowId: string,
  input: UpdateGuardianInput,
): Promise<void> {
  await requireCapability(churchId, "kids.guardians.manage");

  const patch: Record<string, unknown> = {};
  if (input.relationshipType !== undefined) {
    const relationshipType = input.relationshipType.trim();
    if (!relationshipType) throw new DomainError("VALIDATION_ERROR", "El tipo de relación es obligatorio.");
    patch.relationship_type = relationshipType;
  }
  if (input.legalGuardian !== undefined) patch.legal_guardian = input.legalGuardian;
  if (input.emergencyContact !== undefined) patch.emergency_contact = input.emergencyContact;
  if (input.canView !== undefined) patch.can_view = input.canView;
  if (input.validUntil !== undefined) patch.valid_until = input.validUntil;
  if (Object.keys(patch).length === 0) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("kid_guardians").update(patch).eq("church_id", churchId).eq("id", guardianRowId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo actualizar al responsable.");

  await auditLog({
    churchId,
    action: "kids.guardian_added",
    entityType: "kid_guardians",
    entityId: guardianRowId,
    metadata: { updated: Object.keys(patch) },
  });
}
