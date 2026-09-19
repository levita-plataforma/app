import "server-only";
import { createSupabaseServiceRoleClient } from "@/server/supabase/service-role-client";

/**
 * Ejecución periódica de comunicaciones (Fase 9). Se lanza desde una tarea
 * programada, nunca desde la interfaz: usa service_role y no recibe ningún
 * churchId del cliente. Análogo a src/server/notifications/runner.ts, pero
 * con su propio ciclo: materializa las `scheduled` cuya hora ya llegó, y
 * envía en lotes acotados las que ya tienen destinatarios pendientes
 * (recién materializadas o interrumpidas en una pasada anterior). Una
 * comunicación con miles de destinatarios se termina en varias pasadas del
 * cron, nunca de forma síncrona en una sola request.
 *
 * Cadencia (vercel.json): una vez al día, igual que el cron de avisos,
 * porque el plan de Vercel en uso no soporta crons más frecuentes. Una
 * comunicación programada para una hora concreta del día puede tardar hasta
 * la siguiente ejecución del cron en procesarse: documentado en la UI de
 * programación, no es un defecto oculto.
 */

export type CommunicationsRunResult = {
  materialized: number;
  sent: number;
};

const DUE_LIMIT = 5;
const SEND_LIMIT = 5;
const BATCH_SIZE = 500;

export async function runCommunications(): Promise<CommunicationsRunResult> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: due, error: dueError } = await supabase.rpc("due_scheduled_communications", {
    p_limit: DUE_LIMIT,
  });
  if (dueError) throw new Error(`Falló due_scheduled_communications: ${dueError.message}`);

  let materialized = 0;
  for (const row of due ?? []) {
    const { error } = await supabase.rpc("cron_materialize_communication", {
      p_communication_id: row.id,
    });
    if (error) throw new Error(`Falló cron_materialize_communication (${row.id}): ${error.message}`);
    materialized += 1;
  }

  const { data: pending, error: pendingError } = await supabase.rpc("pending_send_communications", {
    p_limit: SEND_LIMIT,
  });
  if (pendingError) throw new Error(`Falló pending_send_communications: ${pendingError.message}`);

  let sent = 0;
  for (const row of pending ?? []) {
    const { error } = await supabase.rpc("cron_send_communication", {
      p_communication_id: row.id,
      p_batch_limit: BATCH_SIZE,
    });
    if (error) throw new Error(`Falló cron_send_communication (${row.id}): ${error.message}`);
    sent += 1;
  }

  return { materialized, sent };
}
