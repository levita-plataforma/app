import { NextResponse, type NextRequest } from "next/server";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { getAnalyticsDashboard, dashboardToCsv, ANALYTICS_PERIODS, type AnalyticsPeriod } from "@/server/analytics/analytics-service";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";

/**
 * Export síncrono del dashboard agregado, mismo patrón que
 * src/app/(app)/app/eventos/[id]/exportar/route.ts. analytics.export es una
 * capability propia, distinta de analytics.read (§39-40 del prompt); nunca
 * sustituye la autorización de los módulos fuente porque solo exporta lo que
 * app.analytics_dashboard ya filtró por capability de cada módulo.
 */
export async function GET(request: NextRequest) {
  const tenant = await requireTenantContext();
  const { searchParams } = new URL(request.url);

  try {
    await requireCapability(tenant.churchId, "analytics.export");

    const rawPeriod = searchParams.get("period");
    const period: AnalyticsPeriod = (ANALYTICS_PERIODS as readonly string[]).includes(rawPeriod ?? "")
      ? (rawPeriod as AnalyticsPeriod)
      : "30d";

    const dashboard = await getAnalyticsDashboard(tenant.churchId, { period });
    const csv = dashboardToCsv(dashboard);

    await auditLog({
      churchId: tenant.churchId,
      action: "analytics.export.created",
      entityType: "analytics_dashboard",
      metadata: { period },
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="informes-${period}-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    if (err instanceof DomainError) {
      return NextResponse.json({ error: err.message }, { status: err.code === "FORBIDDEN" ? 403 : 400 });
    }
    throw err;
  }
}
