import { notFound } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { getEvent } from "@/server/events/events-service";
import { ensureEventsModule } from "../../module-gate";
import CheckinClient from "./CheckinClient";

export default async function CheckinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenantContext();
  const disabled = await ensureEventsModule(tenant.churchId);
  if (disabled) return disabled;

  const event = await getEvent(tenant.churchId, id);
  if (!event) notFound();

  const canCheckin = await hasCapability(tenant.churchId, "event.checkin", "activity", event.activityId);
  if (!canCheckin) {
    return (
      <div className="shell-card shell-empty-state" style={{ padding: "48px 24px" }}>
        <h3>No tienes permiso para hacer check-in</h3>
        <p>Pide acceso a quien gestiona este evento.</p>
      </div>
    );
  }

  return <CheckinClient eventId={id} eventTitle={event.activity?.title ?? "Evento"} />;
}
