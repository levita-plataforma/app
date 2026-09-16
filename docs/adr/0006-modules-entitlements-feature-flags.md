# ADR 0006 · Modules vs entitlements vs feature flags

## Estado

Aceptado — 16 de septiembre de 2026.

## Contexto

Tres preguntas distintas se confunden fácilmente en el código si no se separan desde el núcleo:

1. ¿Existe este módulo en el producto? (catálogo)
2. ¿Esta iglesia tiene derecho a usarlo? (comercial/entitlement)
3. ¿Está operativamente activado en este contexto/entorno? (feature flag)
4. ¿Este usuario concreto puede usarlo? (permiso, ver ADR 0005)

## Decisión

Se modelan como conceptos independientes:

- `modules`: catálogo global de módulos del producto (`people`, `serving`, `worship`, `groups`, `discipleship`, `events`, `kids`, `communications`, `pastoral`, `giving`, `facilities`, `analytics`, `integrations`).
- `church_modules`: qué módulos están habilitados para un tenant concreto (tenant-aware).
- `plan_entitlements` / `church_entitlement_overrides`: qué capacidades/límites derivan del plan comercial de la iglesia, con overrides auditados para casos excepcionales de operación.
- **Feature flags**: capa independiente de rollout operativo (global o por tenant), sin relación con lo comercial. Nunca se usan como mecanismo de autorización de seguridad.

Una ruta o acción no se considera autorizada solo por el rol del usuario: debe comprobar también `church_modules` y, cuando aplique, el entitlement del plan.

## Alternativas consideradas

1. **Un único flag booleano por funcionalidad mezclando comercial y operativo.** Descartado: imposibilita hacer rollout progresivo de una función ya vendida, o vender una función que aún no está en rollout general.
2. **Condicionales `if (plan === "premium")` dispersos en la aplicación.** Descartado explícitamente por la documentación de producto (`docs/16`): dificulta cambiar el catálogo comercial sin tocar decenas de puntos del código.

## Consecuencias

- Se provee una función/helper única, `hasEntitlement(church, capability)` (o equivalente), como único punto de consulta comercial.
- Un módulo desactivado para una iglesia: no aparece en navegación, no permite crear datos nuevos, conserva datos existentes, puede permitir exportación administrativa.
- Los límites de plan (personas activas, sedes, almacenamiento, etc.) se modelan como entitlements, no como constantes en código.

## Riesgos

- Añadir demasiada granularidad de entitlements antes de tener un catálogo comercial aprobado. Mitigación: la Fase 0 implementa el mecanismo y un entitlement mínimo de ejemplo; el catálogo comercial completo se define en Fase 1 (pricing, ver `docs/07-decisiones.md` A1).
