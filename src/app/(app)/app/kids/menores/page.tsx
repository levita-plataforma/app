import Link from "next/link";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { listKidsProfiles, type KidsProfileStatus } from "@/server/kids/kids-profiles-service";
import Pagination from "@/components/shell/Pagination";
import { ensureKidsModule } from "../module-gate";
import MenoresManager from "./MenoresManager";
import { secondaryButtonStyle } from "../ui";

type SearchParams = {
  q?: string;
  status?: string;
  page?: string;
  pageSize?: string;
};

const STATUS_VALUES: KidsProfileStatus[] = ["active", "inactive", "archived"];

export default async function MenoresPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const tenant = await requireTenantContext();
  const disabled = await ensureKidsModule(tenant.churchId);
  if (disabled) return disabled;

  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 25;
  const status = STATUS_VALUES.includes(params.status as KidsProfileStatus)
    ? (params.status as KidsProfileStatus)
    : undefined;

  const [{ items, total }, canManage] = await Promise.all([
    listKidsProfiles(tenant.churchId, { search: params.q, status, page, pageSize }),
    hasCapability(tenant.churchId, "kids.manage"),
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
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Menores</h1>
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
            Perfiles Kids de las personas ya registradas en Personas.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/app/kids" style={secondaryButtonStyle()}>
            Volver al resumen
          </Link>
        </div>
      </section>

      <form className="shell-card serving-toolbar" style={{ padding: 14 }}>
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Buscar por nombre…"
          aria-label="Buscar menor"
          style={{
            padding: "8px 12px",
            borderRadius: "var(--shell-radius-sm)",
            border: "1px solid var(--shell-border)",
            fontSize: 13,
            minWidth: 180,
            flex: "1 1 180px",
          }}
        />
        <select
          name="status"
          defaultValue={params.status ?? ""}
          aria-label="Filtrar por estado"
          style={{
            padding: "8px 12px",
            borderRadius: "var(--shell-radius-sm)",
            border: "1px solid var(--shell-border)",
            fontSize: 13,
          }}
        >
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
          <option value="archived">Archivado</option>
        </select>
        <button type="submit" style={secondaryButtonStyle()}>
          Filtrar
        </button>
      </form>

      <MenoresManager profiles={items} canManage={canManage} />

      {total > pageSize ? <Pagination page={page} pageSize={pageSize} total={total} /> : null}
    </>
  );
}
