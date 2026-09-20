# Encargo para Claude — Fase 7: Grupos y discipulado

Preparado el 18 de septiembre de 2026. **Responsable: Carlos.**
Repositorio: https://github.com/levita-plataforma/app.git

## 1. Instrucción de ejecución

Implementa F7 completa en el alcance definido aquí: grupos, participantes, reuniones, asistencia, comunicación interna de grupo, cursos, cohortes, sesiones, itinerarios y progreso. Entrega implementación, migraciones, pruebas y una PR revisable; no te limites a proponer un plan.

Trabaja en `feature/carlos-fase-7-grupos-discipulado`, desde `origin/main` actualizado, en un clon o worktree propio. Si esa rama existe, inspecciona su estado y responsable antes de continuar, sin sobrescribir trabajo ajeno. Los arreglos independientes de fases previas van en ramas `hotfix/` separadas cuando proceda.

**No hacer commits directos ni integrar en main sin validación expresa de Carlos del commit concreto.** Puedes crear commits, subir tu rama y abrir una PR. No activar auto-merge. Si añades cambios después de la validación, hay que validar la nueva versión.

F8 está propuesta para Diogo y puede avanzar en paralelo: este encargo no implementa Kids ni modifica sus reglas. No contactar a Diogo ni iniciar otros agentes por la sola existencia del reparto; documenta las dependencias y los puntos que Carlos deba coordinar.

## 2. Estado de partida y lecturas

Al preparar este encargo, la base remota consultada estaba en `bde4076`. Es una referencia, no una orden de retroceder: hacer fetch y revisar avances antes de empezar.

- Carlos comunica F4 y F5 terminadas; Diogo hizo F6. Reutilizar sus implementaciones, sin reabrir auditorías completas ni reconstruir dominios.
- `/app/grupos` y `/app/discipulado` son placeholders en la revisión inspeccionada.
- People es identidad común; una persona puede no tener cuenta. Su pertenencia a iglesia vive en `church_people`.
- Activity proporciona fechas, zonas, estados, recurrencia y calendario.
- F6 implementa Events como extensión de Activity, formularios e inscripciones. Una reunión de grupo no debe necesitar una inscripción pública de evento para existir.
- F5 proporciona outbox, avisos internos y cola. `docs/FASE-5-AVISOS-DISPONIBILIDAD.md` documenta **email y push desactivados**. No habilitarlos ni anunciar envíos externos como parte de F7.

Leer `AGENTS.md`, `CLAUDE.md`, `FUNCIONAMIENTO.md`, `docs/REPARTO-CARLOS-DIOGO.md`, `docs/modulos/02-grupos-discipulado.md`, roadmap, decisiones, núcleo, datos/RLS y documentos F4–F6 aplicables. Consultar ADR 0002, 0004, 0005, 0015, 0016, 0017 y 0018.

Antes de escribir código Next.js, leer las guías relevantes de la versión instalada según AGENTS.md. Comprobar esquema, RPC, capacidades, módulos, rutas y pruebas reales: una descripción histórica no sustituye al código.

## 3. Resultado esperado

Una iglesia puede crear grupos, nombrar líderes, incorporar personas existentes, tramitar solicitudes, preparar reuniones y registrar asistencia. También puede definir cursos, ofrecerlos a cohortes, organizar sesiones e inscribir personas; asignar itinerarios y registrar su progreso sin duplicar sus fichas.

Un líder ve solo la información necesaria de sus grupos. Un responsable de formación accede a sus cohortes e itinerarios autorizados. Un participante consulta su información permitida y solicita incorporarse donde corresponda. Cambiar de iglesia o manipular un ID no permite acceder a datos de otro ámbito.

Grupos y discipulado forman una fase, pero se desarrollan en entregas separadas que comparten identidad, actividades y permisos. No convertir un grupo en un área de Serving, ni una cohorte en una copia de People.

## 4. Contrato y decisiones previas acotadas

Preparar `docs/CONTRATO-FASE-7.md` con entidades, relaciones, capacidades, audiencia, transiciones, eventos y dependencias de F4–F6. Resolver elecciones técnicas rutinarias con el patrón existente. Consultar a Carlos solo las reglas de producto o privacidad que sigan abiertas; continuar entretanto con trabajo independiente.

Propuestas para acordar antes de sus operaciones dependientes:

| Tema | Propuesta explícita, no aprobación previa |
|---|---|
| Visibilidad de grupos | Directorio interno de grupos visibles para miembros; grupos privados solo para responsables/participantes autorizados. No publicar listados, ubicaciones o participantes en la web anónima. |
| Solicitudes | Una solicitud activa por persona/grupo; aprobación manual por responsable. Aforo controla participantes activos; no añadir lista de espera compleja sin necesidad acordada. |
| Participación y liderazgo | Modelos relacionados pero distintos; definir si un líder cuenta para aforo y qué sucede al retirar al último líder. |
| Autoinscripción a formación | Confirmar si se permite solicitar plaza o solo inscribe un responsable. Reutilizar conceptos, no forzar el flujo público de F6. |
| Finalización | Definir si la determina un responsable, asistencia mínima u otros requisitos. No inventar umbrales ni asumir que asistir implica completar. |
| Progreso histórico | Proponer conservar lo conseguido al modificar un itinerario; nuevas revisiones no alteran silenciosamente resultados históricos. |
| Comunicación | Avisos internos para participantes autorizados; confirmar emisores, destinatarios y tipos automáticos. Sin campañas ni envíos externos. |
| Datos personales | Contactos y ubicación privada según necesidad y permiso; no heredar acceso a teléfonos/notas por poder ver el nombre. |

No iniciar funciones sensibles dependientes de una decisión pendiente. Registrar la decisión final y sus pruebas; no guardar una alternativa como si ya estuviera aprobada.

## 5. Modelo de datos y reutilización

Revisar si ya existen estas entidades y ampliar solo lo necesario. Nombres conceptuales del catálogo:

- Groups: `groups`, `group_types`, `group_members`, `group_leaders`, `group_meetings`, `group_attendance`, `group_join_requests`.
- Discipleship: `courses`, `course_cohorts`, `course_sessions`, `course_enrollments`, `learning_paths`, `path_steps`, `person_path_progress`.
- Añadir asistencia a sesiones/progreso por paso solo donde haga falta; no duplicar tablas con el mismo significado.

Requisitos comunes:

1. Datos tenant-aware con `church_id`, IDs, timestamps, actor y archivado donde corresponda. FK compuestas que impidan relaciones entre iglesias.
2. Campus opcional dentro del tenant; definir compatibilidad entre grupo/cohorte, reunión/sesión y Activity. Campus no es otra iglesia.
3. Referenciar personas mediante pertenencia válida. No añadir una segunda identidad ni una FK a `people(church_id, id)`, que no existe.
4. Unicidad de pertenencia vigente, solicitud activa y asistencia por persona/reunión o sesión. Controlar también carreras concurrentes en base de datos.
5. Archivar preserva relaciones e historial. Retirar a alguien no borra asistencias antiguas ni le mantiene acceso actual por haber participado antes.
6. Las relaciones deben validar el padre exacto: una sesión de otra cohorte de la misma iglesia no se admite por compartir tenant.
7. Estados/transiciones centralizados y comprobados en servidor/base; no strings dispersos ni confianza en un estado enviado por cliente.

Mantener una raíz Activity por reunión o sesión con horario. Las extensiones guardan dominio de grupo/formación y referencian Activity; no copiar su motor de recurrencia, timestamps o estados. Reutilizar la serie existente si encaja y definir la asociación de cada ocurrencia. Evitar filas huérfanas si falla una operación compuesta.

La visibilidad de Activity requiere atención: una actividad del calendario no puede revelar título, ubicación o participantes de un grupo privado. El acceso mínimo para participantes se implementa explícitamente y no concede notas administrativas. Probar tanto la ruta del módulo como Activity y calendario.

## 6. Groups: catálogo, miembros y líderes

Implementar listado paginado y filtros por tipo, campus, estado y pertenencia; crear, editar, archivar y reactivar donde las reglas lo permitan.

Datos: nombre, descripción, tipo configurable, campus, ubicación, capacidad opcional, periodicidad descriptiva, líderes, estado y visibilidad. Tipos iniciales, si se usan, son datos editables por iglesia; no categorías globales impuestas por código.

- Añadir participantes existentes, retirarlos y conservar historial con fechas.
- Nombrar/retirar líderes mediante capacidad específica, sin permitir que un líder se autoeleve a administrador.
- No obligar a una persona a tener login para figurar como participante.
- No mostrar al líder el directorio completo para seleccionar personas. Diseñar búsqueda de candidatos con datos mínimos y autorización explícita; evitar enumeración masiva.
- Validar aforo de forma transaccional al añadir o aceptar solicitudes. Dos aprobaciones simultáneas no deben exceder el aforo si es un límite estricto acordado.
- Gestionar bajas/archivado de persona, iglesia, grupo y módulo de forma coherente, preservando historial.

## 7. Groups: solicitudes, reuniones y asistencia

Solicitudes: crear propia, consultar estado propio, cancelar si procede; responsable autorizado acepta o rechaza. La persona objetivo se resuelve en servidor, no por un person_id libre del cliente. Aceptar repetidamente no duplica pertenencia ni avisos. Definir si una solicitud previa puede reabrirse y cómo queda su historia.

Reuniones:

- Puntuales o recurrentes sobre Activity, con campus/ubicación y zona IANA.
- Editar/reprogramar/cancelar respetando recurrencias y excepciones existentes.
- Impedir que regenerar una serie borre reuniones con asistencia; conservar o reconciliar explícitamente el histórico.
- Un cambio de hora no crea dos reuniones equivalentes ni duplica avisos.

Asistencia:

- Lista de participantes y estados claros, por ejemplo presente/ausente/justificado si se aprueban; «sin registrar» no cuenta como ausente automáticamente.
- Registro y corrección por responsables autorizados, con auditoría.
- Registrar a participantes que ya salieron mediante el roster histórico adecuado cuando se corrige una reunión pasada; no limitar todo al roster actual.
- Visitantes solo mediante una regla explícita de People, nunca texto libre que cree otra identidad personal.
- No guardar motivos médicos o notas pastorales en campos de asistencia genéricos.

## 8. Discipleship: cursos, cohortes y sesiones

Separar definición del curso, edición concreta (cohorte), sesiones e inscripciones. Un curso puede reutilizarse sin duplicar personas o destruir el historial de cohortes anteriores.

- CRUD/archivo de cursos con título, descripción, estado y material/enlaces permitidos.
- Cohortes con curso, campus, responsables, fechas/estado y capacidad si se acuerda.
- Inscribir personas, retirar/concluir su participación con historia y validación concurrente del aforo.
- Sesiones sobre Activity; orden, fechas y asistencia con permisos acotados.
- Reutilizar archivos/storage solo si la infraestructura necesaria funciona. No montar uploads inseguros ni prometer almacenamiento si solo hay enlaces.
- Una persona puede pertenecer a grupos y a cohortes a la vez sin crear fichas duplicadas.
- Definir cómo una revisión del curso afecta a cohortes activas y terminadas: no cambiar silenciosamente los requisitos históricos de finalización.

## 9. Itinerarios y progreso

- Crear itinerarios con pasos ordenados vinculados a cursos u objetivos definidos; responsables y estado.
- Asignar un itinerario a una persona existente con actor y fecha.
- Registrar estados de progreso, fechas y evidencia mínima; acceso propio y de responsables según scope.
- Si hay prerrequisitos, impedir referencias inválidas o ciclos. No introducir un motor de reglas complejo sin necesidad.
- Distinguir asistencia, curso terminado y paso validado. Completar una sesión no completa automáticamente un itinerario.
- Hacer idempotente el reconocimiento de un curso finalizado en un paso; una corrección debe quedar trazada y recalcular el resultado según la regla acordada.
- Acordar si la finalización de un curso cuenta para varios itinerarios; no copiar progreso por coincidencia de título.
- Versionar o conservar snapshot del itinerario asignado cuando sus pasos cambien, con una actualización explícita si se quiere migrar participantes activos.
- Mostrar progreso real y explicar qué falta, sin porcentajes inventados ni división por cero en itinerarios vacíos.

## 10. Comunicación e integración con F5/F6

Reutilizar `notification_events`, los servicios de notificaciones, preferencias y runner existentes, comprobando sus firmas reales. No crear otro outbox ni activar transportes externos.

- Emisión transaccional con la acción de dominio y deduplicación por evento/transición/destinatario.
- Posibles eventos a acordar: solicitud recibida/resuelta, incorporación, cambio/cancelación de reunión o sesión y actualización de progreso relevante.
- Permitir comunicación interna a un grupo por quien tenga permiso, con texto acotado y sin exponer datos de otros participantes. No implementar segmentación masiva F9.
- Reevaluar pertenencia y permiso al procesar entregas pendientes; alguien retirado no recibe novedades privadas futuras por una audiencia obsoleta.
- Extender `notificationTarget` con destinos autorizados de grupos/cohortes, manteniendo enlaces F5/F6. Una notificación no concede acceso por sí misma.
- Mostrar «aviso en la aplicación» donde corresponda. Email/push desactivados no pueden mostrarse como «enviados».
- Preservar funciones públicas de eventos F6: no extender grants de anon a grupos, formación o listados personales.

## 11. UI/UX y rutas

Sustituir los placeholders y reutilizar shell, componentes, estilos y referencia visual vigente de LEVITA. Rutas orientativas, ajustables a convenciones existentes:

- `/app/grupos`, `/app/grupos/nuevo`, `/app/grupos/[id]`.
- Reuniones, participantes, solicitudes y asistencia dentro de la ficha del grupo.
- `/app/discipulado`, catálogo de cursos, cohortes, sesiones e itinerarios con fichas propias.
- Vistas «Mis grupos» y «Mi formación» dentro del módulo para participantes, sin crear otra aplicación.

Cada pantalla contempla carga, vacío, error, permiso denegado y módulo desactivado; formularios accesibles, foco y teclado; confirmación de acciones de impacto y recuperación ante errores. Mobile first sin tablas imposibles de usar.

Dashboard con grupos activos, solicitudes pendientes, asistencia y progreso según autorización. Definir denominadores y periodo de métricas; cancelados/no registrados no equivalen a ausentes. Consultas paginadas y por rango; no cargar todo el tenant en cliente.

## 12. Seguridad y pruebas de datos

Identificar los module keys reales de Groups/Discipleship y aplicar entitlements y permisos en servidor/base. No asumir que un rol global autoriza ver toda formación o todos los grupos privados.

Definir capacidades granulares para catálogo, líderes, miembros, solicitudes, reuniones/asistencia, cohortes y progreso. El scope group ya aparece en el núcleo: revisar su validación y resolución. Para cohortes/itinerarios, diseñar una relación de responsable segura o scope explícito; no insertar IDs polimórficos sin comprobar tipo y tenant.

Tablas nuevas tenant-aware con RLS activo/forzado, grants mínimos, FK tenant-safe y cobertura automática. RPC de escritura autorizadas y atómicas. Revisar search_path/execute de security definer y no usar service-role en peticiones de usuario para eludir permisos.

Pruebas obligatorias: usuario anónimo, miembro ordinario, líder de otro grupo de la misma iglesia, responsable de otra cohorte, usuario en varias iglesias, pertenencia retirada y tenant distinto. Probar acceso directo por SQL/RPC, no solo controles UI. Proteger contactos, ubicación privada, notas y progreso también en consultas agregadas y avisos.

## 13. Migraciones, coordinación y entregas

Añadir migraciones nuevas con nombres únicos posteriores a las dependencias reales; el repositorio ya tiene prefijos hasta `20260925000500` en la referencia inspeccionada. No basarse solo en la fecha actual ni reescribir migraciones aplicadas. Revisar cambios de Diogo antes de reservar prefijos.

Carlos coordina tipos generados, navegación, tenant y autorización; no incorporar archivos ajenos mediante git add global. Usar los contratos existentes y un ADR nuevo si una decisión arquitectónica lo requiere, sin sobrescribir el ADR 0018 de F6.

Orden propuesto:

1. Contrato, esquema, módulos/permisos y tests de aislamiento.
2. Grupos, miembros, líderes y solicitudes.
3. Reuniones, asistencia y avisos internos.
4. Cursos, cohortes y sesiones.
5. Itinerarios, progreso, métricas y validación integral.

Cada entrega debe dejar una versión coherente. Coordinar cambios compartidos con el trabajo de Diogo en F8; F7 no necesita esperar a que Kids esté terminado.

## 14. Validaciones mínimas

| Dominio | Casos requeridos |
|---|---|
| Grupos | Crear/editar/archivar/restaurar, tipos por tenant, campus válido, grupo privado y módulo desactivado. |
| Participación | Alta/retiro/reincorporación, persona sin cuenta, duplicado, aforo concurrente y persona de otra iglesia. |
| Liderazgo | Scope de grupo, líder retirado, intento de autoescalada y consultas de candidatos limitadas. |
| Solicitudes | Propia/ajena, aceptación/rechazo/cancelación, doble aprobación y aforo agotado. |
| Reuniones | Puntual/serie, DST, cambio/cancelación, excepción y preservación de asistencia histórica. |
| Asistencia | Una fila por persona y reunión, roster histórico, corrección auditada, sin registrar frente a ausente. |
| Cursos/cohortes | Reutilización de curso, inscripción y aforo, responsables por cohorte, sesión ajena y conservación de histórico. |
| Progreso | Orden/prerrequisitos, ciclo rechazado si aplica, finalización/corrección, reintento y versión de itinerario. |
| Avisos | Rollback no emite, reintento no duplica, retirada revoca entrega privada y enlaces no conceden permisos. |
| Integración | Mis grupos/mi formación, calendario privado, People no duplicado y ausencia de regresión en eventos/avisos. |
| Seguridad | Cruces entre iglesias y entre grupos/cohortes de la misma iglesia, acceso directo y agregados. |
| Interfaz | Móvil/escritorio, teclado, vacíos/errores, recuperación y datos reales. |

Ejecutar comandos del package.json de la revisión usada. En la base inspeccionada: `npm run lint`, `npm run typecheck`, `npm run build`; no existe npm test. Ejecutar Supabase local, `supabase test db` y comprobar `supabase db diff --local`. Añadir pruebas de dominio con un runner solo si es necesario y documentar su comando.

Conservar suites anteriores y ejecutar CI sobre la versión de la PR. Probar base limpia y actualización con datos sintéticos. No presentar mocks, un arnés alternativo o pruebas no ejecutadas como validación de Supabase real.

## 15. Entrega, revisión y producción

Crear commits de trabajo en la rama, push y PR con alcance, dependencias, evidencia y pasos de prueba. Preparar Preview con base de pruebas aislada cuando esté disponible. Guardar secretos en .env.local/gestor del entorno, nunca en documentación, Git o logs.

Antes de pedir validación a Carlos, completar todo el desarrollo y pruebas que no dependan de decisiones o accesos pendientes. Presentar el commit concreto, pantallas y pasos para verificarlo.

**Esperar validación de Carlos antes de integrar en main.** La aprobación de fases anteriores o de este encargo no valida automáticamente el código nuevo. Preparar lista de migraciones, compatibilidad y recuperación; aplicar en producción solo con autorización del despliegue correspondiente. No sembrar datos sintéticos ni enviar pruebas a usuarios reales en producción.

## 16. Cierre e informe

F7 está lista para revisión cuando Groups y Discipleship cumplen sus flujos, personas no se duplican, histórico se conserva, ámbitos y datos privados están protegidos, avisos internos funcionan, pruebas pasan y se han documentado contratos y limitaciones.

Actualizar `docs/FASE-7-GRUPOS-DISCIPULADO.md`, catálogo del módulo, roadmap, índice y decisiones afectadas. Diferenciar implementado, probado, integrado y desplegado.

Informe final:

- Estado: `FASE 7: LISTA PARA VALIDACIÓN DE CARLOS`, o `PARCIAL/BLOQUEADA` con motivo concreto.
- Funcionalidades, decisiones, migraciones, tablas y capacidades.
- Contratos reutilizados y cambios compartidos con F4–F6/F8.
- Pruebas ejecutadas/resultados y pendientes.
- Rama, commit, PR y Preview si existe.
- Pasos de prueba para Carlos, limitaciones y plan de recuperación.
- Estado exacto de main y producción.

Solo informar `FASE 7: PRODUCCIÓN` tras aprobación, integración, migraciones y comprobación real del despliegue. No iniciar F8, F9 o F10 automáticamente.

## 17. Fuera de alcance

Kids/check-in infantil, autorizaciones de recogida, notas pastorales, donaciones, campañas masivas, transportes email/push nuevos, pagos de cursos, certificados oficiales, exámenes/LMS completo, videoconferencia, migración de Alabanza y reconstrucción de F4–F6. Si se detecta un fallo previo que bloquea F7, describirlo y corregirlo con alcance acotado y revisión propia, sin convertirlo en una reimplementación de la fase anterior.
