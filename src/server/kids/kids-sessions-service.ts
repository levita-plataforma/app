import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";

/**
 * Sesiones Kids (Fase 8 §10). Una sesión une una `activity` ya existente
 * (culto, evento...) con una sala Kids concreta; varias sesiones (una por
 * sala) pueden compartir la misma activity. Ver
 * `supabase/migrations/20260928000200_kids_salas_sesiones.sql`.
 */

export type KidsSessionStatus = "scheduled" | "open" | "closed" | "cancelled";

export type KidsSession = {
  id: string;
  churchId: string;
  activityId: string;
  roomId: string;
  campusId: string | null;
  status: KidsSessionStatus;
  openedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KidsSessionDetail = KidsSession & {
  activityTitle: string;
  activityStartsAt: string | null;
  activityEndsAt: string | null;
  roomName: string;
};

type KidsSessionRow = {
  id: string;
  church_id: string;
  activity_id: string;
  room_id: string;
  campus_id: string | null;
  status: KidsSessionStatus;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

type KidsSessionDetailRow = KidsSessionRow & {
  activities: { title: string; starts_at: string | null; ends_at: string | null } | { title: string; starts_at: string | null; ends_at: string | null }[] | null;
  kids_rooms: { name: string } | { name: string }[] | null;
};

const SESSION_COLUMNS = "id, church_id, activity_id, room_id, campus_id, status, opened_at, closed_at, created_at, updated_at";

function mapSession(row: KidsSessionRow): KidsSession {
  return {
    id: row.id,
    churchId: row.church_id,
    activityId: row.activity_id,
    roomId: row.room_id,
    campusId: row.campus_id,
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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

export type KidsSessionFilters = {
  status?: KidsSessionStatus;
  roomId?: string;
  from?: string;
  to?: string;
};

export async function listKidsSessions(churchId: string, filters: KidsSessionFilters = {}): Promise<KidsSessionDetail[]> {
  await requireCapability(churchId, "kids.read");

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("kids_sessions")
    .select(
      `${SESSION_COLUMNS}, activities!inner(title, starts_at, ends_at), kids_rooms!inner(name)`,
    )
    .eq("church_id", churchId);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.roomId) query = query.eq("room_id", filters.roomId);
  if (filters.from) query = query.gte("activities.starts_at", filters.from);
  if (filters.to) query = query.lte("activities.starts_at", filters.to);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error || !data) return [];

  return (data as unknown as KidsSessionDetailRow[]).map(mapSessionDetail);
}

function mapSessionDetail(row: KidsSessionDetailRow): KidsSessionDetail {
  const activity = Array.isArray(row.activities) ? row.activities[0] : row.activities;
  const room = Array.isArray(row.kids_rooms) ? row.kids_rooms[0] : row.kids_rooms;

  return {
    ...mapSession(row),
    activityTitle: activity?.title ?? "",
    activityStartsAt: activity?.starts_at ?? null,
    activityEndsAt: activity?.ends_at ?? null,
    roomName: room?.name ?? "",
  };
}

/**
 * Lee una sesión concreta. Aquí NO se exige `kids.read` desde la
 * aplicación: el hotfix 20260928001000 amplió `kids_sessions_select` para
 * que también puedan abrirla quien solo tiene `kids.checkin` o
 * `kids.checkout` sobre la actividad —que es justamente quien atiende la
 * puerta, y antes recibía un 404—. Esa política evalúa la capacidad con el
 * ámbito correcto (iglesia, sede o actividad), algo que desde aquí no se
 * puede hacer sin haber leído antes la sesión: repetirlo en TypeScript solo
 * serviría para volver a dejar fuera a la puerta. La barrera es la RLS; si
 * no corresponde, la consulta no devuelve nada y esto responde `null`.
 *
 * Los dos embebidos van sin `!inner` a propósito: la sala sigue pidiendo
 * `kids.read` por su propia política, y con un `inner join` la sesión entera
 * desaparecía para la puerta por no poder ver el nombre de la sala.
 */
export async function getKidsSession(churchId: string, sessionId: string): Promise<KidsSessionDetail | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("kids_sessions")
    .select(`${SESSION_COLUMNS}, activities(title, starts_at, ends_at), kids_rooms(name)`)
    .eq("church_id", churchId)
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !data) return null;
  return mapSessionDetail(data as unknown as KidsSessionDetailRow);
}

export async function createKidsSessionFromActivity(
  churchId: string,
  activityId: string,
  roomId: string,
  campusId?: string,
): Promise<{ sessionId: string }> {
  // El scope efectivo es 'activity' (mismo patrón que Fase 6 con eventos):
  // app.kids_cap también admite 'campus' o el capability a nivel de
  // iglesia, pero desde TS comprobamos primero contra la activity, que es
  // el scope más específico disponible aquí.
  await requireCapability(churchId, "kids.session.manage", "activity", activityId);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("kids_sessions")
    .insert({
      church_id: churchId,
      activity_id: activityId,
      room_id: roomId,
      campus_id: campusId || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      throw new DomainError("CONFLICT", "Ya existe una sesión Kids para esta sala en esta actividad.");
    }
    throw new DomainError("INTERNAL_ERROR", "No se pudo crear la sesión Kids.");
  }

  await auditLog({
    churchId,
    action: "kids.session_created",
    entityType: "kids_sessions",
    entityId: data.id,
    metadata: { activity_id: activityId, room_id: roomId },
  });

  return { sessionId: data.id };
}

export async function closeKidsSession(churchId: string, sessionId: string): Promise<void> {
  const activityId = await getSessionActivityId(churchId, sessionId);
  await requireCapability(churchId, "kids.session.manage", "activity", activityId);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("kids_sessions")
    .update({ status: "closed", closed_at: new Date().toISOString(), closed_by: user?.id ?? null })
    .eq("church_id", churchId)
    .eq("id", sessionId);

  if (error) throw new DomainError("INTERNAL_ERROR", "No se pudo cerrar la sesión Kids.");

  await auditLog({
    churchId,
    action: "kids.session_closed",
    entityType: "kids_sessions",
    entityId: sessionId,
  });
}

/**
 * Estados que devuelve `app.kids_room_ratio_status`, los tres del enum
 * `kids_ratio_state`. `warning` significa «la sala está en su máximo para
 * el personal presente»: todavía no se incumple el ratio, pero el siguiente
 * menor ya no entra sin otro adulto.
 */
export type KidsRatioState = "safe" | "warning" | "blocked";

export type KidsRatioStatus = {
  state: KidsRatioState;
  childrenCheckedIn: number;
  staffCheckedIn: number;
  minAdultsRequired: number;
  ratioChildrenPerAdult: number;
  maxChildrenForCurrentStaff: number;
};

/**
 * El ratio no siempre se puede responder, y la diferencia importa en la
 * puerta: no es lo mismo «no tienes permiso para ver esto» que «no se ha
 * podido calcular». Devolver `null` para ambos casos dejaba la pantalla
 * diciendo que algo falló cuando en realidad faltaba un permiso.
 */
export type KidsRatioView =
  | { kind: "ok"; ratio: KidsRatioStatus }
  | { kind: "forbidden" }
  | { kind: "unavailable" };

type KidsRatioStatusRow = {
  state: KidsRatioState;
  children_checked_in: number;
  staff_checked_in: number;
  min_adults_required: number;
  ratio_children_per_adult: number;
  max_children_for_current_staff: number;
};

/**
 * Estado del ratio de una sesión. Desde el hotfix 20260928001000,
 * `kids_room_ratio_status` exige capacidad sobre la iglesia que organiza la
 * sala (kids.read o kids.checkin) y responde 42501 a quien no la tenga:
 * antes contestaba a cualquiera, incluso desde otra iglesia, y con solo un
 * uuid de sesión se podía leer la ocupación de cualquier sala.
 *
 * Lo que sí se hace aquí es resolver la sesión contra la iglesia del
 * contexto antes de preguntar, para no pasar a la base un uuid del cliente
 * sin validar. La capacidad no se recomprueba en TypeScript: la función la
 * evalúa con el ámbito correcto (iglesia, sede o actividad) y repetirlo con
 * un ámbito fijo solo serviría para dejar fuera a quien la tiene concedida
 * sobre la actividad, que es el caso de la puerta. Su 42501 se traduce a
 * «sin permiso», no a una pantalla rota.
 */
export async function getRatioStatus(churchId: string, sessionId: string): Promise<KidsRatioView> {
  try {
    await getSessionActivityId(churchId, sessionId);
  } catch {
    // La sesión no existe o no es de esta iglesia: no se llega a preguntar.
    return { kind: "unavailable" };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("kids_room_ratio_status", { p_session_id: sessionId });

  if (error) return error.code === "42501" ? { kind: "forbidden" } : { kind: "unavailable" };
  if (!data) return { kind: "unavailable" };

  const row = (Array.isArray(data) ? data[0] : data) as KidsRatioStatusRow | undefined;
  if (!row) return { kind: "unavailable" };

  return {
    kind: "ok",
    ratio: {
      state: row.state,
      childrenCheckedIn: row.children_checked_in,
      staffCheckedIn: row.staff_checked_in,
      minAdultsRequired: row.min_adults_required,
      ratioChildrenPerAdult: row.ratio_children_per_adult,
      maxChildrenForCurrentStaff: row.max_children_for_current_staff,
    },
  };
}
