import Link from "next/link";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { hasCapability } from "@/server/tenant/authorize";
import { listGroupTypes } from "@/server/groups/groups-service";
import { ensureGroupsModule } from "../module-gate";
import NuevoGrupoForm from "./NuevoGrupoForm";

export default async function NuevoGrupoPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureGroupsModule(tenant.churchId);
  if (disabled) return disabled;

  const supabase = await createSupabaseServerClient();

  const [{ data: campuses }, groupTypes, canCreate] = await Promise.all([
    supabase.from("campuses").select("id, name").eq("church_id", tenant.churchId).is("archived_at", null).order("name"),
    listGroupTypes(tenant.churchId),
    hasCapability(tenant.churchId, "group.create"),
  ]);

  // La RPC vuelve a comprobar el permiso (también el de sede concreta); esta
  // comprobación solo evita enseñar un formulario que no se podría enviar.
  if (!canCreate) {
    return (
      <div className="shell-card shell-empty-state" style={{ padding: "48px 24px" }}>
        <h3>No puedes crear grupos</h3>
        <p>Pide a quien administra la iglesia que te dé permiso para crear grupos.</p>
        <Link href="/app/grupos" style={{ fontSize: 12.5, marginTop: 10, color: "var(--shell-brand)" }}>
          Volver a Grupos
        </Link>
      </div>
    );
  }

  return (
    <>
      <section>
        <Link href="/app/grupos" style={{ fontSize: 12, color: "var(--shell-text-muted)", textDecoration: "none" }}>
          ← Grupos
        </Link>
        <h1 style={{ fontSize: 21, fontWeight: 600, marginTop: 6 }}>Nuevo grupo</h1>
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)", marginTop: 2 }}>
          Crea el grupo y después añade a quien lo lleva, a sus participantes y sus reuniones.
        </p>
      </section>

      <NuevoGrupoForm
        campuses={(campuses ?? []).map((c) => ({ id: c.id as string, name: c.name as string }))}
        groupTypes={groupTypes.map((t) => ({ id: t.id, name: t.name }))}
      />
    </>
  );
}
