# Encargo para Claude — Fase 4 de LEVITA

Preparado para Carlos y Diogo el 16 de septiembre de 2026.
Este documento adapta el encargo aportado por Diogo. Ejecutar desarrollo de la Fase 4; no limitarse a proponer un plan. Las reglas de validación de Carlos prevalecen sobre cualquier flujo autónomo anterior.

## A. Lectura y comprobación inicial acotada

Repositorio: https://github.com/levita-plataforma/app.git
Checkout inspeccionado: `C:/Users/Usuario/Documents/GitHub/app`.
`origin/main` comprobado tras fetch: `e5679ca`, merge de Fase 3. No fijar ese commit si el remoto ya ha avanzado: inspeccionar los cambios nuevos y evitar duplicar trabajo.

Leer `AGENTS.md`, `FUNCIONAMIENTO.md` si está disponible, `docs/README.md`, `docs/07-decisiones.md`, `docs/13-plan-por-fases.md`, ADR 0004, ADR 0015 y ADR 0016. Antes de escribir código Next.js, leer las guías relevantes de la versión instalada según `AGENTS.md`.

La guía y este prompt se prepararon en una rama de documentación sin commits; pueden no estar en main. Este encargo contiene por sí mismo las reglas de trabajo necesarias. No incorporar cambios ajenos por estar presentes en el checkout.

No volver a auditar completas F0–F3: inspeccionar únicamente los contratos, tablas, políticas y componentes que se reutilizan o modifican. El equipo aporta el cierre previo; este encargo no acredita una nueva inspección de producción.

## B. Cambio de alcance respecto al roadmap antiguo

Para este encargo, **F4 es estructura de actividades y planificación; F5 incorporará asignaciones de personas, disponibilidad, respuestas y notificaciones**. El roadmap anterior incluía asignaciones y conflictos en F4. Actualizar las secciones afectadas del roadmap y los criterios de salida para reflejar esta separación, sin afirmar que se cumplió el alcance anterior.

El planning/orden del servicio entra en F4 por este encargo. La ruta de calendario operativo tampoco implica completar F6: formularios públicos, inscripciones, aforo y venta de entradas permanecen fuera.

## C. Hallazgos concretos que debes respetar

1. `activities` ya existe en `20260916000500_activities.sql`. Usa `starts_at` y `ends_at` (no `start_at`/`end_at`), ambos nullable. Conservar la posibilidad de tareas sin hora fija conforme al ADR 0004; no añadir NOT NULL indiscriminadamente. Para actividades horarias exigir un rango válido; las tareas sin horario deben tener presentación y reglas explícitas.
2. El enum `activity_type` ya contiene los ocho tipos requeridos. Reutilizarlo y centralizar sus etiquetas UI sin recrear el catálogo.
3. El enum de estado ya existe, pero no contiene `planned`. Añadirlo con una migración segura, teniendo en cuenta cuándo puede usarse un nuevo valor de enum en PostgreSQL. Documentar una matriz de transiciones y permisos; impedir saltos de estado mediante escrituras directas no autorizadas. Mantener consistentes `archived_at`, `archived_by` y estado.
4. La visibilidad actual es `public/internal`, no la lista nueva. Preparar una conversión conservadora: no aumentar acceso automáticamente a datos existentes; documentar el mapeo y probar cada audiencia. `public_future` no concede acceso anónimo en esta fase. Notas administrativas no se exponen automáticamente con el resumen de la actividad.
5. Revisar y sustituir las políticas previas de activities: ahora hay lectura por pertenencia a iglesia y gestión mediante `church.settings.manage`. Añadir políticas restrictivas sin retirar las permisivas anteriores podría conservar accesos indebidos. Comprobar lectura y escritura vía API/SQL con roles autenticados reales, incluidos usuarios de la misma iglesia sin capacidad suficiente.
6. `people` es una identidad global sin `church_id`; la pertenencia vive en `church_people`. Organizador y responsables deben pertenecer a la iglesia de la actividad. No inventar una FK compuesta contra columnas inexistentes en `people`; reutilizar pertenencias y restricciones adecuadas. Verificar tenant también al cambiar una relación, no solo al crearla.
7. `service_positions` y la elegibilidad ya existen. Los snapshots de requisitos por actividad necesitan un contrato reutilizable por F5. La función actual de elegibilidad recibe un puesto de catálogo y no una fecha de actividad ni un snapshot: no afirmar que ya valida overrides o caducidad en la fecha futura. Preparar el modelo sin duplicar ni romper la lógica existente.
8. El esquema actual tiene timezone por defecto `Europe/Madrid`. Los nuevos flujos deben resolver zona IANA desde la configuración aplicable, guardar instantes correctamente y no imponer Madrid a todas las iglesias. Una repetición semanal conserva la hora local al cruzar DST.
9. Conservar migraciones existentes y generar nuevas con nombres únicos respecto a ambas líneas de trabajo. Regenerar tipos desde el esquema local resultante. No introducir una segunda app ni un catálogo paralelo de áreas o puestos.

## D. Precisiones para evitar una implementación ambigua

- Recurrencia: implementar semanal, cada N semanas, mensual y finalización por fecha o cantidad, con expansión acotada y sin duplicados por reintento. Cada ocurrencia tiene identidad vinculada a la serie. Implementar edición individual, futuras y serie, preservando excepciones y actividades históricas/completadas. Si no puede completarse, declarar el recorte como pendiente en lugar de marcar toda la fase lista. Documentar y probar días 29–31 y horas inexistentes/duplicadas por DST.
- Plantillas y duplicación: crear copias transaccionales de áreas, puestos, requisitos y plan; un fallo parcial no deja una actividad incompleta presentada como éxito. Duplicar devuelve un borrador con nuevos IDs y sin arrastrar auditoría, cancelación o pertenencia accidental a la serie original.
- Campus: definir la compatibilidad entre actividad global, sede, área y puesto, incluyendo cambios posteriores. Probar cruces dentro de una misma iglesia además de cruces entre iglesias.
- Cobertura: en F4 no existen asignaciones. Separar «estructura completa» de «personas cubiertas». Mostrar cero personas asignadas sin inventar datos. Un puesto con mínimo cero no se considera necesariamente descubierto; probar límites de mínimos/máximos y definir el caso sin máximo.
- Publicación: requiere estructura válida, no personas asignadas. No emitir notificaciones reales en esta fase. Reservar la integración de eventos para F5 sin implementar transportes.
- Planning: unidades de duración y offsets explícitas; `song` es un bloque del plan, no un catálogo musical. Reordenación persistida de forma atómica, con alternativa por teclado y móvil. Documentar solapes y duración total respecto a la actividad.
- Permisos: validar capacidades, scopes y módulos en servidor/base; un líder de área no recibe por ello permiso para editar las demás áreas ni toda la actividad. Separar publicar/cancelar/archivar de una edición genérica.
- Calendario: consultar por rango de fechas e incluir actividades que se solapan con el rango, no solo las que empiezan dentro. Aplicar filtros y autorización antes de devolver datos. Ofrecer tareas sin horario en una vista apropiada, sin inventar horas.
- No introducir permisos amplios, mocks permanentes o estadísticas ficticias para completar pantallas.

## E. Orden de ejecución y coordinación con Diogo

Una persona es responsable de este encargo. La otra puede trabajar en tareas independientes acordadas. No iniciar dos implementaciones completas de F4 en paralelo.

Dividir en entregables revisables: (1) contrato/esquema/permisos; (2) actividades y plantillas; (3) áreas, puestos, snapshots y planning; (4) recurrencia/calendario/dashboard; (5) integración y pruebas. Cada entrega debe dejar el código coherente. Si se reparte la implementación, usar ramas distintas y fijar un único responsable de migraciones compartidas, tipos y navegación.

Rama propuesta: `feature/fase-4-actividades-planificacion`. Ninguna integración en main sin validación de Carlos del commit concreto. No desplegar ni migrar producción como efecto automático de terminar código.

Comprobaciones existentes: `npm run lint`, `npm run typecheck`, `npm run build`, `supabase test db` y revisión de `supabase db diff --local`, con Supabase local iniciado. No existe `npm test` en el package.json de referencia. Añadir una herramienta de pruebas solo si es necesaria para cubrir reglas temporales/de dominio y documentar el comando nuevo; conservar las suites existentes.

Además de los tests enumerados abajo, cubrir migración de estados/visibilidad, acceso directo evitando UI, reintentos/concurrencia, rollback de operaciones compuestas, DST, pertenencia de organizador/responsables, snapshots inmutables y restricciones entre sedes. Ejecutar el CI existente; no confundir conservar regresiones con reauditar fases cerradas.

---
Vamos a iniciar la Fase 4 de LEVITA.

Estado de partida comunicado por Carlos y Diogo:
- El equipo comunica Fases 0, 1, 2 y 3 cerradas en producción. El historial de origin/main confirma la integración hasta Fase 3; la producción no ha sido verificada de nuevo al preparar este encargo.
- `main` en `e5679ca`.
- El equipo comunica Supabase real operativo y actualizado. No deducir acceso o autorización de migración remota de la mera disponibilidad de credenciales.
- People, familias, Serving, áreas, equipos, puestos, cualificaciones, credenciales, elegibilidad, RBAC, tenant/campus, auditoría y shell ya existen.
- No repitas validaciones de fases anteriores salvo que un cambio de esta fase las afecte directamente.

# FASE 4 — Actividades, cultos, eventos operativos y planificación del servicio

## Objetivo

Al finalizar esta fase, una iglesia debe poder crear y gestionar actividades reales sobre las que después se hará scheduling.

LEVITA debe soportar de forma genérica:
- cultos;
- reuniones;
- ensayos;
- eventos;
- cursos;
- reuniones de grupo;
- tareas;
- turnos operativos;
- actividades puntuales;
- actividades recurrentes.

La fase debe convertir la entidad `activities` definida en Fase 0 en un dominio funcional real.

La iglesia debe poder:

1. crear una actividad;
2. elegir su tipo;
3. asignarla a un campus;
4. definir fecha, hora, zona horaria y duración;
5. crear recurrencias;
6. usar plantillas;
7. añadir áreas de servicio necesarias;
8. añadir puestos por actividad;
9. definir necesidades mínimas por puesto;
10. heredar puestos desde áreas;
11. preparar la actividad para futuras asignaciones;
12. gestionar estado del servicio;
13. duplicar actividades;
14. cancelar;
15. archivar;
16. ver calendario operativo;
17. consultar detalle completo;
18. preparar planning/orden del servicio;
19. mantener todo tenant-safe, auditable y responsive.

No desarrollar todavía:
- disponibilidad personal por fecha;
- asignaciones de personas;
- confirmaciones/rechazos;
- sustituciones;
- notificaciones completas;
- Groups funcional;
- Kids check-in;
- Giving;
- Pastoral;
- Alabanza funcional completa.

---

# 1. Reutiliza `activities`

No crees otra entidad paralela si `activities` ya existe.

Primero inspecciona:
- columnas actuales;
- constraints;
- RLS;
- índices;
- ADR de Activity.

Amplía únicamente lo necesario.

`activities` debe seguir siendo la raíz transversal.

---

# 2. Tipos de actividad

Implementar tipos coherentes.

Como mínimo:

- service
- meeting
- event
- course_session
- group_meeting
- rehearsal
- task
- shift

No usar strings dispersos por UI.

Centralizar enum/catálogo.

El tipo debe influir en defaults y presentación, no en seguridad.

---

# 3. Estados

Definir estados consistentes:

- draft
- planned
- published
- completed
- cancelled
- archived

No mezclar estado de actividad con estado futuro de asignaciones.

Reglas sugeridas:
- draft: editable libremente;
- planned: estructura definida;
- published: visible según permisos;
- completed: histórico;
- cancelled: no programable;
- archived: oculto por defecto.

---

# 4. CRUD de actividades

Crear:

/app/calendario
/app/actividades
/app/actividades/nueva
/app/actividades/[id]

Debe permitir:
- crear;
- editar;
- duplicar;
- cancelar;
- completar;
- archivar;
- reactivar si procede.

No borrar físicamente actividades con histórico.

---

# 5. Campos mínimos

Activity debe contemplar:

- church_id
- campus_id opcional
- type
- title
- description
- starts_at
- ends_at
- timezone
- status
- visibility
- location_text opcional
- organizer_person_id opcional
- recurrence_rule opcional
- template_id opcional
- notes administrativas no sensibles
- created_by
- created_at
- updated_at
- archived_at

Si alguno ya existe, reutilízalo.

---

# 6. Timezone

Guardar tiempos de forma segura.

Recomendación:
- UTC en DB;
- timezone IANA como contexto;
- convertir en UI.

No hardcodear Europe/Madrid.

Campus puede aportar timezone por defecto.

---

# 7. Actividades recurrentes

Implementar recurrencia básica.

Soportar como mínimo:
- semanal;
- cada N semanas;
- mensual;
- hasta fecha;
- número máximo de ocurrencias.

No construir un motor infinito.

Usar una representación clara:
- RRULE si ya existe soporte;
- o modelo equivalente documentado.

Debe poder:
- crear serie;
- editar solo ocurrencia;
- editar futuras;
- editar toda la serie.

Si eso complica demasiado esta fase, como mínimo dejar correctamente modelada:
- recurrence_series_id
- occurrence_date
- rule
- exception

No improvisar duplicando filas sin relación.

---

# 8. Plantillas de actividad

Crear:

activity_templates

Debe permitir:
- nombre;
- tipo;
- campus opcional;
- duración por defecto;
- áreas incluidas;
- puestos;
- notas;
- activo;
- orden.

Ejemplos:
- Culto domingo 11:00
- Culto domingo tarde
- Reunión de jóvenes
- Ensayo de alabanza
- Evento especial
- Limpieza semanal

No hardcodear ejemplos como lógica.

---

# 9. Crear desde plantilla

Al crear una actividad, permitir:

- desde cero;
- desde plantilla.

Una plantilla puede precargar:
- campus;
- duración;
- áreas;
- puestos;
- mínimos;
- orden del servicio.

Debe copiar estructura, no crear una dependencia rígida.

Cambiar la plantilla después no debe alterar automáticamente actividades históricas.

---

# 10. Áreas requeridas por actividad

Crear entidad conceptual:

activity_service_areas

Debe relacionar:
- activity
- service_area
- required/optional
- notes
- sort_order

Ejemplo:
Culto domingo:
- Sonido
- Multimedia
- Bienvenida
- Niños
- Dirección del culto
- Alabanza

Evento especial:
- Parking
- Seguridad
- Protocolo
- Multimedia

Tenant-safe obligatorio.

---

# 11. Puestos por actividad

Crear:

activity_positions

Debe permitir copiar puestos desde `service_positions`.

Una actividad puede:
- usar un puesto estándar;
- ajustar min_people;
- ajustar max_people;
- marcar critical;
- cambiar requirement;
- añadir un puesto ad-hoc.

Guardar snapshot suficiente para que cambios futuros en el catálogo de puestos no rompan la actividad histórica.

No depender solo de referencia mutable.

---

# 12. Requisitos en actividad

Los requisitos base del puesto deben heredarse.

Pero permitir override para la actividad.

Ejemplo:
Puesto Cámara normalmente requiere nivel basic.
Evento especial puede exigir advanced.

Crear modelo de override claro.

No duplicar lógica innecesariamente.

---

# 13. Capacity / cobertura

Para cada activity_position mostrar:

- required_min
- required_max
- assigned_count futuro
- coverage status

En esta fase assigned_count será 0.

Estados conceptuales:
- uncovered
- partially_covered
- covered
- overstaffed

Preparar cálculo, aunque asignaciones lleguen en Fase 5.

---

# 14. Planning / orden del servicio

Crear estructura real para planificación.

Conceptualmente:

activity_plan_items

Tipos:
- section
- song
- speech
- prayer
- announcement
- media
- transition
- custom

No desarrollar todavía Alabanza completa.

Pero debe ser posible crear un orden como:

10:55 Bienvenida
11:00 Inicio
11:05 Canción
11:15 Oración
11:20 Avisos
11:25 Predicación
12:05 Canción final
12:10 Cierre

Campos:
- title
- type
- duration
- start offset opcional
- responsible_text/person opcional
- notes
- sort_order

---

# 15. Planning drag & drop

En desktop permitir reordenar items de forma cómoda.

En mobile debe existir alternativa accesible:
- botones subir/bajar;
- menú.

No depender solo de drag & drop.

---

# 16. Vista detalle de actividad

`/app/actividades/[id]`

Tabs sugeridas:

Resumen
Plan
Áreas
Puestos
Equipo
Notas
Historial

`Equipo` en esta fase puede mostrar placeholders vacíos para futuras asignaciones, pero no inventar personas asignadas.

Resumen:
- tipo;
- campus;
- fecha;
- hora;
- estado;
- duración;
- cobertura estructural;
- áreas;
- puestos.

---

# 17. Calendario

Crear `/app/calendario`.

Vistas:
- mes;
- semana;
- lista.

Filtros:
- campus;
- tipo;
- estado;
- área relacionada.

En mobile priorizar:
- agenda/lista;
- navegación simple.

No cargar todo en cliente si hay volumen.

---

# 18. Actividades tipo tarea/turno sin culto

Esta fase debe resolver definitivamente la necesidad histórica de:

“turnos por franja horaria sin evento asociado”.

Ejemplo:
- Limpieza sábado 09:00
- Recepción oficina martes
- Mantenimiento
- Seguridad de evento
- Preparación de sala

Estas deben ser activities válidas por sí mismas.

No obligar a vincularlas a un culto.

---

# 19. Relaciones con campus

Una actividad puede:
- estar ligada a un campus;
- ser global de iglesia si aplica.

Pero un puesto/área con campus incompatible no debe colarse sin control.

Definir reglas claras.

---

# 20. Visibilidad

Implementar al menos:

- private
- leaders
- members
- public_future

`public_future` puede quedar sin exposición web pública todavía.

La visibilidad no sustituye permisos.

---

# 21. Duplicación

Permitir duplicar actividad.

Debe copiar:
- datos base;
- áreas;
- puestos;
- requisitos/overrides;
- planning.

No copiar:
- auditoría;
- estado completed/cancelled;
- asignaciones futuras;
- IDs históricos.

---

# 22. Cancelación

Cancelar debe:
- conservar actividad;
- guardar razón opcional;
- registrar auditoría;
- impedir futuras asignaciones.

No borrar.

---

# 23. Publicación

`published` debe significar:
- estructura lista;
- visible a usuarios autorizados;
- preparada para Fase 5.

No implementar aún notificaciones automáticas.

---

# 24. Integración con Serving

Debe poder seleccionar:
- áreas activas;
- puestos activos;
- requisitos;
- campus compatibles.

No duplicar catálogo.

La elegibilidad de Fase 3 debe seguir siendo reutilizable después.

---

# 25. Dashboard

Actualizar dashboard general o de Serving con datos reales:

- próximas actividades;
- actividades esta semana;
- actividades draft;
- actividades sin estructura completa;
- próximos cultos.

No inventar estadísticas.

---

# 26. Plantillas de culto

Crear UI:

/app/actividades/plantillas

Permitir:
- crear;
- editar;
- duplicar;
- archivar;
- usar.

Mostrar:
- nombre;
- tipo;
- campus;
- áreas;
- nº puestos;
- duración.

---

# 27. Validaciones

Impedir:
- ends_at <= starts_at;
- actividad cross-tenant;
- campus de otro tenant;
- área de otro tenant;
- puesto de otro tenant;
- template cross-tenant;
- recurrence inconsistente.

---

# 28. Permisos

Capabilities sugeridas:

activity.read
activity.create
activity.manage
activity.publish
activity.cancel
activity.archive
activity_template.manage
activity_plan.manage

Scopes:
- church
- campus
- service_area cuando corresponda.

Un líder de área puede consultar actividades donde participa su área, pero no necesariamente editar toda la actividad.

---

# 29. RLS

Toda tabla nueva tenant-aware:
- ENABLE RLS;
- FORCE RLS;
- policies;
- indexes;
- tenant-safe FKs.

Actualizar cobertura automática.

---

# 30. Auditoría

Registrar:

activity.created
activity.updated
activity.duplicated
activity.published
activity.cancelled
activity.completed
activity.archived
activity_template.created
activity_template.updated
activity.area_added
activity.position_added
activity.position_updated
activity.plan_item_added
activity.plan_item_updated
activity.plan_reordered

No guardar contenido sensible innecesario.

---

# 31. UI/UX

Usar las referencias visuales ya aprobadas de:
- Calendario
- Servicios
- Eventos
- dashboard LEVITA

Mantener:
- premium;
- limpio;
- elegante;
- crema/blanco;
- azul grisáceo;
- dorado suave;
- cards;
- responsive;
- mobile-first.

No introducir un calendario visual completamente ajeno al design system.

---

# 32. Performance

Índices razonables:

activities:
- church_id + starts_at
- church_id + status
- church_id + campus_id + starts_at
- church_id + type + starts_at

activity_service_areas:
- church_id + activity_id
- church_id + service_area_id

activity_positions:
- church_id + activity_id
- church_id + service_position_id

activity_plan_items:
- church_id + activity_id + sort_order

No sobreindexar.

---

# 33. Migraciones y entornos

Crear migraciones nuevas, versionadas y compatibles con el esquema existente. No reescribir migraciones aplicadas. Coordinar nombres y dependencias con el trabajo de Diogo.

Validar en Supabase local y, si existe un entorno de pruebas autorizado, en ese entorno. No aplicar automáticamente migraciones a la base real de producción ni conectar una Preview con permiso de escritura a producción. Preparar la lista exacta de migraciones, impacto, compatibilidad con la versión desplegada y procedimiento de recuperación para revisión de Carlos.

No aplicar seeds sintéticos a remoto. Carlos dispone de las variables de entorno: usar `.env.local` en el checkout de trabajo si está configurado. En la copia revisada al preparar este encargo no existía `.env.local`. No imprimir secretos ni copiarlos a Git o al informe. La existencia de variables no identifica por sí sola el entorno ni autoriza cambios remotos.

No pedir que Carlos ejecute SQL manualmente si puedes preparar las migraciones y ejecutarlas en el entorno autorizado. Si falta acceso a un entorno, completar código, pruebas independientes y documentación, indicando qué validación queda pendiente.

---
# 34. Flujo de trabajo y validación de Carlos

Trabajar en `feature/fase-4-actividades-planificacion` dentro de un clon o worktree propio. Consultar primero estado local, ramas remotas y trabajo de Diogo; si esa rama ya tiene responsable, no reutilizarla sin coordinación. No mezclar modificaciones documentales o código ajeno con el encargo.

Flujo autorizado de desarrollo:

inspección acotada del código afectado
→ contrato y actualización del alcance documental
→ implementación y migraciones locales
→ pruebas y build
→ commits en la rama de trabajo
→ push de la rama y PR en borrador hacia main
→ Preview con entorno aislado, si está disponible
→ smoke test
→ entrega de resultado y commit exacto a Carlos.

DETENER LA INTEGRACIÓN en este punto hasta que Carlos valide expresamente esa versión. No hacer commits directos, push directo, merge, squash, rebase de main ni activar auto-merge. La aprobación de Diogo o el CI en verde no sustituyen la validación de Carlos. Si cambia el código después de la revisión, la nueva versión necesita validación.

Solo después de esa validación y de tener acordado el destino y la ejecución de las migraciones remotas: ejecutar el plan de entrega aprobado, verificar CI, integrar por PR, comprobar despliegue y hacer smoke test del entorno resultante. No asumir que la configuración de Vercel o las protecciones de GitHub ya existen.

No reabrir auditorías completas de fases cerradas. Ejecutar el CI existente y las regresiones necesarias por los cambios de esta fase; esto no equivale a repetir todo el desarrollo anterior.

---
# 35. Tests nuevos mínimos

## Activities
- crear;
- editar;
- cancelar;
- archivar;
- cross-tenant bloqueado.

## Campus
- campus válido;
- campus cross-tenant rechazado.

## Templates
- crear;
- instanciar;
- snapshot correcto;
- cross-tenant.

## Service areas
- añadir área válida;
- área cross-tenant rechazada.

## Positions
- copiar puesto;
- override min_people;
- puesto ad-hoc;
- cross-tenant.

## Plan
- crear item;
- reordenar;
- mantener sort_order.

## Recurrence
- crear serie;
- ocurrencias vinculadas;
- excepción válida.

## Permissions
- read;
- manage;
- publish;
- scope campus/area.

No duplicar tests antiguos sin motivo.

---

# 36. No desarrollar ahora

NO implementar:
- disponibilidad personal;
- asignaciones;
- respuestas;
- sustituciones;
- conflictos de agenda;
- push/email final;
- grupos funcionales;
- Kids;
- Pastoral;
- Giving;
- Alabanza funcional completa.

---

# 37. Criterios de salida

Fase 4 completa solo si:

- actividades funcionan;
- tipos/estados funcionan;
- recurrencia básica funciona;
- templates funcionan;
- calendario funciona;
- áreas por actividad funcionan;
- puestos por actividad funcionan;
- overrides funcionan;
- planning funciona;
- duplicación funciona;
- cancelación funciona;
- actividad tipo task/shift independiente funciona;
- permisos funcionan;
- RLS cubre nuevas tablas;
- auditoría funciona;
- tests nuevos pasan;
- build pasa;
- migraciones probadas en local y en el entorno de pruebas autorizado, si está disponible;
- Preview y su smoke test documentados, o bloqueo concreto de entorno declarado;
- PR y commit final preparados para validación de Carlos;
- ninguna verificación pendiente se presenta como realizada. La integración y producción se cierran aparte tras aprobación.

---

# 38. Informe final

Antes de la validación de Carlos, devolver:

FASE 4: LISTA PARA VALIDACIÓN DE CARLOS

Usar ese estado solo cuando los criterios de implementación y pruebas estén satisfechos. Si faltan requisitos o verificaciones, indicar FASE 4: PARCIAL o BLOQUEADA, con el motivo concreto.

Incluir:
- funcionalidades implementadas y excluidas;
- migraciones y tablas nuevas;
- cambios compatibles del esquema existente;
- tipos, estados y transiciones;
- recurrencia y casos DST;
- plantillas y snapshots;
- áreas, puestos y requisitos por actividad;
- planning y calendario;
- pruebas ejecutadas, resultados y pruebas pendientes;
- RLS, permisos y auditoría;
- rama, commit exacto y PR;
- URL de Preview y smoke test, si existen;
- plan de migración, despliegue y recuperación;
- limitaciones, deuda y decisiones pendientes;
- indicación explícita de que main no se ha integrado y producción no se ha modificado sin aprobación.

Solo tras aprobación de Carlos, integración y comprobación real de despliegue, informar FASE 4: PRODUCCIÓN, con commit integrado, migraciones aplicadas, URL y resultado del smoke test. No usar ese estado como una salida obligatoria cuando no ha ocurrido.

No iniciar la Fase 5 automáticamente.
