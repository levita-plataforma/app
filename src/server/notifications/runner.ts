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
  processed: number;
  transport: string;
  deliveriesSent: number;
};

const BATCH = 200;

export async function runNotifications(): Promise<NotificationsRunResult> {
  const supabase = createSupabaseServiceRoleClient();

  const reminders = await callCount(supabase, "enqueue_due_reminders", {});
  const escalations = await callCount(supabase, "escalate_uncovered_positions", {});
  const processed = await callCount(supabase, "process_notification_events", { p_limit: BATCH });

  return {
    reminders,
    escalations,
    processed,
    transport: env.notificationsTransport,
    // Sin transporte configurado no se envía nada fuera de la aplicación.
    deliveriesSent: 0,
  };
}

type Rpc = ReturnType<typeof createSupabaseServiceRoleClient>;

async function callCount(supabase: Rpc, fn: string, args: Record<string, unknown>): Promise<number> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(`Falló ${fn}: ${error.message}`);
  return typeof data === "number" ? data : 0;
}
