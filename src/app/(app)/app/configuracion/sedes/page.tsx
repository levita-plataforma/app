import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import SedesManager from "./SedesManager";

export default async function ConfiguracionSedesPage() {
  const tenant = await requireTenantContext();
  const canManage = await hasCapability(tenant.churchId, "church.settings.manage");

  const supabase = await createSupabaseServerClient();
  const { data: campuses } = await supabase
    .from("campuses")
    .select("id, name, address, is_primary, status")
    .eq("church_id", tenant.churchId)
    .is("archived_at", null)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });

  return (
    <>
      <section>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Sedes</h1>
        <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
          Gestiona la sede principal y añade nuevas sedes de {tenant.churchName}.
        </p>
      </section>

      <SedesManager campuses={campuses ?? []} canManage={canManage} />
    </>
  );
}
