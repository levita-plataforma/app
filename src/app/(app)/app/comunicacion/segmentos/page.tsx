import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { listCommunicationSegments } from "@/server/communications/communications-service";
import { ensureCommunicationsModule } from "../module-gate";
import SegmentosManager from "./SegmentosManager";

export default async function SegmentosPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureCommunicationsModule(tenant.churchId);
  if (disabled) return disabled;

  const supabase = await createSupabaseServerClient();

  const [segments, canManage, campusesRes, tagsRes, serviceAreasRes] = await Promise.all([
    listCommunicationSegments(tenant.churchId),
    hasCapability(tenant.churchId, "communications.manage_segments"),
    supabase.from("campuses").select("id, name").eq("church_id", tenant.churchId).is("archived_at", null).order("name"),
    supabase.from("tags").select("id, name").eq("church_id", tenant.churchId).is("archived_at", null).order("name"),
    supabase
      .from("service_areas")
      .select("id, name")
      .eq("church_id", tenant.churchId)
      .eq("active", true)
      .order("name"),
  ]);

  return (
    <>
      <section>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Segmentos</h1>
        <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
          Define audiencias reutilizables para tus comunicaciones.
        </p>
      </section>

      <SegmentosManager
        churchId={tenant.churchId}
        segments={segments}
        canManage={canManage}
        campuses={campusesRes.data ?? []}
        tags={tagsRes.data ?? []}
        serviceAreas={serviceAreasRes.data ?? []}
      />
    </>
  );
}
