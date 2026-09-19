import Link from "next/link";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { listCommunicationTemplates, listCommunicationSegments } from "@/server/communications/communications-service";
import { ensureCommunicationsModule } from "../module-gate";
import NuevaComunicacionWizard from "./NuevaComunicacionWizard";

export default async function NuevaComunicacionPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureCommunicationsModule(tenant.churchId);
  if (disabled) return disabled;

  await requireCapability(tenant.churchId, "communications.create");

  const supabase = await createSupabaseServerClient();

  const [templates, segments, campusesRes, tagsRes, serviceAreasRes] = await Promise.all([
    listCommunicationTemplates(tenant.churchId),
    listCommunicationSegments(tenant.churchId),
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
        <Link href="/app/comunicacion" style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}>
          ← Comunicación
        </Link>
        <h1 style={{ fontSize: 21, fontWeight: 600, marginTop: 6 }}>Nueva comunicación</h1>
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 2 }}>
          Define el contenido, la audiencia y los canales, y envíala ahora o prográmala.
        </p>
      </section>

      <NuevaComunicacionWizard
        churchId={tenant.churchId}
        templates={templates}
        segments={segments}
        campuses={campusesRes.data ?? []}
        tags={tagsRes.data ?? []}
        serviceAreas={serviceAreasRes.data ?? []}
      />
    </>
  );
}
