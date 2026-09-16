import { requireTenantContext } from "@/server/tenant/tenant-context";
import { listCustomFieldDefinitions } from "@/server/people/custom-fields-service";
import { hasCapability } from "@/server/tenant/authorize";
import CamposManager from "./CamposManager";

export default async function CamposPersonalizadosPage() {
  const tenant = await requireTenantContext();
  const [fields, canManage] = await Promise.all([
    listCustomFieldDefinitions(tenant.churchId),
    hasCapability(tenant.churchId, "church.settings.manage"),
  ]);

  return (
    <>
      <section>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Campos personalizados</h1>
        <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
          Adapta la información que guardas de cada persona.
        </p>
      </section>

      <CamposManager fields={fields} canManage={canManage} />
    </>
  );
}
