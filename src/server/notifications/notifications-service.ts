import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { toDomainError } from "@/server/activities/rpc";
import { logger } from "@/server/logger/logger";

/**
 * Avisos de la persona autenticada (Fase 5, DI-02).
 *
 * Lecturas con el cliente del usuario (RLS decide qué ve) y escrituras solo
 * por RPC, que comprueban la pertenencia y auditan. El outbox
 * (`notification_events`) y la cola de salida (`notification_deliveries`) no
 * son alcanzables desde el cliente: los lee únicamente el motor con la clave
 * de servicio (ver src/server/notifications/runner.ts).
 *
 * Mientras el transporte externo esté desactivado, las entregas de email y
 * push se quedan en cola y no sale nada: ningún texto de la interfaz puede
 * decir que se ha enviado un correo ni una notificación al móvil.
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export const NOTIFICATION_CHANNELS = ["inapp", "email", "push"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export function isNotificationChannel(value: unknown): value is NotificationChannel {
  return typeof value === "string" && (NOTIFICATION_CHANNELS as readonly string[]).includes(value);
}

export type AppNotification = {
  id: string;
  eventType: string;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  /** Actividad de la que cuelga el aviso, si cuelga de alguna. */
  activityId: string | null;
  createdAt: string;
  readAt: string | null;
  /**
   * Identificadores del destino del aviso (`group_id`, `cohort_id`,
   * `learning_path_id`). `list_my_notifications` no devuelve el payload del
   * evento —`notifications` ni siquiera tiene esa columna—, así que lo resuelve
   * `resolveNotificationContext` leyendo la entidad a la que apunta el aviso,
   * siempre con el cliente del usuario y por tanto filtrado por RLS.
   */
  context: Record<string, string> | null;
};

/** Preferencia por canal. Sin fila en la tabla, el canal se considera activo. */
export type NotificationPreferences = Record<NotificationChannel, boolean>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  inapp: true,
  email: true,
  push: true,
};

/** Destino de un aviso: la ficha de la actividad o el propio turno. */
export type NotificationTarget = {
  href: string;
  /** Texto del enlace, ya en español y sin prometer nada. */
  label: string;
};

const LIST_LIMIT_MIN = 1;
const LIST_LIMIT_MAX = 200;
const DEFAULT_LIMIT = 50;

// ---------------------------------------------------------------------------
// Destino de cada tipo de aviso
// ---------------------------------------------------------------------------

/**
 * Avisos dirigidos a la persona asignada: su destino es su turno, no la ficha
 * de la actividad (a la que normalmente no tiene acceso de gestión). El resto
 * van a quien coordina, y su destino es la ficha de la actividad.
 *
 * El tipo de evento manda sobre `entity_type`: una respuesta aceptada también
 * apunta a `activity_assignments`, pero quien la recibe NO es la persona
 * asignada, así que /app/mis-turnos/<id> no le mostraría nada.
 */
const TARGET_IS_OWN_SHIFT = new Set([
  "assignment.proposed",
  "assignment.cancelled",
  "assignment.substituted",
  "assignment.reminder",
  "activity.rescheduled",
]);

const TARGET_IS_ACTIVITY = new Set([
  "assignment.accepted",
  "assignment.declined",
  "assignment.substitution_requested",
  "assignment.coverage_at_risk",
]);

/**
 * Avisos de Grupos (Fase 7). Todos llevan a la ficha del grupo: la solicitud,
 * la incorporación y el cambio o la cancelación de una reunión se leen allí.
 * El identificador del grupo llega en `context.group_id`.
 */
const TARGET_IS_GROUP = new Set([
  "group.join_request.received",
  "group.join_request.accepted",
  "group.join_request.rejected",
  "group.member.added",
  "group.meeting.rescheduled",
  "group.meeting.cancelled",
]);

/** Avisos de Discipulado que se leen en la ficha de la cohorte. */
const TARGET_IS_COHORT = new Set([
  "course.session.rescheduled",
  "course.session.cancelled",
  "course.enrollment.completed",
]);

export function notificationTarget(notification: AppNotification): NotificationTarget | null {
  const { eventType, entityType, entityId, activityId, context } = notification;

  if (TARGET_IS_OWN_SHIFT.has(eventType) && entityType === "activity_assignments") {
    return { href: `/app/mis-turnos/${entityId}`, label: "Ver el turno" };
  }

  if (TARGET_IS_ACTIVITY.has(eventType) && activityId) {
    return { href: `/app/actividades/${activityId}`, label: "Ver la actividad" };
  }

  if (TARGET_IS_GROUP.has(eventType) && context?.group_id) {
    return { href: `/app/grupos/${context.group_id}`, label: "Ver el grupo" };
  }

  if (TARGET_IS_COHORT.has(eventType) && context?.cohort_id) {
    return { href: `/app/discipulado/cohortes/${context.cohort_id}`, label: "Ver la cohorte" };
  }

  if (eventType === "path.step.completed" && context?.learning_path_id) {
    return { href: `/app/discipulado/itinerarios/${context.learning_path_id}`, label: "Ver el itinerario" };
  }

  // Reserva para tipos de aviso futuros: se resuelve por la entidad y, si no
  // cuelga de nada que se pueda abrir, el aviso se muestra sin enlace.
  if (entityType === "activities") {
    return { href: `/app/actividades/${entityId}`, label: "Ver la actividad" };
  }
  if (activityId) {
    return { href: `/app/actividades/${activityId}`, label: "Ver la actividad" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

type NotificationRow = {
  id: string;
  event_type: string;
  title: string;
  body: string;
  entity_type: string;
  entity_id: string;
  activity_id: string | null;
  created_at: string;
  read_at: string | null;
};

function mapNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    eventType: row.event_type,
    title: row.title,
    body: row.body,
    entityType: row.entity_type,
    entityId: row.entity_id,
    activityId: row.activity_id,
    createdAt: row.created_at,
    readAt: row.read_at,
    context: null,
  };
}

/**
 * Entidades de la Fase 7 desde las que se puede deducir a dónde lleva el
 * aviso, y la columna que lo dice. El aviso apunta a la solicitud, a la
 * reunión o al paso; lo que se abre es el grupo, la cohorte o el itinerario.
 */
const CONTEXT_SOURCES: Record<string, { table: string; column: string; key: string }> = {
  group_join_requests: { table: "group_join_requests", column: "group_id", key: "group_id" },
  group_members: { table: "group_members", column: "group_id", key: "group_id" },
  group_meetings: { table: "group_meetings", column: "group_id", key: "group_id" },
  groups: { table: "groups", column: "id", key: "group_id" },
  course_sessions: { table: "course_sessions", column: "cohort_id", key: "cohort_id" },
  course_enrollments: { table: "course_enrollments", column: "cohort_id", key: "cohort_id" },
  path_steps: { table: "path_steps", column: "learning_path_id", key: "learning_path_id" },
};

/**
 * Rellena el `context` de los avisos que lo necesitan. Una consulta por tabla
 * implicada, nunca una por aviso. Si la fila ya no es legible (por ejemplo, la
 * persona dejó el grupo), el aviso se queda sin enlace en vez de llevar a un
 * sitio al que no puede entrar.
 */
async function resolveNotificationContext(
  churchId: string,
  notifications: AppNotification[],
): Promise<AppNotification[]> {
  const byTable = new Map<string, Set<string>>();
  for (const notification of notifications) {
    if (!CONTEXT_SOURCES[notification.entityType]) continue;
    const ids = byTable.get(notification.entityType) ?? new Set<string>();
    ids.add(notification.entityId);
    byTable.set(notification.entityType, ids);
  }
  if (byTable.size === 0) return notifications;

  const supabase = await createSupabaseServerClient();
  const resolved = new Map<string, Record<string, string>>();

  await Promise.all(
    [...byTable.entries()].map(async ([entityType, ids]) => {
      const source = CONTEXT_SOURCES[entityType];
      const { data, error } = await supabase
        .from(source.table)
        .select(source.column === "id" ? "id" : `id, ${source.column}`)
        .eq("church_id", churchId)
        .in("id", [...ids]);

      if (error) {
        logger.warn("No se pudo resolver el destino de unos avisos", { entityType, error: error.message });
        return;
      }
      // El `select` se compone con el nombre de columna de cada entidad, así
      // que PostgREST no puede tipar la fila: se lee como registro genérico.
      for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
        const id = row.id;
        const value = row[source.column];
        if (typeof id === "string" && typeof value === "string") {
          resolved.set(`${entityType}:${id}`, { [source.key]: value });
        }
      }
    }),
  );

  return notifications.map((notification) => {
    const context = resolved.get(`${notification.entityType}:${notification.entityId}`);
    return context ? { ...notification, context } : notification;
  });
}

export async function listMyNotifications(
  churchId: string,
  options: { onlyUnread?: boolean; limit?: number } = {},
): Promise<AppNotification[]> {
  const supabase = await createSupabaseServerClient();
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? DEFAULT_LIMIT), LIST_LIMIT_MIN), LIST_LIMIT_MAX);
  const { data, error } = await supabase.rpc("list_my_notifications", {
    p_church_id: churchId,
    p_only_unread: options.onlyUnread ?? false,
    p_limit: limit,
  });
  if (error) throw toDomainError(error, "No se pudieron cargar tus avisos.");
  const notifications = ((data ?? []) as unknown as NotificationRow[]).map(mapNotification);
  return resolveNotificationContext(churchId, notifications);
}

export async function countMyUnreadNotifications(churchId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("count_my_unread_notifications", { p_church_id: churchId });
  if (error) throw toDomainError(error, "No se pudieron contar tus avisos sin leer.");
  return typeof data === "number" ? data : 0;
}

/**
 * Variante para la cabecera: un fallo del contador nunca puede tumbar la
 * shell. Devuelve null, y la campana se muestra sin número.
 */
export async function countMyUnreadNotificationsSafe(churchId: string): Promise<number | null> {
  try {
    return await countMyUnreadNotifications(churchId);
  } catch (error) {
    logger.error("No se pudo contar los avisos sin leer", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Preferencias por canal de la persona en la iglesia activa. Sin fila = activo. */
export async function getMyNotificationPreferences(
  churchId: string,
  personId: string,
): Promise<NotificationPreferences> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("channel, enabled")
    .eq("church_id", churchId)
    .eq("person_id", personId);
  if (error) throw toDomainError(error, "No se pudieron cargar tus preferencias de avisos.");

  const preferences: NotificationPreferences = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  for (const row of (data ?? []) as { channel: string; enabled: boolean }[]) {
    if (isNotificationChannel(row.channel)) preferences[row.channel] = row.enabled;
  }
  // La bandeja de la aplicación no se puede desactivar (lo impide la base).
  preferences.inapp = true;
  return preferences;
}

// ---------------------------------------------------------------------------
// Escritura (solo por RPC)
// ---------------------------------------------------------------------------

export async function markNotificationRead(notificationId: string): Promise<{ readAt: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("mark_notification_read", { p_notification_id: notificationId });
  if (error) throw toDomainError(error, "No se pudo marcar el aviso como leído.");
  const result = (data ?? {}) as { read_at?: string | null };
  return { readAt: result.read_at ?? null };
}

/** Devuelve cuántos avisos se han marcado (0 si ya estaban todos leídos). */
export async function markAllNotificationsRead(churchId: string): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("mark_all_notifications_read", { p_church_id: churchId });
  if (error) throw toDomainError(error, "No se pudieron marcar tus avisos como leídos.");
  const result = (data ?? {}) as { updated?: number };
  return typeof result.updated === "number" ? result.updated : 0;
}

/**
 * Cambia un canal. Es una preferencia personal: la RPC la aplica a todas las
 * pertenencias vigentes de la persona. `inapp` no se puede desactivar.
 */
export async function setMyNotificationPreference(
  channel: NotificationChannel,
  enabled: boolean,
): Promise<{ channel: NotificationChannel; enabled: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("set_my_notification_preference", {
    p_channel: channel,
    p_enabled: enabled,
  });
  if (error) throw toDomainError(error, "No se pudo guardar tu preferencia de avisos.");
  const result = (data ?? {}) as { channel?: string; enabled?: boolean };
  return {
    channel: isNotificationChannel(result.channel) ? result.channel : channel,
    enabled: typeof result.enabled === "boolean" ? result.enabled : enabled,
  };
}
