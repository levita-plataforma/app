/**
 * Convención central de errores de dominio. Nunca se expone al cliente el
 * SQL, el stack interno, claves o nombres internos de políticas. Ver Fase 0
 * §20.
 */
export const DOMAIN_ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "TENANT_CONTEXT_REQUIRED",
  "MODULE_DISABLED",
  "ENTITLEMENT_REQUIRED",
  "RESOURCE_NOT_FOUND",
  "CONFLICT",
  "VALIDATION_ERROR",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
