import { env } from "@/server/env";
import { logger } from "@/server/logger/logger";
import { runCommunications } from "@/server/communications/runner";

/**
 * Tarea programada de comunicaciones (Fase 9). Protegida por CRON_SECRET,
 * igual que src/app/api/tareas/avisos/route.ts. Acepta GET y POST porque
 * Vercel Cron invoca con GET (ver vercel.json) y una llamada manual suele
 * hacerse con POST.
 *
 * No recibe ningún dato del cliente: solo dispara el proceso completo. Una
 * petición sin credencial válida recibe siempre 401.
 */

export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!env.cronSecret || !timingSafeEqual(token, env.cronSecret)) {
    if (!env.cronSecret) logger.error("La tarea de comunicaciones no está configurada: falta CRON_SECRET.");
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const result = await runCommunications();
    logger.info("Tarea de comunicaciones ejecutada", result);
    return Response.json({ ok: true, ...result });
  } catch (error) {
    logger.error("Falló la tarea de comunicaciones", { error: error instanceof Error ? error.message : String(error) });
    return Response.json({ ok: false, error: "No se pudo ejecutar la tarea de comunicaciones." }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

function timingSafeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length, 32);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i % (a.length || 1)) || 0) ^ (b.charCodeAt(i % (b.length || 1)) || 0);
  }
  return diff === 0;
}
