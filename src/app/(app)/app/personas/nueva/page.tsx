import { requireTenantContext } from "@/server/tenant/tenant-context";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import NuevaPersonaForm from "./NuevaPersonaForm";

export default async function NuevaPersonaPage() {
  const tenant = await requireTenantContext();
  const supabase = await createSupabaseServerClient();

  const [{ data: campuses }, { data: tags }] = await Promise.all([
    supabase.from("campuses").select("id, name").eq("church_id", tenant.churchId).is("archived_at", null),
    supabase.from("tags").select("id, name, color").eq("church_id", tenant.churchId).is("archived_at", null),
  ]);

  return (
    <>
      <section>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Nueva persona</h1>
        <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
          Crea una ficha sin necesidad de que tenga cuenta en LEVITA.
        </p>
      </section>

      <NuevaPersonaForm campuses={campuses ?? []} tags={tags ?? []} />
    </>
  );
}
