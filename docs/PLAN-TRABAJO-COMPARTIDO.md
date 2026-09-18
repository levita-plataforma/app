# Plan de trabajo compartido — dos personas

> Actualización 18/09/2026: Carlos terminó F4/F5 y continuará con F7; Diogo terminó F6 y tiene F8 propuesta. Este plan inicial es histórico. Reparto actualizado por nombres: [Carlos y Diogo](REPARTO-CARLOS-DIOGO.md). Ese documento sustituye las asignaciones A/B y el reparto de F4/F5 de esta propuesta inicial.

Propuesta del 16 de septiembre de 2026 sobre el checkout `e5679ca`.
Estado: **pendiente de validación del propietario**. Identifica a Carlos y Diogo, sin asignar todavía responsables por bloque ni fechas comprometidas y no sustituye el [roadmap](13-plan-por-fases.md).

## 1. Reparto recomendado

Organizar el trabajo por entregables que puedan integrarse, no repartir fases pares e impares. Las fases 4 y 5 comparten asignaciones, estados y notificaciones: desarrollarlas sin un contrato común provocaría retrabajo.

El equipo está formado por **Carlos** (propietario y validador final) y **Diogo** (colaborador). Usamos **Persona A** y **Persona B** como puestos pendientes de reparto entre ambos; no presuponen responsabilidades aceptadas. Cada responsable entrega datos, servicios, interfaz y pruebas de su tarea cuando proceda; no se crea una separación permanente de «una persona hace backend y otra frontend».

Trabajar juntos significa acordar el contrato, revisar y probar la integración. Un único responsable modifica cada archivo compartido dentro de una tarea. Cada persona conserva su rama y su propio clon o worktree.

## 2. Punto de partida que hay que validar

| Fase | Evidencia en el repositorio | Acción antes de darla por cerrada |
|---|---|---|
| F0 | Núcleo, ADR, RLS, shell y CI; cierre documental existente. | Reejecutar comprobaciones del checkout y reconciliar documentación con el entorno real. |
| F1 | Registro, onboarding, alta asistida, sedes y suscripción tienen código. | Verificar el recorrido completo, multiiglesia, permisos, reintentos y alcance real de billing. |
| F2 | Personas, familias, invitación, etiquetas, campos e importación/exportación tienen código. | Contrastar cada criterio: formatos admitidos, duplicados, privacidad e historial. |
| F3 | Áreas, equipos, puestos, cualificaciones y credenciales tienen código y pruebas SQL. | Verificar ámbitos de líder, elegibilidad, caducidades, composición y aislamiento. |
| F4–F5 | Hay una raíz de actividades y bases transversales. Eso no acredita programación y notificaciones completas. | Definir contratos y ejecutar el plan incremental siguiente. |
| F6–F12 | Varias rutas muestran placeholders. | Mantener en backlog hasta sus dependencias y validación de producto. |
| F13 | Parte de las prácticas está en CI y en el núcleo. | Seguridad, accesibilidad, observabilidad y recuperación acompañan cada entrega; reservar también una revisión final. |

La inspección de esta propuesta es estática: no se han ejecutado la app, las suites SQL ni comprobaciones remotas. La primera tanda establece el estado probado; no rehacer automáticamente F1–F3.

## 3. Mapa de dependencias

| Bloque | Dependencias necesarias para cerrar el bloque | Trabajo que puede adelantarse |
|---|---|---|
| F1 · Alta y tenant | F0 y decisiones comerciales para cerrar billing. | Revisión de UX, pruebas y configuración sin inventar precios. |
| F2 · Personas y familias | Identidad, pertenencias y permisos estables de F0–F1. | Auditoría de importación y directorio sobre lo existente. |
| F3 · Servicio | Personas y pertenencias de F2, permisos de F0–F1. | Revisar áreas/puestos existentes con personas sintéticas. |
| F4 · Programación | Contratos de People y Servicio validados; decisión sobre Activity, estados y publicación. | UI con datos de prueba una vez acordados los contratos. |
| F5 · Respuestas y avisos | Identificador y estados de asignación de F4; motor persistente de notificaciones. | Disponibilidad y motor de avisos pueden empezar antes del cierre completo de F4, tras fijar sus contratos. |
| F6 · Eventos | People, Activity y estados de F4; avisos de F5 para comunicaciones. | Formularios una vez acordada su clasificación y permisos. |
| F7 · Grupos y discipulado | People, scopes y Activity si las sesiones se vinculan al calendario. | Puede avanzar en paralelo con F6; no necesita toda su funcionalidad. |
| F8 · Kids | Familias, personas, credenciales de servicio, permisos y decisiones de recogida. | Especificación y pruebas de permisos; no implementar decisiones sensibles sin cerrar. |
| F9 · Campañas | Segmentación de People y motor de F5; preferencias y límites aprobados. | Puede avanzar junto a Kids una vez estables sus dependencias; segmentos de grupos requieren F7. |
| F10 · Recursos | Activity estable, permisos y regla de conflictos. | No depende de completar Kids o campañas; mantener prioridad comercial acordada. |
| F11 · Alabanza | Core y programación/respuestas estables; inventario y plan de migración de Calserv. | Inventario de compatibilidad; no efectuar el corte antes de validar continuidad. |
| F12 · Pastoral, Giving, analítica | People, permisos especializados, auditoría y decisiones propias de cada dominio. | Diseño de contratos; no tratar Giving y Pastoral como permisos genéricos. |
| F13 · Operación y escala | Cada módulo integrado para su validación; pruebas globales al final. | Toda medida aplicable desde la primera tanda. |

## 4. Tandas para llegar al MVP

### Tanda 0 — comprobar lo que ya existe

A y B pueden revisar en paralelo. El cierre conjunto deja una lista de evidencias y carencias, no un nuevo desarrollo completo.

| ID | Responsable | Entregable | Dependencia | Criterio de cierre |
|---|---|---|---|---|
| COMP-01 | A | Revisión de F0–F1: entorno, CI, tenant, altas, sedes, suscripción. | Ninguna. | Informe con pruebas realizadas, fallos reproducibles y decisiones pendientes. |
| COMP-02 | B | Revisión de F2–F3: personas, familias, importación y servicio. | Entorno local disponible; puede usar seed sintético. | Matriz criterio/código/prueba/falta, incluyendo permisos y aislamiento. |
| COMP-03 | Ambos; A consolida | Contrato de datos compartidos y lista priorizada de carencias. | COMP-01 y COMP-02. | IDs de persona/iglesia/puesto, capacidades y superficies compartidas acordados; propietario valida prioridades. |

Abrir cada fallo confirmado en `hotfix/comp-<id>-<descripcion>` y cada capacidad ausente en `feature/comp-<id>-<descripcion>`. Los informes se preparan en `docs/comp-01-auditoria-core` y `docs/comp-02-auditoria-personas-servicio`. No se crean incidencias remotas por la sola existencia de esta propuesta.

### Tanda 1 — estabilizar la base y fijar contratos

| ID | Responsable | Entregable | Dependencia | Criterio de cierre |
|---|---|---|---|---|
| COMP-04 | A | Resolver las carencias priorizadas de F1 y el contexto multiiglesia. | COMP-03; decisiones de producto cuando afecten a billing. | Altas reintentables y cambio de contexto probado sin acceso cruzado. Billing declarado completo solo con el alcance comercial aprobado y probado. |
| COMP-05 | B | Resolver las carencias priorizadas de F2–F3. | COMP-03 y contrato estable de identidad. | Personas/familias utilizables, líder limitado a su área y elegibilidad verificable. |
| COMP-06 | Ambos; A edita el contrato | Activity, puestos requeridos, asignaciones y transiciones. | COMP-03; cuestiones A7–A10 de decisiones vigentes. | Contrato escrito de estados, publicación, conflictos, fechas, respuestas y eventos de notificación. |

COMP-04 y COMP-05 pueden avanzar a la vez. COMP-06 puede diseñarse durante ambos, pero no integrarse como si sus dependencias pendientes estuvieran resueltas.

Para COMP-06 acordar: quién puede publicar, qué requisitos bloquean, cómo se calcula cobertura pendiente/confirmada, hasta cuándo se responde, qué ocurre al cambiar hora/cancelar y cómo se evita duplicar avisos. Registrar explícitamente el criterio DST (cambio de hora) y la zona de iglesia/sede.

### Tanda 2 — base de programación y motor de avisos en paralelo

| ID | Responsable | Entregable | Dependencia | Criterio de cierre |
|---|---|---|---|---|
| COMP-07 | A | F4: actividades, plantillas, recurrencia y necesidades de puestos. | COMP-06 validado; partes de COMP-04/05 que consume, integradas. | Crear, editar y duplicar borradores; fechas correctas al cruzar cambio de hora; RLS probado. |
| COMP-08 | B | F5: notificación persistente, cola, reintentos y preferencias. | Contrato de evento de COMP-06 y núcleo de tenant/persona validado. | Un evento sintético genera un aviso persistente; repetirlo no duplica; un fallo de transporte conserva el trabajo pendiente. |

Frontera propuesta: A mantiene el dominio de actividades/programación; B mantiene el motor de notificaciones. B no crea una segunda tabla de asignaciones. El evento comparte tenant, destinatario, tipo, entidad/versionado y clave de deduplicación; los nombres finales se fijan en COMP-06.

### Tanda 3 — asignación y disponibilidad en paralelo

| ID | Responsable | Entregable | Dependencia | Criterio de cierre |
|---|---|---|---|---|
| COMP-09 | A | F4: asignación, elegibilidad, cobertura, conflictos y publicación. | COMP-07 y contrato de disponibilidad fijado en COMP-06. | Publicación aplica las reglas acordadas, detecta conflictos y produce el evento persistente previsto. |
| COMP-10 | B | F5: bloqueos de disponibilidad, frecuencia y privacidad. | COMP-06 y People validado. | Crear/editar disponibilidad; solapes y zonas horarias correctos; motivos visibles solo según permiso. |

A puede usar casos de prueba acordados mientras B implementa la disponibilidad. El cierre real de COMP-09 requiere comprobar la integración con COMP-10 y COMP-08. Los datos simulados no sustituyen esa comprobación.

### Tanda 4 — cerrar el recorrido real

| ID | Responsable | Entregable | Dependencia | Criterio de cierre |
|---|---|---|---|---|
| COMP-11 | A | F5: mis turnos, aceptar/rechazar, cambios de respuesta y sustituciones. | COMP-09/10 y contrato de estados. | La respuesta autorizada actualiza cobertura; reintentos y concurrencia no crean resultados contradictorios. |
| COMP-12 | B | F5: email/push, recordatorios, silencio, avisos por cambios y escalado. | COMP-08/09; proveedores y reglas acordados. | Entrega y reintentos probados, cancelación/reprogramación coherentes y respaldo cuando falla un canal. |
| COMP-13 | Ambos; propietario valida | Piloto del recorrido F1–F5 y correcciones resultantes. | COMP-04/05/11/12. | Dos iglesias aisladas, programación completa, respuestas y cobertura correctas, móvil/escritorio y recuperación comprobados. |

COMP-11 y COMP-12 usan el mismo contrato de evento/respuesta. Cambiarlo requiere coordinación y pruebas conjuntas. Se valida la recepción push en dispositivos reales aplicables, no solo en navegador de escritorio.

Si las decisiones comerciales siguen abiertas, se puede validar el piloto técnico, pero no declarar cerrado el MVP comercial con billing.

## 5. Después del MVP

Cada fila es una tanda propuesta, supeditada a pilotos y a tu validación de prioridades. No son fechas comprometidas.

| Tanda | Persona A | Persona B | Trabajo conjunto / condición |
|---|---|---|---|
| Expansión 1 | F6: eventos, formularios e inscripciones. | F7: grupos y discipulado. | Reutilizar People y Activity; cerrar contrato común de asistencia antes de duplicarlo. |
| Expansión 2 | F8: Kids. | F9: campañas y segmentación. | Permisos, autorizaciones, preferencias y datos restringidos acordados; cada módulo tiene su validación propia. |
| Expansión 3 | F10: salas, recursos y reservas. | Preparación F11: inventario Calserv, correspondencias y ensayo de migración. | La preparación de Alabanza no ejecuta el corte ni presupone acceso al repositorio histórico. |
| Expansión 4 | F11: integración de programación/identidad. | F11: canciones, repertorio y atril. | Ambos validan continuidad, ensayo, conteos y recuperación antes de proponer el corte al propietario. |
| Expansión 5 | F12: Pastoral con permisos específicos. | F12: Giving con proveedor y reglas aprobadas. | Analítica se planifica en una tarea posterior o al quedar libre un responsable; no añadir una tercera línea simultánea. |
| Cierre de escala | F13: rendimiento, aislamiento y recuperación. | F13: experiencia, soporte y observabilidad. | Revisión integral y validación del propietario; las medidas críticas no se aplazan a esta tanda. |

## 6. Archivos compartidos y orden de integración

| Superficie | Coordinación propuesta |
|---|---|
| Migraciones | Cada tarea añade archivos propios con nombres únicos. Coordinar dependencias y probar el orden conjunto antes de integrar. |
| Tipos de base de datos | Un responsable regenera el archivo compartido tras integrar las migraciones requeridas; evitar dos regeneraciones simultáneas incompatibles. |
| Tenant, autorización y clientes Supabase | Responsable explícito por tanda, inicialmente A; cualquier cambio de contrato se revisa entre ambos. |
| Shell, navegación y estilos globales | Una tarea pequeña separada, con responsable acordado; cada módulo evita cambios globales no coordinados. |
| Dependencias y lockfile | Actualizaciones aisladas; el otro trabajo sincroniza después. |
| Documentación y decisiones | Cada tarea actualiza su documento; una persona consolida el índice/roadmap al cierre conjunto. |

Preferir PR pequeñas e independientes. Si una tarea necesita código aún no integrado, se puede diseñar y probar con el contrato acordado. Si hace falta una rama dependiente, registrar su rama base y PR previa; no integrarla antes de la dependencia. Tras integrar la base, actualizar la rama, revisar el diff y repetir comprobaciones antes de solicitar tu validación final.

Orden general: contrato validado → cambio compatible de esquema/servicio → consumidores → prueba integrada. Cada PR que vaya a `main` debe dejar una versión coherente y tiene su propia validación del propietario; una aprobación del plan no aprueba automáticamente el código.

## 7. Tablero compartido

Estados: **Pendiente → Lista → En curso → En revisión → Pendiente de tu validación → Validada → Integrada**. Usar **Bloqueada** con la dependencia concreta cuando corresponda. «Desplegada» se registra aparte con entorno y evidencia.

Cada tarjeta contiene:

- ID, objetivo y criterios de aceptación.
- Responsable A/B y otra persona como revisor.
- Tipo, rama y enlace de PR cuando exista.
- IDs de las tareas bloqueantes y archivos compartidos afectados.
- Pruebas realizadas, pendientes y riesgos de datos.
- Commit validado por el propietario y referencia a su aprobación.

Límite inicial: una tarea principal en curso por persona. Al empezar, comunicar tarea y superficies; antes de revisar, sincronizar dependencias; al cerrar, comunicar PR integrada y cambios de contrato. Un bloqueo comercial o funcional se eleva al propietario con una propuesta concreta; mientras se resuelve, avanzar solo en trabajo independiente.

## 8. Decisiones necesarias antes de sus tareas dependientes

No bloquean la lectura ni las auditorías iniciales, pero sí el desarrollo que las presupone:

| Decisión del propietario | Tarea afectada |
|---|---|
| Asignar Carlos/Diogo a los puestos A/B y confirmar su disponibilidad. | Asignación real y estimaciones, todavía sin fechas. |
| Pricing, prueba, impago y propietarios (A1–A3). | Cierre comercial de F1 y COMP-04/13. |
| Estados de membresía, privacidad y fusiones (A4–A6). | Carencias de F2 dentro de COMP-05. |
| Activity, publicación, respuestas y conflictos (A7–A10). | COMP-06 y consumidores F4–F5. |
| Proveedores y reglas concretas de notificación. | COMP-12. |
| Decisiones de formularios, Kids, campañas y migración. | Tandas de expansión correspondientes. |

Consultar [decisiones vigentes](07-decisiones.md) para el detalle. Esta propuesta permite comenzar por COMP-01 y COMP-02, decidir con evidencia cuánto falta en F1–F3 y después construir F4/F5 con dos líneas de trabajo coordinadas.


## 9. Actualización tras recibir el encargo de Diogo

Carlos aportó el encargo de Diogo, que comunica F0–F3 cerradas en producción.
El fetch de `origin/main` confirma `e5679ca` y la integración de Fase 3; no se
ha revalidado producción en esta revisión.

Para el siguiente encargo prevalece [PROMPT-CLAUDE-FASE-4.md](PROMPT-CLAUDE-FASE-4.md):
F4 implementa estructura de actividades, plantillas, recurrencia, calendario y
planning; las asignaciones y conflictos personales pasan a F5. Las tandas
COMP-01/02 dejan de proponerse como auditorías completas previas: basta revisar
los contratos que F4 consume. COMP-09/11 se replanifican para F5 en lo relativo
a asignaciones y respuestas. No ejecutar el reparto anterior literalmente sin
adaptarlo a esta separación.

Reparto inmediato propuesto: un responsable único desarrolla F4 y la otra
persona revisa contratos, casos de aceptación y cambios compartidos en una
rama separada de pruebas/documentación. Carlos conserva siempre la validación
final. La asignación concreta de responsable entre Carlos y Diogo sigue pendiente;
no se presupone que Diogo haya delegado la implementación al aportar el prompt.
