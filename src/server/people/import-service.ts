import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { requireCapability } from "@/server/tenant/authorize";
import { auditLog } from "@/server/audit/audit-log";
import { DomainError } from "@/server/errors/domain-error";
import { findPotentialDuplicates } from "@/server/people/people-service";

export type ImportRow = Record<string, string>;

export type ImportRowResult = {
  row: number;
  status: "created" | "skipped" | "duplicate" | "error";
  errors: { field: string; message: string; severity: "error" | "warning" }[];
  personId?: string;
};

export type ImportPreview = {
  columns: string[];
  sampleRows: ImportRow[];
  totalRows: number;
};

const REQUIRED_MAPPED_FIELD = "firstName";

/**
 * Parser CSV mínimo suficiente para el caso de uso (comillas dobles,
 * comas como separador, sin fórmulas ejecutables — nunca se interpreta el
 * contenido como código, solo como texto). No soporta CSV multi-línea
 * dentro de un campo entrecomillado más allá de \n simples.
 */
export function parseCsv(content: string): { columns: string[]; rows: ImportRow[] } {
  const lines = content.split(/\r\n|\n|\r/).filter((line) => line.length > 0);
  if (lines.length === 0) return { columns: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        cells.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current);
    return cells.map((c) => c.trim());
  };

  const columns = parseLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = parseLine(line);
    const row: ImportRow = {};
    columns.forEach((col, i) => {
      row[col] = cells[i] ?? "";
    });
    return row;
  });

  return { columns, rows };
}

export type ColumnMapping = Record<string, string>; // csv column -> campo interno

export type ImportRunOptions = {
  rows: ImportRow[];
  mapping: ColumnMapping;
  duplicateStrategy: "skip" | "create_anyway";
  idempotencyKey: string;
};

/**
 * Ejecuta la importación de forma síncrona (encargo §19: para archivos
 * pequeños no hace falta worker externo, pero nunca debe bloquear
 * indefinidamente — se asume un volumen de cientos de filas, no decenas
 * de miles). Registra el job en import_jobs para trazabilidad, progreso e
 * idempotencia.
 */
export async function runPeopleImport(
  churchId: string,
  options: ImportRunOptions,
): Promise<{ jobId: string; results: ImportRowResult[] }> {
  await requireCapability(churchId, "people.import");

  const supabase = await createSupabaseServerClient();

  const { data: existingJob } = await supabase
    .from("import_jobs")
    .select("id, status, progress")
    .eq("church_id", churchId)
    .eq("idempotency_key", options.idempotencyKey)
    .maybeSingle();

  if (existingJob && existingJob.status === "succeeded") {
    const progress = (existingJob.progress as { results?: ImportRowResult[] }) ?? {};
    return { jobId: existingJob.id, results: progress.results ?? [] };
  }

  const { data: job, error: jobError } = await supabase
    .from("import_jobs")
    .upsert(
      {
        church_id: churchId,
        entity_type: "person",
        idempotency_key: options.idempotencyKey,
        status: "processing",
        mapping: options.mapping,
        started_at: new Date().toISOString(),
      },
      { onConflict: "church_id,idempotency_key" },
    )
    .select("id")
    .single();

  if (jobError || !job) throw new DomainError("INTERNAL_ERROR", "No se pudo iniciar la importación.");

  await auditLog({ churchId, action: "import.started", entityType: "import_jobs", entityId: job.id, metadata: { rows: options.rows.length } });

  const results: ImportRowResult[] = [];

  for (let i = 0; i < options.rows.length; i++) {
    const raw = options.rows[i];
    const rowNumber = i + 2; // +1 por índice base 1, +1 por fila de cabecera
    const mapped = mapRow(raw, options.mapping);
    const errors: ImportRowResult["errors"] = [];

    if (!mapped.firstName?.trim()) {
      errors.push({ field: REQUIRED_MAPPED_FIELD, message: "El nombre es obligatorio.", severity: "error" });
    }

    if (errors.length > 0) {
      results.push({ row: rowNumber, status: "error", errors });
      continue;
    }

    const duplicates = await findPotentialDuplicates(churchId, {
      email: mapped.email,
      phone: mapped.phone,
      firstName: mapped.firstName,
      lastName: mapped.lastName,
      birthDate: mapped.birthDate,
    });

    const strongDuplicate = duplicates.find((d) => d.matchType === "email" || d.matchType === "phone");

    if (strongDuplicate && options.duplicateStrategy === "skip") {
      results.push({
        row: rowNumber,
        status: "duplicate",
        errors: [{ field: "email", message: `Coincide con una persona ya existente (${strongDuplicate.firstName} ${strongDuplicate.lastName ?? ""}).`, severity: "warning" }],
        personId: strongDuplicate.personId,
      });
      continue;
    }

    const { data: person, error: personError } = await supabase
      .from("people")
      .insert({
        first_name: mapped.firstName.trim(),
        last_name: mapped.lastName?.trim() || null,
        email: mapped.email?.trim() || null,
        phone: mapped.phone?.trim() || null,
        birth_date: mapped.birthDate || null,
        source: "import",
      })
      .select("id")
      .single();

    if (personError || !person) {
      results.push({ row: rowNumber, status: "error", errors: [{ field: "row", message: "No se pudo crear la persona.", severity: "error" }] });
      continue;
    }

    const { error: churchPeopleError } = await supabase.from("church_people").insert({
      church_id: churchId,
      person_id: person.id,
      relationship: (mapped.status as never) || "visitor",
      source: "import",
    });

    if (churchPeopleError) {
      await supabase.from("people").delete().eq("id", person.id);
      results.push({ row: rowNumber, status: "error", errors: [{ field: "row", message: "No se pudo vincular la persona a la iglesia.", severity: "error" }] });
      continue;
    }

    results.push({
      row: rowNumber,
      status: strongDuplicate ? "duplicate" : "created",
      errors: strongDuplicate
        ? [{ field: "email", message: "Se creó de todos modos pese a una posible coincidencia.", severity: "warning" }]
        : [],
      personId: person.id,
    });
  }

  const summary = {
    total: options.rows.length,
    created: results.filter((r) => r.status === "created").length,
    duplicates: results.filter((r) => r.status === "duplicate").length,
    errors: results.filter((r) => r.status === "error").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    results,
  };

  await supabase
    .from("import_jobs")
    .update({ status: "succeeded", progress: summary, finished_at: new Date().toISOString() })
    .eq("id", job.id);

  await auditLog({
    churchId,
    action: "import.completed",
    entityType: "import_jobs",
    entityId: job.id,
    metadata: { created: summary.created, duplicates: summary.duplicates, errors: summary.errors },
  });

  return { jobId: job.id, results };
}

function mapRow(raw: ImportRow, mapping: ColumnMapping): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [csvColumn, field] of Object.entries(mapping)) {
    if (field && field !== "ignore") mapped[field] = raw[csvColumn] ?? "";
  }
  return mapped;
}
