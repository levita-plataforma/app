# ADR 0015 · Repositorio único (no monorepo apps/packages)

## Estado

Aceptado — 16 de septiembre de 2026.

## Contexto

Al iniciar la Fase 0 se auditó el repositorio `levita-app` y se confirmó que contiene únicamente la landing pública ("Muy pronto"): Next.js App Router sin backend, sin Supabase, sin tests, sin CI. La documentación histórica (`docs/TAREAS.md`, `docs/04-apps.md`) describe una arquitectura de dos aplicaciones Next.js separadas (`apps/dashboard` y `apps/pwa`) sobre un monorepo con `packages/core` y `packages/db`, localizada en un repositorio distinto (`Documents/Levitaapp`) no accesible desde este checkout.

Era necesario decidir dónde construir el núcleo SaaS de la Fase 0: en este mismo repositorio, reconstruyendo la estructura de monorepo `apps/`+`packages/`, o en un repositorio nuevo.

## Decisión

El núcleo de LEVITA se construye **en este mismo repositorio**, ampliándolo de landing pública a aplicación completa. Se usa un único proyecto Next.js con **route groups**: la landing pública permanece en su ubicación actual (`src/app/page.tsx` y alrededores), y la aplicación autenticada vive en un nuevo route group `src/app/(app)/...`. Supabase se añade en `supabase/` (migraciones, config, seeds) dentro del mismo repositorio, ejecutado localmente mediante Supabase CLI + Docker.

No se reconstruye la separación histórica en `apps/dashboard` + `apps/pwa` + `packages/core` + `packages/db` como aplicaciones/paquetes de workspace independientes.

## Alternativas consideradas

1. **Monorepo con `apps/` + `packages/` como en el histórico `Levitaapp`.** Más fiel a la arquitectura documentada de dos aplicaciones Next.js separadas (panel de escritorio + PWA), pero exige configurar workspaces, builds y despliegues separados antes de poder tocar una sola entidad de dominio. Se pospone: si en una fase posterior el panel y la PWA necesitan `manifest`/service worker realmente incompatibles entre sí (razón original de esa separación, ver backlog histórico decisión 8), se extraerá entonces con el dominio ya estable.
2. **Repositorio nuevo, recuperando o reescribiendo `Documents/Levitaapp`.** Descartado para la Fase 0: ese repositorio no está accesible desde este entorno de trabajo, y crear uno nuevo distinto de `levita-plataforma/app` (ya configurado como origin, ver historial de git) fragmentaría el trabajo sin necesidad.

## Consecuencias

- Toda la Fase 0 (schema, RLS, shell autenticada) se implementa dentro de `levita-app`, mismo repositorio que la landing.
- `docs/04-apps.md` y `docs/05-despliegue.md` requieren actualización para reflejar que, por ahora, panel y PWA comparten un único proyecto Next.js con rutas responsive, en vez de dos despliegues Vercel separados. Se marca como decisión revisable, no definitiva.
- Si la separación en dos apps se retoma más adelante, el dominio (`church_id`, RLS, capabilities) ya estará desacoplado de la capa de presentación y no debería requerir cambios de esquema.

## Riesgos

- Que el proyecto único crezca en complejidad de build antes de que se justifique separarlo. Mitigación: mantener la lógica de dominio en módulos server-only reutilizables (`src/server/...` o equivalente) para que una futura extracción a `packages/` sea mecánica.
