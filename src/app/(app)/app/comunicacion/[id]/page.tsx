import { notFound } from "next/navigation";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import {
  getCommunication,
  getCommunicationMetrics,
  getPersonName,
  type CommunicationMetrics,
} from "@/server/communications/communications-service";
import { ensureCommunicationsModule } from "../module-gate";
import EstadoComunicacion, { type AuditEntry, type NameLookup } from "./EstadoComunicacion";

export default async function ComunicacionDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenantContext();
  const disabled = await ensureCommunicationsModule(tenant.churchId);
  if (disabled) return disabled;

  const communication = await getCommunication(tenant.churchId, id);
  if (!communication) notFound();

  const supabase = await createSupabaseServerClient();

  const [canSchedule, canReadMetrics, canReadAudit, creator] = await Promise.all([
    hasCapability(tenant.churchId, "communications.schedule"),
    hasCapability(tenant.churchId, "communications.read_metrics"),
    hasCapability(tenant.churchId, "audit.read"),
    communication.createdByPersonId ? getPersonName(communication.createdByPersonId) : Promise.resolve(null),
  ]);

  // Nombres legibles de los ids referenciados en las reglas del segmento
  // (campus_id, tags, service_area_id): sin esto la ficha mostraría uuids
  // crudos, que el prompt de esta fase pide evitar explícitamente.
  const rules = communication.segmentRulesSnapshot;
  const campusIds = new Set<string>();
  const tagIds = new Set<string>();
  const serviceAreaIds = new Set<string>();

  for (const condition of rules?.all ?? []) {
    const values = Array.isArray(condition.value) ? condition.value : [condition.value];
    for (const v of values) {
      if (typeof v !== "string") continue;
      if (condition.field === "campus_id") campusIds.add(v);
      if (condition.field === "tags") tagIds.add(v);
      if (condition.field === "service_area_id") serviceAreaIds.add(v);
    }
  }

  const [campusRes, tagRes, serviceAreaRes, metricsResult, auditRes] = await Promise.all([
    campusIds.size > 0
      ? supabase.from("campuses").select("id, name").eq("church_id", tenant.churchId).in("id", Array.from(campusIds))
      : Promise.resolve({ data: [] }),
    tagIds.size > 0
      ? supabase.from("tags").select("id, name").eq("church_id", tenant.churchId).in("id", Array.from(tagIds))
      : Promise.resolve({ data: [] }),
    serviceAreaIds.size > 0
      ? supabase.from("service_areas").select("id, name").eq("church_id", tenant.churchId).in("id", Array.from(serviceAreaIds))
      : Promise.resolve({ data: [] }),
    canReadMetrics && communication.materializedAt
      ? getCommunicationMetrics(id).catch((): CommunicationMetrics | null => null)
      : Promise.resolve(null),
    canReadAudit
      ? supabase
          .from("audit_logs")
          .select("id, action, created_at, metadata, actor_person_id")
          .eq("church_id", tenant.churchId)
          .eq("entity_type", "communications")
          .eq("entity_id", id)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: null }),
  ]);

  const nameLookup: NameLookup = {
    campuses: Object.fromEntries((campusRes.data ?? []).map((r) => [r.id as string, r.name as string])),
    tags: Object.fromEntries((tagRes.data ?? []).map((r) => [r.id as string, r.name as string])),
    serviceAreas: Object.fromEntries((serviceAreaRes.data ?? []).map((r) => [r.id as string, r.name as string])),
  };

  const auditEntries = (auditRes.data ?? []) as AuditEntry[];

  return (
    <EstadoComunicacion
      communication={communication}
      creatorName={creator ? [creator.firstName, creator.lastName].filter(Boolean).join(" ") : null}
      nameLookup={nameLookup}
      metrics={metricsResult}
      canReadMetrics={canReadMetrics}
      canSchedule={canSchedule}
      auditEntries={auditEntries}
    />
  );
}
