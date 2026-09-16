import Link from "next/link";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { getCreationScopes } from "@/server/activities/activities-service";
import { secondaryButtonStyle } from "../../../servicios/ui";
import { loadTemplateEditorData } from "../editor-data";
import PlantillaEditor from "../PlantillaEditor";
import "../plantillas.css";

export default async function NuevaPlantillaPage() {
  const tenant = await requireTenantContext();
  const scopes = await getCreationScopes(tenant.churchId);

  if (!scopes.templatesChurch && scopes.templatesCampusIds.length === 0) {
    return (
      <div className="tpl-root">
        <div className="shell-card shell-empty-state" style={{ padding: "56px 24px" }}>
          <h3>No puedes crear plantillas</h3>
          <p>Crear plantillas requiere permiso para gestionarlas en la iglesia o en alguna sede.</p>
          <Link href="/app/actividades/plantillas" className="tpl-btn" style={{ ...secondaryButtonStyle(), marginTop: 12 }}>
            Volver a plantillas
          </Link>
        </div>
      </div>
    );
  }

  const data = await loadTemplateEditorData(tenant.churchId, scopes);

  return (
    <div className="tpl-root">
      <PlantillaEditor template={null} canEdit data={data} />
    </div>
  );
}
