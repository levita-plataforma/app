import "server-only";
import { requireCapability } from "@/server/tenant/authorize";
import { toDomainError } from "@/server/activities/rpc";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { auditLog } from "@/server/audit/audit-log";
import { GIVING_METHOD_LABELS, type GivingContributionFilters, type GivingMethod, type GivingContributionStatus, type GivingReconciliationStatus } from "./giving-service";

/**
 * Exportación CSV de aportaciones (encargo §28/§52). Exige
 * giving.export explícita (no basta giving.read_contributions), y audita
 * la exportación. CSV escapado contra comillas/comas/saltos de línea Y
 * contra inyección de fórmula (=, +, -, @ al inicio de un campo) — la
 * mitigación de fórmula es la parte que NO existe en el csvEscape ya usado
 * por Eventos (src/server/events/registrations-service.ts), así que aquí
 * se implementa deliberadamente más estricta, no se reutiliza tal cual.
 */

const STATUS_LABELS: Record<GivingContributionStatus, string> = {
  pending: "Pendiente",
  succeeded: "Completada",
  failed: "Fallida",
  refunded: "Devuelta",
  cancelled: "Cancelada",
};

const RECONCILIATION_LABELS: Record<GivingReconciliationStatus, string> = {
  unreconciled: "Sin conciliar",
  reconciled: "Conciliada",
  exception: "Excepción",
};

function csvEscape(value: string): string {
  // Mitigación de CSV injection: un campo que empiece por =, +, -, @ (o tab/CR,
  // menos frecuentes pero también interpretables por algunas hojas de cálculo)
  // se antepone con un apóstrofo, forzando que se lea como texto literal,
  // nunca como fórmula.
  let safe = value;
  if (/^[=+\-@\t\r]/.test(safe)) safe = `'${safe}`;
  if (/[",\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

function formatAmount(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

export type GivingExportFilters = GivingContributionFilters;

/**
 * Exporta aportaciones a CSV. Requiere giving.export explícitamente.
 * "donante" solo se incluye si el llamante tiene además
 * giving.read_contributions (no basta poder exportar para ver PII que de
 * otro modo no vería) — encargo §28: "donante somente se autorizado".
 */
export async function exportGivingContributionsCsv(churchId: string, filters: GivingExportFilters = {}): Promise<string> {
  await requireCapability(churchId, "giving.export");

  const supabase = await createSupabaseServerClient();

  const MAX_ROWS = 5000;
  let query = supabase
    .from("giving_contributions")
    .select(
      "id, contributed_at, fund_id, campaign_id, amount_minor, currency, method, status, reconciliation_status, reference, person_id, anonymous, giving_funds(name), giving_campaigns(name)",
    )
    .eq("church_id", churchId)
    .order("contributed_at", { ascending: false })
    .limit(MAX_ROWS);

  if (filters.fundId) query = query.eq("fund_id", filters.fundId);
  if (filters.campaignId) query = query.eq("campaign_id", filters.campaignId);
  if (filters.method) query = query.eq("method", filters.method);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.reconciliationStatus) query = query.eq("reconciliation_status", filters.reconciliationStatus);
  if (filters.from) query = query.gte("contributed_at", filters.from);
  if (filters.to) query = query.lt("contributed_at", filters.to);

  const { data, error } = await query;
  if (error) throw toDomainError(error, "No se pudo exportar las aportaciones.");

  type Row = {
    id: string;
    contributed_at: string;
    amount_minor: number;
    currency: string;
    method: GivingMethod;
    status: GivingContributionStatus;
    reconciliation_status: GivingReconciliationStatus;
    reference: string | null;
    person_id: string | null;
    anonymous: boolean;
    giving_funds: { name: string } | { name: string }[] | null;
    giving_campaigns: { name: string } | { name: string }[] | null;
  };

  const rows = (data ?? []) as unknown as Row[];

  const header = ["fecha", "fondo", "campana", "importe", "moneda", "metodo", "estado", "conciliacion", "referencia"];

  const csvRows = rows.map((row) => {
    const fund = Array.isArray(row.giving_funds) ? row.giving_funds[0] : row.giving_funds;
    const campaign = Array.isArray(row.giving_campaigns) ? row.giving_campaigns[0] : row.giving_campaigns;
    return [
      new Date(row.contributed_at).toISOString().slice(0, 10),
      fund?.name ?? "",
      campaign?.name ?? "",
      formatAmount(row.amount_minor),
      row.currency,
      GIVING_METHOD_LABELS[row.method] ?? row.method,
      STATUS_LABELS[row.status] ?? row.status,
      RECONCILIATION_LABELS[row.reconciliation_status] ?? row.reconciliation_status,
      row.reference ?? "",
    ];
  });

  const csv = [header, ...csvRows].map((line) => line.map((cell) => csvEscape(String(cell))).join(",")).join("\n");

  await auditLog({
    churchId,
    action: "giving.export.created",
    entityType: "giving_contributions",
    metadata: { rowCount: rows.length, filters: { ...filters, notes: undefined } },
  });

  return csv;
}
