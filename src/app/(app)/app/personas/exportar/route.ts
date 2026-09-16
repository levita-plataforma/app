import { NextResponse, type NextRequest } from "next/server";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { exportPeopleCsv } from "@/server/people/export-service";
import { DomainError } from "@/server/errors/domain-error";

/**
 * Descarga CSV de personas respetando los filtros activos del directorio
 * (encargo de Fase 2 §22). Route Handler, no Server Action, porque el
 * resultado es un fichero para el navegador, no un estado de UI.
 */
export async function GET(request: NextRequest) {
  const tenant = await requireTenantContext();
  const { searchParams } = new URL(request.url);

  try {
    const csv = await exportPeopleCsv(tenant.churchId, {
      search: searchParams.get("q") ?? undefined,
      relationship: searchParams.get("relationship") ?? undefined,
      campusId: searchParams.get("campus") ?? undefined,
      tagId: searchParams.get("tag") ?? undefined,
      hasAccount: (searchParams.get("hasAccount") as "yes" | "no") || undefined,
      archived: searchParams.get("archived") === "true",
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="personas-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 400 });
    }
    throw err;
  }
}
