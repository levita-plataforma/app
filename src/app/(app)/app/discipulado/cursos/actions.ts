"use server";

import { revalidatePath } from "next/cache";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { DomainError } from "@/server/errors/domain-error";
import { saveCourse, setCourseArchived } from "@/server/discipleship/discipleship-service";
import { isCourseStatus } from "@/lib/discipleship/constants";

export type CursosState = { error: string | null };

const OK: CursosState = { error: null };

function asState(err: unknown): CursosState {
  if (err instanceof DomainError) return { error: err.message };
  throw err;
}

function revalidateCourses(courseId?: string) {
  revalidatePath("/app/discipulado/cursos");
  revalidatePath("/app/discipulado");
  if (courseId) revalidatePath(`/app/discipulado/cursos/${courseId}`);
}

export async function guardarCursoAction(_prev: CursosState, formData: FormData): Promise<CursosState> {
  const tenant = await requireTenantContext();

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  const sessionCountRaw = String(formData.get("sessionCount") ?? "").trim();
  const ratioRaw = String(formData.get("completionAttendanceRatio") ?? "").trim();

  if (!name) return { error: "El nombre del curso es obligatorio." };

  // El umbral se pide en porcentaje porque es lo legible; la base lo guarda
  // como proporción entre 0 y 1.
  const ratio = ratioRaw ? Number(ratioRaw) / 100 : undefined;
  if (ratio !== undefined && (!Number.isFinite(ratio) || ratio < 0 || ratio > 1)) {
    return { error: "El umbral de asistencia debe estar entre 0 y 100." };
  }

  try {
    await saveCourse(tenant.churchId, {
      id: id || undefined,
      name,
      description: description || null,
      status: isCourseStatus(status) ? status : undefined,
      sessionCount: sessionCountRaw ? Number(sessionCountRaw) : null,
      completionAttendanceRatio: ratio ?? null,
    });
  } catch (err) {
    return asState(err);
  }
  revalidateCourses(id || undefined);
  return OK;
}

export async function archivarCursoAction(courseId: string, archived: boolean): Promise<CursosState> {
  await requireTenantContext();
  try {
    await setCourseArchived(courseId, archived);
  } catch (err) {
    return asState(err);
  }
  revalidateCourses(courseId);
  return OK;
}
