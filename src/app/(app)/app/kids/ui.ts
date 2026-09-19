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

/**
 * Presentación del estado del ratio, compartida por la ficha de la sesión y
 * por la pantalla de check-in para que la puerta y el escritorio digan lo
 * mismo. Desde el hotfix 20260928001000 el estado no es decorativo: con
 * `blocked`, `app.kids_checkin` rechaza el siguiente check-in; con
 * `warning`, la sala ya está en su máximo para el personal presente, así
 * que el siguiente menor tampoco entra sin otro adulto.
 */
export type KidsRatioTone = {
  /** Etiqueta larga, para la ficha de la sesión. */
  label: string;
  /** Etiqueta de puerta: dice qué hacer, no solo qué pasa. */
  doorLabel: string;
  bg: string;
  fg: string;
  border: string;
};

export const RATIO_TONES: Record<"safe" | "warning" | "blocked", KidsRatioTone> = {
  safe: {
    label: "RATIO SEGURO",
    doorLabel: "RATIO SEGURO",
    bg: "#e6f4ea",
    fg: "#1e7e34",
    border: "#1e7e34",
  },
  warning: {
    label: "RATIO AL LÍMITE",
    doorLabel: "RATIO AL LÍMITE — NO CABEN MÁS MENORES SIN OTRO ADULTO",
    bg: "#fff4e0",
    fg: "#8a5a00",
    border: "#8a5a00",
  },
  blocked: {
    label: "RATIO INSUFICIENTE",
    doorLabel: "RATIO INSUFICIENTE — NO SE ADMITEN MÁS CHECK-IN",
    bg: "#fdeaea",
    fg: "#b3261e",
    border: "#b3261e",
  },
};

/**
 * Si la base añadiera un estado que aquí todavía no está, se pinta como
 * aviso en vez de romper la pantalla de la puerta.
 */
export function ratioTone(state: string): KidsRatioTone {
  return RATIO_TONES[state as keyof typeof RATIO_TONES] ?? RATIO_TONES.warning;
}

/**
 * Código de recogida. Desde el hotfix 20260928001000 son ocho caracteres de
 * un alfabeto de 32 sin ambigüedades: no hay I, O, 0 ni 1, para que nadie
 * confunda un cero con una o al teclearlo en la puerta. Antes eran ocho
 * dígitos hexadecimales (32 bits) y su huella era legible, que es como se
 * recuperó un código real invirtiéndola.
 */
export const PICKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PICKUP_CODE_LENGTH = 8;

const PICKUP_CODE_PATTERN = new RegExp(`^[${PICKUP_CODE_ALPHABET}]{${PICKUP_CODE_LENGTH}}$`);

/** Misma normalización que hace la RPC: recortar y pasar a mayúsculas. */
export function normalizePickupCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isPickupCodeValid(value: string): boolean {
  return PICKUP_CODE_PATTERN.test(normalizePickupCode(value));
}
