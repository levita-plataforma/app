"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, X } from "lucide-react";
import { authInputStyle } from "@/components/shell/AuthCard";
import { subtleButtonStyle, formatKey, WORSHIP_KEY_ROOT_OPTIONS, WORSHIP_KEY_MODE_LABELS } from "../../ui";
import type { WorshipRepertoireSongItem, WorshipSong, WorshipKeyRoot, WorshipKeyMode } from "@/server/worship/worship-service";
import { anadirCancionAction, quitarCancionAction, reordenarCancionesAction, cambiarTonalidadAction } from "../actions";

/**
 * Editor de repertorio: añadir/quitar/reordenar canciones y elegir
 * tonalidad por repertorio. Reorder con controles subir/bajar (no depende
 * exclusivamente de drag, ver contrato §35/§48) — no se introduce una
 * librería de drag-and-drop nueva solo para esto.
 */
export default function RepertorioEditor({
  repertoireId,
  items,
  allSongs,
  canManage,
}: {
  repertoireId: string;
  items: WorshipRepertoireSongItem[];
  allSongs: WorshipSong[];
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [songToAdd, setSongToAdd] = useState("");
  const router = useRouter();

  const availableSongs = allSongs.filter((song) => !items.some((item) => item.song.id === song.id));

  function runAction<T>(fn: () => Promise<{ error: string | null } & Partial<T>>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleAdd() {
    if (!songToAdd) return;
    runAction(() => anadirCancionAction(repertoireId, songToAdd));
    setSongToAdd("");
  }

  function handleRemove(repertoireSongId: string) {
    runAction(() => quitarCancionAction(repertoireId, repertoireSongId));
  }

  function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    const orderedIds = items.map((item) => item.id);
    const [moved] = orderedIds.splice(index, 1);
    orderedIds.splice(targetIndex, 0, moved);
    runAction(() => reordenarCancionesAction(repertoireId, orderedIds));
  }

  function handleKeyChange(repertoireSongId: string, root: WorshipKeyRoot, mode: WorshipKeyMode) {
    runAction(() => cambiarTonalidadAction(repertoireId, repertoireSongId, root, mode));
  }

  return (
    <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 13, fontWeight: 600 }}>Canciones del repertorio</p>

      {error ? (
        <p role="alert" style={{ fontSize: 12.5, color: "var(--shell-danger)" }}>
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>Todavía no hay canciones en este repertorio.</p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item, index) => (
            <li
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                border: "1px solid var(--shell-border)",
                borderRadius: "var(--shell-radius-sm)",
              }}
            >
              <span style={{ fontSize: 12, color: "var(--shell-text-muted)", minWidth: 20 }}>{item.position}</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13.5, fontWeight: 600 }}>{item.song.title}</p>
                <p style={{ fontSize: 12, color: "var(--shell-text-muted)" }}>{item.song.author ?? "—"}</p>
              </div>

              {canManage ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <select
                    value={item.selectedKey?.root ?? ""}
                    onChange={(e) => handleKeyChange(item.id, e.target.value as WorshipKeyRoot, item.selectedKey?.mode ?? "major")}
                    style={{ ...authInputStyle, padding: "6px 8px", fontSize: 12 }}
                    disabled={pending}
                  >
                    <option value="">Tonalidad</option>
                    {WORSHIP_KEY_ROOT_OPTIONS.map((root) => (
                      <option key={root} value={root}>
                        {root}
                      </option>
                    ))}
                  </select>
                  <select
                    value={item.selectedKey?.mode ?? "major"}
                    onChange={(e) =>
                      item.selectedKey?.root && handleKeyChange(item.id, item.selectedKey.root, e.target.value as WorshipKeyMode)
                    }
                    style={{ ...authInputStyle, padding: "6px 8px", fontSize: 12 }}
                    disabled={pending || !item.selectedKey?.root}
                  >
                    <option value="major">{WORSHIP_KEY_MODE_LABELS.major}</option>
                    <option value="minor">{WORSHIP_KEY_MODE_LABELS.minor}</option>
                  </select>
                </div>
              ) : (
                <span style={{ fontSize: 12.5 }}>{formatKey(item.selectedKey)}</span>
              )}

              {canManage ? (
                <div style={{ display: "flex", gap: 2 }}>
                  <button
                    type="button"
                    aria-label="Subir"
                    onClick={() => handleMove(index, -1)}
                    disabled={pending || index === 0}
                    style={subtleButtonStyle}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="Bajar"
                    onClick={() => handleMove(index, 1)}
                    disabled={pending || index === items.length - 1}
                    style={subtleButtonStyle}
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="Quitar"
                    onClick={() => handleRemove(item.id)}
                    disabled={pending}
                    style={subtleButtonStyle}
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={songToAdd} onChange={(e) => setSongToAdd(e.target.value)} style={{ ...authInputStyle, flex: 1 }}>
            <option value="">Selecciona una canción para añadir…</option>
            {availableSongs.map((song) => (
              <option key={song.id} value={song.id}>
                {song.title}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleAdd} disabled={pending || !songToAdd} style={subtleButtonStyle}>
            Añadir
          </button>
        </div>
      ) : null}
    </section>
  );
}
