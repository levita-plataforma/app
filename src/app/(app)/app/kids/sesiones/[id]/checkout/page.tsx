import { notFound } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { getKidsSession } from "@/server/kids/kids-sessions-service";
import { ensureKidsModule } from "../../../module-gate";
import CheckoutClient from "./CheckoutClient";

export default async function KidsCheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenantContext();
  const disabled = await ensureKidsModule(tenant.churchId);
  if (disabled) return disabled;

  const session = await getKidsSession(tenant.churchId, id);
  if (!session) notFound();

  const canCheckout = await hasCapability(tenant.churchId, "kids.checkout", "activity", session.activityId);
  if (!canCheckout) {
    return (
      <div className="shell-card shell-empty-state" style={{ padding: "48px 24px" }}>
        <h3>No tienes permiso para hacer check-out</h3>
        <p>Pide acceso a quien gestiona esta sesión Kids.</p>
      </div>
    );
  }

  return <CheckoutClient sessionId={id} activityTitle={session.activityTitle || "Sesión Kids"} roomName={session.roomName} />;
}
