import { requireTenantContext } from "@/server/tenant/tenant-context";
import { requireCapability } from "@/server/tenant/authorize";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { ensureFacilitiesModule } from "../module-gate";
import RecursoForm from "./RecursoForm";

/**
 * Alta de un recurso. La capacidad se exige aquí además de en la RPC: sin esto
 * la página se pintaría entera para alguien que luego no puede guardar, que es
 * una forma tonta de hacer perder el tiempo.
 */
export default async function NuevoRecursoPage() {
  const tenant = await requireTenantContext();

  const sinModulo = await ensureFacilitiesModule(tenant.churchId);
  if (sinModulo) return sinModulo;

  await requireCapability(tenant.churchId, "facilities.manage_resources");

  const supabase = await createSupabaseServerClient();
  const { data: sedes } = await supabase
    .from("campuses")
    .select("id, name")
    .eq("church_id", tenant.churchId)
    .is("archived_at", null)
    .order("name");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 20 }}>Nuevo recurso</h1>
        <p style={{ margin: "4px 0 0", color: "var(--shell-text-muted)", fontSize: 13 }}>
          Una sala, un equipo o un vehículo que se pueda reservar.
        </p>
      </header>
      <RecursoForm sedes={sedes ?? []} />
    </div>
  );
}
