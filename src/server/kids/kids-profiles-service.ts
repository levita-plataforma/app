import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";
import { toDomainError } from "@/server/activities/rpc";
import { candidateSearchTerms } from "@/server/assignments/assignments-service";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Perfiles Kids (Fase 8 §4). Un `kids_profile` extiende una fila ya
 * existente en `people`: nunca se duplica `birth_date` (la edad se calcula
 * aquí a partir de `people.birth_date`).
 *
 * Desde el hotfix 20260928001000 las notas de accesibilidad y de emergencia
 * ya NO viven en `kids_profiles`: están en la tabla aparte
 * `kids_sensitive_notes`, cuya política de RLS exige `kids.sensitive.read`.
 * Eso sustituye al filtrado que antes se hacía en Node después de traer las
 * columnas de la base, que no era una barrera real (RLS filtra filas, no
 * columnas, así que el dato salía igualmente del servidor). En
 * `kids_profiles` se queda `medical_alert_flag`, que es el aviso de «hay
 * algo que consultar» y sí debe verse en la sala.
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
  active: boolean;
  archivedAt: string | null;
};

/**
 * Columnas de `kids_profiles` que existen tras el hotfix. Se listan de
 * forma explícita en vez de `select("*")` para que la aparición de una
 * columna sensible en la tabla sea siempre una decisión escrita.
 */
const PROFILE_COLUMNS = "id, person_id, status, preferred_name, medical_alert_flag, active, archived_at";

type ProfileRow = {
  id: string;
  person_id: string;
  status: KidsProfileStatus;
  preferred_name: string | null;
  medical_alert_flag: boolean;
  active: boolean;
  archived_at: string | null;
};

type PersonInfo = { first_name: string; last_name: string | null; birth_date: string | null };

function mapProfile(row: ProfileRow, person: PersonInfo | null): KidsProfile {
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

  const { data: person, error: personError } = await supabase
    .from("people")
    .select("first_name, last_name")
    .eq("id", personId)
    .single();

  if (personError || !person) throw new DomainError("RESOURCE_NOT_FOUND", "No se encontró a la persona indicada.");

  // La fecha de nacimiento no se lee con un select directo desde R-01: la sirve
  // una RPC que exige kids.manage, que es justo la capacidad que esta función
  // ya ha comprobado arriba.
  const { data: fechas } = await supabase.rpc("people_birth_dates", {
    p_church_id: churchId,
    p_person_ids: [personId],
  });
  const birthDate = fechas?.[0]?.birth_date ?? null;
  const personInfo = { ...person, birth_date: birthDate };

  const { data: existing, error: existingError } = await supabase
    .from("kids_profiles")
    .select(PROFILE_COLUMNS)
    .eq("church_id", churchId)
    .eq("person_id", personId)
    .maybeSingle();

  if (existingError) throw new DomainError("INTERNAL_ERROR", "No se pudo consultar el perfil Kids.");
  if (existing) return mapProfile(existing as unknown as ProfileRow, personInfo);

  const { data: created, error: createError } = await supabase
    .from("kids_profiles")
    .insert({ church_id: churchId, person_id: personId })
    .select(PROFILE_COLUMNS)
    .single();

  if (createError || !created) {
    if (createError?.code === "23505") {
      // Carrera: otro caller lo creó entre el select y el insert. Reintenta lectura.
      const { data: retry } = await supabase
        .from("kids_profiles")
        .select(PROFILE_COLUMNS)
        .eq("church_id", churchId)
        .eq("person_id", personId)
        .single();
      if (retry) return mapProfile(retry as unknown as ProfileRow, personInfo);
    }
    throw new DomainError("INTERNAL_ERROR", "No se pudo crear el perfil Kids.");
  }

  const createdRow = created as unknown as ProfileRow;

  await auditLog({
    churchId,
    action: "kids.profile_created",
    entityType: "kids_profiles",
    entityId: createdRow.id,
    metadata: { person_id: personId },
  });

  return mapProfile(createdRow, personInfo);
}

export type KidsSensitiveNotes = {
  accessibilityNotes: string | null;
  emergencyNotes: string | null;
  updatedAt: string | null;
};

/**
 * Notas de accesibilidad y de emergencia de un menor. La barrera es la
 * política de RLS de `kids_sensitive_notes`, que exige
 * `kids.sensitive.read`: a quien no la tenga, la consulta le devuelve vacío
 * y esta función responde `null`. No se repite aquí la comprobación de
 * capacidad para que el permiso tenga un único sitio donde vivir.
 */
export async function getKidsSensitiveNotes(churchId: string, personId: string): Promise<KidsSensitiveNotes | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("kids_sensitive_notes")
    .select("accessibility_notes, emergency_notes, updated_at")
    .eq("church_id", churchId)
    .eq("kid_person_id", personId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as {
    accessibility_notes: string | null;
    emergency_notes: string | null;
    updated_at: string | null;
  };

  return {
    accessibilityNotes: row.accessibility_notes,
    emergencyNotes: row.emergency_notes,
    updatedAt: row.updated_at,
  };
}

/**
 * Guarda las notas sensibles. La escritura solo existe como RPC
 * (`public.kids_save_sensitive_notes`), que exige `kids.manage` **y**
 * `kids.sensitive.read` y escribe su propia auditoría
 * ('kids.sensitive_notes_saved'): aquí no se duplica.
 */
export async function saveKidsSensitiveNotes(
  churchId: string,
  personId: string,
  input: { accessibilityNotes?: string | null; emergencyNotes?: string | null },
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("kids_save_sensitive_notes", {
    p_church_id: churchId,
    p_kid_person_id: personId,
    p_accessibility_notes: input.accessibilityNotes?.trim() || null,
    p_emergency_notes: input.emergencyNotes?.trim() || null,
  });

  if (error) throw toDomainError(error, "No se pudieron guardar las notas del menor.");
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
  // El término de búsqueda se parte y se limpia antes de entrar en el
  // filtro `or` de PostgREST: sin limpiarlo, una coma o un paréntesis
  // reescriben el filtro entero. Mismo criterio que `listCandidatePeople`
  // en Asignaciones.
  for (const term of candidateSearchTerms(filters.search)) {
    query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`, { referencedTable: "people" });
  }

  const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);
  if (error || !data) return { items: [], total: 0, page, pageSize };

  const personIds: string[] = data.map((row) => row.person_id);
  if (personIds.length === 0) return { items: [], total: count ?? 0, page, pageSize };

  const { data: birthDateRows } = await supabase.rpc("people_birth_dates", {
    p_church_id: churchId,
    p_person_ids: personIds,
  });

  const [householdRows, guardianCounts, pickupCounts] = await Promise.all([
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

  // La forma se anota a mano: en este punto TypeScript no infiere el retorno de
  // la RPC —sí lo hace en getOrCreateKidsProfile, con la misma llamada— y sin
  // esto el mapa acaba siendo Map<any, {}> y la edad deja de calcularse.
  type FechaNacimiento = { person_id: string; birth_date: string | null };
  const birthDateByPerson = new Map<string, string | null>(
    ((birthDateRows ?? []) as FechaNacimiento[]).map((p) => [p.person_id, p.birth_date]),
  );

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

/**
 * Campos del perfil que siguen viviendo en `kids_profiles`. Las notas
 * sensibles ya no se escriben por aquí: van por `saveKidsSensitiveNotes`.
 */
export type UpdateKidsProfileInput = {
  preferredName?: string | null;
  medicalAlertFlag?: boolean;
  status?: KidsProfileStatus;
};

export async function updateKidsProfile(
  churchId: string,
  personId: string,
  input: UpdateKidsProfileInput,
): Promise<void> {
  await requireCapability(churchId, "kids.manage");

  const patch: Record<string, unknown> = {};
  if (input.preferredName !== undefined) patch.preferred_name = input.preferredName?.trim() || null;
  if (input.medicalAlertFlag !== undefined) patch.medical_alert_flag = input.medicalAlertFlag;
  if (input.status !== undefined) patch.status = input.status;
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
    metadata: { updated: Object.keys(patch) },
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
