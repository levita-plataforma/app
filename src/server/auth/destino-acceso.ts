/**
 * A dónde va una persona después de iniciar sesión, según sus dos contextos
 * posibles: la consola de plataforma (LEVITA · Administración) y la app de una
 * iglesia. Son contextos distintos: la consola nunca se representa como una
 * iglesia más en el selector.
 *
 * Función pura, sin dependencias, para poder probarla sola.
 *
 * - Operador de plataforma sin iglesia → consola. El onboarding (/acceso/onboarding)
 *   es para dar de alta o terminar de configurar una iglesia, no un sitio por defecto.
 * - Iglesia sin plataforma → app de iglesia (allí sigue el onboarding si el alta
 *   no terminó).
 * - Las dos cosas → el último contexto usado; si no hay, una pantalla para elegir.
 * - Ninguna → app, que lleva al alta de una iglesia nueva (comportamiento de siempre).
 */
export type UltimoContexto = "plataforma" | "iglesia" | null;

export type DestinoAcceso = "/operacion" | "/app" | "/acceso/contexto";

export const COOKIE_ULTIMO_CONTEXTO = "levita_contexto";

export function destinoTrasAcceso(entrada: {
  esOperador: boolean;
  tieneIglesia: boolean;
  ultimoContexto: UltimoContexto;
}): DestinoAcceso {
  const { esOperador, tieneIglesia, ultimoContexto } = entrada;

  if (esOperador && !tieneIglesia) return "/operacion";
  if (!esOperador) return "/app";

  if (ultimoContexto === "plataforma") return "/operacion";
  if (ultimoContexto === "iglesia") return "/app";
  return "/acceso/contexto";
}

/** Lee el valor de la cookie de último contexto; cualquier otra cosa cuenta como «sin contexto». */
export function leerUltimoContexto(valor: string | undefined | null): UltimoContexto {
  return valor === "plataforma" || valor === "iglesia" ? valor : null;
}

/** Qué contexto representa una ruta, para recordarlo. null si la ruta no es de ninguno. */
export function contextoDeRuta(ruta: string): UltimoContexto {
  if (ruta === "/operacion" || ruta.startsWith("/operacion/")) return "plataforma";
  if (ruta === "/app" || ruta.startsWith("/app/")) return "iglesia";
  return null;
}
