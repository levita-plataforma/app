"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import {
  createCredentialType,
  updateCredentialType,
  archiveCredentialType,
  assignCredential,
  verifyCredential,
  revokeCredential,
  updateCredential,
  type CredentialStatus,
} from "@/server/serving/credentials-service";
import { DomainError } from "@/server/errors/domain-error";

export type CredencialesState = { error: string | null; success?: boolean };
const OK: CredencialesState = { error: null, success: true };

function asState(err: unknown): CredencialesState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

function revalidate() {
  revalidatePath("/app/servicios/credenciales");
  revalidatePath("/app/servicios");
}

export async function crearTipoCredencialAction(
  _prev: CredencialesState,
  formData: FormData,
): Promise<CredencialesState> {
  const tenant = await requireTenantContext();
  try {
    await createCredentialType(tenant.churchId, {
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? "").trim() || undefined,
      requiresExpiry: formData.get("requiresExpiry") === "on",
      sensitive: formData.get("sensitive") === "on",
    });
  } catch (err) {
    return asState(err);
  }
  revalidate();
  return OK;
}

export async function editarTipoCredencialAction(
  credentialTypeId: string,
  input: { name?: string; description?: string; requiresExpiry?: boolean; sensitive?: boolean; active?: boolean },
): Promise<CredencialesState> {
  const tenant = await requireTenantContext();
  try {
    await updateCredentialType(tenant.churchId, credentialTypeId, input);
  } catch (err) {
    return asState(err);
  }
  revalidate();
  return OK;
}

export async function archivarTipoCredencialAction(credentialTypeId: string): Promise<CredencialesState> {
  const tenant = await requireTenantContext();
  try {
    await archiveCredentialType(tenant.churchId, credentialTypeId);
  } catch (err) {
    return asState(err);
  }
  revalidate();
  return OK;
}

export async function registrarCredencialAction(
  _prev: CredencialesState,
  formData: FormData,
): Promise<CredencialesState> {
  const tenant = await requireTenantContext();
  try {
    await assignCredential(
      tenant.churchId,
      String(formData.get("personId") ?? ""),
      String(formData.get("credentialTypeId") ?? ""),
      {
        status: (String(formData.get("status") ?? "pending") as CredentialStatus) || "pending",
        issuedAt: String(formData.get("issuedAt") ?? "").trim() || null,
        expiresAt: String(formData.get("expiresAt") ?? "").trim() || null,
        reference: String(formData.get("reference") ?? "").trim() || undefined,
      },
    );
  } catch (err) {
    return asState(err);
  }
  revalidate();
  return OK;
}

export async function verificarCredencialAction(credentialId: string): Promise<CredencialesState> {
  const tenant = await requireTenantContext();
  try {
    await verifyCredential(tenant.churchId, credentialId);
  } catch (err) {
    return asState(err);
  }
  revalidate();
  return OK;
}

export async function revocarCredencialAction(credentialId: string): Promise<CredencialesState> {
  const tenant = await requireTenantContext();
  try {
    await revokeCredential(tenant.churchId, credentialId);
  } catch (err) {
    return asState(err);
  }
  revalidate();
  return OK;
}

export async function actualizarCredencialAction(
  credentialId: string,
  input: { status?: CredentialStatus; expiresAt?: string | null },
): Promise<CredencialesState> {
  const tenant = await requireTenantContext();
  try {
    await updateCredential(tenant.churchId, credentialId, input);
  } catch (err) {
    return asState(err);
  }
  revalidate();
  return OK;
}
