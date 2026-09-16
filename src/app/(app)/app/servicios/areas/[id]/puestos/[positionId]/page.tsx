import { notFound } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { getPosition } from "@/server/serving/service-positions-service";
import { listRequirements } from "@/server/serving/position-requirements-service";
import { getEligiblePeopleForPosition } from "@/server/serving/eligibility-service";
import { listQualifications } from "@/server/serving/qualifications-service";
import { listCredentialTypes } from "@/server/serving/credentials-service";
import { ensureServingModule } from "../../../../module-gate";
import PuestoFicha from "./PuestoFicha";

export default async function PuestoPage({
  params,
}: {
  params: Promise<{ id: string; positionId: string }>;
}) {
  const { id, positionId } = await params;
  const tenant = await requireTenantContext();
  const disabled = await ensureServingModule(tenant.churchId);
  if (disabled) return disabled;

  const position = await getPosition(tenant.churchId, positionId);
  if (!position || position.areaId !== id) notFound();

  const [requirements, eligibility, { items: qualifications }, credentialTypes, canManage] =
    await Promise.all([
      listRequirements(tenant.churchId, positionId),
      getEligiblePeopleForPosition(tenant.churchId, positionId),
      listQualifications(tenant.churchId, { pageSize: 100 }),
      listCredentialTypes(tenant.churchId),
      hasCapability(tenant.churchId, "service_positions.manage", "service_area", position.areaId),
    ]);

  return (
    <PuestoFicha
      position={position}
      requirements={requirements}
      eligibility={eligibility}
      qualifications={qualifications.map((q) => ({ id: q.id, name: q.name }))}
      credentialTypes={credentialTypes.map((c) => ({ id: c.id, name: c.name }))}
      canManage={canManage}
    />
  );
}
