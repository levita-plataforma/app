import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { DomainError } from "@/server/errors/domain-error";
import { toDomainError } from "@/server/activities/rpc";

/**
 * Staff Kids asignado a una sesión (Fase 8 §11-13). La elegibilidad
 * (app.kids_staff_eligibility) combina pertenencia activa a la iglesia y
 * las credenciales obligatorias marcadas en kids_required_credentials.
 * eligible_at_assignment/eligibility_reasons en kids_session_staff son un
 * SNAPSHOT del momento de asignar, no una garantía permanente.
 *
 * Tras el hotfix 20260928001000, `kids_session_staff` no admite escritura
 * directa: se eliminó su política de gestión y se revocaron insert/update/
 * delete. Las cuatro operaciones pasan por RPC —
 * `public.kids_add_session_staff`, `public.kids_remove_session_staff`,
 * `public.kids_staff_check_in` y `public.kids_staff_check_out`—, que
 * comprueban la capacidad con el ámbito correcto, calculan la elegibilidad
 * dentro (ya no se envía el snapshot desde el cliente) y escriben su propia
 * auditoría. La barrera real vive ahí; lo que queda en TypeScript es para
 * poder enseñar un motivo claro antes de intentarlo.
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
 * Comprobación previa de elegibilidad, para avisar antes de intentar el
 * alta. Desde el hotfix, `kids_staff_eligibility` exige capacidad sobre la
 * iglesia consultada (kids.session.manage o kids.manage) y responde 42501 a
 * quien no la tenga: antes contestaba a cualquiera y servía de oráculo de
 * pertenencia y de estado del certificado de antecedentes entre iglesias.
 */
export async function checkStaffEligibility(
  churchId: string,
  personId: string,
  campusId?: string,
): Promise<StaffEligibility> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("kids_staff_eligibility", {
    p_church_id: churchId,
    p_person_id: personId,
    p_campus_id: campusId ?? null,
  });

  if (error) throw toDomainError(error, "No se pudo evaluar la elegibilidad del staff.");

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

/**
 * Personal de una sesión. No se exige `kids.read` desde la aplicación: la
 * política de `kids_session_staff` ya decide, y admite tres casos —
 * `kids.read`, `kids.session.manage` sobre la actividad, o que la fila sea
 * la de la propia persona—. Repetir aquí un `kids.read` a nivel de iglesia
 * era más estricto que la política y rompía la ficha de la sesión para
 * quien solo atiende la puerta, que ahora sí puede abrirla; con este cambio
 * ve al menos su propia asignación y puede registrar su entrada.
 */
export async function listSessionStaff(churchId: string, sessionId: string): Promise<KidsSessionStaffMember[]> {
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
 * El alta y la entrada del personal rechazan la falta de credencial con
 * 22023 y este mismo mensaje, que lleva dentro los códigos de motivo. Esos
 * códigos no están escritos para leerlos en una pantalla: se extraen y se
 * traducen. Cualquier otro 22023 —por ejemplo el de la salida, que explica
 * cuántos menores quedan en la sala y cuántos adultos hacen falta— se deja
 * tal cual, porque ya viene redactado para quien lo va a leer.
 */
const ELIGIBILITY_REJECTION_PREFIX = "Esa persona no puede estar con menores";

function translateStaffError(error: { code?: string; message: string }, fallback: string): DomainError {
  if (error.code !== "22023" || !error.message.startsWith(ELIGIBILITY_REJECTION_PREFIX)) {
    return toDomainError(error, fallback);
  }

  const separator = error.message.indexOf(":");
  const rawReasons = separator === -1 ? "" : error.message.slice(separator + 1).replace(/\.\s*$/, "");
  const labels = rawReasons
    .split(",")
    .map((reason) => reason.trim())
    .filter(Boolean)
    .map(translateEligibilityReason);

  if (labels.length === 0) {
    return new DomainError("VALIDATION_ERROR", `${ELIGIBILITY_REJECTION_PREFIX}.`);
  }
  return new DomainError("VALIDATION_ERROR", `${ELIGIBILITY_REJECTION_PREFIX}: ${labels.join(", ")}.`);
}

/**
 * Decisión de diseño: si la persona NO es elegible, el alta se RECHAZA sin
 * excepción. No hay flujo de override para staff no elegible — eso es
 * distinto del override de recogida (kids.pickup.override), y permitir que
 * alguien sin la credencial obligatoria trabaje con menores merecería su
 * propia capacidad y su propio registro auditado.
 *
 * La comprobación de elegibilidad de aquí solo sirve para explicar el
 * motivo antes de intentarlo: la barrera de verdad la aplica
 * `app.kids_add_session_staff`, que la recalcula dentro y rechaza con
 * 22023. El snapshot ya no se envía desde el cliente.
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
  const { data, error } = await supabase.rpc("kids_add_session_staff", {
    p_session_id: sessionId,
    p_person_id: personId,
    p_role: role,
  });

  if (error) {
    if (error.code === "23505") throw new DomainError("CONFLICT", "Esta persona ya es staff de esta sesión.");
    throw translateStaffError(error, "No se pudo añadir el staff a la sesión.");
  }

  const staffId = (Array.isArray(data) ? data[0] : data) as string | null;
  if (!staffId) throw new DomainError("INTERNAL_ERROR", "No se pudo añadir el staff a la sesión.");

  // La auditoría 'kids.staff_added' la escribe app.kids_add_session_staff.
  return { staffId };
}

/**
 * La baja también pasa por RPC y queda auditada ('kids.staff_removed'):
 * antes se borraba la fila sin dejar constancia. El motivo es opcional y
 * viaja al registro de auditoría.
 */
export async function removeStaffFromSession(
  churchId: string,
  staffRowId: string,
  reason?: string,
): Promise<void> {
  await requireCapability(churchId, "kids.session.manage");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("kids_remove_session_staff", {
    p_staff_id: staffRowId,
    p_reason: reason?.trim() || null,
  });

  if (error) throw toDomainError(error, "No se pudo quitar el staff de la sesión.");
}

/**
 * Entrada del personal en la sala, por `public.kids_staff_check_in`.
 *
 * Ya no se escribe en la tabla: la función acepta tanto
 * `kids.session.manage` como `kids.checkin` sobre la actividad —con el
 * ámbito correcto, que desde aquí no se puede evaluar sin haber leído antes
 * la sesión— y además **vuelve a comprobar la credencial en este momento**,
 * no solo cuando se asignó el turno: entre una cosa y otra puede haber
 * caducado. Ese rechazo llega con 22023 y sus motivos traducidos.
 *
 * No se repite la comprobación de capacidad en TypeScript porque hacerlo a
 * nivel de iglesia dejaría fuera precisamente a quien atiende la puerta,
 * que es quien más va a usar esto. Tampoco hace falta pasar la iglesia: la
 * función comprueba que la asignación sea de una iglesia del usuario.
 */
export async function staffCheckIn(staffRowId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("kids_staff_check_in", { p_staff_id: staffRowId });

  // La auditoría 'kids.staff_checked_in' la escribe la propia función.
  if (error) throw translateStaffError(error, "No se pudo registrar la entrada del personal.");
}

/**
 * Salida del personal, por `public.kids_staff_check_out`.
 *
 * La función impide salir si quedan menores en la sala y al irse se bajaría
 * del mínimo de adultos: es la otra mitad de la regla del ratio, la que
 * evita vaciar de adultos una sala llena de niños. Ese rechazo viene con
 * 22023 y un mensaje que ya dice cuántos menores quedan y cuántos adultos
 * hacen falta, así que se deja pasar tal cual hasta la pantalla.
 */
export async function staffCheckOut(staffRowId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("kids_staff_check_out", { p_staff_id: staffRowId });

  // La auditoría 'kids.staff_checked_out' la escribe la propia función.
  if (error) throw translateStaffError(error, "No se pudo registrar la salida del personal.");
}
