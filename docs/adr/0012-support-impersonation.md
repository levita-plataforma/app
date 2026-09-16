# ADR 0012 · Support sessions / impersonación

## Estado

Aceptado — 16 de septiembre de 2026.

## Contexto

El equipo de operación de LEVITA necesitará ocasionalmente diagnosticar o asistir dentro de un tenant concreto. Un acceso "de plataforma" silencioso y permanente a todos los datos de todas las iglesias es inaceptable para datos personales, pastorales y de menores.

## Decisión

Se modela `support_sessions`: operador, iglesia objetivo, motivo, capacidades temporales limitadas, inicio, expiración obligatoria, revocación, y referencia para auditoría (ver ADR 0007, cada acción durante la sesión queda auditada con `support_session_id`).

El soporte trabaja primero con metadatos y diagnósticos (estado de tenant, logs técnicos) sin necesidad de abrir una sesión. Abrir una sesión de soporte dentro del contenido de un tenant es la excepción, no el modo por defecto. Para datos especialmente sensibles, se deja prevista la posibilidad de requerir aprobación del tenant antes de abrir la sesión (implementación completa fuera de alcance de la Fase 0).

## Alternativas consideradas

1. **Rol `platform_admin` con acceso permanente vía RLS a todos los tenants.** Descartado explícitamente: es exactamente el antipatrón que D11/D6 de `docs/07-decisiones.md` prohíben — "el soporte no tiene acceso silencioso universal".
2. **Acceso de soporte solo mediante `service_role` manual fuera de la aplicación.** Descartado: no queda auditado, no tiene expiración ni motivo registrado, y requiere manejar la clave más peligrosa del sistema fuera de un flujo controlado.

## Consecuencias

- La Fase 0 modela la tabla y el mecanismo de expiración/revocación; la consola completa de soporte (UI) es una entrega de fases posteriores (ligada a Fase 13, hardening y operación).
- Toda acción realizada durante una sesión de soporte activa debe mostrar, en fases futuras de UI, un banner visible indicando que hay una sesión de soporte activa sobre ese tenant.

## Riesgos

- Una sesión de soporte olvidada sin expirar. Mitigación: expiración obligatoria a nivel de esquema (no nullable, con valor por defecto corto), y test que verifique que una sesión expirada no concede acceso.
