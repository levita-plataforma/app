import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";

/**
 * Staff Kids asignado a una sesión (Fase 8 §11-13). La elegibilidad
 * (app.kids_staff_eligibility) combina pertenencia activa a la iglesia,
 * compatibilidad de sede y credenciales obligatorias marcadas en
 * kids_required_credentials. eligible_at_assignment/eligibility_reasons en
 * kids_session_staff son un SNAPSHOT del momento de asignar, no una
 * garantía permanente.
 */

export type KidsStaffRole = "lead" | "assistant" | "support";

const REASON_LABELS: Record<string, string> = {
  inactive_person: "Persona no activa en la iglesia",
  wrong_campus: "Sede no compatible",
  missing_credential: "Falta una credencial obligatoria para Kids",
};

export function translateEligibilityReason(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}

export type StaffEligibility = {
  eligible: boolean;
  reasons: string[];
  reasonLabels: string[];
};

type StaffEligibilityRow = { eligible: boolean; reasons: string[] | null };

/**
 * NOTA: `app.kids_staff_eligibility` (migración 20260928000600) no tiene un
 * wrapper `public.*` en el SQL, a diferencia de `evaluate_person_eligibility`
 * (Fase 3) que sí lo tiene. Sin ese wrapper, PostgREST no expone esta
 * función como RPC pública y la llamada de abajo fallará en runtime contra
 * Supabase tal como está el esquema hoy. Se implementa igualmente tal como
 * pide el encargo (no se tocan migraciones en esta tarea); hace falta una
 * migración adicional con `create or replace function public.kids_staff_eligibility(...)`
 * (y su `grant execute to authenticated`) antes de que esto funcione end to end.
 */
export async function checkStaffEligibility(
  churchId: string,
  personId: string,
  campusId?: string,
): Promise<StaffEligibility> {
  const supabase = await createSupabaseServerClient();
  // kids_staff_eligibility no está en Database["public"]["Functions"]: solo
  // existe como app.kids_staff_eligibility sin wrapper public.* (ver nota
  // arriba), así que el nombre no es un literal conocido por el tipo del
  // cliente y cae en el overload genérico de `.rpc()`.
  const { data, error } = await supabase.rpc("kids_staff_eligibility", {
    p_church_id: churchId,
    p_person_id: personId,
    p_campus_id: campusId ?? null,
  });

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo evaluar la elegibilidad del staff.");

  const row = (Array.isArray(data) ? data[0] : data) as StaffEligibilityRow | undefined;
  if (!row) return { eligible: false, reasons: [], reasonLabels: [] };

  const reasons = Array.from(new Set(row.reasons ?? []));
  return { eligible: row.eligible, reasons, reasonLabels: reasons.map(translateEligibilityReason) };
}

export type KidsSessionStaffMember = {
  id: string;
  sessionId: string;
  personId: string;
  firstName: string;
  lastName: string | null;
  role: KidsStaffRole;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  eligibleAtAssignment: boolean;
  eligibilityReasons: string[];
};

type KidsSessionStaffRow = {
  id: string;
  session_id: string;
  person_id: string;
  role: KidsStaffRole;
  checked_in_at: string | null;
  checked_out_at: string | null;
  eligible_at_assignment: boolean;
  eligibility_reasons: string[];
  people: { first_name: string; last_name: string | null } | { first_name: string; last_name: string | null }[] | null;
};

export async function listSessionStaff(churchId: string, sessionId: string): Promise<KidsSessionStaffMember[]> {
  await requireCapability(churchId, "kids.read");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("kids_session_staff")
    .select(
      "id, session_id, person_id, role, checked_in_at, checked_out_at, eligible_at_assignment, eligibility_reasons, people!inner(first_name, last_name)",
    )
    .eq("church_id", churchId)
    .eq("session_id", sessionId);

  if (error || !data) return [];

  return (data as unknown as KidsSessionStaffRow[]).map((row) => {
    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    return {
      id: row.id,
      sessionId: row.session_id,
      personId: row.person_id,
      firstName: person?.first_name ?? "",
      lastName: person?.last_name ?? null,
      role: row.role,
      checkedInAt: row.checked_in_at,
      checkedOutAt: row.checked_out_at,
      eligibleAtAssignment: row.eligible_at_assignment,
      eligibilityReasons: row.eligibility_reasons ?? [],
    };
  });
}

/**
 * Decisión de diseño: si la persona NO es elegible, el alta se RECHAZA sin
 * excepción (DomainError con las razones traducidas). No se implementa un
 * flujo de override para staff no elegible en esta primera versión — eso es
 * distinto del override de pickup (kids.pickup.override) que ya existe en
 * SQL para la recogida de menores. Un override de staff (permitir que una
 * persona sin credencial obligatoria trabaje igualmente en Kids) es una
 * decisión de mayor riesgo que amerita su propio capability y su propio
 * registro auditado explícito, y queda fuera del alcance de este encargo.
 */
export async function addStaffToSession(
  churchId: string,
  sessionId: string,
  personId: string,
  role: KidsStaffRole,
): Promise<{ staffId: string }> {
  await requireCapability(churchId, "kids.session.manage");

  const eligibility = await checkStaffEligibility(churchId, personId);
  if (!eligibility.eligible) {
    throw new DomainError(
      "VALIDATION_ERROR",
      `La persona no es elegible para Kids: ${eligibility.reasonLabels.join(", ")}.`,
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("kids_session_staff")
    .insert({
      church_id: churchId,
      session_id: sessionId,
      person_id: personId,
      role,
      eligible_at_assignment: true,
      eligibility_reasons: [],
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") throw new DomainError("CONFLICT", "Esta persona ya es staff de esta sesión.");
    throw new DomainError("INTERNAL_ERROR", "No se pudo añadir el staff a la sesión.");
  }

  await auditLog({
    churchId,
    action: "kids.staff_added",
    entityType: "kids_session_staff",
    entityId: data.id,
    metadata: { session_id: sessionId, person_id: personId, role },
  });

  return { staffId: data.id };
}

export async function removeStaffFromSession(churchId: string, staffRowId: string): Promise<void> {
  await requireCapability(churchId, "kids.session.manage");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("kids_session_staff").delete().eq("church_id", churchId).eq("id", staffRowId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo quitar el staff de la sesión.");
  // Sin auditoría en el remove: el alta (kids.staff_added) ya queda
  // registrada, y esta es una operación operativa de baja frecuencia sin
  // implicación de seguridad equivalente al alta o al checkin/checkout.
}

async function requireSessionManageOrSelf(churchId: string, personId: string): Promise<void> {
  // No se encontró en el código un precedente limpio para "la propia
  // persona" resuelto desde el cliente Supabase (el patrón
  // current_person_ids/app.current_person_id vive en SQL, no en un helper
  // TS reutilizable). Por simplicidad y para no introducir una resolución
  // de identidad ad-hoc, se exige la capability kids.session.manage sin
  // distinguir "la propia persona". Documentado como decisión: si se
  // necesita que el propio staff pueda auto-checkin/checkout sin esa
  // capability, hace falta añadir un helper de "persona actual" reutilizable
  // primero.
  await requireCapability(churchId, "kids.session.manage");
  void personId;
}

export async function staffCheckIn(churchId: string, staffRowId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: staffRow, error: fetchError } = await supabase
    .from("kids_session_staff")
    .select("person_id")
    .eq("church_id", churchId)
    .eq("id", staffRowId)
    .maybeSingle();

  if (fetchError || !staffRow) throw new DomainError("RESOURCE_NOT_FOUND", "Staff de sesión no encontrado.");
  await requireSessionManageOrSelf(churchId, staffRow.person_id);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("kids_session_staff")
    .update({ checked_in_at: new Date().toISOString(), checked_in_by: user?.id ?? null })
    .eq("church_id", churchId)
    .eq("id", staffRowId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo registrar el check-in del staff.");
}

export async function staffCheckOut(churchId: string, staffRowId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: staffRow, error: fetchError } = await supabase
    .from("kids_session_staff")
    .select("person_id")
    .eq("church_id", churchId)
    .eq("id", staffRowId)
    .maybeSingle();

  if (fetchError || !staffRow) throw new DomainError("RESOURCE_NOT_FOUND", "Staff de sesión no encontrado.");
  await requireSessionManageOrSelf(churchId, staffRow.person_id);

  const { error } = await supabase
    .from("kids_session_staff")
    .update({ checked_out_at: new Date().toISOString() })
    .eq("church_id", churchId)
    .eq("id", staffRowId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo registrar el check-out del staff.");
}
