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

export async function getKidsSession(churchId: string, sessionId: string): Promise<KidsSessionDetail | null> {
  await requireCapability(churchId, "kids.read");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("kids_sessions")
    .select(`${SESSION_COLUMNS}, activities!inner(title, starts_at, ends_at), kids_rooms!inner(name)`)
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

export type KidsRatioStatus = {
  state: "safe" | "warning" | "blocked";
  childrenCheckedIn: number;
  staffCheckedIn: number;
  minAdultsRequired: number;
  ratioChildrenPerAdult: number;
  maxChildrenForCurrentStaff: number;
};

type KidsRatioStatusRow = {
  state: "safe" | "warning" | "blocked";
  children_checked_in: number;
  staff_checked_in: number;
  min_adults_required: number;
  ratio_children_per_adult: number;
  max_children_for_current_staff: number;
};

/**
 * NOTA: `app.kids_room_ratio_status` (migración 20260928000600) no tiene un
 * wrapper `public.*` en el SQL, a diferencia de `evaluate_person_eligibility`
 * (Fase 3) que sí lo tiene. Sin ese wrapper, PostgREST no expone esta
 * función como RPC pública y la llamada de abajo fallará en runtime contra
 * Supabase tal como está el esquema hoy. Se implementa igualmente tal como
 * pide el encargo (no se tocan migraciones en esta tarea); hace falta una
 * migración adicional con `create or replace function public.kids_room_ratio_status(...)`
 * (y su `grant execute to authenticated`) antes de que esto funcione end to end.
 */
export async function getRatioStatus(churchId: string, sessionId: string): Promise<KidsRatioStatus | null> {
  await requireCapability(churchId, "kids.read");

  const supabase = await createSupabaseServerClient();
  // kids_room_ratio_status no está en Database["public"]["Functions"]: solo
  // existe como app.kids_room_ratio_status sin wrapper public.* (ver nota
  // arriba), así que el nombre no es un literal conocido por el tipo del
  // cliente y cae en el overload genérico de `.rpc()`.
  const { data, error } = await supabase.rpc("kids_room_ratio_status", { p_session_id: sessionId });

  if (error || !data) return null;

  const row = (Array.isArray(data) ? data[0] : data) as KidsRatioStatusRow | undefined;
  if (!row) return null;

  return {
    state: row.state,
    childrenCheckedIn: row.children_checked_in,
    staffCheckedIn: row.staff_checked_in,
    minAdultsRequired: row.min_adults_required,
    ratioChildrenPerAdult: row.ratio_children_per_adult,
    maxChildrenForCurrentStaff: row.max_children_for_current_staff,
  };
}
