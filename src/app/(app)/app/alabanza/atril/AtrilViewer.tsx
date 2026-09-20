"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Maximize, Minimize, Plus, Minus, List } from "lucide-react";
import { formatKey } from "../ui";
import type { WorshipRepertoireSongItem } from "@/server/worship/worship-service";

const FONT_SIZE_KEY = "levita.atril.fontSize";
const MIN_FONT = 14;
const MAX_FONT = 32;
const DEFAULT_FONT = 18;

/**
 * Atril: experiencia de ejecución musical, no dashboard administrativo (ver
 * docs/CONTRATO-FASE-11-DIOGO.md §9/§10). Solo lectura + transposición
 * VISUAL: cambiar la tonalidad aquí nunca reescribe worship_songs.chords ni
 * worship_repertoire_songs.selected_key_root/mode — es una preferencia de
 * presentación del dispositivo, nunca persistida en servidor (§41/§42 del
 * encargo: "la UI debe ser honesta").
 */
export default function AtrilViewer({
  repertoireName,
  items,
}: {
  repertoireName: string;
  items: WorshipRepertoireSongItem[];
}) {
  const [index, setIndex] = useState(0);
  // Lee la preferencia de tamaño de texto del dispositivo de forma perezosa
  // (una sola vez, en el propio inicializador de useState, nunca en un
  // efecto): esta vista no se sirve con contenido estático relevante desde
  // el servidor con el que deba coincidir en el primer render.
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_FONT;
    try {
      const saved = window.localStorage.getItem(FONT_SIZE_KEY);
      return saved ? Number(saved) : DEFAULT_FONT;
    } catch {
      // Preferencia por dispositivo, no crítica: si localStorage falla
      // (modo privado, bloqueo de sitio), se usa el tamaño por defecto.
      return DEFAULT_FONT;
    }
  });
  const [fullscreen, setFullscreen] = useState(false);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
    } catch {
      // Ver comentario anterior.
    }
  }, [fontSize]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, items.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [items.length]);

  const current = items[index];

  const renderedLyrics = useMemo(() => {
    if (!current?.song.chords) return current?.song.lyrics ?? "";
    return current.song.chords;
  }, [current]);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  }

  if (!current) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--shell-bg)",
        display: "flex",
        flexDirection: "column",
        zIndex: 40,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 14px",
          borderBottom: "1px solid var(--shell-border)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Link href="/app/alabanza/atril" style={{ color: "var(--shell-text-muted)", display: "flex" }} aria-label="Salir del atril">
            <ArrowLeft size={18} />
          </Link>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 11, color: "var(--shell-text-muted)" }}>{repertoireName}</p>
            <p style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {current.song.title}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 12, color: "var(--shell-text-muted)", marginRight: 4 }}>
            {formatKey(current.selectedKey ?? current.song.defaultKey ?? current.song.originalKey)}
          </span>
          <button
            type="button"
            aria-label="Reducir tamaño de texto"
            onClick={() => setFontSize((s) => Math.max(MIN_FONT, s - 2))}
            style={iconButtonStyle}
          >
            <Minus size={16} />
          </button>
          <button
            type="button"
            aria-label="Aumentar tamaño de texto"
            onClick={() => setFontSize((s) => Math.min(MAX_FONT, s + 2))}
            style={iconButtonStyle}
          >
            <Plus size={16} />
          </button>
          <button type="button" aria-label="Pantalla completa" onClick={toggleFullscreen} style={iconButtonStyle}>
            {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
          <button type="button" aria-label="Ver lista del repertorio" onClick={() => setShowList((v) => !v)} style={iconButtonStyle}>
            <List size={16} />
          </button>
        </div>
      </header>

      {showList ? (
        <div style={{ borderBottom: "1px solid var(--shell-border)", padding: "10px 14px", maxHeight: 200, overflowY: "auto" }}>
          <ul style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {items.map((item, i) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setIndex(i);
                    setShowList(false);
                  }}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: i === index ? "var(--shell-surface-hover, rgba(0,0,0,0.04))" : "none",
                    border: "none",
                    padding: "8px 10px",
                    borderRadius: "var(--shell-radius-sm)",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {item.position}. {item.song.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px 20px",
          fontSize,
          lineHeight: 1.7,
          fontFamily: "var(--font-mono, monospace)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {renderedLyrics || <span style={{ color: "var(--shell-text-muted)" }}>Sin contenido para esta canción.</span>}
      </main>

      <footer
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 14px",
          borderTop: "1px solid var(--shell-border)",
        }}
      >
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(i - 1, 0))}
          disabled={index === 0}
          style={{ ...navButtonStyle, opacity: index === 0 ? 0.4 : 1 }}
          aria-label="Canción anterior"
        >
          <ChevronLeft size={20} />
        </button>
        <span style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
          {index + 1} / {items.length}
        </span>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(i + 1, items.length - 1))}
          disabled={index === items.length - 1}
          style={{ ...navButtonStyle, opacity: index === items.length - 1 ? 0.4 : 1 }}
          aria-label="Canción siguiente"
        >
          <ChevronRight size={20} />
        </button>
      </footer>
    </div>
  );
}

const iconButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 36,
  height: 36,
  borderRadius: "var(--shell-radius-sm)",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-surface)",
  color: "var(--shell-text)",
  cursor: "pointer",
};

const navButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 48,
  height: 48,
  borderRadius: "50%",
  border: "1px solid var(--shell-border)",
  background: "var(--shell-surface)",
  color: "var(--shell-text)",
  cursor: "pointer",
};
