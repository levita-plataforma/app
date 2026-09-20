import { NextResponse, type NextRequest } from "next/server";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { exportGivingContributionsCsv } from "@/server/giving/giving-export";
import { DomainError } from "@/server/errors/domain-error";

/**
 * Descarga CSV de aportaciones, mismo patrón que
 * src/app/(app)/app/eventos/[id]/exportar/route.ts. Route Handler, no
 * Server Action, porque el resultado es un fichero para el navegador.
 * Requiere giving.export explícita (comprobada dentro de
 * exportGivingContributionsCsv), auditada.
 */
export async function GET(request: NextRequest) {
  const tenant = await requireTenantContext();
  const { searchParams } = new URL(request.url);

  try {
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");
    const csv = await exportGivingContributionsCsv(tenant.churchId, {
      from: desde ? new Date(desde).toISOString() : undefined,
      to: hasta ? new Date(hasta).toISOString() : undefined,
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="ofrendas-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 400 });
    }
    throw err;
  }
}
