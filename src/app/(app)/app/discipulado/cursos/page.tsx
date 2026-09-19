import Link from "next/link";
import Pagination from "@/components/shell/Pagination";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { listCourses, type CourseListFilters } from "@/server/discipleship/discipleship-service";
import { COURSE_STATUSES, COURSE_STATUS_INFO } from "@/lib/discipleship/constants";
import { ensureDiscipleshipModule } from "../module-gate";
import { ensureDiscipleshipRead } from "../access-gate";
import { secondaryButtonStyle, selectStyle } from "../ui";
import CursosManager from "./CursosManager";

type SearchParams = { estado?: string; q?: string; archivados?: string; page?: string; pageSize?: string };

export default async function CursosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const tenant = await requireTenantContext();
  const disabled = await ensureDiscipleshipModule(tenant.churchId);
  if (disabled) return disabled;

  const denied = await ensureDiscipleshipRead(tenant.churchId, ["course.read"], "los cursos");
  if (denied) return denied;

  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Number(params.pageSize) || 25;

  const filters: CourseListFilters = {
    status:
      params.estado && (COURSE_STATUSES as readonly string[]).includes(params.estado)
        ? (params.estado as CourseListFilters["status"])
        : undefined,
    search: params.q?.trim() || undefined,
    includeArchived: params.archivados === "1",
    page,
    pageSize,
  };

  const [{ items, total }, canCreate, canManage] = await Promise.all([
    listCourses(tenant.churchId, filters),
    hasCapability(tenant.churchId, "course.create"),
    hasCapability(tenant.churchId, "course.manage"),
  ]);

  return (
    <>
      <section>
        <Link href="/app/discipulado" style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}>
          ← Discipulado
        </Link>
        <h1 style={{ fontSize: 21, fontWeight: 600, marginTop: 6 }}>Cursos</h1>
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 2 }}>
          El curso describe la formación. Cada edición concreta, con sus fechas y su gente, es una cohorte.
        </p>
      </section>

      <form className="shell-card serving-toolbar" style={{ padding: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Buscar curso…"
          aria-label="Buscar curso"
          style={{
            padding: "8px 12px",
            borderRadius: "var(--shell-radius-sm)",
            border: "1px solid var(--shell-border)",
            fontSize: 13,
            minWidth: 180,
            flex: "1 1 180px",
          }}
        />
        <select name="estado" defaultValue={params.estado ?? ""} aria-label="Estado" style={selectStyle}>
          <option value="">Todos los estados</option>
          {COURSE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {COURSE_STATUS_INFO[status].label}
            </option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
          <input type="checkbox" name="archivados" value="1" defaultChecked={params.archivados === "1"} /> Incluir
          archivados
        </label>
        <button type="submit" style={secondaryButtonStyle()}>
          Filtrar
        </button>
      </form>

      <CursosManager courses={items} canCreate={canCreate} canManage={canManage} />

      {total > pageSize ? <Pagination page={page} pageSize={pageSize} total={total} /> : null}
    </>
  );
}
