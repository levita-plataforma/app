import Link from "next/link";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import {
  listServiceAreas,
  listServiceAreaTemplates,
} from "@/server/serving/service-areas-service";
import Pagination from "@/components/shell/Pagination";
import { ensureServingModule } from "../module-gate";
import AreasManager from "./AreasManager";
import { secondaryButtonStyle } from "../ui";

type SearchParams = {
  q?: string;
  campus?: string;
  archived?: string;
  page?: string;
  pageSize?: string;
};

export default async function AreasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const tenant = await requireTenantContext();
  const disabled = await ensureServingModule(tenant.churchId);
  if (disabled) return disabled;

  const supabase = await createSupabaseServerClient();
  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 25;
  const showingArchived = params.archived === "true";

  const [{ items, total }, templates, canManage, { data: campuses }] = await Promise.all([
    listServiceAreas(tenant.churchId, {
      search: params.q,
      campusId: params.campus,
      archived: showingArchived,
      page,
      pageSize,
    }),
    listServiceAreaTemplates(),
    hasCapability(tenant.churchId, "service_area.manage"),
    supabase
      .from("campuses")
      .select("id, name")
      .eq("church_id", tenant.churchId)
      .is("archived_at", null),
  ]);

  return (
    <>
      <section
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Áreas de servicio</h1>
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
            Las unidades operativas reales de tu iglesia. Un área no es un permiso global.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/app/servicios" style={secondaryButtonStyle()}>
            Volver al resumen
          </Link>
          <Link
            href={showingArchived ? "/app/servicios/areas" : "/app/servicios/areas?archived=true"}
            style={secondaryButtonStyle()}
          >
            {showingArchived ? "Ver activas" : "Ver archivadas"}
          </Link>
        </div>
      </section>

      <form className="shell-card serving-toolbar" style={{ padding: 14 }}>
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Buscar área…"
          aria-label="Buscar área"
          style={{
            padding: "8px 12px",
            borderRadius: "var(--shell-radius-sm)",
            border: "1px solid var(--shell-border)",
            fontSize: 13,
            minWidth: 180,
            flex: "1 1 180px",
          }}
        />
        {(campuses ?? []).length > 0 ? (
          <select
            name="campus"
            defaultValue={params.campus ?? ""}
            aria-label="Filtrar por sede"
            style={{
              padding: "8px 12px",
              borderRadius: "var(--shell-radius-sm)",
              border: "1px solid var(--shell-border)",
              fontSize: 13,
            }}
          >
            <option value="">Todas las sedes</option>
            {(campuses ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
        {showingArchived ? <input type="hidden" name="archived" value="true" /> : null}
        <button type="submit" style={secondaryButtonStyle()}>
          Filtrar
        </button>
      </form>

      <AreasManager
        areas={items}
        templates={templates}
        campuses={campuses ?? []}
        canManage={canManage}
        showingArchived={showingArchived}
      />

      {total > pageSize ? <Pagination page={page} pageSize={pageSize} total={total} /> : null}
    </>
  );
}
