import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { getWorshipRepertoire, listWorshipRepertoireSongs, listWorshipSongs } from "@/server/worship/worship-service";
import { ensureWorshipModule } from "../../module-gate";
import RepertorioForm from "../RepertorioForm";
import ArchivarRepertorioButton from "./ArchivarRepertorioButton";
import RepertorioEditor from "./RepertorioEditor";

export default async function RepertorioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenantContext();
  const disabled = await ensureWorshipModule(tenant.churchId);
  if (disabled) return disabled;

  const [repertoire, canManage] = await Promise.all([
    getWorshipRepertoire(tenant.churchId, id),
    hasCapability(tenant.churchId, "worship.repertoire.manage"),
  ]);

  if (!repertoire) notFound();

  const [items, allSongs] = await Promise.all([
    listWorshipRepertoireSongs(tenant.churchId, id),
    canManage ? listWorshipSongs(tenant.churchId, { status: "active" }) : Promise.resolve([]),
  ]);

  return (
    <>
      <section style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/app/alabanza/repertorios" style={{ color: "var(--shell-text-muted)", display: "flex" }}>
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600 }}>{repertoire.name}</h1>
            {repertoire.status === "archived" ? (
              <p style={{ fontSize: 12, color: "var(--shell-text-muted)" }}>Archivado</p>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href={`/app/alabanza/atril?repertorio=${repertoire.id}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 16px",
              borderRadius: "var(--shell-radius-md)",
              border: "1px solid var(--shell-border)",
              background: "var(--shell-surface)",
              color: "var(--shell-text)",
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Abrir atril
          </Link>
          {canManage && repertoire.status === "active" ? <ArchivarRepertorioButton repertoireId={repertoire.id} /> : null}
        </div>
      </section>

      {repertoire.status === "archived" ? (
        <div className="shell-card" style={{ padding: 16, fontSize: 13, color: "var(--shell-text-muted)" }}>
          Este repertorio está archivado. No se puede editar; sus canciones siguen siendo legibles.
        </div>
      ) : (
        <RepertorioForm repertoire={repertoire} />
      )}

      <RepertorioEditor
        repertoireId={repertoire.id}
        items={items}
        allSongs={allSongs}
        canManage={canManage && repertoire.status === "active"}
      />
    </>
  );
}
