import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { secondaryButtonStyle } from "@/app/(app)/app/servicios/ui";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  /** Parámetros actuales (sin `pagina`). */
  params: Record<string, string>;
};

/** Paginación por enlaces con el parámetro `pagina` (la consulta se pagina en servidor). */
export default function ListPager({ page, pageSize, total, params }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const query = new URLSearchParams(params);
    if (p > 1) query.set("pagina", String(p));
    else query.delete("pagina");
    const qs = query.toString();
    return `/app/actividades${qs ? `?${qs}` : ""}`;
  };
  const disabledStyle = { ...secondaryButtonStyle(), opacity: 0.45, pointerEvents: "none" as const };

  return (
    <nav className="act-pager" aria-label="Paginación">
      <span>
        {total} actividad{total === 1 ? "" : "es"} · página {page} de {totalPages}
      </span>
      <div className="act-actions">
        {page > 1 ? (
          <Link href={href(page - 1)} style={secondaryButtonStyle()} rel="prev">
            <ChevronLeft size={14} aria-hidden="true" /> Anterior
          </Link>
        ) : (
          <span style={disabledStyle} aria-disabled="true">
            <ChevronLeft size={14} aria-hidden="true" /> Anterior
          </span>
        )}
        {page < totalPages ? (
          <Link href={href(page + 1)} style={secondaryButtonStyle()} rel="next">
            Siguiente <ChevronRight size={14} aria-hidden="true" />
          </Link>
        ) : (
          <span style={disabledStyle} aria-disabled="true">
            Siguiente <ChevronRight size={14} aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}
