# ADR 0011 · Observabilidad

## Estado

Aceptado — 16 de septiembre de 2026.

## Contexto

Diagnosticar un fallo en producción sin poder correlacionar una petición con su tenant, su usuario y sus efectos posteriores (jobs, webhooks) es inviable a escala. Al mismo tiempo, los logs no pueden convertirse en una segunda copia no controlada de datos sensibles.

## Decisión

Se define un logger estructurado común que adjunta siempre, cuando estén disponibles: `request_id`, `correlation_id`, `church_id` interno, `user_id`, módulo, operación. Se distingue explícitamente entre **logs técnicos** (errores, latencia, trazas) y **audit logs** (ADR 0007) — nunca se usa uno como sustituto del otro.

Prohibido en logs técnicos: contenido de notas pastorales, cuerpos completos de formularios sensibles, datos financieros detallados, secretos y tokens.

## Alternativas consideradas

1. **`console.log` ad hoc sin estructura.** Descartado: imposible de filtrar por tenant o correlacionar entre servicios/jobs a medida que el sistema crece.
2. **Adoptar de inmediato una plataforma de observabilidad externa (Sentry, Datadog) en la Fase 0.** Pospuesto: se deja la abstracción de logger lista para conectarse a un proveedor cuando el volumen de producción lo justifique, sin bloquear la Fase 0 por una integración comercial.

## Consecuencias

- Toda ruta de servidor y todo job usa el logger común en vez de `console.log` directo.
- Los errores expuestos al cliente pasan por la convención de errores de dominio (ver `docs/README.md` sección de errores / Fase 0 sección 20), nunca el stack interno o SQL crudo.

## Riesgos

- Que la disciplina de no loguear PII se relaje bajo presión de depuración. Mitigación: el helper de logging sanitiza campos conocidos como sensibles por convención de nombre (`*_note`, `notes`, `reason`) salvo marcado explícito de seguro.
