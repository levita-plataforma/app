/**
 * Estilos compartidos del módulo Kids. Replica exactamente el patrón de
 * `src/app/(app)/app/servicios/ui.ts` para no introducir una identidad
 * visual distinta dentro de la misma shell.
 */

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

export function fullName(firstName: string, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-ES");
}
