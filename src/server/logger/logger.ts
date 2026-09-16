import "server-only";

/**
 * Logger estructurado común. Adjunta siempre correlationId/churchId/userId
 * cuando estén disponibles. Nunca registra PII innecesaria ni datos
 * "restricted" (contenido pastoral, financiero, secretos). Ver docs/adr/0011.
 */

const SENSITIVE_KEY_PATTERN = /(password|token|secret|note|notes|reason)/i;

function sanitize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitize);

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : sanitize(val);
  }
  return out;
}

function sanitizeContext(context: LogContext): Record<string, unknown> {
  return sanitize(context) as Record<string, unknown>;
}

export type LogContext = {
  requestId?: string;
  correlationId?: string;
  churchId?: string;
  userId?: string;
  module?: string;
  operation?: string;
  [key: string]: unknown;
};

function log(level: "info" | "warn" | "error", message: string, context?: LogContext) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...sanitizeContext(context ?? {}),
  };

  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, context?: LogContext) => log("info", message, context),
  warn: (message: string, context?: LogContext) => log("warn", message, context),
  error: (message: string, context?: LogContext) => log("error", message, context),
};
