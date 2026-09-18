# Encargo para Claude — Fase 5 de LEVITA

Preparado para Carlos y Diogo el 17 de septiembre de 2026.
Objetivo: implementar asignaciones, disponibilidad, respuestas, sustituciones y notificaciones sobre las actividades de F4. Ejecutar el trabajo del responsable indicado; no limitarse a entregar un plan y no asumir las tareas de la otra persona.

## 1. Estado real de partida

Repositorio: https://github.com/levita-plataforma/app.git

Estado comprobado el 17 de septiembre de 2026:

- `origin/main`: `667f3ba`, incluye código F4 (PR #2, merge `b3f5add`) y cierre documental (PR #3).
- El informe de F4 registra validación de Carlos sobre `93eb369`, migraciones aplicadas, despliegue y comprobaciones de producción, además de CI con Supabase en verde. Son evidencias registradas por el responsable del cierre, no pruebas ejecutadas por quien preparó este prompt.
- F0–F4 se toman como base cerrada. No volver a implementar F4 ni repetir auditorías completas de fases anteriores.
- `docs/CONTRATO-F4-F5.md` ya está en main, pero sus propuestas para F5 siguen pendientes de acuerdo. El cierre de F4 no aprueba automáticamente las decisiones de F5.
- El contrato conserva una frase antigua que dice que las migraciones F4 no llegaron a remoto. Corregir esa referencia conforme al informe de cierre integrado, sin modificar el estado pendiente de las decisiones de F5.

Hacer fetch al comenzar y partir de `origin/main` actualizado, comprobando que incluye `667f3ba`. Si hay trabajo F5 posterior, inspeccionarlo y reutilizarlo; no sobrescribirlo ni reiniciarlo. Esta referencia no exige retroceder main.

**Modo predeterminado de este encargo: CARLOS**, ya que lo solicita Carlos para su agente. Ejecutar CA-04/CA-05 y la coordinación de contrato correspondiente. El apartado de Diogo describe la dependencia y su encargo independiente; solo se ejecuta en modo DIOGO cuando ese responsable lo indique expresamente.

Este encargo autoriza el desarrollo de la parte indicada en su rama, las pruebas y la preparación de PR. No autoriza integrar en main ni operar producción.
## 2. Lectura obligatoria y dependencias

Leer `AGENTS.md`, `FUNCIONAMIENTO.md` y `docs/REPARTO-CARLOS-DIOGO.md` si están disponibles. Los documentos de coordinación pueden estar solo en una rama documental: este encargo incluye las reglas necesarias y no requiere incorporar cambios ajenos al trabajo.

Leer desde la revisión de F4 que vaya a consumirse:

- `docs/CONTRATO-F4-F5.md`.
- `docs/FASE-4-ACTIVIDADES.md`.
- `docs/adr/0017-actividades-planificacion-fase-4.md`.
- `docs/03-notificaciones.md`, `docs/02-datos-y-rls.md`, `docs/07-decisiones.md` y el roadmap actualizado.
- Migraciones F4, servicios `src/server/activities/`, helpers de `src/lib/activities/`, Serving, tenant y autorización.

Antes de escribir código Next.js, consultar las guías locales de la versión instalada según AGENTS.md.

**Base de trabajo:** F4 ya está integrada y cerrada. Crear la rama de F5 desde origin/main actualizado en un clon o worktree propio. No usar la antigua rama de F4 como base ni modificarla. Conservar los cambios locales ajenos; la documentación de este encargo puede estar sin commit en otra rama.

Diogo puede adelantar disponibilidad y el motor de avisos tras acordar sus contratos, sin afirmar que sus integraciones con asignaciones estén terminadas. Si una dependencia no está disponible, avanzar en lo independiente y señalar el bloqueo; no crear tablas o funciones duplicadas para simular que existe.

## 3. Dos encargos separados

### Mensaje de inicio para el agente de Carlos

> Ejecuta la Fase 5 en modo CARLOS siguiendo este documento. Eres responsable de asignaciones, elegibilidad por actividad, conflictos, cobertura, mis turnos, respuestas y sustituciones. Reutiliza el contrato F4/F5 y coordina sus cambios con Diogo. No implementes en paralelo su motor de disponibilidad o notificaciones. Trabaja en una rama propia y entrega código, pruebas y PR revisable. No integres en main ni modifiques producción sin validación expresa de Carlos.

### Mensaje de inicio para el agente de Diogo

> Ejecuta la Fase 5 en modo DIOGO siguiendo este documento. Eres responsable de disponibilidad, frecuencia, preferencias, avisos persistentes, cola, email/push, recordatorios y escalado. Reutiliza el contrato F4/F5 y consume los eventos de Carlos. No implementes una segunda tabla de asignaciones ni cambies por tu cuenta las transiciones de actividades. Trabaja en una rama propia y entrega código, pruebas y PR revisable. No integres en main ni modifiques producción sin validación expresa de Carlos.

Si no hay otra indicación explícita, ejecutar en modo CARLOS. Para el agente de Diogo, usar el mensaje de inicio DIOGO. Inspeccionar dependencias y preparar la matriz de contrato antes de modificar dominios compartidos. Un agente no se adjudica ambos modos por defecto. No lanzar agentes adicionales ni contactar a terceros por la sola existencia de este reparto.

## 4. Reparto y orden de entrega

| ID | Responsable | Entregable | Depende de |
|---|---|---|---|
| F5-00 | Ambos; Carlos consolida | Contrato final: estados, permisos, disponibilidad, eventos y orden de migraciones. | Contrato existente de F4 y decisiones del apartado 5. |
| DI-01 | Diogo | Disponibilidad y preferencias de frecuencia. | People/tenant y firma acordada. |
| DI-02 | Diogo | Outbox/entrada de eventos, bandeja persistente, cola y preferencias de canal. | F5-00; no depende de crear asignaciones reales. |
| CA-04 | Carlos | Asignaciones, elegibilidad, conflictos y cobertura real. | F4 y contratos de DI-01/DI-02. |
| CA-05 | Carlos | Mis turnos, respuestas y sustituciones. | CA-04. |
| DI-03 | Diogo | Transporte email/push y estado de entrega. | DI-02 y proveedores de prueba definidos. |
| DI-04 | Diogo | Recordatorios, silencio, cambios/cancelaciones y escalado. | DI-03 y eventos reales CA-04/CA-05. |
| CO-03 | Ambos; Carlos valida | Recorrido integral de F5 y regresión de F4. | Todas las entregas anteriores. |

Ramas sugeridas: `feature/carlos-fase-5-asignaciones`, `feature/carlos-fase-5-respuestas`, `feature/diogo-fase-5-disponibilidad`, `feature/diogo-fase-5-motor-avisos` y `feature/diogo-fase-5-canales-recordatorios`. Conservar ramas ya acordadas; no duplicar trabajos existentes.

Las migraciones de disponibilidad y entrada de eventos no deben depender de una tabla de asignaciones aún inexistente si Carlos depende a su vez de ellas. Separar infraestructura neutral de las conexiones posteriores a asignaciones. No aceptar dependencias circulares.

## 5. Contrato: resolver antes del desarrollo dependiente

Revisar las decisiones abiertas del contrato, no tratarlas como aprobadas. Presentar a Carlos y Diogo una propuesta concreta y registrar las respuestas en ese mismo documento, sin mantener versiones contradictorias. No bloquear desarrollo independiente de una decisión pendiente.

| Tema | Propuesta para acordar, no decisión ya aprobada |
|---|---|
| Estados de asignación | `proposed`, `pending`, `accepted`, `declined`, `cancelled`, `substituted`. Diferenciar preparar una propuesta de comunicarla. |
| Cobertura | Conteo confirmado = accepted; conteo previsto = proposed + pending + accepted. Mostrar pendiente por separado. Mantener el contrato público de F4 y documentar qué representa assigned_count. |
| Conflictos | Solapes humanos y frecuencia deseada avisan; credenciales obligatorias y permisos bloquean. Acordar cuándo puede el coordinador continuar y cómo se audita. |
| Respuestas | Definir instante límite, cambios tras aceptar/rechazar, actividad iniciada y retirada concurrente. No inventar una ventana definitiva. |
| Emisión | Outbox en la misma transacción de la mutación; Diogo mantiene su esquema/consumidor, Carlos usa el punto de escritura acordado. |
| Avisos | Destinatarios operativos afectados; no notificar a toda la iglesia por defecto. Definir qué aceptaciones/rechazos avisan y quién recibe escalado sin líder. |
| Horarios | Zona explícita de preferencias con fallback acordado; definir offsets de recordatorio y excepciones urgentes al silencio. |
| Llegada | Si F4 no contiene antelación por puesto, acordar su incorporación compatible antes de basar recordatorios en ella. No suponer una columna existente. |
| Flexible | Tareas sin hora fija no reciben una hora inventada. Definir ventana de elegibilidad, respuestas y recordatorio o declarar la capacidad temporal no aplicable. |
| Publicación | Conservar autoridad de F4 sobre actividad multiárea; no dar activity.publish a un líder por poder gestionar sus asignaciones. |
| Enlaces de respuesta | Primera versión con autenticación, salvo contrato explícito de tokens firmados, caducidad y revocación. |
| Transporte | Reutilizar proveedor configurado; si no existe, acordarlo. Tener variables no autoriza envíos a personas reales. |

Decisiones técnicas rutinarias pueden resolverse con el código y documentarse. Reglas abiertas de producto, permisos y destinatarios requieren acuerdo, no una elección silenciosa del agente.

## 6. Contratos existentes de F4 que hay que conservar

- `activities` usa `starts_at`, `ends_at`, `timezone` y `schedule_kind` (`timed`/`flexible`). Las actividades flexibles pueden tener fechas nulas.
- `activity_positions` contiene puestos por actividad y requisitos propios; un puesto ad-hoc puede no tener `service_position_id`.
- Resolver requisitos mediante `app.activity_position_effective_requirements`. No leer filas desactivadas como requisitos efectivos ni sustituir snapshots por el catálogo mutable.
- `app.activity_accepts_assignments` acepta planned/published y comprueba vigencia temporal cuando aplica. Llamarlo desde servidor/base; no inferir autorización solo porque devuelve true.
- F3 evalúa elegibilidad del puesto de catálogo con now(). F5 debe evaluar el puesto efectivo y la fecha de la actividad. Reutilizar piezas sin afirmar que la función antigua ya cubre este caso.
- `app.position_coverage_status` ya define estados de cobertura; reutilizarlo. `public.activity_position_coverage` devuelve ceros en F4: Carlos sustituye ese recuento por datos reales manteniendo compatibilidad.
- F4 impide escritura directa autenticada en sus tablas; no restaurar grants amplios para facilitar F5. Reutilizar/extender RPC con autorización equivalente.
- La lectura de actividades depende de estado, audiencia y capacidades. Definir cómo una persona asignada accede al mínimo necesario cuando no tendría lectura por audiencia, sin darle notas administrativas ni acceso general a actividades privadas.
- `audit_logs` registra auditoría, no es el bus de notificaciones. F4 no emitía eventos de negocio: hay que conectar explícitamente cambios individuales y de series.
- No cambiar Activity, recurrencia, plantillas o planificación por comodidad de F5 ni reconstruir esos módulos.

## 7. CARLOS — asignaciones y elegibilidad

Implementar esquema, RPC, servicios, interfaz y pruebas del dominio de asignaciones:

1. Vincular asignación a iglesia, actividad, puesto de actividad y persona perteneciente a esa iglesia. Comprobar también que el puesto corresponde a esa actividad: varias FK independientes por tenant no garantizan esa relación.
2. Una asignación vigente por puesto/persona; duplicados e intentos concurrentes se resuelven en base de datos. Conservar historia, actor, timestamps, respuesta y relación de sustitución.
3. Evaluar requisitos efectivos, nivel, cualificaciones, credenciales en la fecha/ventana acordada, pertenencia y campus. No exponer documentos o motivos sensibles al coordinador sin permiso.
4. Revalidar al cambiar persona, puesto, requisitos o fecha; una credencial válida hoy no basta si caduca antes del servicio. Los cambios de F4 deben dejar las asignaciones afectadas en un estado verificable, no ignorar el problema.
5. Consultar la disponibilidad de Diogo y otras asignaciones mediante el contrato. Usar rangos semiabiertos [inicio, fin): terminar a las 11:00 y empezar a las 11:00 no se solapa salvo un margen explícito acordado.
6. Mostrar todos los conflictos relevantes; distinguir aviso y bloqueo. No filtrar por frontend como único control. No consultar ni revelar calendarios de otras iglesias sin una política explícita de consentimiento.
7. Aplicar las reglas de composición acordadas, mínimos/máximos y persona autónoma. Distinguir estructura publicable de cobertura de personas: F4 puede haber publicado una actividad todavía vacía.
8. Actualizar listas, ficha/Equipo, cobertura y dashboard con conteos reales. Diferenciar «confirmados», «pendientes» y «sin cubrir»; probar mínimo cero y máximo nulo.
9. Una persona sin cuenta puede ser asignable según reglas del directorio; no inventar una cuenta o confirmación. Definir la gestión autorizada de respuestas por representante y auditarla si se aprueba; si no, mostrar la limitación.

No reutilizar tablas globales de personas como si tuvieran church_id: validar pertenencia mediante church_people. Todas las relaciones de actividad/puesto/asignación deben ser tenant-safe.

## 8. CARLOS — respuestas, sustituciones y cambios

- Implementar Mis turnos y detalle móvil reutilizando navegación/diseño de la app. Proponer rutas según las existentes; no crear una segunda aplicación.
- La persona solo acepta/rechaza su asignación dentro de la ventana acordada. La nota es opcional y privada según contrato; nunca aparece automáticamente en push/email.
- Modelar y probar cada transición permitida; el cliente no decide el estado final. Una respuesta repetida no genera otro aviso lógico. Un error revierte la UI optimista y mantiene información clara.
- Proteger respuestas frente a cancelación, retirada, sustitución o reprogramación concurrentes mediante transacción y versión/estado comprobado.
- Una sustitución tiene solicitud/propuesta, aceptación y aprobación cuando corresponda. Revalidar al candidato; el original no desaparece antes del punto acordado. Dos candidatos no sustituyen simultáneamente la misma asignación.
- Acordar qué cambios de hora invalidan una aceptación o requieren nueva respuesta. Conservar trazabilidad; no mantener silenciosamente una confirmación de una hora diferente si la regla exige reconfirmar.
- Conectar cancelación, despublicación, archivado y cambios de serie de F4: cada ocurrencia afectada actualiza asignaciones y avisos coherentemente, también cuando desaparece una ocurrencia futura.
- Copiar estructura no debe copiar personas por defecto. «Duplicar programación» solo si se acuerda expresamente, con nuevos IDs y nueva validación, sin arrastrar aceptaciones.
- Si hay enlaces firmados, nunca mutar con GET: mostrar confirmación y ejecutar una acción protegida. Vincular token a iglesia, asignación, destinatario y versión; probar alteración, expiración, replay y revocación.

## 9. DIOGO — disponibilidad y frecuencia

- CRUD de periodos por persona/iglesia, con inicio/fin, zona IANA y tratamiento explícito de días completos.
- Resolver límites de días en hora local y almacenarlos como instantes; un día con cambio de hora no siempre dura 24 horas.
- Detectar solapes y ofrecer fusión cuando proceda. Proteger también escrituras concurrentes en base de datos; no borrar ni fusionar silenciosamente notas ajenas.
- Motivo opcional: el contrato propone que solo lo lea su autor; quien asigna ve únicamente no disponible. No ampliar acceso sin decisión registrada.
- Usar la firma acordada basada en `app.person_unavailability` y `app.person_serving_preferences`; ajustar nombres solo de forma coordinada.
- Limitar consultas masivas por permiso, scope y rango. Que alguien asigne en un área no debe darle acceso a la disponibilidad de cualquier persona de la iglesia.
- Frecuencia por periodo y, si se aprueba, por área. Definir si se cuentan actividades o puestos: servir en dos puestos de la misma actividad no debe computar dos participaciones sin una regla expresa.
- Permitir a la persona gestionar sus preferencias; operaciones administrativas requieren capacidad y auditoría propias.

## 10. DIOGO — outbox, bandeja y canales

- Definir un único contrato de entrada compartido: event_id, versión de entidad, tenant, tipo, entidad, destinatarios autorizados, instante UTC, correlation_id y payload mínimo.
- Escribir el evento de forma atómica con la mutación de dominio. La entrega externa ocurre fuera de esa transacción y nunca impide guardar una respuesta.
- No usar solo la nueva fecha como clave de deduplicación: mover A→B→A debe producir dos cambios legítimos. Una versión monotónica o ID estable de transición distingue cambios de reintentos.
- Persistir notificación interna antes del transporte. Deduplicar por evento/destinatario y por entrega/canal, sin suprimir eventos diferentes del mismo usuario.
- Implementar reclamación concurrente, leases/recuperación de trabajos abandonados, reintentos con backoff, límite de intentos y estado fallido revisable. No prometer exactly-once externo si el proveedor no ofrece idempotencia; documentar cómo se reduce el duplicado tras un resultado incierto.
- El worker vuelve a verificar estado, versión, destinatario y permisos antes de enviar. Invalidar recordatorios antiguos al cambiar fecha, respuesta o cancelación.
- Bandeja propia con leído/no leído y enlace autorizado. No permitir enumerar mensajes de otros destinatarios o tenants.
- Email: plantillas operativas, enlace a la actividad/turno autorizado, estado de envío y fallo; definir respaldo cuando push no esté disponible conforme a preferencias.
- Push por dispositivo: suscripción iniciada por gesto del usuario, guías de instalación cuando sean necesarias, endpoints caducados desactivados y revocación al retirar acceso. Inspeccionar manifest/service worker reales; una shell responsive no equivale a PWA instalada.
- No exponer claves privadas de push, service-role ni proveedor. Limitar endpoints de suscripción y worker; llamadas de terceros no pueden escoger libremente church_id o destinatarios.
- Usar cuentas y destinatarios sintéticos de prueba. No enviar pruebas a usuarios reales.

## 11. DIOGO — recordatorios y escalado

- Calcular avisos desde la hora de llegada si existe y está acordada; en otro caso usar el contrato temporal explícito, no un campo supuesto.
- Configurar offsets, zona de silencio, fallback y urgencia según el acuerdo; no copiar horarios históricos como decisión nueva.
- Si el aviso cae en silencio, reprogramarlo sin perderlo. Definir qué hacer si al terminar el silencio ya no tiene utilidad.
- Programar ejecución del worker en el entorno autorizado. Un worker escrito sin mecanismo de ejecución probado no cierra la tarea.
- Cambio de hora/cancelación retira trabajos obsoletos y crea los nuevos que correspondan. Aplicar también cambios por series.
- Rechazo o retirada en puesto crítico: evaluar cobertura real y responsables antes de escalar; no avisar por un hueco ya cubierto ni a quien acaba de rechazar por el mero hecho de ser líder.
- Frecuencia y severidad del escalado, plazos y fallback de destinatario deben estar acordados. No existe un envío periódico a toda la iglesia por defecto.
- Observabilidad mínima: pendientes vencidos, intentos, fallos, latencia y correlación, sin notas privadas ni secretos en logs.

## 12. Permisos, auditoría y migraciones

- Capabilities específicas para gestionar asignaciones, responder las propias, consultar disponibilidad operativa, gestionar preferencias y operar el worker. Reutilizar scopes church/campus/service_area/activity sin conceder permisos globales innecesarios.
- Roles y permisos se resuelven en servidor y base. Probar usuarios de la misma iglesia con ámbitos distintos, además de dos iglesias diferentes.
- Nuevas tablas tenant-aware con RLS y FORCE RLS, grants mínimos, índices y FK compuestas. Revisar funciones security definer, search_path, execute y actor real.
- Actualizar la suite de cobertura RLS. Cambios en policies no deben dejar otra policy permisiva que mantenga el acceso antiguo.
- Auditar creación/retirada/respuesta/sustitución, cambios de disponibilidad administrativos y acciones operativas sensibles, evitando texto privado innecesario.
- Migraciones nuevas, no reescribir las de F4. Los prefijos 20260921…/20260922… del contrato son propuestas: confirmar que siguen libres y ordenar por dependencias reales.
- Carlos coordina autorización, navegación y tipos compartidos; Diogo mantiene su dominio. Regenerar tipos desde el esquema combinado, no editar el generado a mano.
- Validar tanto base limpia como actualización desde F4 con datos sintéticos. Preparar compatibilidad de despliegue y recuperación; revertir Git no revierte una migración.

## 13. Pruebas mínimas de aceptación

| Área | Casos que deben cubrirse |
|---|---|
| Asignación | Crear, duplicado/reintento, mismo puesto en otra actividad, persona de otra iglesia, puesto ad-hoc, actividad cancelada/completada/archivada. |
| Elegibilidad | Snapshot/override, requisitos desactivados, credencial válida hoy pero caducada en la actividad, cambio de fecha, campus incompatible y persona inactiva. |
| Conflictos | Solape real, rangos adyacentes, disponibilidad, frecuencia, cambio concurrente y permisos sobre el detalle del conflicto. |
| Cobertura | Pending frente a accepted, rechazo/retirada/sustitución, mínimo cero, máximo nulo, composición y actualización concurrente. |
| Respuestas | Solo destinatario, expiración, doble click/replay, cambio permitido/prohibido, cancelación concurrente y nota privada. |
| Sustitución | Elegibilidad de reemplazo, aprobación, aceptación simultánea por dos candidatos y conservación de historial. |
| Disponibilidad | Crear/editar/borrar, fusión explícita, límites de día local, DST y consulta por scope sin revelar motivo. |
| Eventos | Rollback no emite, reintento no duplica, A→B→A sí avisa de ambos cambios y serie actualiza cada ocurrencia correcta. |
| Worker | Dos consumidores, caída tras envío, lease vencido, backoff, trabajo inválido, fallo del proveedor y cola recuperable. |
| Avisos | Persistencia aunque falle canal, email de respaldo, push revocado, silencio/DST, recordatorios obsoletos y aislamiento de bandeja. |
| Integración | Actividad → puesto → asignación → aviso → aceptación/rechazo → cobertura → sustitución/cancelación. |
| UI | Móvil/escritorio, teclado, carga/vacío/error, permiso denegado y recuperación de UI optimista. |

Ejecutar los comandos existentes en la revisión de trabajo: `npm run lint`, `npm run typecheck`, `npm run build`, `supabase test db` y revisión de `supabase db diff --local`, iniciando Supabase local cuando proceda. En el package.json de referencia no existe npm test: si se añade un runner necesario, documentar el comando e integrarlo en CI.

Mantener las suites anteriores; no repetir auditorías históricas completas. Si Docker, credenciales de prueba o dispositivos no están disponibles, declarar qué falta. Un arnés alternativo o transporte simulado no acredita pruebas reales de Supabase/proveedor/dispositivo.

## 14. Flujo de entrega y límite de autorización

Trabajar en rama propia y conservar cambios ajenos. Hacer commits de la tarea, push de su rama y PR revisable cuando se entregue. Preparar Preview con base de pruebas aislada si existe configuración; documentar los bloqueos si no existe.

**Detenerse antes de integrar en main: Carlos debe validar expresamente el commit concreto.** No hacer push directo, merge, squash ni auto-merge sin esa validación. Ni Diogo ni un agente pueden darla en su nombre. Si cambia la versión, volver a validar.

Las variables de Carlos se usan desde .env.local o el gestor del entorno y nunca se imprimen. Tener acceso no autoriza aplicar migraciones o activar envíos/jobs en producción. Preparar el plan concreto de entrega y ejecutar producción solo tras su autorización correspondiente.

No desarrollar F6–F13, campañas masivas, autoasignación/rotación avanzada, WhatsApp/SMS, pagos ni migración de Alabanza. No completar funciones ausentes de F4 dentro de F5 sin identificar la dependencia y coordinar el cambio.

## 15. Criterios de cierre e informe

Una parte puede estar lista para Carlos aunque la otra siga en curso. **La Fase 5 completa solo se cierra tras CO-03**, con sus dependencias integradas, pruebas pasadas y limitaciones resueltas. No ocultar una falta de pruebas detrás de «implementado».

Informar con uno de estos estados:

- `F5-CARLOS: LISTA PARA VALIDACIÓN DE CARLOS`.
- `F5-DIOGO: LISTA PARA VALIDACIÓN DE CARLOS`.
- `FASE 5: PARCIAL — dependencia o comprobación pendiente`.
- `FASE 5: LISTA PARA VALIDACIÓN CONJUNTA` cuando ambas partes estén conectadas y probadas.
- `FASE 5: PRODUCCIÓN` únicamente después de aprobación, integración, migraciones y verificación real del entorno.

El informe incluye: responsable y alcance, base F4 utilizada, decisiones acordadas, archivos/migraciones, contratos entregados/consumidos, pruebas y resultados, pendientes, rama/commit/PR, Preview cuando exista, pasos de prueba para Carlos, plan de recuperación y estado exacto de main/producción.

No iniciar la Fase 6 automáticamente.
