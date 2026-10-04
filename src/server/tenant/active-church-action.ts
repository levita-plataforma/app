"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ACTIVE_CHURCH_COOKIE, getTenantContext } from "@/server/tenant/tenant-context";

/**
 * Cambia la iglesia activa. El id llega del navegador, así que se valida contra
 * las membresías reales del usuario antes de guardarlo: un church_id ajeno no
 * sirve como credencial (ver getTenantContext).
 */
export async function switchActiveChurch(formData: FormData): Promise<void> {
  const churchId = String(formData.get("churchId") ?? "");
  const context = await getTenantContext();

  if (!context || !context.memberships.some((m) => m.churchId === churchId)) {
    redirect("/app/estado");
  }

  (await cookies()).set(ACTIVE_CHURCH_COOKIE, churchId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/app");
}
