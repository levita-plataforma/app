import Link from "next/link";
import { Plus, ArrowLeft } from "lucide-react";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { listWorshipSongs } from "@/server/worship/worship-service";
import { ensureWorshipModule } from "../module-gate";
import { primaryButtonStyle, secondaryButtonStyle, formatKey } from "../ui";

export default async function CancionesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const tenant = await requireTenantContext();
  const disabled = await ensureWorshipModule(tenant.churchId);
  if (disabled) return disabled;

  const { q, status } = await searchParams;

  const [songs, canManage] = await Promise.all([
    listWorshipSongs(tenant.churchId, {
      search: q || undefined,
      status: status === "archived" ? "archived" : "active",
    }),
    hasCapability(tenant.churchId, "worship.song.manage"),
  ]);

  return (
    <>
      <section style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/app/alabanza" style={{ color: "var(--shell-text-muted)", display: "flex" }}>
          <ArrowLeft size={18} />
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Canciones</h1>
      </section>

      <section style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <form style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="search"
            name="q"
            placeholder="Buscar por título o autor…"
            defaultValue={q ?? ""}
            style={{
              padding: "9px 12px",
              borderRadius: "var(--shell-radius-sm)",
              border: "1px solid var(--shell-border)",
              fontSize: 13,
              minWidth: 220,
            }}
          />
          <select
            name="status"
            defaultValue={status ?? "active"}
            style={{ padding: "9px 12px", borderRadius: "var(--shell-radius-sm)", border: "1px solid var(--shell-border)", fontSize: 13 }}
          >
            <option value="active">Activas</option>
            <option value="archived">Archivadas</option>
          </select>
          <button type="submit" style={secondaryButtonStyle()}>
            Filtrar
          </button>
        </form>

        {canManage ? (
          <Link href="/app/alabanza/canciones/nueva" style={primaryButtonStyle()}>
            <Plus size={14} /> Nueva canción
          </Link>
        ) : null}
      </section>

      <section className="shell-card" style={{ padding: 20 }}>
        {songs.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "32px 16px" }}>
            <p style={{ fontWeight: 600 }}>No hay canciones todavía.</p>
            <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
              Crea tu primera canción para empezar a construir repertorios.
            </p>
            {canManage ? (
              <Link href="/app/alabanza/canciones/nueva" style={{ ...primaryButtonStyle(), marginTop: 14 }}>
                <Plus size={14} /> Crear primera canción
              </Link>
            ) : null}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--shell-text-muted)", fontSize: 12 }}>
                  <th style={{ padding: "8px 10px" }}>Título</th>
                  <th style={{ padding: "8px 10px" }}>Autor</th>
                  <th style={{ padding: "8px 10px" }}>Tonalidad</th>
                  <th style={{ padding: "8px 10px" }}>BPM</th>
                  <th style={{ padding: "8px 10px" }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {songs.map((song) => (
                  <tr key={song.id} style={{ borderTop: "1px solid var(--shell-border)" }}>
                    <td style={{ padding: "10px" }}>
                      <Link href={`/app/alabanza/canciones/${song.id}`} style={{ color: "var(--shell-text)", fontWeight: 600, textDecoration: "none" }}>
                        {song.title}
                      </Link>
                    </td>
                    <td style={{ padding: "10px", color: "var(--shell-text-muted)" }}>{song.author ?? "—"}</td>
                    <td style={{ padding: "10px" }}>{formatKey(song.defaultKey ?? song.originalKey)}</td>
                    <td style={{ padding: "10px" }}>{song.bpm ?? "—"}</td>
                    <td style={{ padding: "10px" }}>{song.status === "archived" ? "Archivada" : "Activa"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
