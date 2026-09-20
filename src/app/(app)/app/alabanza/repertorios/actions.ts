"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { DomainError } from "@/server/errors/domain-error";
import {
  createWorshipRepertoire,
  updateWorshipRepertoire,
  archiveWorshipRepertoire,
  addWorshipRepertoireSong,
  removeWorshipRepertoireSong,
  reorderWorshipRepertoireSongs,
  setWorshipRepertoireSongKey,
  type WorshipKeyRoot,
  type WorshipKeyMode,
} from "@/server/worship/worship-service";

export type RepertorioFormState = { error: string | null };
export const repertorioFormInitialState: RepertorioFormState = { error: null };

export async function crearRepertorioAction(
  _prevState: RepertorioFormState,
  formData: FormData,
): Promise<RepertorioFormState> {
  const tenant = await requireTenantContext();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!name) return { error: "El nombre es obligatorio." };

  let repertoireId: string;
  try {
    await requireCapability(tenant.churchId, "worship.repertoire.manage");
    repertoireId = await createWorshipRepertoire(tenant.churchId, { name, description });
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/alabanza");
  revalidatePath("/app/alabanza/repertorios");
  redirect(`/app/alabanza/repertorios/${repertoireId}`);
}

export async function actualizarRepertorioAction(
  repertoireId: string,
  _prevState: RepertorioFormState,
  formData: FormData,
): Promise<RepertorioFormState> {
  const tenant = await requireTenantContext();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!name) return { error: "El nombre es obligatorio." };

  try {
    await requireCapability(tenant.churchId, "worship.repertoire.manage");
    await updateWorshipRepertoire(tenant.churchId, repertoireId, { name, description });
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath(`/app/alabanza/repertorios/${repertoireId}`);
  revalidatePath("/app/alabanza/repertorios");
  return { error: null };
}

export async function archivarRepertorioAction(repertoireId: string): Promise<{ error: string | null }> {
  const tenant = await requireTenantContext();
  try {
    await requireCapability(tenant.churchId, "worship.repertoire.manage");
    await archiveWorshipRepertoire(tenant.churchId, repertoireId);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/alabanza/repertorios");
  revalidatePath(`/app/alabanza/repertorios/${repertoireId}`);
  return { error: null };
}

export async function anadirCancionAction(
  repertoireId: string,
  songId: string,
): Promise<{ error: string | null }> {
  const tenant = await requireTenantContext();
  try {
    await requireCapability(tenant.churchId, "worship.repertoire.manage");
    await addWorshipRepertoireSong(tenant.churchId, repertoireId, songId);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath(`/app/alabanza/repertorios/${repertoireId}`);
  return { error: null };
}

export async function quitarCancionAction(
  repertoireId: string,
  repertoireSongId: string,
): Promise<{ error: string | null }> {
  const tenant = await requireTenantContext();
  try {
    await requireCapability(tenant.churchId, "worship.repertoire.manage");
    await removeWorshipRepertoireSong(tenant.churchId, repertoireSongId);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath(`/app/alabanza/repertorios/${repertoireId}`);
  return { error: null };
}

export async function reordenarCancionesAction(
  repertoireId: string,
  orderedIds: string[],
): Promise<{ error: string | null }> {
  const tenant = await requireTenantContext();
  try {
    await requireCapability(tenant.churchId, "worship.repertoire.manage");
    await reorderWorshipRepertoireSongs(tenant.churchId, repertoireId, orderedIds);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath(`/app/alabanza/repertorios/${repertoireId}`);
  return { error: null };
}

export async function cambiarTonalidadAction(
  repertoireId: string,
  repertoireSongId: string,
  root: WorshipKeyRoot,
  mode: WorshipKeyMode,
): Promise<{ error: string | null }> {
  const tenant = await requireTenantContext();
  try {
    await requireCapability(tenant.churchId, "worship.repertoire.manage");
    await setWorshipRepertoireSongKey(tenant.churchId, repertoireSongId, { root, mode });
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath(`/app/alabanza/repertorios/${repertoireId}`);
  return { error: null };
}
