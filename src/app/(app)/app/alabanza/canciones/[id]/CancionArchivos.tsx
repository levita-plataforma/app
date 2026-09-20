"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { subtleButtonStyle } from "../../ui";
import { quitarArchivoAction } from "../actions-archivos";
import type { WorshipSongFile } from "@/server/worship/worship-service";

/**
 * Lista de archivos ya adjuntos a una canción (reutiliza `files` del
 * núcleo, ADR 0008). La subida real de archivos exige infraestructura de
 * signed URL/storage que no existe todavía en ningún módulo del proyecto
 * (confirmado: Alabanza es el primer consumidor de `files`) — se documenta
 * aquí en vez de fingir un botón de subida que no sube nada. attach/detach
 * ya están implementados en la capa RPC (app.attach_worship_song_file/
 * app.detach_worship_song_file) para cuando exista esa infraestructura.
 */
export default function CancionArchivos({ files }: { files: WorshipSongFile[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleDetach(fileId: string) {
    setError(null);
    startTransition(async () => {
      const result = await quitarArchivoAction(fileId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="shell-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 600 }}>Archivos</p>

      {error ? (
        <p role="alert" style={{ fontSize: 12, color: "var(--shell-danger)" }}>
          {error}
        </p>
      ) : null}

      {files.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--shell-text-muted)" }}>
          Sin archivos adjuntos. La subida de partituras/audio llega cuando exista infraestructura de
          almacenamiento firmado compartida con el resto de LEVITA (ver docs/CONTRATO-FASE-11-DIOGO.md §11).
        </p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {files.map((file) => (
            <li
              key={file.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "8px 10px",
                border: "1px solid var(--shell-border)",
                borderRadius: "var(--shell-radius-sm)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                <FileText size={14} aria-hidden="true" />
                {file.objectPath}
              </span>
              <button type="button" onClick={() => handleDetach(file.id)} disabled={pending} style={subtleButtonStyle}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
