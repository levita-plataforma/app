import "server-only";
import { createSupabaseServiceRoleClient } from "@/server/supabase/service-role-client";
import { logger } from "@/server/logger/logger";

/**
 * Retención y borrado tras una baja (Fase 13).
 *
 * Decisión de Carlos (21 de septiembre de 2026): 30 días desde que una iglesia
 * queda archivada, y después se borra de verdad.
 *
 * Son dos pasos separados a propósito. El primero borra la fila de la iglesia,
 * y las 107 claves foráneas en cascada se llevan todo lo suyo de la base. El
 * segundo vacía el almacenamiento, que la cascada no puede tocar: si solo se
 * hiciera el primero, las filas de `files` desaparecerían del índice y los
 * objetos seguirían vivos en el bucket. El borrado parecería haber funcionado y
 * habría documentos pastorales y fotos de menores intactos. Por eso los objetos
 * se encolan antes de borrar la iglesia, en una tabla que la cascada no alcanza.
 *
 * El orden importa: primero la base, después el almacenamiento. Al revés, un
 * fallo a media pasada dejaría ficheros borrados de una iglesia que sigue
 * existiendo, que es la forma mala de fallar.
 */

export type RetentionRunResult = {
  /** Iglesias eliminadas en esta pasada. */
  purged: number;
  /** Plazo aplicado, en días. La base impone un mínimo de 7. */
  retentionDays: number;
  /** Objetos borrados del almacenamiento. */
  filesDeleted: number;
  /** Objetos que no se pudieron borrar y se reintentarán. */
  filesFailed: number;
};

/** Cuántas iglesias como mucho por pasada. */
const PURGE_LIMIT = 10;
/** Cuántos objetos como mucho por pasada. */
const STORAGE_LIMIT = 200;

export async function runRetention(retentionDays = 30): Promise<RetentionRunResult> {
  const supabase = createSupabaseServiceRoleClient();

  // --- 1. Iglesias cuyo plazo ha vencido ------------------------------------
  //
  // Se registra antes de borrar qué se va a borrar: si algo sale mal, queda
  // dicho en los registros qué había en juego. Un borrado irreversible sin
  // rastro previo es indefendible.
  const { data: due, error: dueError } = await supabase.rpc("churches_due_for_purge", {
    p_retention_days: retentionDays,
  });

  if (dueError) {
    throw new Error(`No se pudo consultar qué iglesias han cumplido el plazo: ${dueError.message}`);
  }

  const pendientes = (due ?? []) as {
    church_id: string;
    days_archived: number;
    people_count: number;
    files_count: number;
  }[];

  if (pendientes.length > 0) {
    logger.info("Iglesias que han cumplido el plazo de retención", {
      total: pendientes.length,
      detalle: pendientes.map((x) => ({
        churchId: x.church_id,
        diasArchivada: x.days_archived,
        personas: x.people_count,
        ficheros: x.files_count,
      })),
    });
  }

  const { data: purgeData, error: purgeError } = await supabase.rpc("purge_archived_churches", {
    p_retention_days: retentionDays,
    p_limit: PURGE_LIMIT,
  });

  if (purgeError) {
    throw new Error(`Falló el borrado de iglesias vencidas: ${purgeError.message}`);
  }

  const purgeResult = (purgeData ?? {}) as { purged?: number; retention_days?: number };
  const purged = purgeResult.purged ?? 0;
  const aplicado = purgeResult.retention_days ?? retentionDays;

  if (purged > 0) {
    logger.info("Iglesias borradas por retención", { purged, retentionDays: aplicado });
  }

  // --- 2. Vaciar el almacenamiento ------------------------------------------
  //
  // La cola incluye lo encolado en esta pasada y lo que quedó pendiente de
  // anteriores. Cada objeto se marca por separado: un bucket que falla no
  // detiene a los demás, que es la lección que dejó la cola de comunicaciones.
  const { data: objetos, error: colaError } = await supabase.rpc("due_storage_deletions", {
    p_limit: STORAGE_LIMIT,
  });

  if (colaError) {
    throw new Error(`No se pudo leer la cola de borrado de ficheros: ${colaError.message}`);
  }

  let filesDeleted = 0;
  let filesFailed = 0;

  for (const objeto of (objetos ?? []) as { id: string; bucket: string; object_path: string }[]) {
    const { error } = await supabase.storage.from(objeto.bucket).remove([objeto.object_path]);

    // Un objeto que ya no está cuenta como borrado: lo que importa es que no
    // exista, no haberlo borrado nosotros. Reintentarlo para siempre solo
    // llenaría la cola de ruido.
    const yaNoEstaba = error != null && /not found|does not exist/i.test(error.message);

    if (error == null || yaNoEstaba) {
      await supabase.rpc("mark_storage_deletion", { p_id: objeto.id, p_ok: true, p_error: null });
      filesDeleted += 1;
    } else {
      await supabase.rpc("mark_storage_deletion", {
        p_id: objeto.id,
        p_ok: false,
        p_error: error.message,
      });
      filesFailed += 1;
      logger.error("No se pudo borrar un objeto del almacenamiento", {
        bucket: objeto.bucket,
        // La ruta puede identificar a una persona, así que no va entera.
        rutaParcial: objeto.object_path.split("/")[0],
        error: error.message,
      });
    }
  }

  if (filesFailed > 0) {
    logger.warn("Quedan ficheros sin borrar del almacenamiento", { filesFailed });
  }

  return { purged, retentionDays: aplicado, filesDeleted, filesFailed };
}
