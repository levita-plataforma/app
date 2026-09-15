# Despliegue, entornos y operación

Revisión: **15 de septiembre de 2026**.

## Entornos

- local/dev;
- preview/test;
- staging;
- production.

Cada uno usa credenciales y bases separadas. Nunca copiar datos reales a preview sin anonimización autorizada.

## CI obligatorio

Según repositorio:

- install reproducible;
- lint;
- typecheck;
- unit tests;
- integration tests;
- tests RLS/tenant;
- build;
- migrations validation;
- dependency/security checks razonables.

## Migraciones

- versionadas;
- aplicadas primero en staging;
- compatibles con despliegue gradual;
- evitar cambios destructivos directos;
- backup previo cuando el riesgo lo justifique;
- verificación posterior.

## Deploy

Preferir infraestructura gestionada para reducir carga operativa. Vercel/Supabase u otros proveedores son decisiones de implementación, no requisitos de dominio.

## Observabilidad

- errores frontend/backend;
- logs estructurados;
- correlation ids;
- métricas de latencia;
- colas;
- webhooks;
- proveedor de email/push;
- salud de pagos;
- alertas.

## Backups

Definir retención, PITR cuando exista, backup de storage y prueba de restauración.

## Rollback

No depender solo de revertir Git cuando hay migraciones. Cada release relevante debe evaluar estrategia de rollback/roll-forward.

## Feature flags

Usar para rollout progresivo por entorno/tenant. No usar como control de seguridad.

## Dominios

La landing y la aplicación pueden usar dominios separados, pero los nombres finales deben documentarse en configuración de despliegue. Ejemplos históricos no se consideran destinos aprobados.

## Secretos

Solo secret manager/proveedor de entorno. Nunca en repo, cliente o logs.
