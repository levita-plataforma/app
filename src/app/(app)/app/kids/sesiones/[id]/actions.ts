"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import { closeKidsSession, getRatioStatus, type KidsRatioStatus } from "@/server/kids/kids-sessions-service";
import {
  checkStaffEligibility,
  addStaffToSession,
  removeStaffFromSession,
  staffCheckIn,
  staffCheckOut,
  type StaffEligibility,
  type KidsStaffRole,
} from "@/server/kids/kids-staff-service";
import { createSupabaseServerClient } from "@/server/supabase/server-client";

export type SesionActionState<T> = { error: string | null; data?: T };

function asState<T>(err: unknown): SesionActionState<T> {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

export async function getRatioStatusAction(sessionId: string): Promise<SesionActionState<KidsRatioStatus | null>> {
  const tenant = await requireTenantContext();
  try {
    const data = await getRatioStatus(tenant.churchId, sessionId);
    return { error: null, data };
  } catch (err) {
    return asState(err);
  }
}

export async function cerrarSesionAction(sessionId: string): Promise<SesionActionState<null>> {
  const tenant = await requireTenantContext();
  try {
    await closeKidsSession(tenant.churchId, sessionId);
    revalidatePath(`/app/kids/sesiones/${sessionId}`);
    revalidatePath("/app/kids/sesiones");
    return { error: null, data: null };
  } catch (err) {
    return asState(err);
  }
}

export type PersonCandidate = { personId: string; firstName: string; lastName: string | null };

/**
 * Búsqueda simple de personas de la iglesia para el selector de staff.
 * No hay un servicio de búsqueda de personas reutilizable expuesto en
 * src/server para este caso puntual (candidato a staff, no a menor), así
 * que se hace una query directa análoga a searchKidForCheckin.
 */
export async function searchPersonForStaffAction(query: string): Promise<SesionActionState<PersonCandidate[]>> {
  const tenant = await requireTenantContext();
  const term = query.trim();
  if (!term) return { error: null, data: [] };

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("church_people")
      .select("person_id, people!church_people_person_id_fkey!inner(first_name, last_name)")
      .eq("church_id", tenant.churchId)
      .is("archived_at", null)
      .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`, { referencedTable: "people" })
      .limit(25);

    if (error || !data) return { error: null, data: [] };

    type Row = { person_id: string; people: { first_name: string; last_name: string | null } | { first_name: string; last_name: string | null }[] | null };
    const result = (data as unknown as Row[]).map((row) => {
      const person = Array.isArray(row.people) ? row.people[0] : row.people;
      return { personId: row.person_id, firstName: person?.first_name ?? "", lastName: person?.last_name ?? null };
    });
    return { error: null, data: result };
  } catch (err) {
    return asState(err);
  }
}

export async function checkStaffEligibilityAction(personId: string): Promise<SesionActionState<StaffEligibility>> {
  const tenant = await requireTenantContext();
  try {
    const data = await checkStaffEligibility(tenant.churchId, personId, tenant.campusId);
    return { error: null, data };
  } catch (err) {
    return asState(err);
  }
}

export async function addStaffToSessionAction(
  sessionId: string,
  personId: string,
  role: KidsStaffRole,
): Promise<SesionActionState<{ staffId: string }>> {
  const tenant = await requireTenantContext();
  try {
    const data = await addStaffToSession(tenant.churchId, sessionId, personId, role);
    revalidatePath(`/app/kids/sesiones/${sessionId}`);
    return { error: null, data };
  } catch (err) {
    return asState(err);
  }
}

export async function removeStaffFromSessionAction(sessionId: string, staffRowId: string): Promise<SesionActionState<null>> {
  const tenant = await requireTenantContext();
  try {
    await removeStaffFromSession(tenant.churchId, staffRowId);
    revalidatePath(`/app/kids/sesiones/${sessionId}`);
    return { error: null, data: null };
  } catch (err) {
    return asState(err);
  }
}

export async function staffCheckInAction(sessionId: string, staffRowId: string): Promise<SesionActionState<null>> {
  const tenant = await requireTenantContext();
  try {
    await staffCheckIn(tenant.churchId, staffRowId);
    revalidatePath(`/app/kids/sesiones/${sessionId}`);
    return { error: null, data: null };
  } catch (err) {
    return asState(err);
  }
}

export async function staffCheckOutAction(sessionId: string, staffRowId: string): Promise<SesionActionState<null>> {
  const tenant = await requireTenantContext();
  try {
    await staffCheckOut(tenant.churchId, staffRowId);
    revalidatePath(`/app/kids/sesiones/${sessionId}`);
    return { error: null, data: null };
  } catch (err) {
    return asState(err);
  }
}
