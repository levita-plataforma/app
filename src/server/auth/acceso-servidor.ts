import "server-only";
import { cookies } from "next/headers";
import { getOperatorContext } from "@/server/platform/platform-service";
import { getTenantContext } from "@/server/tenant/tenant-context";
import { COOKIE_ULTIMO_CONTEXTO, destinoTrasAcceso, leerUltimoContexto, type DestinoAcceso } from "./destino-acceso";

/**
 * Reúne lo que hace falta para decidir el destino tras el login: si la cuenta es
 * del equipo de plataforma, si pertenece a alguna iglesia y cuál fue el último
 * contexto usado. La decisión está en destino-acceso.ts.
 *
 * «Operador» es pertenecer a platform_operators. Un operador sin capacidades
 * entra igualmente en la consola, que le explica que no tiene ninguna: mandarlo
 * al alta de una iglesia sería peor.
 */
export async function resolverDestinoAcceso(): Promise<DestinoAcceso> {
  const [operador, tenant, almacen] = await Promise.all([getOperatorContext(), getTenantContext(), cookies()]);
  return destinoTrasAcceso({
    esOperador: operador !== null,
    tieneIglesia: tenant !== null,
    ultimoContexto: leerUltimoContexto(almacen.get(COOKIE_ULTIMO_CONTEXTO)?.value),
  });
}
