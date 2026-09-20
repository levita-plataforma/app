/**
 * Estilos compartidos del módulo Alabanza. Replica los estilos ya usados en
 * Comunicación (src/app/(app)/app/comunicacion/ui.ts) para no introducir una
 * identidad visual distinta dentro de la misma shell.
 */
import type { WorshipKey } from "@/server/worship/worship-service";

export const primaryButtonStyle = (pending = false): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "9px 16px",
  borderRadius: "var(--shell-radius-md)",
  border: "none",
  background: "var(--shell-brand)",
  color: "#fff",
  fontSize: 12.5,
  fontWeight: 600,
  textDecoration: "none",
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.7 : 1,
});

export const secondaryButtonStyle = (pending = false): React.CSSProperties => ({
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
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.7 : 1,
});

export const subtleButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--shell-text-subtle)",
  cursor: "pointer",
};

export const cardStyle: React.CSSProperties = {
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

export function formatKey(key: WorshipKey): string {
  if (!key) return "—";
  const modeLabel = key.mode === "minor" ? "m" : "";
  return `${key.root}${modeLabel}`;
}

export const WORSHIP_KEY_ROOT_OPTIONS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
export const WORSHIP_KEY_MODE_LABELS: Record<"major", string> & Record<"minor", string> = {
  major: "Mayor",
  minor: "Menor",
};
