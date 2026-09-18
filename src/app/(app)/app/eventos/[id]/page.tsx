import { notFound } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { hasCapability } from "@/server/tenant/authorize";
import { getEvent } from "@/server/events/events-service";
import { listRegistrations } from "@/server/events/registrations-service";
import { getForm } from "@/server/forms/forms-service";
import { ensureEventsModule } from "../module-gate";
import EventoFicha from "./EventoFicha";

type SearchParams = { status?: string; q?: string; page?: string; pageSize?: string };

export default async function EventoDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tenant = await requireTenantContext();
  const disabled = await ensureEventsModule(tenant.churchId);
  if (disabled) return disabled;

  const event = await getEvent(tenant.churchId, id);
  if (!event) notFound();

  const supabase = await createSupabaseServerClient();

  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = Number(sp.pageSize) || 25;
  const registrationStatus =
    sp.status && ["pending", "confirmed", "waitlisted", "cancelled", "declined"].includes(sp.status)
      ? (sp.status as "pending" | "confirmed" | "waitlisted" | "cancelled" | "declined")
      : undefined;

  const [canManage, canPublish, canCheckin, canExport, canReadAudit] = await Promise.all([
    hasCapability(tenant.churchId, "event.manage", "activity", event.activityId),
    hasCapability(tenant.churchId, "event.publish", "activity", event.activityId),
    hasCapability(tenant.churchId, "event.checkin", "activity", event.activityId),
    hasCapability(tenant.churchId, "event.registration.export"),
    hasCapability(tenant.churchId, "audit.read"),
  ]);

  const [
    { items: registrations, total: registrationsTotal },
    form,
    campusRes,
    auditRes,
  ] = await Promise.all([
    listRegistrations(tenant.churchId, id, {
      status: registrationStatus,
      search: sp.q?.trim() || undefined,
      page,
      pageSize,
    }).catch(() => ({ items: [], total: 0, page: 1, pageSize })),
    event.formId ? getForm(tenant.churchId, event.formId) : Promise.resolve(null),
    supabase.from("campuses").select("id, name").eq("church_id", tenant.churchId).is("archived_at", null).order("name"),
    canReadAudit
      ? supabase
          .from("audit_logs")
          .select("id, action, created_at, metadata, actor_person_id")
          .eq("church_id", tenant.churchId)
          .eq("entity_type", "events")
          .eq("entity_id", id)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: null }),
  ]);
  const campuses = campusRes.data;
  const auditRows = auditRes.data;

  return (
    <EventoFicha
      event={event}
      registrations={registrations}
      registrationsTotal={registrationsTotal}
      registrationsPage={page}
      registrationsPageSize={pageSize}
      form={form}
      campuses={campuses ?? []}
      auditEntries={(auditRows ?? []) as {
        id: string;
        action: string;
        created_at: string;
        metadata: Record<string, unknown>;
        actor_person_id: string | null;
      }[]}
      permissions={{ canManage, canPublish, canCheckin, canExport }}
    />
  );
}
