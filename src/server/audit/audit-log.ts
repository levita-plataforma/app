import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { logger } from "@/server/logger/logger";

/**
 * Helper único para producir entradas de auditoría de forma coherente.
 * Delega en app.write_audit_log (vía RPC pública), que sanea el diff y
 * asocia automáticamente la sesión de soporte activa si existe. Ver
 * docs/adr/0007.
 */
export async function auditLog(params: {
  churchId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("write_audit_log", {
    p_church_id: params.churchId,
    p_action: params.action,
    p_entity_type: params.entityType,
    p_entity_id: params.entityId ?? null,
    p_metadata: params.metadata ?? {},
    p_correlation_id: params.correlationId ?? null,
  });

  if (error) {
    logger.error("No se pudo escribir el registro de auditoría", {
      churchId: params.churchId,
      action: params.action,
      error: error.message,
    });
  }
}
