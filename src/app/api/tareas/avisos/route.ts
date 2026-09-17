import { env } from "@/server/env";
import { runNotifications } from "@/server/notifications/runner";

/**
 * Tarea programada de avisos (DI-02). Protegida por CRON_SECRET: sin secreto
 * configurado no hace nada (503), y con secreto exige la cabecera
 * `Authorization: Bearer <CRON_SECRET>`.
 *
 * No recibe ningún dato del cliente: solo dispara el proceso completo.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!env.cronSecret) {
    return Response.json(
      { error: "La tarea de avisos no está configurada (falta CRON_SECRET)." },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!timingSafeEqual(token, env.cronSecret)) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const result = await runNotifications();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Comparación en tiempo constante, para no filtrar el secreto por el tiempo de respuesta. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
