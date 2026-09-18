"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import { saveGroupType, setGroupTypeArchived } from "@/server/groups/groups-service";

export type TiposState = { error: string | null };

const OK: TiposState = { error: null };

function asState(err: unknown): TiposState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

function revalidateTypes() {
  revalidatePath("/app/grupos/tipos");
  revalidatePath("/app/grupos");
}

/**
 * La clave identifica el tipo dentro de la iglesia y no se puede cambiar
 * después: al editar se envía solo el nombre, la descripción y el orden.
 */
export async function guardarTipoAction(_prev: TiposState, formData: FormData): Promise<TiposState> {
  const tenant = await requireTenantContext();

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const key = String(formData.get("key") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const sortOrderRaw = String(formData.get("sortOrder") ?? "").trim();

  if (!name) return { error: "El nombre del tipo de grupo es obligatorio." };
  if (!id && !key) return { error: "La clave del tipo de grupo es obligatoria." };

  try {
    await saveGroupType(tenant.churchId, {
      id: id || undefined,
      key: key || undefined,
      name,
      description: description || null,
      sortOrder: sortOrderRaw ? Number(sortOrderRaw) : 0,
    });
  } catch (err) {
    return asState(err);
  }
  revalidateTypes();
  return OK;
}

export async function archivarTipoAction(groupTypeId: string, archived: boolean): Promise<TiposState> {
  await requireTenantContext();
  try {
    await setGroupTypeArchived(groupTypeId, archived);
  } catch (err) {
    return asState(err);
  }
  revalidateTypes();
  return OK;
}
