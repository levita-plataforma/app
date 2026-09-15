# Flujos principales de producto

Revisión: **15 de septiembre de 2026**.

## F1 · Alta autoservicio

Cuenta → datos iglesia → plan/pago → tenant provisioning → sede principal → módulos/áreas base → onboarding.

Errores recuperables: pago pendiente, callback repetido, navegador cerrado, webhook duplicado.

## F2 · Alta asistida

Operación crea alta pendiente → responsable recibe enlace → verifica identidad → completa iglesia → acepta términos → pago → activación.

## F3 · Cambio de iglesia

Usuario abre selector → servidor valida pertenencia → cambia tenant → invalida caché → recarga permisos/módulos → muestra nuevo contexto.

## F4 · Importar personas

Archivo → mapeo → validación → preview → duplicados → confirmar → job → resultado → corregir errores → invitaciones opcionales.

## F5 · Invitar persona

Crear persona → generar invitación → asignar incluso antes de aceptación → persona acepta → vincular cuenta → conservar historial.

## F6 · Crear familia

Crear household → añadir relaciones → elegir contactos principales → configurar privacidad. Las autorizaciones Kids se gestionan por separado.

## F7 · Crear área/equipo

Admin/líder autorizado → área → puestos → miembros → cualificaciones → equipos → reglas → guardar.

## F8 · Preparar culto/actividad

Elegir plantilla → fecha/hora/sede → generar necesidades → asignar personas/equipos → detectar conflictos → revisar cobertura → guardar borrador.

## F9 · Publicar

Validar reglas bloqueantes → mostrar destinatarios/cobertura → confirmar → estado published → crear mensajes → workers entregan.

## F10 · Responder turno

Persona abre deep link/app → ve contexto → aceptar/rechazar → actualización optimista → servidor valida → panel recalcula → mensaje de éxito/recuperación.

## F11 · Sustituir

Rechazo → marcar hueco → sugerir/seleccionar reemplazo → notificar → aceptar → mantener historial de original.

## F12 · Crear evento e inscripción

Evento → formulario → publicar → persona envía → validar aforo → confirmar/lista espera → mensaje → check-in posterior.

## F13 · Grupo

Crear grupo → líderes → publicar/invitar → solicitud → aprobación → reuniones → asistencia → comunicación.

## F14 · Discipulado

Crear curso/itinerario → cohorte → matricular → sesiones → asistencia/progreso → completar.

## F15 · Kids check-in/out

Tutor localiza menor → sesión → autorización → check-in → etiqueta/código si existe → actividad → recogida → verificar responsable → check-out.

## F16 · Campaña

Crear mensaje → elegir segmento → resolver destinatarios → revisar opt-outs → preview → confirmar → cola → entrega → métricas.

## F17 · Reserva

Actividad/recurso → comprobar disponibilidad → reservar → conflicto transaccional protegido → confirmar → cancelar/liberar según política.

## F18 · Soporte

Cliente solicita ayuda → operador revisa diagnóstico → si necesita acceso crea support session → motivo/duración → banner → acciones auditadas → expiración.

## F19 · Cancelación de tenant

Owner inicia → confirmar → exportación → cancelar renovación → fecha efectiva → restricción → retención → eliminación/anonimización.

## Estados UX comunes

Todo flujo importante contempla:

- loading;
- empty;
- success;
- partial success;
- retry;
- validation error;
- permission denied;
- module disabled;
- offline cuando aplique;
- archived;
- conflict/concurrency.
