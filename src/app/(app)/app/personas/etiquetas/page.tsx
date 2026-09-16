import { requireTenantContext } from "@/server/tenant/tenant-context";
import { listTags } from "@/server/people/tags-service";
import { hasCapability } from "@/server/tenant/authorize";
import EtiquetasManager from "./EtiquetasManager";

export default async function EtiquetasPage() {
  const tenant = await requireTenantContext();
  const [tags, canManage] = await Promise.all([
    listTags(tenant.churchId),
    hasCapability(tenant.churchId, "people.manage"),
  ]);

  return (
    <>
      <section>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Etiquetas</h1>
        <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
          Clasifica a tu comunidad de forma flexible. Las etiquetas no son permisos.
        </p>
      </section>

      <EtiquetasManager tags={tags} canManage={canManage} />
    </>
  );
}
