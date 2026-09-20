import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { getWorshipSong, listWorshipSongFiles } from "@/server/worship/worship-service";
import { ensureWorshipModule } from "../../module-gate";
import CancionForm from "../CancionForm";
import ArchivarCancionButton from "./ArchivarCancionButton";
import CancionArchivos from "./CancionArchivos";

export default async function CancionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenantContext();
  const disabled = await ensureWorshipModule(tenant.churchId);
  if (disabled) return disabled;

  const [song, canManage] = await Promise.all([
    getWorshipSong(tenant.churchId, id),
    hasCapability(tenant.churchId, "worship.song.manage"),
  ]);

  if (!song) notFound();

  const files = canManage ? await listWorshipSongFiles(tenant.churchId, id) : [];

  return (
    <>
      <section style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/app/alabanza/canciones" style={{ color: "var(--shell-text-muted)", display: "flex" }}>
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600 }}>{song.title}</h1>
            {song.status === "archived" ? (
              <p style={{ fontSize: 12, color: "var(--shell-text-muted)" }}>Archivada</p>
            ) : null}
          </div>
        </div>
        {canManage && song.status === "active" ? <ArchivarCancionButton songId={song.id} /> : null}
      </section>

      {song.status === "archived" ? (
        <div className="shell-card" style={{ padding: 16, fontSize: 13, color: "var(--shell-text-muted)" }}>
          Esta canción está archivada. No se puede editar ni añadir a nuevos repertorios; sigue siendo
          legible en los repertorios que ya la incluían.
        </div>
      ) : (
        <CancionForm song={song} />
      )}

      {canManage ? <CancionArchivos files={files} /> : null}
    </>
  );
}
