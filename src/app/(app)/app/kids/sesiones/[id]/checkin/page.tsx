import { notFound } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { getKidsSession, getRatioStatus } from "@/server/kids/kids-sessions-service";
import { ensureKidsModule } from "../../../module-gate";
import CheckinClient from "./CheckinClient";

export default async function KidsCheckinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenantContext();
  const disabled = await ensureKidsModule(tenant.churchId);
  if (disabled) return disabled;

  const session = await getKidsSession(tenant.churchId, id);
  if (!session) notFound();

  const canCheckin = await hasCapability(tenant.churchId, "kids.checkin", "activity", session.activityId);
  if (!canCheckin) {
    return (
      <div className="shell-card shell-empty-state" style={{ padding: "48px 24px" }}>
        <h3>No tienes permiso para hacer check-in</h3>
        <p>Pide acceso a quien gestiona esta sesión Kids.</p>
      </div>
    );
  }

  const ratio = await getRatioStatus(tenant.churchId, id);

  return (
    <CheckinClient
      sessionId={id}
      activityTitle={session.activityTitle || "Sesión Kids"}
      roomName={session.roomName}
      initialRatio={ratio}
    />
  );
}
