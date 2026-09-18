# Reparto de fases y tareas — Carlos y Diogo

Actualizado el **18 de septiembre de 2026** tras la confirmación de Carlos: él terminó F4 y F5, Diogo terminó F6 y Carlos continuará con F7.

Este documento sustituye el reparto anterior. F7 está asignada expresamente a Carlos; las asignaciones futuras se mantienen como propuesta de organización, sin fechas comprometidas. No inicia tareas ni autoriza integraciones.

## 1. Estado y responsables

| Fase | Responsable | Estado / alcance |
|---|---|---|
| F0–F3 · Base, altas, personas y servicio | Equipo | Cerradas según el estado previo comunicado. Reutilizar; no volver a implementar. |
| F4 · Actividades y planificación | **Carlos** | Terminada. Código y cierre documental comprobados anteriormente en main, hasta `667f3ba`. |
| F5 · Asignaciones, disponibilidad, respuestas y avisos | **Carlos** | Terminada según su confirmación del 18/09. Sustituye el reparto previo de F5 entre Carlos y Diogo. |
| F6 · Eventos, formularios e inscripciones | **Diogo** | Terminada según confirmación de Carlos del 18/09. |
| F7 · Grupos y discipulado | **Carlos** | **Siguiente fase confirmada:** grupos, participantes, reuniones, asistencia, cursos e itinerarios. |
| F8 · Kids | **Diogo — propuesto** | Menores, tutores, autorizaciones y recogida. Puede avanzar en paralelo con F7 tras cerrar sus decisiones específicas. |
| F9 · Comunicación segmentada | **Diogo — propuesto, después de F8** | Campañas, preferencias, segmentos y métricas sobre el motor de F5. |
| F10 · Recursos e instalaciones | **Carlos — propuesto, después de F7** | Salas, equipos, reservas y conflictos utilizando Activity. |
| F11 · Alabanza: preparación y contenido | **Diogo — propuesto, después de F9** | Inventario Calserv, correspondencias, canciones, repertorios y atril. |
| F11 · Alabanza: integración | **Carlos — propuesto, después de F10** | Identidad, actividades, programación y permisos; cierre conjunto con Diogo. |
| F12 · Pastoral | **Carlos — propuesto** | Casos, seguimiento y permisos especializados. |
| F12 · Giving | **Diogo — propuesto** | Donaciones, proveedor y conciliación. |
| F12 · Analítica | **Diogo — propuesto, después de Giving** | Métricas de módulos disponibles; Carlos revisa permisos y métricas de su dominio. |
| F13 · Seguridad y recuperación | **Carlos — propuesto** | Aislamiento, rendimiento, recuperación y coordinación de cierre técnico. |
| F13 · Operación y experiencia | **Diogo — propuesto** | Observabilidad, soporte y experiencia en dispositivos; revisión final conjunta. |

La actualización de F5/F6 recoge la confirmación de Carlos; no acredita una nueva inspección de sus ramas, CI, migraciones o producción. Antes de consumir sus cambios, comprobar la versión integrada y sus contratos, sin reabrir una auditoría completa de fases terminadas.

## 2. Próxima tanda: Carlos F7 y Diogo F8

**F7 y F8 no necesitan cerrarse juntas ni ejecutarse por la misma persona o agente.** Comparten personas, familias, permisos y, donde corresponda, actividades. Cada módulo entrega sus propias migraciones, servicios, UI y pruebas.

| ID | Responsable | Tarea | Dependencia | Criterio de cierre |
|---|---|---|---|---|
| CO-07-08 | Ambos; Carlos consolida | Revisar contratos compartidos y acordar archivos/migraciones que tocará cada uno. | Versiones disponibles de People, familias, Activity, Serving y avisos. | No hay cambios incompatibles ni dos implementaciones de la misma entidad. |
| CA-07-01 | Carlos | Modelo de grupos, tipos, líderes, participantes, pertenencias y permisos por grupo. | People, tenant y scopes existentes. | Un líder gestiona su grupo sin acceder a otros grupos o iglesias fuera de su permiso. |
| CA-07-02 | Carlos | Reuniones, asistencia y solicitudes de incorporación. | CA-07-01; Activity y avisos cuando se usen. | Registrar reuniones y asistencia sin duplicar personas ni exponer información indebida. |
| CA-07-03 | Carlos | Cursos, cohortes, sesiones, itinerarios y progreso. | People y contratos de sesiones/asistencia acordados. | Una persona participa y progresa con historial y acceso limitado a sus responsables. |
| CA-07-04 | Carlos; Diogo revisa | Integración y cierre de F7. | CA-07-01/02/03. | Recorrido completo, permisos, aislamiento y UI móvil/escritorio probados; Carlos valida la PR. |
| DI-08-01 | Diogo | Preparar modelo de menor/tutor y autorizaciones explícitas. | Familias y decisiones de recogida/privacidad. | Pertenecer a una familia no concede automáticamente permiso de recogida. |
| DI-08-02 | Diogo | Salas/clases, responsables, ratios y validación de credenciales. | DI-08-01 y credenciales de Serving. | Se aplican las reglas acordadas, con acceso restringido a datos sensibles. |
| DI-08-03 | Diogo | Check-in/out, recogida e incidencias. | DI-08-02; mecanismo de identificación aprobado. | Entrada y salida trazables; recogida no autorizada rechazada. |
| DI-08-04 | Diogo; Carlos revisa y valida | Integración y cierre de F8. | DI-08-01/02/03. | Pruebas funcionales, privacidad y aislamiento completas; sin depender de terminar F7. |

Las tareas de Diogo son una propuesta para su siguiente encargo. Si una regla sensible de Kids sigue abierta, preparar una propuesta concreta y avanzar solo en tareas independientes; no inventar autorizaciones de recogida o políticas de datos.

## 3. Orden posterior propuesto

| Tanda | Carlos | Diogo | Coordinación |
|---|---|---|---|
| Actual | F7 · Grupos y discipulado | F8 · Kids | Contratos de personas, permisos y actividades; cierres independientes. |
| Siguiente | F10 · Recursos | F9 · Comunicación | Ambas reutilizan módulos anteriores. Segmentos de grupos consumen F7 cuando esté integrado. |
| Integración de Alabanza | F11 · Identidad y programación | F11 · Contenido y migración | Cierre conjunto antes del corte de datos. |
| Especializados | F12 · Pastoral | F12 · Giving y después analítica | Cada módulo tiene permisos y cierre propios. |
| Escala | F13 · Seguridad y recuperación | F13 · Operación y experiencia | Revisión global conjunta. |

Los números de fase no obligan a una ejecución estrictamente secuencial: F10 puede avanzar junto a F9 porque depende de Activity, no de completar campañas. No abrir más de una tarea principal por persona. Las medidas de seguridad, accesibilidad y recuperación aplicables acompañan cada entrega, sin esperar a F13.

## 4. Qué necesita validación conjunta

- **F7/F8:** cierres independientes; prueba compartida solo de los contratos que ambos cambien.
- **F9/F10:** cierres independientes; no bloquear un módulo por la falta del otro.
- **F11:** integración y migración requieren validar juntas las partes de Carlos y Diogo antes del corte.
- **F12:** Pastoral, Giving y analítica se entregan por separado; completar uno no completa todos.
- **F13:** cierre global sobre los módulos que se vayan a lanzar.

Cierre conjunto significa comprobar que las partes funcionan juntas, no hacer una PR gigante. Ninguna fase exige técnicamente conservar el mismo agente: un relevo debe recibir contrato, rama, commit y pruebas pendientes.

## 5. Propiedad de cambios compartidos

- Carlos mantiene la coordinación de Activity/programación (F4/F5) y desarrolla F7.
- Diogo mantiene la continuidad de eventos/inscripciones (F6) y, si acepta el reparto, desarrolla F8.
- Carlos coordina cambios de tenant, autorización, navegación y tipos compartidos. Esto no concede permiso para alterar trabajo ajeno: cada cambio tiene responsable explícito y revisión cruzada.
- Cada persona añade migraciones de su dominio, con nombres únicos y dependencias declaradas. Probar el orden combinado y regenerar tipos desde ese esquema.
- Reutilizar el motor de avisos de F5 y los contratos reales de F6. No volver a asignar su desarrollo por seguir un prompt anterior.
- Cada persona o agente usa su clon o worktree. No editar simultáneamente la misma carpeta ni mantener versiones paralelas de tablas comunes.

## 6. Ramas y validación de Carlos

Ramas propuestas para la próxima tanda:

- Carlos: `feature/carlos-fase-7-grupos-discipulado`.
- Diogo: `feature/diogo-fase-8-kids`.

Dividir entregables grandes en ramas/PR pequeñas si facilita revisión. Conservar nombres existentes si ya hay trabajo iniciado. Los arreglos usan `hotfix/<nombre>-<descripcion>` y la documentación `docs/<nombre>-<descripcion>`; Codex puede anteponer `codex/`.

**Carlos valida expresamente cada versión antes de integrarla en main**, también cuando él coordina al agente que la implementa. CI en verde o revisión de Diogo no sustituyen esa validación. Si cambia la versión, volver a validar. No hacer commits directos a main ni fusiones automáticas.

## 7. Referencias y precedencia

- [Funcionamiento y reglas](../FUNCIONAMIENTO.md).
- [Roadmap funcional](13-plan-por-fases.md).
- [Plan inicial de colaboración](PLAN-TRABAJO-COMPARTIDO.md), conservado como antecedente.

Este reparto actualizado prevalece sobre las asignaciones A/B, sobre el reparto anterior de F5 y sobre los responsables F6/F7/F8 que aparezcan en documentos previos. Los prompts de F4/F5 quedan como referencia de sus encargos históricos; no son instrucciones para reiniciar esas fases.
