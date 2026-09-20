"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { DomainError } from "@/server/errors/domain-error";
import { detachWorshipSongFile } from "@/server/worship/worship-service";

export async function quitarArchivoAction(fileId: string): Promise<{ error: string | null }> {
  const tenant = await requireTenantContext();
  try {
    await requireCapability(tenant.churchId, "worship.song.manage");
    await detachWorshipSongFile(tenant.churchId, fileId);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/alabanza/canciones");
  return { error: null };
}
