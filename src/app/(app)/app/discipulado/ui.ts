/**
 * Estilos y utilidades compartidas del módulo Discipulado. Replica el enfoque
 * de Eventos y Grupos (`ui.ts` con estilos en línea sobre las clases ya
 * existentes de la shell, sin hoja de estilos propia) para no introducir una
 * identidad visual distinta dentro de la misma aplicación.
 */

import type { ChipTone } from "@/lib/activities/constants";

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

export const dangerButtonStyle: React.CSSProperties = {
  ...subtleButtonStyle,
  color: "var(--shell-danger)",
};

export const selectStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "var(--shell-radius-sm)",
  border: "1px solid var(--shell-border)",
  fontSize: 13,
  background: "var(--shell-surface)",
  color: "var(--shell-text)",
};

export const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: "var(--shell-radius-sm)",
  border: "1px solid var(--shell-border)",
  fontSize: 13.5,
  background: "var(--shell-surface)",
  color: "var(--shell-text)",
  width: "100%",
};

export const labelStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--shell-text)",
  display: "block",
  marginBottom: 4,
};

export const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: "1 1 220px",
  minWidth: 180,
};

export const cardStyle: React.CSSProperties = {
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

export const sectionTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
};

/** Traduce el tono del catálogo a la clase de chip de la shell. */
export const CHIP_CLASS: Record<ChipTone, string> = {
  success: "serving-chip is-success",
  warning: "serving-chip is-warning",
  danger: "serving-chip is-danger",
  muted: "serving-chip is-muted",
  default: "serving-chip",
};

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-ES", { dateStyle: "medium" });
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

export function toLocalInputValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`;
}

export function isUuid(value: string | undefined): value is string {
  return !!value && /^[0-9a-f-]{36}$/i.test(value);
}

/** Proporción de asistencia como porcentaje entero legible. */
export function formatRatio(ratio: number): string {
  return `${Math.round(ratio * 100)} %`;
}
