/**
 * Estilos y helpers de presentación del módulo Informes. Mismo criterio que
 * src/app/(app)/app/comunicacion/ui.ts. formatDelta/PERIOD_LABELS_CLIENT se
 * duplican aquí (en vez de importarse de analytics-service.ts) porque ese
 * archivo es "server-only" y los componentes cliente del selector de período
 * no pueden importar runtime de un módulo server-only (ver
 * docs/FASE-12-ANALITICA.md, bug ya visto en Fase 11/12 Giving).
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

export const cardStyle: React.CSSProperties = {
  padding: 20,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

export const ANALYTICS_PERIODS_CLIENT = ["7d", "30d", "this_month", "3m", "12m"] as const;

export const PERIOD_LABELS_CLIENT: Record<string, string> = {
  "7d": "Últimos 7 días",
  "30d": "Últimos 30 días",
  this_month: "Este mes",
  "3m": "Últimos 3 meses",
  "12m": "Últimos 12 meses",
};

export function formatDelta(deltaPct: number | null): string {
  if (deltaPct === null) return "N/A";
  const sign = deltaPct > 0 ? "+" : "";
  return `${sign}${deltaPct}%`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-ES").format(value);
}
