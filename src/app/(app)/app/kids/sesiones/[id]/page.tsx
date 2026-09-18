import { notFound } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { getKidsSession, getRatioStatus } from "@/server/kids/kids-sessions-service";
import { listSessionStaff } from "@/server/kids/kids-staff-service";
import { ensureKidsModule } from "../../module-gate";
import SesionFicha from "./SesionFicha";

export default async function SesionKidsDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenantContext();
  const disabled = await ensureKidsModule(tenant.churchId);
  if (disabled) return disabled;

  const session = await getKidsSession(tenant.churchId, id);
  if (!session) notFound();

  const [ratio, staff, canManage, canCheckin, canCheckout] = await Promise.all([
    getRatioStatus(tenant.churchId, id),
    listSessionStaff(tenant.churchId, id),
    hasCapability(tenant.churchId, "kids.session.manage"),
    hasCapability(tenant.churchId, "kids.checkin", "activity", session.activityId),
    hasCapability(tenant.churchId, "kids.checkout", "activity", session.activityId),
  ]);

  return (
    <SesionFicha
      session={session}
      initialRatio={ratio}
      initialStaff={staff}
      permissions={{ canManage, canCheckin, canCheckout }}
    />
  );
}
