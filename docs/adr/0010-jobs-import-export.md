# ADR 0010 · Jobs, import y export

## Estado

Aceptado — 16 de septiembre de 2026.

## Contexto

Notificaciones, envío de email, importación masiva, exportación, generación de informes, limpieza de retención y reconciliación de pagos son procesos asíncronos que no deben bloquear la petición HTTP del usuario ni perderse ante un fallo transitorio.

## Decisión

Se define una abstracción común de job con: `church_id`, `correlation_id`, `attempts`, `status` (`queued`/`processing`/`succeeded`/`failed`), `last_error` sanitizado, `scheduled_at`, `started_at`, `finished_at`. `import_jobs` y `export_jobs` son especializaciones de este contrato con campos propios (mapeo de columnas, progreso, archivo resultante, expiración).

Para la Fase 0 se usa **`pg_cron` + tablas de cola en Postgres** como motor de ejecución, siguiendo la decisión ya validada en el backlog histórico (`docs/07-decisiones.md`, decisión heredada 6): más fiable, sin cold start, y sin infraestructura adicional que gestionar en esta etapa. No se introduce una cola externa (Redis, SQS) hasta que el volumen real lo justifique.

Todo job procesa datos con `church_id` explícito; ningún worker opera "sin contexto de tenant".

## Alternativas consideradas

1. **Cola externa gestionada (SQS, Redis) desde la Fase 0.** Descartado por prematuro: añade una pieza de infraestructura y un proveedor más antes de tener un solo job real en producción.
2. **Procesar todo de forma síncrona en la petición HTTP.** Descartado: un envío de notificaciones o una importación de 500 filas no puede bloquear la respuesta al usuario, y un fallo de red externo no debe perder el trabajo ya validado.

## Consecuencias

- La Fase 0 deja el contrato de tablas y el mecanismo de cola listo; no implementa todavía ningún job de negocio real (eso llega con cada módulo: notificaciones en Fase 5, importación de personas en Fase 2).
- Reintentar un job no debe duplicar su efecto (idempotencia), ver también ADR 0007 para su trazabilidad en auditoría cuando aplique.

## Riesgos

- `pg_cron` acopla el motor de jobs a la disponibilidad de la base de datos. Aceptado como riesgo consciente para el volumen esperado del MVP; revisar si la telemetría de colas (ADR 0011) muestra saturación.
