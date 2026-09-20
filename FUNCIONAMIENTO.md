# Funcionamiento de LEVITA y normas de trabajo

Fecha de revisión: 19 de septiembre de 2026. Código de referencia: `3c724d4`.
Repositorio: https://github.com/levita-plataforma/app

## 1. Regla principal: cada responsable integra sus fases

**Todo trabajo se realiza en una rama identificable, y cada responsable integra sus propias fases sin depender de nadie más.** Desde el 20 de septiembre de 2026 no hace falta la validación de la otra persona para llevar una fase a `main`: quien la construye responde de ella y decide cuándo está lista. Esto vale igual para las personas y para cualquier asistente automatizado que trabaje en nombre de una de ellas.

- No desarrollar ni hacer commits directamente en `main`.
- La integración se propone mediante una pull request (PR) con destino `main`.
- **El CI en verde es requisito para integrar.** Al no haber validación previa, es la única comprobación obligatoria que queda: lo que el CI no cubra no lo cubre nada, y responde de ello quien integra.
- Quien integra deja escrito en la PR qué comprobó y qué no. Las cuentas de GitHub y Vercel son compartidas, así que el registro automático **no** identifica al autor: hay que escribirlo.
- **Avisar antes de integrar algo que toque el núcleo compartido** —tenant, permisos, RLS, navegación, tipos generados— o la fase de la otra persona. No hace falta su permiso, sí que se entere: un cambio de permisos o de RLS puede romper una fase ajena sin que su responsable sepa por qué.
- **Cada fase se integra por separado, no en tandas.** Si una falla en producción hay que poder revertir esa y solo esa. Cuanto más tiempo pasan dos fases sin integrar, más se pisan sus migraciones.
- No hacer push forzado a `main`: reescribir el historial compartido afecta a todo el mundo.

Estas son normas de trabajo. Este documento no configura protecciones de GitHub ni acredita que estén activas. Mientras las cuentas de GitHub y Vercel sean compartidas, ningún cambio tiene autor identificable: conviene que cada persona use la suya y que la compartida quede solo como propietaria.

## 2. Qué es y cómo funciona el producto

LEVITA es una plataforma modular para iglesias. Cada iglesia es un **tenant**: sus datos, personas, sedes y permisos se mantienen separados de los de otras iglesias. Una sede pertenece a una iglesia; no constituye un tenant distinto.

Una persona puede existir en el directorio sin tener cuenta de acceso. La cuenta autentica al usuario; las pertenencias, capacidades y ámbitos determinan qué puede hacer dentro de cada iglesia. Los módulos contratados o habilitados determinan las funciones disponibles, y no sustituyen los permisos personales.

El recorrido objetivo es: alta de iglesia → configuración y sedes → personas y familias → áreas, equipos y puestos → preparación de actividades → asignación de voluntarios → publicación y avisos → respuestas y seguimiento de huecos. Este recorrido completo es el objetivo del MVP de las fases 0–5, no una afirmación de que todo esté terminado.

### Estado observado en el código

La tabla describe presencia de implementación tras inspección estática. No acredita pruebas ejecutadas ni despliegue de esta revisión.

| Área | Evidencia y alcance observado |
|---|---|
| Landing | Página pública en `src/app/page.tsx`. |
| Acceso | Formularios y acciones de acceso con correo y contraseña, registro e invitaciones bajo `src/app/(app)/acceso/`. |
| Alta y configuración | Onboarding, alta asistida, configuración de iglesia y sedes, con servicios y migraciones. |
| Personas | Directorio, ficha, alta, importación, exportación, etiquetas y campos personalizados. |
| Familias | Pantalla de gestión y servicio de hogares. |
| Servicio | Áreas, miembros, líderes, equipos, puestos, cualificaciones, credenciales y evaluación de elegibilidad. |
| Suscripción | Modelo y servicio de consulta de estado. El código indica que el catálogo comercial y la política definitiva de impago siguen pendientes; no asumir cobro integrado. |
| Módulos posteriores | Grupos, Discipulado, Eventos, Alabanza, Niños, Comunicación, Acompañamiento, Ofrendas, Instalaciones, Informes e Integraciones usan `ModulePlaceholder`; una entrada de menú no acredita un módulo funcional. |
| Base de datos | Migraciones y suites SQL para núcleo, onboarding, personas y servicio en `supabase/`. |
| Validación automática | CI configurado para lint, tipos, build, migraciones y pruebas de base de datos. Su configuración no prueba que una ejecución concreta esté en verde. |

### Recorrido de una petición

1. Supabase Auth valida la cuenta y la sesión.
2. `src/server/tenant/tenant-context.ts` obtiene las pertenencias reales y resuelve la iglesia. Actualmente, sin iglesia solicitada válida, toma la primera pertenencia disponible; no asumir un selector persistente entre iglesias.
3. El layout de `/app` dirige a acceso cuando no hay sesión, o a onboarding cuando falta pertenencia o configuración inicial.
4. Las operaciones deben comprobar capacidades y módulo habilitado mediante los servicios de servidor y las funciones de base de datos.
5. RLS (seguridad por filas), permisos SQL y relaciones entre entidades constituyen la protección de datos. Ocultar un botón o una ruta no es autorización.

## 3. Estructura del repositorio

Es un proyecto Next.js App Router con TypeScript, React y Supabase. La decisión vigente es mantener landing y app en el mismo proyecto; no reconstruir el monorepo histórico `apps/` + `packages/`.

| Ruta | Responsabilidad |
|---|---|
| `src/app/` | Landing, rutas, layouts y estilos. |
| `src/app/(app)/acceso/` | Acceso, registro, invitaciones y onboarding. |
| `src/app/(app)/app/` | Aplicación autenticada. El grupo `(app)` no forma parte de la URL. |
| `src/app/(app)/operacion/` | Flujos de operación, como alta asistida. |
| `src/components/shell/` | Navegación y componentes comunes de la app. |
| `src/server/` | Servicios de dominio, autorización, tenant, Supabase, auditoría y errores. |
| `src/lib/supabase/` | Cliente de navegador y tipos de base de datos. |
| `supabase/migrations/` | Cambios versionados del esquema y políticas. |
| `supabase/tests/` | Pruebas SQL/pgTAP. |
| `supabase/seed.sql` | Datos sintéticos para desarrollo local. |
| `.github/workflows/ci.yml` | Comprobaciones automáticas. |
| `docs/` | Producto, arquitectura, decisiones, fases y especificaciones. |
| `imagenes/` | Referencias de diseño. |

La referencia visual de la app son las imágenes `layout*`, según ADR 0016. Calserv conserva valor como referencia de comportamiento e integración futura, pero no manda sobre la paleta y estructura visual de la app actual.

## 4. Preparar el entorno local

Requisitos del repositorio: Node.js 22 o posterior, npm, Supabase CLI y Docker para la base local.

Desde la raíz del checkout:

```sh
npm ci
supabase start
```

Crear `.env.local` a partir de `.env.example`, sin sobrescribir una configuración existente. Completar con los valores del entorno local:

- `NEXT_PUBLIC_SUPABASE_URL`: URL de la API local.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: clave pública local.
- `SUPABASE_SERVICE_ROLE_KEY`: solo para procesos de servidor que la necesiten; nunca exponerla en el navegador.
- `NEXT_PUBLIC_APP_URL`: `http://localhost:3000`.

Después:

```sh
npm run dev
```

La landing está en `/`, el acceso en `/acceso` y la aplicación en `/app`. Cada persona mantiene sus credenciales y entorno local. Los datos sintéticos no se aplican a producción. Los secretos no se guardan en commits, capturas ni descripciones de PR.

## 5. Nombres de ramas y tipos de cambio

Una tarea tiene una rama, un responsable y un objetivo concreto. Usar nombres en minúsculas, sin espacios ni tildes, con palabras separadas por guiones. Formato: `<tipo>/<referencia>-<descripcion>`; la referencia puede ser el número de incidencia. Si no existe, usar una descripción inequívoca.

| Tipo de rama | Cuándo usarlo | Ejemplo |
|---|---|---|
| `hotfix/` | Cualquier arreglo de un fallo existente, sea urgente o no. | `hotfix/42-corregir-acceso` |
| `feature/` | Nueva funcionalidad o ampliación de comportamiento. | `feature/43-calendario-actividades` |
| `docs/` | Documentación sin modificar comportamiento. | `docs/44-guia-funcionamiento` |
| `refactor/` | Reorganización interna sin cambiar comportamiento. | `refactor/45-servicios-personas` |
| `chore/` | Mantenimiento, herramientas, dependencias o CI. | `chore/46-actualizar-ci` |
| `test/` | Pruebas sin modificar comportamiento del producto. | `test/47-aislamiento-personas` |

Los trabajos de Codex pueden llevar el prefijo de herramienta `codex/`, conservando el tipo inmediatamente después: `codex/hotfix/42-corregir-acceso`, `codex/feature/43-calendario-actividades`. Esta guía se prepara en `codex/docs/guia-funcionamiento`.

Si una tarea combina una funcionalidad y un arreglo independiente, separarlos en ramas/PR distintas. Un hotfix no debe incluir mejoras ajenas al fallo.

Los mensajes de commit y títulos de PR usan el tipo correspondiente: `hotfix(acceso): corregir validación de sesión`, `feature(personas): añadir filtro` o `docs: documentar flujo de trabajo`. No hay automatización de versiones configurada por esta convención.

## 6. Flujo entre las dos personas

1. Registrar la tarea: objetivo, responsable, rama, alcance, criterios de aceptación y archivos o módulos compartidos que tocará.
2. Comprobar repositorio, rama y cambios locales antes de empezar. No sobrescribir ni incluir cambios ajenos.
3. Obtener el estado remoto y crear la rama de tarea desde `origin/main` actualizado. Si hay cambios locales, conservarlos en su trabajo correspondiente antes de cambiar de contexto.
4. Cada persona trabaja en su propio clon o worktree. No usar simultáneamente la misma carpeta con ramas distintas.
5. Avisar cuando se vaya a tocar un archivo compartido, permisos, estilos globales o esquema. Si las tareas dependen entre sí, acordar el orden de integración.
6. Implementar y validar el alcance. Actualizar la documentación responsable cuando cambie una regla.
7. Crear commits en la rama de tarea y abrir PR hacia `main` cuando se vaya a compartir el resultado. Puede estar en borrador si aún no está listo.
8. Incorporar los cambios recientes de `origin/main` a la rama de tarea antes de la revisión final. Resolver los conflictos en esa rama y repetir las comprobaciones afectadas. No forzar el historial de una rama compartida.
9. Dejar en la PR el resultado concreto, cómo probarlo, las comprobaciones ejecutadas y sus limitaciones. Es lo que permitirá a la otra persona entender el cambio el día que le afecte.
10. Integrar con el CI en verde y sin conflictos. Si `main` cambia y hay que modificar la propuesta, volver a comprobarla antes de integrar.
11. Comunicar la integración al otro colaborador para que sincronice su trabajo. Eliminar la rama solo cuando esté integrada y nadie dependa de ella.

Ejemplo de inicio, con el árbol de trabajo limpio:

```sh
git fetch origin
git switch -c feature/43-calendario-actividades origin/main
```

La validación de una PR no autoriza otras ramas ni futuros cambios.

## 7. Validaciones antes de integrar

Para cambios de aplicación, ejecutar los comandos existentes en `package.json`:

```sh
npm run lint
npm run typecheck
npm run build
```

Para cambios de datos, permisos o consultas, y como parte del CI de integración:

```sh
supabase start
supabase test db
supabase db diff --local
```

El CI actual ejecuta ambos grupos en las PR y en los pushes a `main`. Incluye pruebas de aislamiento y comprueba que no aparezcan diferencias de esquema sin migrar. No existe un script `npm test` en este checkout; las órdenes del backlog histórico no deben copiarse como si estuvieran disponibles.

Además de las comprobaciones automáticas:

- Hotfix: describir cómo reproducir el fallo y comprobar que el caso queda corregido; añadir regresión cuando aporte cobertura útil.
- Feature: comprobar criterios de aceptación, estados vacíos/error y permisos aplicables; revisar móvil y escritorio si afecta a UI.
- Tenant/RLS: verificar que una iglesia no lee ni modifica datos de otra y que un usuario sin permiso recibe denegación.
- Documentación: revisar enlaces, ejemplos y coherencia con el código. No presentar pruebas de ejecución como realizadas si solo hubo lectura estática.

Una comprobación no ejecutada o fallida se declara expresamente. No marcar una fase como terminada por la sola existencia de pantallas o documentación.

## 8. Migraciones y cambios compartidos

### El prefijo es el instante de creación, no la fecha

**El nombre de una migración empieza por la fecha y la hora UTC del momento en que se crea, con catorce dígitos: `YYYYMMDDHHMMSS_descripcion.sql`.** Por ejemplo, `20260920143052_facilities_esquema.sql`. Es el formato propio de la CLI de Supabase, y el motivo de usarlo es simple: dos personas no crean un fichero en el mismo segundo, así que las colisiones desaparecen sin que nadie tenga que mirar lo que está haciendo la otra.

El formato anterior —`YYYYMMDD` más seis dígitos escogidos a mano— provocó cuatro colisiones en un solo día de trabajo, una de ellas con una migración ya aplicada en producción. La numeración a mano parece ordenada y es justo lo contrario: dos personas que trabajan el mismo día eligen el mismo número casi siempre.

Para obtener el prefijo:

```bash
date -u +%Y%m%d%H%M%S
```

**Con una salvedad mientras dure:** el repositorio arrastra prefijos con fechas por delante del calendario, porque se numeraron a mano y algunos apuntan a octubre. Hasta que el reloj los alcance, si la hora de ahora queda por detrás del último prefijo que ya existe, se usa el **segundo siguiente a ese último**. Una migración con número anterior al último aplicado obliga a `db push --include-all` y deja el orden de aplicación en el aire.

Hay un script que hace esa cuenta y renumera una rama entera conservando su orden:

```bash
node scripts/renumerar-migraciones.mjs            # enseña qué haría
node scripts/renumerar-migraciones.mjs --aplicar  # lo hace
```

Solo toca las migraciones de tu rama que no están en `main`: las ya integradas no se renombran nunca.

**Por qué una colisión es grave y no molesta.** La CLI de Supabase indexa las migraciones por ese número, no por el nombre del fichero. Si el número ya consta como aplicado en el historial remoto, `db push` da la migración por hecha y **no ejecuta su SQL, sin dar ningún error**. El resultado es una fase a medias en producción que nadie descubre hasta que alguien abre la pantalla que falla.

Las migraciones que ya existen con el formato antiguo se quedan como están: renombrar una migración aplicada rompería el historial. La regla vale para las nuevas.

### Lo demás

No reescribir migraciones ya aplicadas o compartidas. Antes de integrar, probar el orden combinado de las ramas vivas de ambas personas, no solo el de la propia.

**Cada responsable integra sus fases por separado** (§1). No se espera a juntar dos fases en una misma tanda: cuanto más tiempo pasan dos conjuntos de migraciones sin integrar, más se pisan. Si una fase depende de otra, se dice en la PR y se integra en orden, no a la vez.

Mantener `church_id`, RLS y relaciones seguras entre tenants donde corresponda. Los cambios de permisos deben incluir pruebas de denegación. Revertir Git no revierte una migración aplicada.

## 9. Contenido mínimo de cada PR

```md
## Objetivo
Tipo: hotfix / feature / docs / refactor / chore / test
Tarea y responsable:
Rama:

## Resultado
Qué cambia y por qué. Antes/después cuando ayude.

## Validación
Pasos para que el propietario lo pruebe:
Comprobaciones ejecutadas y resultado:
Comprobaciones pendientes:

## Impacto
Permisos, datos, migraciones o configuración afectados:
Limitaciones y recuperación, si aplica:

## Integración
Quién integra:
Commit integrado:
CI en verde: sí / no
Avisada la otra persona (si toca el núcleo o su fase): sí / no aplica
```

Como las cuentas son compartidas, hay que escribir quién integra: el registro de GitHub no lo distingue.

## 10. Fuentes y mantenimiento de esta guía

Leer primero [el índice documental](docs/README.md), [las decisiones vigentes](docs/07-decisiones.md), [el plan por fases](docs/13-plan-por-fases.md) y los ADR relacionados. Para arquitectura y permisos: [dominio](docs/01-modelo-dominio.md), [datos y RLS](docs/02-datos-y-rls.md) y [seguridad y operación](docs/17-seguridad-operacion.md).

Las decisiones recientes prevalecen sobre descripciones antiguas. En particular: [ADR 0015](docs/adr/0015-repositorio-unico-monorepo.md) establece el proyecto único y [ADR 0016](docs/adr/0016-referencia-visual-layout.md) fija la referencia visual.

Desajustes encontrados al preparar esta guía:

- El README raíz todavía describe solo la landing, aunque el código incluye la aplicación autenticada.
- Algunos documentos describen el estado de Fase 0 y no reflejan las migraciones y servicios posteriores presentes en este checkout.
- `docs/05-despliegue.md` dice que el núcleo no salió de local, mientras `docs/FASE-0-CIERRE.md` registra un despliegue remoto. No se ha comprobado el entorno remoto en esta revisión.
- `docs/TAREAS.md` es histórico: sus casillas y rutas no prueban el estado del repositorio actual.

Actualizar esta guía cuando cambie el flujo de trabajo, el arranque o la estructura. Mantener los detalles de producto en su documento responsable y diferenciar siempre: especificado, implementado, verificado y desplegado.

## 11. Plan compartido por fases

Ver [Plan de trabajo compartido](docs/PLAN-TRABAJO-COMPARTIDO.md) para la propuesta
de reparto entre dos personas, dependencias, tareas del MVP y puntos de validación.
El plan es una propuesta; no acredita aprobación ni ejecución de sus tareas.
