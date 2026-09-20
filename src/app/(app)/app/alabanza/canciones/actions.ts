"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { DomainError } from "@/server/errors/domain-error";
import {
  createWorshipSong,
  updateWorshipSong,
  archiveWorshipSong,
  type WorshipSongInput,
  type WorshipKeyRoot,
  type WorshipKeyMode,
} from "@/server/worship/worship-service";

export type CancionFormState = { error: string | null };
export const cancionFormInitialState: CancionFormState = { error: null };

function parseKey(formData: FormData, rootField: string, modeField: string) {
  const root = String(formData.get(rootField) ?? "");
  const mode = String(formData.get(modeField) ?? "");
  if (!root || !mode) return undefined;
  return { root: root as WorshipKeyRoot, mode: mode as WorshipKeyMode };
}

function parseSongInput(formData: FormData): WorshipSongInput {
  const bpmRaw = String(formData.get("bpm") ?? "").trim();
  return {
    title: String(formData.get("title") ?? "").trim(),
    subtitle: String(formData.get("subtitle") ?? "").trim() || null,
    author: String(formData.get("author") ?? "").trim() || null,
    language: String(formData.get("language") ?? "").trim() || null,
    lyrics: String(formData.get("lyrics") ?? "").trim() || null,
    chords: String(formData.get("chords") ?? "").trim() || null,
    originalKey: parseKey(formData, "originalKeyRoot", "originalKeyMode"),
    defaultKey: parseKey(formData, "defaultKeyRoot", "defaultKeyMode"),
    bpm: bpmRaw ? Number(bpmRaw) : null,
    timeSignature: String(formData.get("timeSignature") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function crearCancionAction(
  _prevState: CancionFormState,
  formData: FormData,
): Promise<CancionFormState> {
  const tenant = await requireTenantContext();
  const input = parseSongInput(formData);

  if (!input.title) {
    return { error: "El título es obligatorio." };
  }

  let songId: string;
  try {
    await requireCapability(tenant.churchId, "worship.song.manage");
    songId = await createWorshipSong(tenant.churchId, input);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/alabanza");
  revalidatePath("/app/alabanza/canciones");
  redirect(`/app/alabanza/canciones/${songId}`);
}

export async function actualizarCancionAction(
  songId: string,
  _prevState: CancionFormState,
  formData: FormData,
): Promise<CancionFormState> {
  const tenant = await requireTenantContext();
  const input = parseSongInput(formData);

  if (!input.title) {
    return { error: "El título es obligatorio." };
  }

  try {
    await requireCapability(tenant.churchId, "worship.song.manage");
    await updateWorshipSong(tenant.churchId, songId, input);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath(`/app/alabanza/canciones/${songId}`);
  revalidatePath("/app/alabanza/canciones");
  return { error: null };
}

export async function archivarCancionAction(songId: string): Promise<{ error: string | null }> {
  const tenant = await requireTenantContext();
  try {
    await requireCapability(tenant.churchId, "worship.song.manage");
    await archiveWorshipSong(tenant.churchId, songId);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/alabanza");
  revalidatePath("/app/alabanza/canciones");
  revalidatePath(`/app/alabanza/canciones/${songId}`);
  return { error: null };
}
