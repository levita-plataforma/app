"use server";

import { requireTenantContext } from "@/server/tenant/tenant-context";
import { parseCsv, runPeopleImport, type ColumnMapping, type ImportRowResult } from "@/server/people/import-service";
import { DomainError } from "@/server/errors/domain-error";

export async function previsualizarCsvAction(content: string) {
  const { columns, rows } = parseCsv(content);
  return { columns, sampleRows: rows.slice(0, 5), totalRows: rows.length };
}

export type EjecutarImportacionState = {
  error: string | null;
  results?: ImportRowResult[];
  summary?: { created: number; duplicates: number; errors: number };
};

export async function ejecutarImportacionAction(
  csvContent: string,
  mapping: ColumnMapping,
  duplicateStrategy: "skip" | "create_anyway",
  idempotencyKey: string,
): Promise<EjecutarImportacionState> {
  const tenant = await requireTenantContext();
  const { rows } = parseCsv(csvContent);

  try {
    const { results } = await runPeopleImport(tenant.churchId, { rows, mapping, duplicateStrategy, idempotencyKey });
    return {
      error: null,
      results,
      summary: {
        created: results.filter((r) => r.status === "created").length,
        duplicates: results.filter((r) => r.status === "duplicate").length,
        errors: results.filter((r) => r.status === "error").length,
      },
    };
  } catch (err) {
    if (err instanceof DomainError) return { error: err.message };
    throw err;
  }
}
