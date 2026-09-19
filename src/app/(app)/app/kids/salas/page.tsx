import Link from "next/link";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { createSupabaseServerClient } from "@/server/supabase/server-client";
import { listKidsRooms } from "@/server/kids/kids-rooms-service";
import { ensureKidsModule } from "../module-gate";
import SalasManager from "./SalasManager";
import { secondaryButtonStyle } from "../ui";

type SearchParams = {
  campus?: string;
  archived?: string;
};

export default async function SalasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const tenant = await requireTenantContext();
  const disabled = await ensureKidsModule(tenant.churchId);
  if (disabled) return disabled;

  const supabase = await createSupabaseServerClient();
  const showingArchived = params.archived === "true";

  const [rooms, canManage, { data: campuses }] = await Promise.all([
    listKidsRooms(tenant.churchId, { campusId: params.campus, archived: showingArchived }),
    hasCapability(tenant.churchId, "kids.room.manage"),
    supabase.from("campuses").select("id, name").eq("church_id", tenant.churchId).is("archived_at", null),
  ]);

  return (
    <>
      <section
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Salas</h1>
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
            Capacidad, franja de edad y ratio de adultos por sala.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/app/kids" style={secondaryButtonStyle()}>
            Volver al resumen
          </Link>
          <Link
            href={showingArchived ? "/app/kids/salas" : "/app/kids/salas?archived=true"}
            style={secondaryButtonStyle()}
          >
            {showingArchived ? "Ver activas" : "Ver archivadas"}
          </Link>
        </div>
      </section>

      <SalasManager
        rooms={rooms}
        campuses={campuses ?? []}
        canManage={canManage}
        showingArchived={showingArchived}
      />
    </>
  );
}
