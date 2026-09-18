import Link from "next/link";
import { Plus } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { listForms } from "@/server/forms/forms-service";
import { ensureEventsModule } from "./module-gate";
import FormulariosManager from "./FormulariosManager";
import { primaryButtonStyle, secondaryButtonStyle } from "./ui";

type SearchParams = {
  archived?: string;
};

export default async function FormulariosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const tenant = await requireTenantContext();
  const disabled = await ensureEventsModule(tenant.churchId);
  if (disabled) return disabled;

  const showingArchived = params.archived === "true";

  const [forms, canManage] = await Promise.all([
    listForms(tenant.churchId, { archived: showingArchived }),
    hasCapability(tenant.churchId, "form.manage"),
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
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Formularios</h1>
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
            Catálogo de formularios reutilizables y versionados para inscripciones y otras necesidades.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            href={
              showingArchived ? "/app/formularios" : "/app/formularios?archived=true"
            }
            style={secondaryButtonStyle()}
          >
            {showingArchived ? "Ver activos" : "Ver archivados"}
          </Link>
          {canManage ? (
            <Link href="/app/formularios/nuevo" style={primaryButtonStyle()}>
              <Plus size={14} /> Nuevo formulario
            </Link>
          ) : null}
        </div>
      </section>

      <FormulariosManager forms={forms} canManage={canManage} showingArchived={showingArchived} />
    </>
  );
}
