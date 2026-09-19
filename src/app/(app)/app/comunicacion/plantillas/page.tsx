import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { listCommunicationTemplates } from "@/server/communications/communications-service";
import { ensureCommunicationsModule } from "../module-gate";
import PlantillasManager from "./PlantillasManager";

export default async function PlantillasPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureCommunicationsModule(tenant.churchId);
  if (disabled) return disabled;

  const [templates, canManage] = await Promise.all([
    listCommunicationTemplates(tenant.churchId),
    hasCapability(tenant.churchId, "communications.manage_templates"),
  ]);

  return (
    <>
      <section>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Plantillas</h1>
        <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
          Reutiliza asunto y cuerpo para tus comunicaciones habituales.
        </p>
      </section>

      <PlantillasManager templates={templates} canManage={canManage} />
    </>
  );
}
