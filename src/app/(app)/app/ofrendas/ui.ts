/**
 * Estilos compartidos del módulo Ofrendas. Replica los estilos ya usados en
 * Comunicación/Alabanza para no introducir una identidad visual distinta
 * dentro de la misma shell.
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

export function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-ES");
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Duplicados a propósito de formatMoney/GIVING_METHOD_LABELS
 * (giving-service.ts, "server-only"): ese módulo no puede importarse en un
 * componente cliente. Mismas implementaciones/valores.
 */
export function formatMoneyClient(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amountMinor / 100);
}

export const GIVING_METHOD_LABELS_CLIENT: Record<string, string> = {
  cash: "Efectivo",
  bank_transfer: "Transferencia",
  card: "Tarjeta",
  direct_debit: "Domiciliación",
  other: "Otro",
};
