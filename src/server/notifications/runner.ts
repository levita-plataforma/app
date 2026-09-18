import "server-only";
import { createSupabaseServiceRoleClient } from "@/server/supabase/service-role-client";
import { env } from "@/server/env";

/**
 * Ejecución periódica de los avisos (DI-02). Se lanza desde una tarea
 * programada, nunca desde la interfaz: usa service_role y no recibe ningún
 * churchId del cliente.
 *
 * Orden: primero se crean los eventos que dependen del tiempo (recordatorios y
 * escalado) y después se procesan todos los pendientes, para que lo recién
 * creado salga en la misma pasada.
 *
 * Transporte: mientras NOTIFICATIONS_TRANSPORT sea "disabled" (valor por
 * defecto), las entregas de email y push se quedan en cola y no se contacta
 * con ningún proveedor. La bandeja de la aplicación sí funciona.
 */

export type NotificationsRunResult = {
  reminders: number;
  escalations: number;
  events: number;
  notifications: number;
  deliveries: number;
  transport: string;
};

const BATCH = 200;

export async function runNotifications(): Promise<NotificationsRunResult> {
  const supabase = createSupabaseServiceRoleClient();

  const reminders = await callRpc(supabase, "enqueue_due_reminders", {});
  const escalations = await callRpc(supabase, "escalate_uncovered_positions", {});
  const processed = await callRpc(supabase, "process_notification_events", { p_limit: BATCH });

  return {
    reminders: count(reminders, "reminders"),
    escalations: count(escalations, "escalations"),
    events: count(processed, "events"),
    notifications: count(processed, "notifications"),
    deliveries: count(processed, "deliveries"),
    transport: env.notificationsTransport,
  };
}

type Rpc = ReturnType<typeof createSupabaseServiceRoleClient>;

/** Las tres RPC del motor devuelven jsonb con sus contadores. */
async function callRpc(supabase: Rpc, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(`Falló ${fn}: ${error.message}`);
  return data;
}

function count(data: unknown, key: string): number {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === "number") return value;
  }
  return 0;
}
