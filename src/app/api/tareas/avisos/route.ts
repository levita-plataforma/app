import { env } from "@/server/env";
import { logger } from "@/server/logger/logger";
import { runNotifications } from "@/server/notifications/runner";

/**
 * Tarea programada de avisos (DI-02). Protegida por CRON_SECRET, que se exige
 * en la cabecera `Authorization: Bearer <CRON_SECRET>`. Acepta GET y POST
 * porque Vercel Cron invoca con GET (ver vercel.json) y una llamada manual
 * suele hacerse con POST.
 *
 * No recibe ningún dato del cliente: solo dispara el proceso completo. Una
 * petición sin credencial válida recibe siempre 401, esté o no configurado el
 * secreto, para no revelar el estado de la configuración.
 */

export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!env.cronSecret || !timingSafeEqual(token, env.cronSecret)) {
    if (!env.cronSecret) logger.error("La tarea de avisos no está configurada: falta CRON_SECRET.");
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const result = await runNotifications();
    logger.info("Tarea de avisos ejecutada", result);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    // El detalle va al registro; la respuesta no expone mensajes internos.
    logger.error("Falló la tarea de avisos", { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ ok: false, error: "No se pudo ejecutar la tarea de avisos." }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

/**
 * Comparación en tiempo constante que no depende de la longitud: se comparan
 * siempre los mismos bytes, así que una diferencia de longitud tampoco se
 * filtra por el tiempo de respuesta.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length, 32);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i % (a.length || 1)) || 0) ^ (b.charCodeAt(i % (b.length || 1)) || 0);
  }
  return diff === 0;
}
