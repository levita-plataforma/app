import Link from "next/link";
import { Music4, ListMusic, Plus, BookOpen } from "lucide-react";
import StatCard from "@/components/shell/StatCard";
import { requireTenantContext } from "@/server/tenant/tenant-context";
import { hasCapability } from "@/server/tenant/authorize";
import { getWorshipKpis, listWorshipSongs, listWorshipRepertoires } from "@/server/worship/worship-service";
import { ensureWorshipModule } from "./module-gate";
import { primaryButtonStyle, secondaryButtonStyle, formatDateTime } from "./ui";

export default async function AlabanzaPage() {
  const tenant = await requireTenantContext();
  const disabled = await ensureWorshipModule(tenant.churchId);
  if (disabled) return disabled;

  const [kpis, recentSongs, recentRepertoires, canManageSongs] = await Promise.all([
    getWorshipKpis(tenant.churchId),
    listWorshipSongs(tenant.churchId, { limit: 6 }),
    listWorshipRepertoires(tenant.churchId),
    hasCapability(tenant.churchId, "worship.song.manage"),
  ]);

  return (
    <>
      <section
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Alabanza</h1>
          <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
            Canciones, tonalidades y repertorios de tu comunidad.
          </p>
        </div>
        {canManageSongs ? (
          <Link href="/app/alabanza/canciones/nueva" style={primaryButtonStyle()}>
            <Plus size={14} /> Nueva canción
          </Link>
        ) : null}
      </section>

      <div className="stat-grid">
        <StatCard
          icon={Music4}
          value={String(kpis.activeSongs)}
          label="Canciones activas"
          accentBg="var(--mod-worship-bg)"
          accentFg="var(--mod-worship-fg)"
        />
        <StatCard
          icon={ListMusic}
          value={String(kpis.repertoires)}
          label="Repertorios"
          accentBg="var(--mod-worship-bg)"
          accentFg="var(--mod-worship-fg)"
        />
      </div>

      <section style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/app/alabanza/canciones" style={secondaryButtonStyle()}>
          <Music4 size={14} /> Canciones
        </Link>
        <Link href="/app/alabanza/repertorios" style={secondaryButtonStyle()}>
          <ListMusic size={14} /> Repertorios
        </Link>
        <Link href="/app/alabanza/atril" style={secondaryButtonStyle()}>
          <BookOpen size={14} /> Abrir atril
        </Link>
      </section>

      <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>Canciones recientes</h2>

        {recentSongs.length === 0 ? (
          <div className="shell-empty-state" style={{ padding: "32px 16px" }}>
            <p style={{ fontWeight: 600 }}>No hay canciones todavía.</p>
            <p style={{ color: "var(--shell-text-muted)", fontSize: 13, marginTop: 4 }}>
              Crea tu primera canción para empezar a construir repertorios.
            </p>
            {canManageSongs ? (
              <Link href="/app/alabanza/canciones/nueva" style={{ ...primaryButtonStyle(), marginTop: 14 }}>
                <Plus size={14} /> Crear primera canción
              </Link>
            ) : null}
          </div>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recentSongs.map((song) => (
              <li key={song.id}>
                <Link
                  href={`/app/alabanza/canciones/${song.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: "var(--shell-radius-sm)",
                    border: "1px solid var(--shell-border)",
                    textDecoration: "none",
                    color: "var(--shell-text)",
                  }}
                >
                  <div>
                    <p style={{ fontSize: 13.5, fontWeight: 600 }}>{song.title}</p>
                    <p style={{ fontSize: 12, color: "var(--shell-text-muted)", marginTop: 2 }}>
                      {song.author ?? "Sin autor"} · {formatDateTime(song.updatedAt)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {recentRepertoires.length === 0 ? null : (
        <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Repertorios</h2>
          <ul style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recentRepertoires.map((repertoire) => (
              <li key={repertoire.id}>
                <Link
                  href={`/app/alabanza/repertorios/${repertoire.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: "var(--shell-radius-sm)",
                    border: "1px solid var(--shell-border)",
                    textDecoration: "none",
                    color: "var(--shell-text)",
                  }}
                >
                  <p style={{ fontSize: 13.5, fontWeight: 600 }}>{repertoire.name}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
