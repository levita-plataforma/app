# ADR 0004 · Activity como raíz genérica

## Estado

Aceptado — 16 de septiembre de 2026.

## Contexto

No toda actividad de una iglesia es un culto dominical. El dominio incluye ensayos, reuniones de grupo, cursos, retiros, conferencias, turnos de limpieza sin evento asociado (franjas horarias) y tareas de mantenimiento. Si el modelo obliga a que todo cuelgue de un "evento con `starts_at`", los turnos por franja horaria (intercesión, limpieza) y las tareas sin hora fija (comprar café durante la semana) no encajan, como ya identificó `docs/areas/00-indice.md` (requisito R7 histórico).

## Decisión

Se define un concepto conceptual común, **Activity**, del que se especializan `Service`, `Meeting`, `Event`, `CourseSession`, `GroupMeeting`, `Rehearsal`, `Task` y `Shift`.

Para la Fase 0 se implementa físicamente como **una tabla `activities` central con columna `type` discriminante**, en vez de tablas especializadas conectadas por FK. Las columnas específicas de cada especialización que no apliquen a todos los tipos se añadirán en fases posteriores como tablas de extensión 1:1 (`activity_id` FK) cuando su volumen de campos lo justifique, no en la Fase 0.

`activities` contempla desde la Fase 0: identidad única, `church_id` obligatorio, `campus_id` opcional, `type`, título, `starts_at`/`ends_at` nullable (para tareas sin hora fija), timezone, estado (`draft`/`published`/`cancelled`/`completed`/`archived`), visibilidad, organizador, y auditoría.

## Alternativas consideradas

1. **Tabla `activities` central con extensiones especializadas (elegida).** Una sola raíz simplifica notificaciones, calendario, conflictos de recursos y permisos transversales. El coste es una tabla más ancha con columnas que no aplican a todos los tipos.
2. **Tablas especializadas independientes (`services`, `meetings`, `events`...) sin raíz común.** Cada módulo futuro (Serving, Groups, Events) tendría que reimplementar su propia lógica de calendario, conflictos, recursos y notificaciones. Duplicación alta y riesgo de incoherencia entre módulos.
3. **Tabla `activities` vacía con todo el detalle en extensiones desde el día uno.** Prematuro para la Fase 0: añade complejidad de joins sin que exista aún ningún módulo consumidor real más allá del esqueleto.

## Consecuencias

- Turnos y tareas operativas sin culto asociado (limpieza semanal, franjas de intercesión, comprar el café) se modelan como `activities` de tipo `task` o `shift` con `starts_at`/`ends_at` representando el rango válido, sin forzar un evento religioso.
- Cuando Serving (Fase 4) necesite plantillas recurrentes y puestos, se construirá sobre `activities`, no sobre una tabla paralela `events`.
- Revisar en Fase 4 si el volumen de columnas específicas de `Service` (recurrencia, plantilla) justifica extraerlas a una tabla de extensión.

## Riesgos

- Una tabla única muy ancha puede degradar el rendimiento si crece sin control. Mitigación: índices por `(church_id, type, starts_at)` y revisión de extracción a extensiones en Fase 4 si el número de columnas nulas por tipo crece significativamente.
