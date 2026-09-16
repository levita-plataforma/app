"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { previsualizarCsvAction, ejecutarImportacionAction, type EjecutarImportacionState } from "./actions";
import type { ColumnMapping } from "@/server/people/import-service";

const INTERNAL_FIELDS = [
  { value: "ignore", label: "No importar" },
  { value: "firstName", label: "Nombre" },
  { value: "lastName", label: "Apellidos" },
  { value: "email", label: "Correo" },
  { value: "phone", label: "Teléfono" },
  { value: "birthDate", label: "Fecha de nacimiento" },
  { value: "status", label: "Estado" },
  { value: "tags", label: "Etiquetas" },
];

type Step = "upload" | "mapping" | "confirm" | "result";

export default function ImportarWizard() {
  const [step, setStep] = useState<Step>("upload");
  const [csvContent, setCsvContent] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Record<string, string>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [duplicateStrategy, setDuplicateStrategy] = useState<"skip" | "create_anyway">("skip");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<EjecutarImportacionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileSelected(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? "");
      setCsvContent(content);
      startTransition(async () => {
        const preview = await previsualizarCsvAction(content);
        setColumns(preview.columns);
        setSampleRows(preview.sampleRows);
        setTotalRows(preview.totalRows);

        const guessed: ColumnMapping = {};
        for (const col of preview.columns) {
          const normalized = col.toLowerCase();
          if (normalized.includes("nombre") && !normalized.includes("apell")) guessed[col] = "firstName";
          else if (normalized.includes("apell")) guessed[col] = "lastName";
          else if (normalized.includes("mail") || normalized.includes("correo")) guessed[col] = "email";
          else if (normalized.includes("tel") || normalized.includes("phone")) guessed[col] = "phone";
          else if (normalized.includes("nacim") || normalized.includes("birth")) guessed[col] = "birthDate";
          else if (normalized.includes("estado") || normalized.includes("status")) guessed[col] = "status";
          else if (normalized.includes("tag") || normalized.includes("etiqueta")) guessed[col] = "tags";
          else guessed[col] = "ignore";
        }
        setMapping(guessed);
        setStep("mapping");
      });
    };
    reader.readAsText(file);
  }

  function handleConfirm() {
    const hasFirstName = Object.values(mapping).includes("firstName");
    if (!hasFirstName) {
      setError('Debes mapear al menos una columna al campo "Nombre".');
      return;
    }
    setError(null);
    setStep("confirm");
  }

  function handleRunImport() {
    startTransition(async () => {
      const idempotencyKey = crypto.randomUUID();
      const res = await ejecutarImportacionAction(csvContent, mapping, duplicateStrategy, idempotencyKey);
      setResult(res);
      setStep("result");
    });
  }

  return (
    <div className="shell-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
      <StepIndicator step={step} />

      {step === "upload" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 13, color: "var(--shell-text-muted)" }}>
            El archivo debe tener una cabecera en la primera fila. Columnas admitidas: nombre, apellidos, correo, teléfono, fecha de nacimiento, estado, etiquetas.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelected(file);
            }}
          />
          {pending ? <p style={{ fontSize: 12.5, color: "var(--shell-text-subtle)" }}>Leyendo archivo…</p> : null}
        </div>
      ) : null}

      {step === "mapping" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontSize: 13 }}>
            {totalRows} fila{totalRows === 1 ? "" : "s"} detectadas. Asigna cada columna del CSV a un campo de LEVITA.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {columns.map((col) => (
              <div key={col} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 140 }}>{col}</span>
                <select
                  value={mapping[col] ?? "ignore"}
                  onChange={(e) => setMapping((m) => ({ ...m, [col]: e.target.value }))}
                  style={{ border: "1px solid var(--shell-border)", borderRadius: "var(--shell-radius-sm)", padding: "6px 10px", fontSize: 12.5 }}
                >
                  {INTERNAL_FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--shell-text-subtle)", marginBottom: 8 }}>
              Vista previa (primeras {sampleRows.length} filas)
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="people-table">
                <thead>
                  <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {sampleRows.map((row, i) => (
                    <tr key={i}>{columns.map((c) => <td key={c} data-label={c}>{row[c]}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error ? <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>{error}</p> : null}

          <div>
            <span style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 6 }}>Si se detecta un posible duplicado (email o teléfono ya existentes):</span>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
              <input type="radio" name="dup" checked={duplicateStrategy === "skip"} onChange={() => setDuplicateStrategy("skip")} />
              Omitir esa fila
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
              <input type="radio" name="dup" checked={duplicateStrategy === "create_anyway"} onChange={() => setDuplicateStrategy("create_anyway")} />
              Crear de todos modos
            </label>
          </div>

          <button type="button" onClick={handleConfirm} style={primaryButtonStyle}>
            Continuar
          </button>
        </div>
      ) : null}

      {step === "confirm" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ fontSize: 13 }}>
            Vas a importar <strong>{totalRows}</strong> fila{totalRows === 1 ? "" : "s"}. Las filas sin nombre no se crearán.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={pending} onClick={handleRunImport} style={primaryButtonStyle}>
              {pending ? "Importando…" : "Confirmar e importar"}
            </button>
            <button type="button" onClick={() => setStep("mapping")} style={secondaryButtonStyle}>
              Volver
            </button>
          </div>
        </div>
      ) : null}

      {step === "result" && result ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {result.error ? (
            <p role="alert" style={{ fontSize: 13, color: "var(--shell-danger)" }}>{result.error}</p>
          ) : (
            <>
              <div style={{ display: "flex", gap: 16 }}>
                <Stat label="Creadas" value={result.summary?.created ?? 0} color="var(--shell-success)" />
                <Stat label="Duplicados" value={result.summary?.duplicates ?? 0} color="var(--shell-warning)" />
                <Stat label="Errores" value={result.summary?.errors ?? 0} color="var(--shell-danger)" />
              </div>

              {result.results && result.results.some((r) => r.errors.length > 0) ? (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--shell-text-subtle)", marginBottom: 8 }}>
                    Detalle de filas con incidencias
                  </p>
                  <ul style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
                    {result.results
                      .filter((r) => r.errors.length > 0)
                      .map((r) => (
                        <li key={r.row}>
                          Fila {r.row}: {r.errors.map((e) => e.message).join(" ")}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}

              <Link href="/app/personas" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--shell-brand)" }}>
                Ver directorio de personas
              </Link>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "Subir" },
    { key: "mapping", label: "Mapeo" },
    { key: "confirm", label: "Confirmar" },
    { key: "result", label: "Resultado" },
  ];
  const currentIndex = steps.findIndex((s) => s.key === step);

  return (
    <ol style={{ display: "flex", gap: 6, listStyle: "none", padding: 0, margin: 0 }}>
      {steps.map((s, i) => (
        <li
          key={s.key}
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 11.5,
            fontWeight: 600,
            padding: "6px 0",
            borderBottom: `2px solid ${i <= currentIndex ? "var(--shell-brand)" : "var(--shell-border)"}`,
            color: i <= currentIndex ? "var(--shell-text)" : "var(--shell-text-subtle)",
          }}
        >
          {s.label}
        </li>
      ))}
    </ol>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <p style={{ fontSize: 22, fontWeight: 700, color }}>{value}</p>
      <p style={{ fontSize: 12, color: "var(--shell-text-muted)" }}>{label}</p>
    </div>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  padding: "9px 18px",
  borderRadius: "var(--shell-radius-sm)",
  border: "none",
  background: "var(--shell-brand)",
  color: "#fff",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "9px 18px",
  borderRadius: "var(--shell-radius-sm)",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-surface)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};
