"use server";

import { revalidatePath } from "next/cache";
import {
  cancelSubscription,
  changePlan,
  previewPlanChange,
  revokeOverride,
  type PlanChangePreview,
} from "@/server/platform/commercial-service";
import { DomainError } from "@/server/errors/domain-error";

/**
 * Acciones comerciales sobre una iglesia (Fase 15).
 *
 * Ninguna comprueba permisos aquí: las RPC lo hacen en la base, que es donde
 * vale. Estas funciones traducen el error a un mensaje y refrescan la ficha.
 *
 * El churchId llega del cliente, y eso es seguro porque la base no se fía de
 * él: cada RPC valida la capacidad del actor antes de tocar esa iglesia. Si
 * alguien manipulara el identificador, recibiría 42501.
 */

export type ComercialState = { error: string | null };
export type PreviaState = { error: string | null; previa: PlanChangePreview | null };

export async function previsualizarPlanAction(churchId: string, planVersionId: string): Promise<PreviaState> {
  try {
    const previa = await previewPlanChange(churchId, planVersionId);
    return { error: null, previa };
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message, previa: null };
    throw err;
  }
}

export async function cambiarPlanAction(
  churchId: string,
  planVersionId: string,
  motivo: string,
): Promise<ComercialState> {
  try {
    await changePlan(churchId, planVersionId, motivo);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/operacion/iglesias/${churchId}`);
  return { error: null };
}

export async function revocarExcepcionAction(
  overrideId: string,
  churchId: string,
  motivo: string,
): Promise<ComercialState> {
  try {
    await revokeOverride(overrideId, motivo);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/operacion/iglesias/${churchId}`);
  return { error: null };
}

export async function cancelarSuscripcionAction(
  churchId: string,
  motivo: string,
  alFinalDelPeriodo: boolean,
): Promise<ComercialState> {
  try {
    await cancelSubscription(churchId, motivo, alFinalDelPeriodo);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/operacion/iglesias/${churchId}`);
  return { error: null };
}
