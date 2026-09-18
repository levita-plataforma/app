import { NextResponse, type NextRequest } from "next/server";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { exportRegistrationsCsv } from "@/server/events/registrations-service";
import { DomainError } from "@/server/errors/domain-error";

/**
 * Descarga CSV de inscripciones de un evento, mismo patrón que
 * src/app/(app)/app/personas/exportar/route.ts. Route Handler, no Server
 * Action, porque el resultado es un fichero para el navegador.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenantContext();
  const { searchParams } = new URL(request.url);

  try {
    const status = searchParams.get("status");
    const csv = await exportRegistrationsCsv(tenant.churchId, id, {
      status:
        status && ["pending", "confirmed", "waitlisted", "cancelled", "declined"].includes(status)
          ? (status as "pending" | "confirmed" | "waitlisted" | "cancelled" | "declined")
          : undefined,
      search: searchParams.get("q") ?? undefined,
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="inscripciones-${id}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 400 });
    }
    throw err;
  }
}
