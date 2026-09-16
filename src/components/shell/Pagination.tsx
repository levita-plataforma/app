"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationProps = { page: number; pageSize: number; total: number };

/**
 * Paginación server-side (encargo de Fase 2 §28): solo cambia parámetros
 * de URL, la página siguiente se resuelve en el servidor con LIMIT/OFFSET
 * reales, nunca cargando todo el listado al navegador.
 */
export default function Pagination({ page, pageSize, total }: PaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function goTo(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    router.push(`${pathname}?${params.toString()}`);
  }

  function changePageSize(size: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("pageSize", size);
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, fontSize: 12.5, color: "var(--shell-text-muted)" }}>
      <span>
        {total} persona{total === 1 ? "" : "s"} · página {page} de {totalPages}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <select
          value={pageSize}
          onChange={(e) => changePageSize(e.target.value)}
          style={{ border: "1px solid var(--shell-border)", borderRadius: "var(--shell-radius-sm)", padding: "5px 8px", fontSize: 12.5 }}
        >
          <option value={25}>25 por página</option>
          <option value={50}>50 por página</option>
          <option value={100}>100 por página</option>
        </select>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => goTo(page - 1)}
          aria-label="Página anterior"
          style={pagerButtonStyle(page <= 1)}
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => goTo(page + 1)}
          aria-label="Página siguiente"
          style={pagerButtonStyle(page >= totalPages)}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

const pagerButtonStyle = (disabled: boolean): React.CSSProperties => ({
  display: "grid",
  placeItems: "center",
  width: 28,
  height: 28,
  borderRadius: "var(--shell-radius-sm)",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-surface)",
  color: disabled ? "var(--shell-text-subtle)" : "var(--shell-text)",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.5 : 1,
});
