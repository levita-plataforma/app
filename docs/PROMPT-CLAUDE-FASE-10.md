# Encargo para Claude — Fase 10: Recursos, instalaciones y mantenimiento

Preparado el 19 de septiembre de 2026. **Responsable: Carlos.**
Repositorio: https://github.com/levita-plataforma/app.git

## 1. Objetivo y autorización

Implementa F10: catálogo de recursos, salas, equipos y vehículos; disponibilidad, reservas, detección de conflictos, responsables, mantenimiento preventivo y tareas recurrentes relacionadas con actividades. Entrega código, migraciones, pruebas y PR revisable; no te limites a un plan.

Trabaja en `feature/carlos-fase-10-recursos-instalaciones`, desde origin/main actualizado, en un clon o worktree propio. Comprueba ramas y tareas existentes para no duplicar trabajo ni sobrescribir cambios ajenos. Carlos conserva F10; el trabajo de Diogo en otras fases es independiente y debe respetarse.

Puedes hacer commits en tu rama, subirla y abrir una PR. **No integres en main, hagas push directo ni actives auto-merge sin validación expresa de Carlos del commit concreto.** La aprobación del encargo no aprueba automáticamente la implementación. No aplicar migraciones, activar jobs ni realizar cambios en producción sin autorización correspondiente.

## 2. Estado comprobado y lecturas

Al preparar este encargo, `origin/main` estaba en `466c3ee`, merge de F7 mediante PR #14. Su informe todavía dice que no está integrada: no usar esa frase antigua para reconstruir F7 ni afirmar que producción está verificada. Revisar el estado real al ejecutar y conservar avances posteriores.

La ruta `/app/instalaciones` es un placeholder y la navegación usa `moduleKey: facilities`. No se encontraron servicios ni migraciones propios de Facilities en la revisión inspeccionada. Confirmarlo antes de crear entidades.

Leer:

- AGENTS.md, CLAUDE.md, FUNCIONAMIENTO.md y el reparto Carlos–Diogo.
- docs/modulos/08-recursos-instalaciones.md y F10 del roadmap.
- Decisiones vigentes, núcleo, datos/RLS, seguridad y operación.
- Contratos y código actual de Activity: F4, recurrencia y ciclo de vida.
- Avisos F5, Events F6 y reuniones/sesiones F7 que consumen Activity.

Antes de escribir código Next.js, seguir AGENTS.md y consultar guías locales de la versión instalada. Reutilizar patrones de servidor, RPC, errores, shell y tipos existentes. F10 no requiere terminar F8 o F9; sí necesita contratos estables de Activity, tenant, permisos y avisos que consuma.

El último estado de avisos inspeccionado documentaba email/push desactivados. Comprobar la configuración actual sin revelar secretos; no habilitar transportes como parte de F10 ni prometer envíos externos inexistentes.

## 3. Resultado de producto

Una iglesia registra una sala, cámara o vehículo; comprueba disponibilidad; reserva ese recurso para una actividad o una necesidad independiente; evita dobles reservas; conoce quién lo gestiona y cuándo queda fuera de servicio. Puede programar mantenimiento, registrar su ejecución y consultar historial.

Crear el recurso, reservarlo y mantenerlo son operaciones distintas. La capacidad de una sala en personas no es la cantidad de unidades reservables de un recurso. Una reserva no crea una asignación de voluntario ni concede permisos de otros módulos.

## 4. Contrato y decisiones previas

Preparar docs/CONTRATO-FASE-10.md con entidades, estados, permisos, integración Activity, reglas de solape, eventos y mantenimiento. Resolver decisiones técnicas normales conforme al código; pedir a Carlos solo las reglas de producto/privacidad todavía abiertas, con propuesta concreta. Avanzar en trabajo independiente mientras se resuelven.

| Tema | Propuesta a confirmar, no decisión previa |
|---|---|
| Unidades | Salas y activos individuales son exclusivos. Para equipos múltiples, modelar cada unidad identificable inicialmente; cantidades compartidas solo con un modelo transaccional explícito. |
| Reserva | Definir si es directa o requiere aprobación. Proponer pendiente/confirmada/cancelada/rechazada/completada y especificar cuáles bloquean disponibilidad. |
| Horario | Rangos semiabiertos [inicio, fin); buffers de montaje/desmontaje explícitos si se necesitan. |
| Conflicto | Dos reservas que consumen la misma unidad no pueden solaparse. Un aviso en UI no sustituye el bloqueo en base. |
| Reprogramación | Proponer operación atómica: si el nuevo horario no está disponible, no guardar parcialmente actividad y reservas. |
| Cancelación | Proponer cancelar reservas futuras asociadas y liberar capacidad en la misma transacción, conservando histórico. |
| Fuera de servicio | Bloquea nuevas reservas. Definir tratamiento de reservas ya confirmadas y cómo se informa al responsable. |
| Reservas independientes | Permitidas con finalidad operativa y responsable; no obligar a crear un culto ficticio. |
| Campus | Regla explícita para recursos globales, sedes y equipos transportables; no relajar pertenencia al tenant. |
| Mantenimiento | Diferenciar tarea administrativa de ventana que bloquea el recurso; acordar periodicidad, vencimiento y criterio de cierre. |

No introducir silenciosamente bypass de conflictos, préstamos entre iglesias, prioridades de reserva o reglas de aprobación sin acuerdo. El historial de F4–F7 no decide esas reglas por sí solo.

## 5. Modelo de datos

Entidades conceptuales del catálogo: resources, resource_types, rooms, resource_reservations, maintenance_tasks y maintenance_schedules. Inspeccionar primero el esquema y decidir nombres finales sin duplicados.

- Resource es la raíz: tenant, nombre, tipo, campus, descripción no sensible, ubicación, responsable opcional, estado operativo, timestamps y archivado.
- Room puede ser una extensión 1:1 con aforo y características; no una segunda sala desconectada del recurso reservable.
- Reservas: recurso/unidad, intervalo, estado, actividad opcional, responsable perteneciente al tenant, actor y versión/idempotencia si procede. Buffers, aprobación y cancelación solo con semántica definida.
- Mantenimiento: recurso, tarea, responsable, vencimiento/ventana, estado, recurrencia opcional, ejecución y notas operativas. Conservar historial de cada ocurrencia.
- Estados y etiquetas centralizados; transiciones validadas en servidor/base.
- FK tenant-safe para campus, actividad, recurso, tarea y reserva. Validar también que la unidad pertenece al recurso indicado, no solo a la misma iglesia.
- People es identidad común sin church_id: comprobar pertenencia por church_people. No duplicar usuarios ni crear FK a columnas inexistentes.
- No borrar físicamente recursos con histórico. El archivado y las bajas de responsables conservan reservas y mantenimientos anteriores sin conceder acceso actual.

No almacenar secretos de acceso físico, códigos de alarma o datos sensibles en descripciones generales. Evitar un sistema de archivos nuevo: reutilizar infraestructura existente solo cuando sea necesaria y tenga permisos adecuados.

## 6. Catálogo de recursos

Implementar alta, edición, listado paginado, filtros por tipo/campus/estado, ficha, archivo y reactivación según reglas.

Tipos editables por iglesia y ejemplos como datos, no lógica fija. Mostrar responsable, características relevantes, disponibilidad, reservas próximas e historial permitido.

Una sala admite aforo; un equipo admite identificación/inventario; un vehículo datos operativos mínimos. No ampliar esta fase a contabilidad de activos o telemetría.

Cambiar recurso a inactivo/fuera de servicio debe resolver reservas futuras según contrato. No permitir que cambiar de campus o recurso en una reserva salte las validaciones de disponibilidad.

## 7. Reservas y concurrencia

Crear, editar, cancelar y, si corresponde, aprobar/rechazar. Mostrar conflictos concretos sin revelar contenido privado de la actividad que ocupa el recurso. Un usuario puede conocer «ocupado» sin derecho a conocer título, asistentes o notas.

- Validar ends_at > starts_at y zona IANA. Comparar instantes UTC, con presentación en la zona aplicable; días completos y DST deben resolverse por límites locales.
- Para una unidad exclusiva, usar una restricción de exclusión o mecanismo de base equivalente que cubra escrituras concurrentes y cambios de estado/recurso/intervalo.
- Si hay stock agregado, impedir que la suma simultánea supere la cantidad con bloqueo/serialización sobre el inventario. No basta sumar en frontend ni hacer SELECT antes de INSERT sin protección.
- Aplicar la misma garantía a bloqueos por mantenimiento: dos tablas con constraints separados no evitan un cruce reserva–mantenimiento. Elegir ocupación común o serialización equivalente demostrada con pruebas.
- Rango adyacente es válido salvo buffers explícitos; un margen consume capacidad igual que el horario principal.
- Reintentar una creación no duplica reservas. Una aprobación concurrente no sobrevende capacidad.
- Operaciones con varios recursos son atómicas o tienen un contrato explícito de parcialidad visible. Propuesta: reservar todos o ninguno, con locks ordenados para reducir deadlocks.
- No ofrecer una reserva de recurso cancelado/archivado como confirmada. El error debe explicar qué cambiar sin exponer datos privados.

## 8. Integración con Activity y series

Añadir gestión de recursos a la ficha de actividad reutilizando Activity y sus RPC. No crear otra entidad de evento, calendario o motor de recurrencia.

- Activity es fuente temporal de la reserva vinculada salvo offsets explícitos acordados. Evitar dos horarios independientes que diverjan silenciosamente.
- Una actividad flexible sin intervalo no reserva capacidad temporal: exigir ventana concreta para la reserva sin inventar fechas en Activity.
- Reprogramar/cancelar/archivar/completar y cambios de serie deben reconciliar reservas conforme al contrato. Revisar todas las rutas de mutación, no solo el formulario UI.
- Editar «esta», «futuras» o «serie» respeta reservas pasadas y excepciones. Si una ocurrencia se elimina, no dejar su reserva activa.
- Previsualizar conflictos de todas las ocurrencias de una serie acotada. Acordar atomicidad de la tanda; no informar éxito global si solo se reservaron algunas.
- Duplicar una actividad o usar plantilla no copia confirmaciones, IDs ni histórico. Recursos sugeridos deben validarse de nuevo antes de reservar.
- No alterar reglas de asignaciones F5, inscripciones F6 ni asistencia F7. Los hooks y RPC añadidos deben preservar sus efectos existentes.
- Recurso visible no implica actividad privada visible. Comprobar calendario, ficha y consultas agregadas.

## 9. Mantenimiento preventivo y tareas recurrentes

- Alta de tarea puntual, asignación de responsable, inicio/cierre/cancelación y registro de ejecución con auditoría.
- Plan recurrente acotado con zona, frecuencia y próximas ocurrencias; elegir representación reutilizable y documentada, sin generar infinitas filas.
- Cada ocurrencia tiene identidad estable, fecha prevista, estado y ejecución. Dos ejecuciones del planificador no crean la misma tarea dos veces.
- Separar mantenimiento vencido de recurso fuera de servicio: no suponer equivalencia automática sin regla.
- Ventanas que bloquean el recurso participan en la misma garantía de ocupación de las reservas.
- Cambios de horario, cancelación o reactivación liberan/revalidan capacidad de forma coherente. Completar una tarea no elimina su historial.
- Modificar una pauta no reescribe tareas realizadas; conservar excepciones y trazabilidad.
- Si hay job, reutilizar la ejecución segura existente y probar su programación en el entorno autorizado. Tener una función sin ejecución comprobada no cierra automatización.

## 10. Permisos, privacidad y avisos

Usar module key facilities y comprobar módulo, pertenencia y capacidades en servidor/base; no solo ocultar navegación.

Definir capacidades para consultar catálogo/disponibilidad, gestionar recursos, reservar, gestionar reservas ajenas, aprobar cuando corresponda y gestionar mantenimiento. Usar scopes existentes de iglesia, campus y recurso cuando encajen, validando que los IDs de scope pertenecen al tenant.

Poder editar una actividad no concede automáticamente gestión del catálogo ni reservas de cualquier recurso. Un responsable de mantenimiento ve lo necesario para su tarea; no adquiere acceso a personas, notas o módulos sensibles.

Todas las tablas tenant-aware con RLS y FORCE RLS, grants mínimos, políticas por operación y FK seguras. Escritura por RPC según patrón vigente; revisar search_path, permisos execute y actor real en security definer. No usar service-role para saltarse autorización de un usuario.

Reutilizar outbox y bandeja de F5 para eventos acordados: reserva resuelta/cancelada, cambio relevante, recurso fuera de servicio, mantenimiento asignado/vencido. Eventos y mutación en la misma transacción, payload mínimo y deduplicación por transición, no solo por fecha. No crear otro motor ni activar email/push.

Comprobar destinatarios y permisos al entregar, ampliar destinos de notificación sin romper tipos F5–F7 y no enviar datos de eventos privados a quien solo necesita saber que un recurso está ocupado.

## 11. Interfaz y métricas

Sustituir `/app/instalaciones` y reutilizar diseño de LEVITA. Rutas orientativas: recursos, ficha de recurso, reservas, mantenimiento y planes dentro de ese módulo; recursos vinculados dentro de la ficha Activity.

- Calendario/agenda de disponibilidad por recurso y campus, filtros y rangos limitados.
- Formulario con recurso, horario, actividad opcional, responsable y conflictos.
- Vistas de próximas reservas, recursos fuera de servicio y mantenimientos pendientes/vencidos.
- Diferenciar solicitado/confirmado/cancelado; no usar «disponible» si falta cargar la consulta.
- Métricas reales con periodo/denominador claros, sin contar reservas canceladas como uso.
- Mobile first, teclado, foco, estados vacíos/carga/error y recuperación de formularios. No depender de drag & drop para reservar o cambiar horario.
- Consultas paginadas con permisos previos; incluir reservas que atraviesan el rango mostrado, no solo las que empiezan dentro.

## 12. Migraciones y entregables

No reescribir migraciones aplicadas. Inspeccionar los prefijos nuevos de F7 y el trabajo paralelo de Diogo; reservar identificadores únicos posteriores a dependencias reales, sin asumir que la fecha actual determina el orden.

Regenerar tipos desde el esquema combinado. Coordinar navegación, Activity, permisos, runner y tipos compartidos; evitar git add global que incluya trabajo ajeno.

Entregas propuestas:

1. Contrato, esquema, permisos y ocupación transaccional.
2. Catálogo y reservas independientes.
3. Integración Activity/series y calendario.
4. Mantenimiento puntual/recurrente y avisos internos.
5. Pruebas integrales, documentación y PR final.

Crear docs/FASE-10-RECURSOS-INSTALACIONES.md; actualizar catálogo, roadmap, índice y decisiones afectadas. Registrar un ADR si la solución de concurrencia o integración lo justifica, usando un número libre.

## 13. Pruebas de aceptación

| Área | Casos mínimos |
|---|---|
| Catálogo | Crear/editar/archivar/restaurar, responsable/sede ajenos, tipos por tenant y recurso fuera de servicio. |
| Reservas | Crear/editar/cancelar, intervalos inválidos, adyacencia, buffers, cambios de recurso/estado y reintentos. |
| Concurrencia | Dos reservas simultáneas de la misma unidad; aprobación simultánea; reserva frente a mantenimiento; actualización frente a nueva reserva. Una transacción debe rechazarse limpiamente cuando no caben ambas. |
| Cantidades | Si se implementan, sumas solapadas y reducción de stock nunca permiten sobreventa. |
| Activity | Cambio de hora, cancelación, archivado, actividad flexible, duplicación, series/excepciones y conservación de efectos F5–F7. |
| Mantenimiento | Puntual/recurrente, doble ejecución del planificador, vencimiento, excepción, cierre y liberación de bloqueo. |
| Tiempo | Cruce de medianoche, día completo, DST, zona diferente de Madrid y reservas que atraviesan el rango consultado. |
| Permisos | Otra iglesia, otro campus/recurso de la misma iglesia, actividad privada, usuario sin módulo y acceso directo RPC/SQL. |
| Avisos | Rollback no emite, replay no duplica, estado cambiado invalida aviso pendiente y enlace respeta audiencia. |
| UI | Móvil/escritorio, teclado, carga/vacío/error, conflicto recuperable y datos reales. |

Mantener suites anteriores y ejecutar los comandos de la revisión: npm run lint, npm run typecheck, npm run build, supabase test db y revisión de supabase db diff --local con Supabase iniciado. Si se necesita un runner para reglas nuevas, justificarlo y documentarlo; no asumir npm test sin comprobar package.json.

Las pruebas de concurrencia deben usar transacciones/sesiones realmente concurrentes; dos llamadas secuenciales no demuestran protección. Validar esquema limpio y actualización desde la base integrada con datos sintéticos.

Declarar cualquier prueba no ejecutada o falta de entorno. No afirmar funcionamiento de producción por tener build o arnés local en verde.

## 14. Cierre y entrega a Carlos

F10 está lista para validación cuando una actividad y una reserva independiente pueden utilizar recursos sin dobles reservas, mantenimiento bloquea correctamente, permisos y datos privados están protegidos, historial/avisos funcionan y pruebas pasan.

Entregar:

- Funciones implementadas y decisiones acordadas.
- Migraciones, capacidades, contratos y estrategia de concurrencia.
- Pruebas realizadas/resultados y pendientes.
- Rama, commit exacto, PR, Preview si existe y pasos para que Carlos pruebe el recorrido.
- Compatibilidad de despliegue y recuperación ante migraciones o errores.
- Estado preciso: `FASE 10: LISTA PARA VALIDACIÓN DE CARLOS` o `PARCIAL/BLOQUEADA` con motivo.

Completar trabajo independiente antes de solicitar revisión. No integrar sin aprobación de Carlos, no subir secretos y no usar producción para pruebas con efectos persistentes sin autorización. Solo declarar `FASE 10: PRODUCCIÓN` tras aprobación, integración, migraciones y verificación real del entorno.

## 15. Fuera de alcance

Compras/contabilidad de activos, GPS/telemetría, alquiler y cobros, control físico de puertas, inventario consumible avanzado, préstamos entre iglesias, autoasignación de voluntarios, Kids, campañas, nuevos transportes y migración de Alabanza. F10 no inicia F11 automáticamente.
