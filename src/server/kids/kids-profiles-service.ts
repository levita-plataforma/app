import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability, hasCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Perfiles Kids (Fase 8 §4). Un `kids_profile` extiende una fila ya
 * existente en `people`: nunca se duplica `birth_date` (la edad se calcula
 * aquí a partir de `people.birth_date`). `accessibility_notes` y
 * `emergency_notes` son datos restringidos: RLS ya los protege a nivel de
 * fila entera junto al resto del perfil, pero como el resto del perfil sí
 * es visible con `kids.read`/`kids.manage`, aquí se filtra además en
 * aplicación (defensa en profundidad) para que ningún caller sin
 * `kids.sensitive.read` reciba esas dos notas.
 */

export type KidsProfileStatus = Database["public"]["Enums"]["kids_profile_status"];

function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

export type KidsProfile = {
  id: string;
  personId: string;
  firstName: string;
  lastName: string | null;
  birthDate: string | null;
  age: number | null;
  status: KidsProfileStatus;
  preferredName: string | null;
  medicalAlertFlag: boolean;
  accessibilityNotes: string | null;
  emergencyNotes: string | null;
  active: boolean;
  archivedAt: string | null;
};

type ProfileRow = Database["public"]["Tables"]["kids_profiles"]["Row"];
type PersonInfo = { first_name: string; last_name: string | null; birth_date: string | null };

function mapProfile(row: ProfileRow, person: PersonInfo | null, includeSensitive: boolean): KidsProfile {
  return {
    id: row.id,
    personId: row.person_id,
    firstName: person?.first_name ?? "",
    lastName: person?.last_name ?? null,
    birthDate: person?.birth_date ?? null,
    age: calculateAge(person?.birth_date ?? null),
    status: row.status,
    preferredName: row.preferred_name,
    medicalAlertFlag: row.medical_alert_flag,
    accessibilityNotes: includeSensitive ? row.accessibility_notes : null,
    emergencyNotes: includeSensitive ? row.emergency_notes : null,
    active: row.active,
    archivedAt: row.archived_at,
  };
}

/**
 * Devuelve el perfil Kids de una persona, creándolo si aún no existe.
 * Requiere `kids.manage` porque la creación implícita es una mutación.
 */
export async function getOrCreateKidsProfile(churchId: string, personId: string): Promise<KidsProfile> {
  await requireCapability(churchId, "kids.manage");

  const supabase = await createSupabaseServerClient();
  const canSeeSensitive = await hasCapability(churchId, "kids.sensitive.read");

  const { data: person, error: personError } = await supabase
    .from("people")
    .select("first_name, last_name, birth_date")
    .eq("id", personId)
    .single();

  if (personError || !person) throw new DomainError("RESOURCE_NOT_FOUND", "No se encontró a la persona indicada.");

  const { data: existing, error: existingError } = await supabase
    .from("kids_profiles")
    .select("*")
    .eq("church_id", churchId)
    .eq("person_id", personId)
    .maybeSingle();

  if (existingError) throw new DomainError("INTERNAL_ERROR", "No se pudo consultar el perfil Kids.");
  if (existing) return mapProfile(existing, person, canSeeSensitive);

  const { data: created, error: createError } = await supabase
    .from("kids_profiles")
    .insert({ church_id: churchId, person_id: personId })
    .select("*")
    .single();

  if (createError || !created) {
    if (createError?.code === "23505") {
      // Carrera: otro caller lo creó entre el select y el insert. Reintenta lectura.
      const { data: retry } = await supabase
        .from("kids_profiles")
        .select("*")
        .eq("church_id", churchId)
        .eq("person_id", personId)
        .single();
      if (retry) return mapProfile(retry, person, canSeeSensitive);
    }
    throw new DomainError("INTERNAL_ERROR", "No se pudo crear el perfil Kids.");
  }

  await auditLog({
    churchId,
    action: "kids.profile_created",
    entityType: "kids_profiles",
    entityId: created.id,
    metadata: { person_id: personId },
  });

  return mapProfile(created, person, canSeeSensitive);
}

export type KidsProfileFilters = {
  status?: KidsProfileStatus;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type KidsProfileListItem = {
  id: string;
  personId: string;
  firstName: string;
  lastName: string | null;
  age: number | null;
  status: KidsProfileStatus;
  preferredName: string | null;
  medicalAlertFlag: boolean;
  householdId: string | null;
  householdName: string | null;
  activeGuardiansCount: number;
  activePickupAuthorizationsCount: number;
};

const PROFILE_PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

export async function listKidsProfiles(
  churchId: string,
  filters: KidsProfileFilters = {},
): Promise<{ items: KidsProfileListItem[]; total: number; page: number; pageSize: number }> {
  await requireCapability(churchId, "kids.read");

  const supabase = await createSupabaseServerClient();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = (PROFILE_PAGE_SIZES as readonly number[]).includes(filters.pageSize ?? DEFAULT_PAGE_SIZE)
    ? (filters.pageSize ?? DEFAULT_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("kids_profiles")
    .select("id, person_id, status, preferred_name, medical_alert_flag, people!inner(first_name, last_name)", {
      count: "exact",
    })
    .eq("church_id", churchId);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.search?.trim()) {
    const term = filters.search.trim();
    query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`, { referencedTable: "people" });
  }

  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
  if (error || !data) return { items: [], total: 0, page, pageSize };

  const personIds = data.map((row) => row.person_id);
  if (personIds.length === 0) return { items: [], total: count ?? 0, page, pageSize };

  const [birthDates, householdRows, guardianCounts, pickupCounts] = await Promise.all([
    supabase.from("people").select("id, birth_date").in("id", personIds),
    supabase
      .from("household_members")
      .select("person_id, household_id, households(name)")
      .eq("church_id", churchId)
      .in("person_id", personIds),
    supabase
      .from("kid_guardians")
      .select("kid_person_id")
      .eq("church_id", churchId)
      .eq("active", true)
      .in("kid_person_id", personIds),
    supabase
      .from("kid_pickup_authorizations")
      .select("kid_person_id")
      .eq("church_id", churchId)
      .eq("status", "active")
      .in("kid_person_id", personIds),
  ]);

  const birthDateByPerson = new Map((birthDates.data ?? []).map((p) => [p.id, p.birth_date]));

  const householdByPerson = new Map<string, { id: string; name: string | null }>();
  for (const row of householdRows.data ?? []) {
    const household = Array.isArray(row.households) ? row.households[0] : row.households;
    householdByPerson.set(row.person_id, { id: row.household_id, name: household?.name ?? null });
  }

  const guardianCountByPerson = new Map<string, number>();
  for (const row of guardianCounts.data ?? []) {
    guardianCountByPerson.set(row.kid_person_id, (guardianCountByPerson.get(row.kid_person_id) ?? 0) + 1);
  }

  const pickupCountByPerson = new Map<string, number>();
  for (const row of pickupCounts.data ?? []) {
    pickupCountByPerson.set(row.kid_person_id, (pickupCountByPerson.get(row.kid_person_id) ?? 0) + 1);
  }

  const items: KidsProfileListItem[] = data.map((row) => {
    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    const household = householdByPerson.get(row.person_id) ?? null;
    return {
      id: row.id,
      personId: row.person_id,
      firstName: person?.first_name ?? "",
      lastName: person?.last_name ?? null,
      age: calculateAge(birthDateByPerson.get(row.person_id) ?? null),
      status: row.status,
      preferredName: row.preferred_name,
      medicalAlertFlag: row.medical_alert_flag,
      householdId: household?.id ?? null,
      householdName: household?.name ?? null,
      activeGuardiansCount: guardianCountByPerson.get(row.person_id) ?? 0,
      activePickupAuthorizationsCount: pickupCountByPerson.get(row.person_id) ?? 0,
    };
  });

  return { items, total: count ?? items.length, page, pageSize };
}

export type UpdateKidsProfileInput = {
  preferredName?: string | null;
  medicalAlertFlag?: boolean;
  status?: KidsProfileStatus;
  accessibilityNotes?: string | null;
  emergencyNotes?: string | null;
};

export async function updateKidsProfile(
  churchId: string,
  personId: string,
  input: UpdateKidsProfileInput,
): Promise<void> {
  await requireCapability(churchId, "kids.manage");

  const touchesSensitive = input.accessibilityNotes !== undefined || input.emergencyNotes !== undefined;
  if (touchesSensitive) {
    const canSeeSensitive = await hasCapability(churchId, "kids.sensitive.read");
    if (!canSeeSensitive) {
      throw new DomainError(
        "FORBIDDEN",
        "No tienes permiso para modificar las notas de accesibilidad o emergencia (kids.sensitive.read).",
      );
    }
  }

  const patch: Record<string, unknown> = {};
  if (input.preferredName !== undefined) patch.preferred_name = input.preferredName?.trim() || null;
  if (input.medicalAlertFlag !== undefined) patch.medical_alert_flag = input.medicalAlertFlag;
  if (input.status !== undefined) patch.status = input.status;
  if (input.accessibilityNotes !== undefined) patch.accessibility_notes = input.accessibilityNotes?.trim() || null;
  if (input.emergencyNotes !== undefined) patch.emergency_notes = input.emergencyNotes?.trim() || null;
  if (Object.keys(patch).length === 0) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("kids_profiles")
    .update(patch)
    .eq("church_id", churchId)
    .eq("person_id", personId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo actualizar el perfil Kids.");

  await auditLog({
    churchId,
    action: "kids.profile_updated",
    entityType: "kids_profiles",
    entityId: personId,
    metadata: { updated: Object.keys(patch).filter((k) => k !== "accessibility_notes" && k !== "emergency_notes") },
  });
}

export async function archiveKidsProfile(churchId: string, personId: string): Promise<void> {
  await requireCapability(churchId, "kids.manage");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("kids_profiles")
    .update({ archived_at: new Date().toISOString(), active: false })
    .eq("church_id", churchId)
    .eq("person_id", personId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo archivar el perfil Kids.");

  await auditLog({
    churchId,
    action: "kids.profile_updated",
    entityType: "kids_profiles",
    entityId: personId,
    metadata: { archived: true },
  });
}
