"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import {
  createCommunicationSegment,
  archiveCommunicationSegment,
  previewCommunicationSegment,
  type CommunicationChannel,
  type SegmentPreview,
  type SegmentRulesJson,
} from "@/server/communications/communications-service";
import { DomainError } from "@/server/errors/domain-error";

export type SegmentosState = { error: string | null };

function parseRulesFromForm(formData: FormData): SegmentRulesJson | null {
  const raw = String(formData.get("rules") ?? "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.all)) return null;
    return parsed as SegmentRulesJson;
  } catch {
    return null;
  }
}

export async function crearSegmentoAction(
  _prevState: SegmentosState,
  formData: FormData,
): Promise<SegmentosState> {
  const tenant = await requireTenantContext();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const rules = parseRulesFromForm(formData);

  if (!name) return { error: "El nombre es obligatorio." };
  if (!rules || rules.all.length === 0) {
    return { error: "Añade al menos una condición para el segmento." };
  }

  try {
    await requireCapability(tenant.churchId, "communications.manage_segments");
    await createCommunicationSegment(
      tenant.churchId,
      { name, description: description || undefined, rules },
    );
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }

  revalidatePath("/app/comunicacion/segmentos");
  return { error: null };
}

export async function archivarSegmentoAction(segmentId: string): Promise<SegmentosState> {
  const tenant = await requireTenantContext();
  try {
    await requireCapability(tenant.churchId, "communications.manage_segments");
    await archiveCommunicationSegment(tenant.churchId, segmentId);
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
  revalidatePath("/app/comunicacion/segmentos");
  return { error: null };
}

export type PreviewSegmentoState = { error: string | null; preview: SegmentPreview | null };

/**
 * Previsualiza destinatarios estimados de un segmento (ad-hoc, sin
 * necesidad de guardarlo primero) llamando a la RPC
 * preview_communication_segment. Reutilizable también desde el wizard de
 * "Nueva comunicación".
 */
export async function previsualizarSegmentoAction(
  churchId: string,
  rules: SegmentRulesJson,
  channels: CommunicationChannel[],
): Promise<PreviewSegmentoState> {
  const tenant = await requireTenantContext(churchId);
  try {
    await requireCapability(tenant.churchId, "communications.read");
    const preview = await previewCommunicationSegment(tenant.churchId, rules, channels);
    return { error: null, preview };
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message, preview: null };
    throw err;
  }
}
