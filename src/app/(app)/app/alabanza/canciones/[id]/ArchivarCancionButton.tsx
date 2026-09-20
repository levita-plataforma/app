"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { secondaryButtonStyle } from "../../ui";
import { archivarCancionAction } from "../actions";

export default function ArchivarCancionButton({ songId }: { songId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleArchive() {
    if (!window.confirm("¿Archivar esta canción? Dejará de poder editarse y de poder añadirse a nuevos repertorios.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await archivarCancionAction(songId);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <button type="button" onClick={handleArchive} disabled={pending} style={secondaryButtonStyle(pending)}>
        {pending ? "Archivando…" : "Archivar"}
      </button>
      {error ? (
        <p role="alert" style={{ fontSize: 12, color: "var(--shell-danger)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
