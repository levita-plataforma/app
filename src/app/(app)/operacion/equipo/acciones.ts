"use server";

import { revalidatePath } from "next/cache";
import {
  addOperator,
  grantCapability,
  removeOperator,
  revokeCapability,
} from "@/server/platform/platform-service";
import { DomainError } from "@/server/errors/domain-error";

/**
 * Equipo de plataforma (CA-3.1).
 *
 * Cada acción la autoriza la base: aquí solo se traduce el error a algo legible
 * y se refresca la pantalla. Lo que no se hace es decidir nada —ni quién puede,
 * ni si queda alguien que gestione el equipo—, porque esa decisión tiene que
 * valer también para quien llame a la RPC sin pasar por aquí.
 */

type Resultado = { error: string | null };

function traduce(err: unknown): Resultado {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

export async function altaOperadorAction(email: string): Promise<Resultado> {
  try {
    await addOperator(email);
  } catch (err) {
    return traduce(err);
  }
  revalidatePath("/operacion/equipo");
  return { error: null };
}

export async function retirarOperadorAction(userId: string): Promise<Resultado> {
  try {
    await removeOperator(userId);
  } catch (err) {
    return traduce(err);
  }
  revalidatePath("/operacion/equipo");
  return { error: null };
}

export async function concederCapacidadAction(userId: string, capacidad: string): Promise<Resultado> {
  try {
    await grantCapability(userId, capacidad);
  } catch (err) {
    return traduce(err);
  }
  revalidatePath("/operacion/equipo");
  return { error: null };
}

export async function retirarCapacidadAction(userId: string, capacidad: string): Promise<Resultado> {
  try {
    await revokeCapability(userId, capacidad);
  } catch (err) {
    return traduce(err);
  }
  revalidatePath("/operacion/equipo");
  return { error: null };
}
