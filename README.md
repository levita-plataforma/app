# LEVITA

Plataforma SaaS multi-tenant para la gestión integral de una iglesia evangélica: personas y familias,
áreas y voluntariado, actividades y programación, disponibilidad y avisos, eventos e inscripciones,
grupos y discipulado, protección de menores (Kids), comunicación segmentada, alabanza (canciones,
repertorios, atril), recursos e instalaciones, ofrendas, informes/analítica, y administración de
plataforma. Construida con Next.js App Router, TypeScript y Supabase (Postgres + Auth + Row Level
Security).

Cada iglesia es un tenant independiente: sus personas, sedes, roles, módulos contratados y datos
permanecen aislados de los de otras iglesias. Una misma cuenta puede pertenecer a varias iglesias. El
detalle de visión de producto está en [`docs/00-vision.md`](docs/00-vision.md); el estado real de cada
fase, en [`docs/13-plan-por-fases.md`](docs/13-plan-por-fases.md).

## Desarrollo

Node.js 22 o posterior, npm, y el [CLI de Supabase](https://supabase.com/docs/guides/cli) para
levantar la base de datos local (Docker).

```sh
npm ci
supabase start
supabase db reset --local
npm run dev
```

La aplicación está en http://localhost:3000. El acceso autenticado vive bajo `/acceso` y `/app`; hay
también una landing pública y páginas de contenido (`/producto`, `/para-iglesias`, `/seguridad`, etc.).

```sh
npm run lint
npm run typecheck
npm run build
npm run start
```

## Base de datos

Las migraciones viven en `supabase/migrations/`, nombradas con la fecha y hora UTC de su creación
(`date -u +%Y%m%d%H%M%S`), nunca con un número escogido a mano — dos migraciones con el mismo prefijo
hacen que una no se ejecute sin dar ningún error. Los tests de aislamiento y RLS usan pgTAP
(`supabase/tests/`):

```sh
supabase db reset --local
supabase test db
supabase db diff --local
```

Antes de declarar una fase "en producción", comprobar que las migraciones realmente se aplicaron allí,
no solo que el código está en `main`:

```sh
npm run check:prod-migrations
```

Ver [`docs/RUNBOOK-OPERACION.md`](docs/RUNBOOK-OPERACION.md) §6 para el checklist completo.

## Estructura

- `src/app/(app)/acceso`: alta, login, onboarding.
- `src/app/(app)/app`: la aplicación autenticada de cada iglesia, un directorio por módulo
  (`personas`, `servicios`, `alabanza`, `grupos`, `discipulado`, `eventos`, `kids`, `comunicacion`,
  `ofrendas`, `instalaciones`, `informes`, `configuracion`...).
- `src/app/(app)/operacion`: panel de administración de plataforma (equipo de LEVITA, no de una
  iglesia).
- `src/server`: servicios de dominio por módulo, autorización, auditoría, cliente de Supabase.
- `src/components/shell`: navegación, catálogo de módulos visual, componentes comunes de la shell
  autenticada.
- `supabase/migrations`, `supabase/tests`, `supabase/seed.sql`: esquema, RLS, RPC y pruebas.
- `docs/`: documentación de producto, arquitectura, decisiones y estado real por fase — ver
  [`docs/README.md`](docs/README.md) como índice y orden de autoridad entre documentos.

## Vercel

Importar el repositorio con el preset Next.js y la raíz del proyecto. Vercel detecta npm mediante
`package-lock.json`. Requiere variables de entorno de Supabase (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) configuradas en el proyecto de Vercel —
**el merge en `main` no aplica migraciones de base de datos por sí solo**, ver la sección "Base de
datos" arriba.

## Funcionamiento y colaboración

Consultar [FUNCIONAMIENTO.md](FUNCIONAMIENTO.md) para las normas de ramas y revisión. Cada
responsable integra sus propias fases sin depender de la validación de la otra persona; el CI en
verde es el requisito obligatorio para integrar. No desarrollar ni hacer commits directamente en
`main`.
