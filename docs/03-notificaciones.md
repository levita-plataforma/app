# Notificaciones: funcionamiento heredado y adaptación multiiglesia

Revisión: **15 de septiembre de 2026**. El promotor indica que LEVITA reutilice
el funcionamiento de push, perfil y demás funciones comunes de Calserv, además
de su UI/UX. Se ha inspeccionado código local; no se han probado envíos reales
en esta revisión documental. Ver [referencia](14-referencia-uiux-alabanza.md).

## Comportamiento que se conserva

La referencia actual es `src/server/notifications/dispatch.ts` de Calserv.
`notifyMembers` centraliza la emisión:

1. Guarda el aviso en la bandeja interna. Si no se puede guardar, informa del
   fallo; no presenta la operación de aviso como completada.
2. Intenta push a los dispositivos suscritos cuando el canal está habilitado.
3. Intenta correo cuando el canal está habilitado y dispone de destinatarios.

Push y correo pueden enviarse para el mismo aviso. El correo no es
exclusivamente un reemplazo del push. Los fallos de canales externos no borran
el aviso interno ni deshacen una respuesta del servidor ya guardada. El resumen
distingue constancia interna, intentos de envío y canales sin configurar.

La política existente excluye al autor de los avisos de su propia acción; los
mensajes de feedback en pantalla sí informan de lo que acaba de hacer. Un correo
de equipo no expone las direcciones de los demás destinatarios. Las invitaciones
individuales conservan su enlace personal.

## Campana y respuestas pendientes

Conservar la campana de móvil y escritorio, bandeja, estado de lectura y
acceso al servicio correspondiente. El código distingue avisos guardados y
asignaciones pendientes de respuesta que se muestran como tareas pendientes.
Leer un aviso no confirma ni rechaza el turno. La tarea de responder no debe
quedar resuelta solo por haber abierto la campana.

La bandeja pertenece a la persona dentro de su iglesia. Un aviso de otra iglesia
no aparece bajo la cabecera de la activa por reutilizar datos en caché. Al abrir
un enlace, resolver la iglesia del aviso, validar pertenencia y cargar ese
contexto antes de permitir responder. No convertir esto en un directorio global.

## Perfil y activación por dispositivo

`ProfileNotifications` y `NotificationBell` usan `usePushSubscription` en Calserv.
Mantener una única lógica compartida y verificar coherencia entre ambas vistas:
activar o desactivar desde una se refleja correctamente en la otra.

| Estado observado en el código | Presentación a conservar |
|---|---|
| `checking` | Comprobando este dispositivo |
| `unconfigured` | El servicio no está configurado; mensaje recuperable, sin fingir activación |
| `unsupported` | Este navegador no admite push; mantener acceso a bandeja y otros canales |
| `unavailable` | No hay registro disponible para usar push; orientar la instalación o recuperación según diagnóstico |
| `default` | Activar avisos en este dispositivo |
| `denied` | Explicar el permiso bloqueado y cómo recuperarlo |
| `subscribed` | Avisos activados en este dispositivo; opción de desactivar aquí |

Conservar estado ocupado y error al activar/desactivar. Activar en el móvil no
activa el ordenador; desactivar aquí no debe desactivar otros dispositivos.
El permiso se pide por acción de la persona. La guía de instalación se valida
con los dispositivos objetivo y capturas reales. Si faltan capturas, se marcan
pendientes en el diseño en lugar de simular evidencia.

La suscripción técnica al dispositivo no debe confundirse con una preferencia
por iglesia. El contrato multiiglesia define cómo se vincula a la cuenta y a
sus pertenencias autorizadas. Cambiar de iglesia no reasigna el endpoint a otro
usuario ni cancela suscripciones por accidente.

## Adaptaciones para LEVITA general

- Asociar destinatarios, avisos y enlaces a una iglesia y una pertenencia válida.
- Resolver líderes por área dentro del tenant; no avisar a toda la plataforma.
- Conservar campana, perfil y canales de Calserv en las áreas generales antes
  de la incorporación final del equipo de Alabanza.
- Reconciliar bandeja y cola del monorepo de turnos con una sola vía de emisión.
  Reintentar un trabajo no crea otra fila de aviso ni otro envío de la misma tanda.
- Mantener constancia de lo guardado aunque un canal externo falle; no confundir
  envío aceptado por un proveedor con lectura o respuesta de la persona.
- Revisar alcance de preferencias: permiso push por dispositivo; horarios y
  reglas de servicio en el contexto de la iglesia.

La arquitectura interna puede requerir adaptación. No se ejecutan en paralelo
un emisor de Calserv y otro de Turnos para la misma acción. D8 define la
integración técnica, no deja abierta la decisión de conservar el funcionamiento.

## Avisos del producto general

La siguiente tabla recoge requisitos de programación procedentes del backlog
de turnos. Se conectan a la base común; no se consideran todos implementados
por existir el código de push en Calserv.

| Aviso | Momento | Destinatario |
|---|---|---|
| Nueva propuesta | Publicación o momento único acordado en D4 | Persona asignada |
| Respuesta pendiente | Según regla configurada del servicio | Persona sin responder |
| Mañana sirves | Víspera | Persona que aceptó |
| Tienes que estar allí en 2 horas | Dos horas antes de la llegada de su puesto | Persona que aceptó |
| Cambio o retirada del turno | Cambio relevante confirmado | Personas afectadas |
| Culto cancelado | Cancelación confirmada | Personas afectadas; cancelar recordatorios pendientes |
| Hueco crítico | Rechazo o retirada que deja el puesto incompleto | Líderes del área o responsables definidos |
| Huecos de seguimiento | Regla del viernes según criticidad | Líderes del área |
| Credencial próxima a caducar | Regla configurada documentada | Persona y responsables con mensaje permitido |
| Repertorio publicado/cambiado | Cuando Alabanza se incorpore al final | Áreas receptoras del culto |

Republicar sin cambios no repite propuestas. «Recordar a pendientes» es una
acción propia, no despublicar y volver a publicar. Respetar horarios de silencio
según la regla de producto; las excepciones urgentes se configuran explícitamente.
No convertir el conjunto de propuestas en confirmaciones.

## Referencias técnicas del monorepo de turnos

La documentación histórica propone `notification_jobs`, `send_at`, `dedupe_key`,
trabajos diferidos, cancelación de recordatorios y worker periódico. El backlog
relata implementación de reglas de llegada, criticidad y silencio. Hay que
contrastar ese código y sus pruebas en `Documents/Levitaapp` antes de integrarlo.
Estos mecanismos deben preservar el comportamiento visible de Calserv.

El antiguo flujo `/api/respond` mediante token firmado y botones directos en
push es una propuesta adicional, no una descripción verificada del flujo de
Calserv. No sustituye abrir el aviso y responder en el detalle existente. Las
capacidades por dispositivo y el contrato de estados se comprueban antes de
habilitar atajos; un turno cancelado o retirado no acepta respuestas nuevas.

En Calserv, `src/server/notifications/push.ts` elimina suscripciones que el
proveedor identifica como inexistentes. Conservar el tratamiento de errores
sin exponer direcciones, claves o detalles privados en la interfaz.

## Criterios de verificación antes del piloto

- Perfil y campana reflejan correctamente activar/desactivar en el dispositivo.
- Desactivar el móvil no modifica el ordenador ni borra la bandeja.
- Abrir la campana no resuelve una asignación pendiente.
- Una respuesta guardada conserva su estado si falla el aviso externo.
- Reintentar y repetir publicación no duplican avisos.
- Destinatarios y enlaces respetan iglesia y área, incluso con varias pertenencias.
- La persona que ejecuta la acción no recibe el aviso de su propia acción.
- Los resultados distinguen aviso guardado, canales intentados y fallos reales.
- Se comparan los recorridos con Calserv en dispositivos reales antes de aceptar
  paridad; leer el código no es una prueba de entrega de push.
