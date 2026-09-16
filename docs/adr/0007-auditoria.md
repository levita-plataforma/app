# ADR 0007 · Estrategia de auditoría

## Estado

Aceptado — 16 de septiembre de 2026.

## Contexto

Cambios de roles, módulos, billing, exportaciones masivas y acceso a datos sensibles deben quedar trazados para soporte, cumplimiento y resolución de incidentes, sin convertir el log de auditoría en un vector de fuga de datos sensibles.

## Decisión

Tabla `audit_logs`, tenant-aware, con: `church_id`, actor (`person_id`/`user_id`), acción, tipo de entidad, identificador de entidad, diff sanitizado o metadata relevante (no el objeto completo cuando contiene datos restringidos), `correlation_id`, origen (IP/user agent cuando aplique), fecha, y referencia a `support_session_id` cuando la acción ocurrió durante una sesión de soporte.

Se provee un helper común (`auditLog(...)`) para producir entradas de forma coherente desde cualquier mutación administrativa relevante, en vez de que cada módulo implemente su propio logging ad hoc.

**Nunca se registran**: contraseñas, tokens de acceso/refresco, secretos, contenido pastoral sensible completo, payloads financieros completos.

## Alternativas consideradas

1. **Logging técnico genérico (application logs) como única fuente de auditoría.** Descartado: los logs técnicos rotan, no están pensados para consulta por tenant/actor a largo plazo, y mezclar ambos fines complica cumplir RGPD (ver `docs/08-rgpd-y-lopivi.md`).
2. **Auditar solo a nivel de base de datos con triggers genéricos sobre todas las tablas.** Descartado para la Fase 0: exceso de ruido (cualquier UPDATE trivial quedaría auditado) sin discriminar qué es "administrativamente relevante". Se reconsiderará selectivamente para tablas de alta sensibilidad (ej. `person_credentials`) en fases futuras.

## Consecuencias

- Cada acción administrativa relevante (cambio de rol, módulo, entitlement, exportación, importación, archivado, cambio de billing, sesión de soporte, configuración de integración) pasa por el helper de auditoría.
- `audit_logs` tiene su propia política RLS: solo roles con capability `audit.read` pueden leer, y nunca cross-tenant.
- El diff se sanitiza en el propio helper, no se delega esa responsabilidad a cada llamador.

## Riesgos

- Que un desarrollador olvide llamar al helper en una mutación nueva. Mitigación: la checklist de la Fase 0 (`docs/README.md` sección 6) incluye "definir auditoría" como paso obligatorio antes de crear una tabla o endpoint.
