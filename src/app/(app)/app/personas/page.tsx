import Link from "next/link";
import { UserPlus, Upload, Download } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { listPeople } from "@/server/people/people-service";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import PersonasFilters from "./PersonasFilters";
import PersonasTable from "./PersonasTable";
import Pagination from "@/components/shell/Pagination";

type SearchParams = {
  q?: string;
  relationship?: string;
  campus?: string;
  tag?: string;
  hasAccount?: "yes" | "no";
  archived?: string;
  page?: string;
  pageSize?: string;
};

export default async function PersonasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const tenant = await requireTenantContext();
  const supabase = await createSupabaseServerClient();

  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 25;

  const [{ items, total }, { data: campuses }, { data: tags }] = await Promise.all([
    listPeople(tenant.churchId, {
      search: params.q,
      relationship: params.relationship,
      campusId: params.campus,
      tagId: params.tag,
      hasAccount: params.hasAccount,
      archived: params.archived === "true",
      page,
      pageSize,
    }),
    supabase.from("campuses").select("id, name").eq("church_id", tenant.churchId).is("archived_at", null),
    supabase.from("tags").select("id, name, color").eq("church_id", tenant.churchId).is("archived_at", null),
  ]);

  return (
    <>
      <section style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Personas</h1>
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
            Conoce y cuida a tu comunidad.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/app/personas/importar" style={secondaryLinkStyle}>
            <Upload size={14} /> Importar
          </Link>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- descarga de fichero (Route Handler), no navegación client-side */}
          <a href="/app/personas/exportar" style={secondaryLinkStyle}>
            <Download size={14} /> Exportar
          </a>
          <Link href="/app/personas/nueva" style={primaryLinkStyle}>
            <UserPlus size={15} /> Nueva persona
          </Link>
        </div>
      </section>

      <PersonasFilters
        campuses={campuses ?? []}
        tags={tags ?? []}
        current={{
          q: params.q ?? "",
          relationship: params.relationship ?? "",
          campus: params.campus ?? "",
          tag: params.tag ?? "",
          hasAccount: params.hasAccount ?? "",
          archived: params.archived ?? "",
        }}
      />

      {items.length === 0 ? (
        <div className="shell-card shell-empty-state">
          <h3>No se han encontrado personas</h3>
          <p>Ajusta los filtros o añade la primera persona de tu comunidad.</p>
        </div>
      ) : (
        <>
          <PersonasTable people={items} />
          <Pagination page={page} pageSize={pageSize} total={total} />
        </>
      )}
    </>
  );
}

const primaryLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "9px 16px",
  borderRadius: "var(--shell-radius-md)",
  background: "var(--shell-brand)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  textDecoration: "none",
};

const secondaryLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "9px 16px",
  borderRadius: "var(--shell-radius-md)",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-surface)",
  color: "var(--shell-text)",
  fontSize: 13,
  fontWeight: 600,
  textDecoration: "none",
};
