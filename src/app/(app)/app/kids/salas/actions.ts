"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import {
  createKidsRoom,
  updateKidsRoom,
  archiveKidsRoom,
  type CreateKidsRoomInput,
  type UpdateKidsRoomInput,
} from "@/server/kids/kids-rooms-service";
import { DomainError } from "@/server/errors/domain-error";

export type SalasState = { error: string | null; success?: boolean };
const OK: SalasState = { error: null, success: true };

function asState(err: unknown): SalasState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

function revalidateSalas() {
  revalidatePath("/app/kids/salas");
  revalidatePath("/app/kids");
}

export async function crearSalaAction(_prev: SalasState, formData: FormData): Promise<SalasState> {
  const tenant = await requireTenantContext();
  const input: CreateKidsRoomInput = {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? "").trim() || undefined,
    campusId: String(formData.get("campusId") ?? "").trim() || undefined,
    ageMinMonths: numberOrUndefined(formData.get("ageMinMonths")),
    ageMaxMonths: numberOrUndefined(formData.get("ageMaxMonths")),
    capacity: Number(formData.get("capacity") ?? 0),
    minAdults: numberOrUndefined(formData.get("minAdults")),
    ratioChildrenPerAdult: numberOrUndefined(formData.get("ratioChildrenPerAdult")),
    locationText: String(formData.get("locationText") ?? "").trim() || undefined,
  };

  try {
    await createKidsRoom(tenant.churchId, input);
  } catch (err) {
    return asState(err);
  }
  revalidateSalas();
  return OK;
}

export async function editarSalaAction(roomId: string, input: UpdateKidsRoomInput): Promise<SalasState> {
  const tenant = await requireTenantContext();
  try {
    await updateKidsRoom(tenant.churchId, roomId, input);
  } catch (err) {
    return asState(err);
  }
  revalidateSalas();
  return OK;
}

export async function archivarSalaAction(roomId: string): Promise<SalasState> {
  const tenant = await requireTenantContext();
  try {
    await archiveKidsRoom(tenant.churchId, roomId);
  } catch (err) {
    return asState(err);
  }
  revalidateSalas();
  return OK;
}

function numberOrUndefined(value: FormDataEntryValue | null): number | undefined {
  const str = String(value ?? "").trim();
  if (!str) return undefined;
  const num = Number(str);
  return Number.isFinite(num) ? num : undefined;
}
