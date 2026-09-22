import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { toDomainError } from "@/server/activities/rpc";

/**
 * Consola de operación y soporte (Fase 15).
 *
 * No recoge telemetría nueva: lee lo que los procesos de las fases anteriores
 * ya escriben. Por eso puede decir «desconocido» cuando nadie está procesando
 * una cola, en vez de enseñar un cero tranquilizador.
 */

export type ProcessFamily = {
  procesador: string;
  estado?: string;
  ultima_senal?: string | null;
  [contador: string]: unknown;
};

export type ProcessesOverview = Record<string, ProcessFamily>;

export async function getProcessesOverview(): Promise<ProcessesOverview | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_processes_overview");
  if (error) throw toDomainError(error, "No se pudo cargar el estado de los procesos.");
  return (data as unknown as ProcessesOverview) ?? null;
}

export type ProcessFailure = {
  familia: string;
  id: string;
  churchId: string | null;
  estado: string;
  intentos: number;
  error: string;
  ocurridoEn: string | null;
  correlationId: string | null;
  reintentable: boolean;
};

/**
 * Lo que ha fallado, ya saneado por la base: sin payloads ni datos personales
 * y con el mensaje de error recortado. Aquí no se vuelve a filtrar nada porque
 * lo que llega ya viene acotado, y filtrar dos veces esconde de dónde sale.
 */
export async function listProcessFailures(limit = 50): Promise<ProcessFailure[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_process_failures", { p_limit: limit });
  if (error) throw toDomainError(error, "No se pudieron cargar los fallos de los procesos.");
  type Fila = {
    familia: string; id: string; church_id: string | null; estado: string; intentos: number;
    error: string | null; ocurrido_en: string | null; correlation_id: string | null; reintentable: boolean;
  };
  return ((data ?? []) as Fila[]).map((row) => ({
    familia: row.familia as string,
    id: row.id as string,
    churchId: row.church_id as string | null,
    estado: row.estado as string,
    intentos: (row.intentos as number) ?? 0,
    error: (row.error as string) ?? "",
    ocurridoEn: row.ocurrido_en as string | null,
    correlationId: row.correlation_id as string | null,
    reintentable: Boolean(row.reintentable),
  }));
}

/**
 * Reintenta un borrado de fichero. Es lo único que hoy se puede repetir sin
 * consecuencias: si el objeto ya no está, cuenta como borrado.
 *
 * No existe un equivalente para cobros ni para envíos externos, y no es un
 * olvido: repetirlos a ciegas es precisamente lo que no se debe poder hacer
 * desde una consola.
 */
export async function retryStorageDeletion(queueId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("platform_retry_storage_deletion", { p_id: queueId });
  if (error) throw toDomainError(error, "No se pudo reintentar el borrado.");
}

export type SupportSession = {
  id: string;
  churchId: string;
  churchName: string;
  operatorUserId: string;
  reason: string;
  startedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  activa: boolean;
};

export async function listSupportSessions(churchId?: string): Promise<SupportSession[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_support_sessions", {
    p_church_id: churchId ?? undefined,
    p_limit: 100,
  });
  if (error) throw toDomainError(error, "No se pudieron cargar las sesiones de soporte.");
  type Fila = {
    id: string; church_id: string; church_name: string; operator_user_id: string; reason: string;
    started_at: string; expires_at: string; revoked_at: string | null; activa: boolean;
  };
  return ((data ?? []) as Fila[]).map((row) => ({
    id: row.id as string,
    churchId: row.church_id as string,
    churchName: row.church_name as string,
    operatorUserId: row.operator_user_id as string,
    reason: row.reason as string,
    startedAt: row.started_at as string,
    expiresAt: row.expires_at as string,
    revokedAt: row.revoked_at as string | null,
    activa: Boolean(row.activa),
  }));
}

/**
 * Abre una sesión de soporte. **No concede acceso a los datos de la iglesia**:
 * deja constancia de que se está atendiendo una incidencia, con motivo y
 * caducidad. El único ámbito admitido es el diagnóstico administrativo; pedir
 * otro devuelve un error que explica que esa política no está acordada.
 */
export async function openSupportSession(
  churchId: string,
  reason: string,
  minutes: number,
): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_open_support_session", {
    p_church_id: churchId,
    p_reason: reason,
    p_minutes: minutes,
    p_scopes: ["diagnostics"],
  });
  if (error) throw toDomainError(error, "No se pudo abrir la sesión de soporte.");
  return data as unknown as string;
}

export async function revokeSupportSession(sessionId: string, reason: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("platform_revoke_support_session", {
    p_session_id: sessionId,
    p_reason: reason,
  });
  if (error) throw toDomainError(error, "No se pudo revocar la sesión de soporte.");
}

export type AuditEntry = {
  id: string;
  actorUserId: string | null;
  action: string;
  churchId: string | null;
  churchName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export async function listAudit(filters: { churchId?: string; action?: string; limit?: number } = {}): Promise<AuditEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("platform_audit", {
    p_church_id: filters.churchId ?? undefined,
    p_action: filters.action ?? undefined,
    p_limit: filters.limit ?? 100,
  });
  if (error) throw toDomainError(error, "No se pudo cargar la auditoría.");
  type Fila = {
    id: string; actor_user_id: string | null; action: string; church_id: string | null;
    church_name: string | null; metadata: Record<string, unknown> | null; created_at: string;
  };
  return ((data ?? []) as Fila[]).map((row) => ({
    id: row.id as string,
    actorUserId: row.actor_user_id as string | null,
    action: row.action as string,
    churchId: row.church_id as string | null,
    churchName: row.church_name as string | null,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.created_at as string,
  }));
}
