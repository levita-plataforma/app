import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability, hasCapability } from "@/server/tenant/authorize";
import { DomainError } from "@/server/errors/domain-error";
import { toDomainError } from "@/server/activities/rpc";
import { candidateSearchTerms } from "@/server/assignments/assignments-service";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Check-in/check-out de menores (Fase 8 §18-22, §44-45). Las mutaciones
 * viajan siempre por las RPC transaccionales `public.kids_checkin` /
 * `public.kids_checkout` (migración 20260928000700, reescritas en el hotfix
 * 20260928001000), que ya auditan internamente ('kids.checkin',
 * 'kids.checkout', 'kids.pickup_denied', 'kids.pickup_override'): este
 * servicio NUNCA duplica esa auditoría.
 *
 * Desde el hotfix, `kid_checkins` no admite ninguna escritura directa y su
 * columna `pickup_token_hash` ya no es legible: no se puede localizar un
 * check-in recalculando el hash del código desde Node, eso lo hace
 * `app.kids_checkout` por dentro.
 */

type KidCheckinStatus = Database["public"]["Enums"]["kid_checkin_status"];

async function getSessionActivityId(churchId: string, sessionId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("kids_sessions")
    .select("activity_id")
    .eq("church_id", churchId)
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !data) throw new DomainError("RESOURCE_NOT_FOUND", "Sesión Kids no encontrada.");
  return data.activity_id;
}

export type CheckinKidResult = {
  checkinId: string;
  /**
   * Código de recogida en texto plano. Esta es la ÚNICA vez que este
   * código está disponible sin hashear: `kid_checkins.pickup_token_hash`
   * solo guarda su hash, así que si se pierde no se puede volver a
   * consultar (solo generar un nuevo check-in). La UI que invoque esta
   * función debe mostrarlo de inmediato de forma prominente (p. ej. en
   * grande, con opción de imprimir/compartir) y no asumir que podrá
   * recuperarlo después.
   */
  pickupCode: string | null;
  replayed: boolean;
};

/**
 * Los rechazos del check-in (22023) llegan con el mensaje que escribe la
 * propia RPC, que ya es accionable: dice el nombre de la sala, cuántos
 * adultos exige y cuántos hay. Desde el hotfix 20260928001000 el ratio
 * bloquea de verdad —antes la pantalla avisaba pero nada lo impedía—, así
 * que a esos dos casos se les añade qué hacer para desbloquearlo.
 */
function translateCheckinRejection(error: { code?: string; message: string }): DomainError {
  const domain = toDomainError(error, "No se pudo registrar el check-in.");

  // Solo los rechazos por falta de adultos o por ratio hablan de adultos;
  // el aforo, la sesión cerrada o el menor de otra iglesia, no.
  if (!/adulto/i.test(domain.message)) return domain;

  return new DomainError(
    domain.code,
    `${domain.message} Registra la entrada de más personal en la sala antes de aceptar a otro menor.`,
  );
}

export async function checkinKid(
  churchId: string,
  sessionId: string,
  kidPersonId: string,
): Promise<CheckinKidResult> {
  const activityId = await getSessionActivityId(churchId, sessionId);
  await requireCapability(churchId, "kids.checkin", "activity", activityId);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("kids_checkin", {
    p_session_id: sessionId,
    p_kid_person_id: kidPersonId,
  });

  if (error) {
    if (error.code === "42501") throw new DomainError("FORBIDDEN", "No tienes permiso para hacer check-in.");
    if (error.code === "P0002") throw new DomainError("RESOURCE_NOT_FOUND", "Sesión Kids no encontrada.");
    if (error.code === "22023") throw translateCheckinRejection(error);
    throw toDomainError(error, "No se pudo registrar el check-in.");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new DomainError("INTERNAL_ERROR", "No se pudo registrar el check-in.");

  // Auditoría 'kids.checkin' ya la escribe app.kids_checkin.
  return { checkinId: row.checkin_id, pickupCode: row.pickup_code, replayed: row.replayed };
}

export type KidCheckinCandidate = {
  personId: string;
  firstName: string;
  lastName: string | null;
};

type ChurchPersonRow = {
  person_id: string;
  people: { first_name: string; last_name: string | null } | { first_name: string; last_name: string | null }[] | null;
};

/**
 * Busca menores candidatos a check-in en la sesión: personas de la iglesia
 * cuyo nombre coincide con la búsqueda y que NO tienen ya un check-in
 * activo (status='checked_in') en esa sesión.
 */
export async function searchKidForCheckin(
  churchId: string,
  sessionId: string,
  query: string,
): Promise<KidCheckinCandidate[]> {
  const activityId = await getSessionActivityId(churchId, sessionId);
  await requireCapability(churchId, "kids.checkin", "activity", activityId);

  // El término se parte y se limpia (fuera comodines, comas, paréntesis,
  // comillas y barras) antes de entrar en el filtro `or` de PostgREST: sin
  // limpiarlo, una coma o un paréntesis reescriben el filtro entero y se
  // puede consultar lo que no toca. Mismo criterio que `listCandidatePeople`
  // en Asignaciones.
  const terms = candidateSearchTerms(query);
  if (terms.length === 0) return [];

  const supabase = await createSupabaseServerClient();

  const { data: activeCheckins } = await supabase
    .from("kid_checkins")
    .select("kid_person_id")
    .eq("church_id", churchId)
    .eq("session_id", sessionId)
    .eq("status", "checked_in");

  const excludeIds = (activeCheckins ?? []).map((row) => row.kid_person_id as string);

  let candidateQuery = supabase
    .from("church_people")
    .select("person_id, people!church_people_person_id_fkey!inner(first_name, last_name)")
    .eq("church_id", churchId)
    .is("archived_at", null)
    .limit(25);

  for (const term of terms) {
    candidateQuery = candidateQuery.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`, {
      referencedTable: "people",
    });
  }

  if (excludeIds.length > 0) {
    candidateQuery = candidateQuery.not("person_id", "in", `(${excludeIds.join(",")})`);
  }

  const { data, error } = await candidateQuery;
  if (error || !data) return [];

  return (data as unknown as ChurchPersonRow[]).map((row) => {
    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    return {
      personId: row.person_id,
      firstName: person?.first_name ?? "",
      lastName: person?.last_name ?? null,
    };
  });
}

export type CheckoutKidResult = {
  checkinId: string;
  status: KidCheckinStatus;
  /**
   * Cuando es `false`, la RPC NO lanzó excepción: significa "recogida no
   * autorizada" (código válido, pero quien recoge no está en la lista de
   * autorizados y no se aplicó override). Este resultado se devuelve tal
   * cual al caller para que la UI muestre el bloqueo con claridad, sin que
   * parezca un error técnico — NO se convierte en DomainError aquí.
   */
  authorized: boolean;
};

export type PickupLookup = {
  checkinId: string;
  kidPersonId: string;
  kidName: string;
  roomName: string | null;
  /**
   * Aviso de que hay algo que consultar antes de entregar al menor. Es el
   * indicador, no el detalle: las notas de accesibilidad y de emergencia
   * viven en `kids_sensitive_notes` y solo las ve quien tenga
   * `kids.sensitive.read`.
   */
  medicalAlert: boolean;
};

/**
 * Localiza el check-in a partir del código de recogida, por
 * `public.kids_lookup_pickup`. La aplicación no puede hacerlo por su
 * cuenta: `kid_checkins.pickup_token_hash` dejó de ser legible en el hotfix
 * 20260928001000 (con la huella a la vista se pudo recuperar un código
 * real) y la fórmula lleva dentro el identificador del check-in. La función
 * exige `kids.checkout`, devuelve solo lo justo para atender la puerta y no
 * sirve como oráculo de códigos.
 *
 * Es solo lectura: la recogida sigue pasando por `kids_checkout`, que lo
 * vuelve a validar todo dentro de la misma transacción.
 */
export async function lookupPickupByCode(
  churchId: string,
  sessionId: string,
  pickupCode: string,
): Promise<PickupLookup> {
  const activityId = await getSessionActivityId(churchId, sessionId);
  await requireCapability(churchId, "kids.checkout", "activity", activityId);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("kids_lookup_pickup", {
    p_session_id: sessionId,
    p_pickup_code: pickupCode,
  });

  if (error) {
    if (error.code === "P0002") throw new DomainError("RESOURCE_NOT_FOUND", "Código no válido o ya utilizado.");
    throw toDomainError(error, "No se pudo comprobar el código de recogida.");
  }

  type PickupLookupRow = {
    checkin_id: string;
    kid_person_id: string;
    kid_name: string | null;
    room_name: string | null;
    medical_alert: boolean | null;
  };

  const row = (Array.isArray(data) ? data[0] : data) as PickupLookupRow | undefined;
  if (!row) throw new DomainError("RESOURCE_NOT_FOUND", "Código no válido o ya utilizado.");

  return {
    checkinId: row.checkin_id,
    kidPersonId: row.kid_person_id,
    kidName: row.kid_name?.trim() || "Menor",
    roomName: row.room_name,
    medicalAlert: row.medical_alert ?? false,
  };
}

export async function checkoutKid(
  churchId: string,
  sessionId: string,
  pickupCode: string,
  pickupPersonName: string,
  authorizedPickupId?: string,
  overrideReason?: string,
): Promise<CheckoutKidResult> {
  const activityId = await getSessionActivityId(churchId, sessionId);
  await requireCapability(churchId, "kids.checkout", "activity", activityId);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("kids_checkout", {
    p_pickup_code: pickupCode,
    p_session_id: sessionId,
    p_pickup_person_name: pickupPersonName,
    p_authorized_pickup_id: authorizedPickupId,
    p_override_reason: overrideReason,
  });

  if (error) {
    if (error.code === "42501") {
      throw new DomainError(
        "FORBIDDEN",
        overrideReason
          ? "No tienes permiso para anular la validación de recogida."
          : "No tienes permiso para hacer check-out.",
      );
    }
    if (error.code === "P0002") throw new DomainError("RESOURCE_NOT_FOUND", "Código no válido o ya utilizado.");
    throw toDomainError(error, "No se pudo registrar el check-out.");
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new DomainError("INTERNAL_ERROR", "No se pudo registrar el check-out.");

  // Auditoría ('kids.checkout' / 'kids.pickup_denied' / 'kids.pickup_override')
  // ya la escribe app.kids_checkout según el caso.
  return { checkinId: row.checkin_id, status: row.status, authorized: row.authorized };
}

export type AuthorizedPickup = {
  id: string;
  authorizedNameSnapshot: string;
  relationText: string | null;
  authorizationType: Database["public"]["Enums"]["pickup_authorization_type"];
};

export async function getAuthorizedPickupsForSession(
  churchId: string,
  kidPersonId: string,
): Promise<AuthorizedPickup[]> {
  await requireCapability(churchId, "kids.checkout");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("kids_authorized_pickups", {
    p_kid_person_id: kidPersonId,
    p_church_id: churchId,
  });

  if (error || !data) return [];

  type AuthorizedPickupRow = {
    id: string;
    authorized_name_snapshot: string;
    relation_text: string | null;
    authorization_type: Database["public"]["Enums"]["pickup_authorization_type"];
  };

  return (data as AuthorizedPickupRow[]).map((row) => ({
    id: row.id,
    authorizedNameSnapshot: row.authorized_name_snapshot,
    relationText: row.relation_text,
    authorizationType: row.authorization_type,
  }));
}

export type ActiveKidCheckin = {
  id: string;
  kidPersonId: string;
  firstName: string;
  lastName: string | null;
  checkedInAt: string;
  status: KidCheckinStatus;
  incidentFlag: boolean;
};

type ActiveKidCheckinRow = {
  id: string;
  kid_person_id: string;
  checked_in_at: string;
  status: KidCheckinStatus;
  incident_flag: boolean;
  people: { first_name: string; last_name: string | null } | { first_name: string; last_name: string | null }[] | null;
};

/**
 * Menores con la entrada registrada en una sesión. Se aceptan las dos
 * mismas capacidades que acepta la política de lectura de `kid_checkins`
 * (kids.read sobre la iglesia, o kids.checkin sobre la actividad): exigir
 * solo kids.read dejaba fuera a quien atiende la puerta, que es quien más
 * necesita ver la lista, y la consulta le habría devuelto vacío sin
 * explicar por qué.
 */
export async function getCheckinsForSession(churchId: string, sessionId: string): Promise<ActiveKidCheckin[]> {
  const activityId = await getSessionActivityId(churchId, sessionId);
  const [canRead, canCheckin] = await Promise.all([
    hasCapability(churchId, "kids.read"),
    hasCapability(churchId, "kids.checkin", "activity", activityId),
  ]);
  if (!canRead && !canCheckin) {
    throw new DomainError("FORBIDDEN", "No tienes permiso para ver los menores de esta sesión (kids.read).");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("kid_checkins")
    .select("id, kid_person_id, checked_in_at, status, incident_flag, people:kid_person_id(first_name, last_name)")
    .eq("church_id", churchId)
    .eq("session_id", sessionId)
    .eq("status", "checked_in")
    .order("checked_in_at", { ascending: true });

  if (error || !data) return [];

  return (data as unknown as ActiveKidCheckinRow[]).map((row) => {
    const person = Array.isArray(row.people) ? row.people[0] : row.people;
    return {
      id: row.id,
      kidPersonId: row.kid_person_id,
      firstName: person?.first_name ?? "",
      lastName: person?.last_name ?? null,
      checkedInAt: row.checked_in_at,
      status: row.status,
      incidentFlag: row.incident_flag,
    };
  });
}
