import { notFound } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { getCreationScopes } from "@/server/activities/activities-service";
import { getActivityTemplate } from "@/server/activities/activity-templates-service";
import { loadTemplateEditorData } from "../editor-data";
import PlantillaEditor from "../PlantillaEditor";
import "../plantillas.css";

export default async function PlantillaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenantContext();
  const [scopes, template] = await Promise.all([
    getCreationScopes(tenant.churchId),
    getActivityTemplate(tenant.churchId, id),
  ]);
  if (!template) notFound();

  const canEdit =
    scopes.templatesChurch || (template.campusId !== null && scopes.templatesCampusIds.includes(template.campusId));
  const data = await loadTemplateEditorData(tenant.churchId, scopes);

  // La sede actual siempre debe poder mostrarse, aunque no esté entre las gestionables.
  if (template.campusId && !data.campuses.some((c) => c.id === template.campusId)) {
    data.campuses = [...data.campuses, { id: template.campusId, name: template.campusName ?? "Sede actual" }];
  }

  return (
    <div className="tpl-root">
      <PlantillaEditor template={template} canEdit={canEdit} data={data} />
    </div>
  );
}
