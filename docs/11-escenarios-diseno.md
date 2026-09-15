# Escenarios para diseño y validación

Datos **ficticios**, revisión del 15 de septiembre de 2026. No son una semilla de
producción ni resultados de entrevistas. Los identificadores sirven para enlazar
pantallas y revisar estados sin inventar datos distintos en cada artboard.

## Iglesias y cuentas de ejemplo

| Iglesia | Slug de maqueta | Zona | Situación |
|---|---|---|---|
| Puerta Abierta | `puerta-abierta` | Europe/Madrid | Alta autoservicio y suscripción activa después de confirmación; unos 80 asistentes |
| La Ribera | `la-ribera` | Europe/Madrid | Alta asistida, variante de pago pendiente; activa en S02 después de completarlo |

Patricia es propietaria de Puerta Abierta. Andrés es propietario de La Ribera.
Sara tiene una cuenta con dos pertenencias: líder de Dirección del culto en Puerta Abierta
y servidora en La Ribera. Olivia es operadora de altas de LEVITA, sin acceso
implícito a los turnos o credenciales de estas iglesias.

No mostrar direcciones de correo reales. Si hacen falta en la maqueta, usar
`patricia@example.com`, `andres@example.com` y `sara@example.com`.
La cuota se representa como variable pendiente en una anotación, sin precio falso.

## S01 · Alta y primera personalización

Puerta Abierta: Patricia registra la iglesia, revisa el pago, vuelve a
«Confirmando el pago» y llega a «Personalizar áreas» tras activación.
La Ribera: Olivia inicia el alta y Andrés recibe el enlace para completar datos
y pago. Si abandona, vuelve a la misma alta; no se genera otra iglesia.

Para estos ejemplos de la etapa general, ambas reciben Sonido, Multimedia, Bienvenida, Niños y Dirección del culto. Es una base propuesta y editable; la app de Alabanza continúa aparte hasta S11, la incorporación final.
Variante de error: pago confirmado y activación aún no terminada. La acción
recupera la activación, sin invitar a pagar de nuevo.

## S02 · Renombrar, crear y cambiar de iglesia

Partir de ambas iglesias activas, con sus propias copias de la base.
Patricia cambia **Bienvenida → Acogida** en Puerta Abierta, conservando el área
`PA-A04`, sus personas y turnos. También crea Hospitalidad como sexta área,
aún sin puestos ni participación en la plantilla del domingo.

La Ribera conserva cinco áreas y su nombre Bienvenida. Sara cambia entre las
iglesias: ve Dirección del culto como líder solo en Puerta Abierta y sus turnos como
servidora en La Ribera. No ve la cuota de ninguna por ser líder o servidora.
Desde S03, todos los nombres de área de Puerta Abierta usan **Acogida**.

## Equipo de referencia de Puerta Abierta

| Persona | Puestos que puede cubrir | Dato necesario para escenarios |
|---|---|---|
| Sara | Dirección | Líder de Dirección del culto; también pertenece a La Ribera |
| David | Lectura | Pendiente de respuesta en E01 |
| Pablo | Oración | Confirmado en E01 |
| Rubén | Mesa de sonido | Autónomo; confirma y después rechaza en S06 |
| Luis | Mesa de sonido | Aprendiz |
| Elena | Proyección | Confirmada en E01 |
| Nuria | Puerta | Confirmada en E01 |
| Ana | Puerta | Invitada; sus asignaciones existen antes de activar cuenta |
| Isabel | Monitores | Requisitos configurados verificados para la fecha del culto |
| Carmen | Monitores | Requisitos configurados verificados para la fecha del culto |
| Mario | Mesa de sonido | Autónomo; sirvió el 4 y el 11 de octubre; máximo deseado 2/mes |
| Marta | Mesa de sonido | Autónoma; bloqueo 17–19 de octubre y asignación en otro evento que se solapa |
| Laura | Monitores | Requisito configurado que caduca el 16 de octubre |
| Irene | Puerta | Sin conflictos en E01 |
| Joel | Cámara | Sin turnos futuros en el estado inicial |

Son 15 personas de servicio, además de Patricia como propietaria. Los datos
sobre requisitos son un ejemplo de configuración de la iglesia; no fijan una
caducidad legal universal. Solo administradores y persona interesada ven esos
detalles. El líder recibe únicamente la indicación permitida de aptitud/revisión.

## Plantilla de referencia

«Culto del domingo», de 11:00 a 12:30. **8 puestos/turnos, 12 plazas necesarias.**
Hospitalidad aún no se ha añadido a esta plantilla.

| Área | Puesto | Plazas | Mínimo | Requiere autónomo | Llegada | Criticidad |
|---|---|---:|---:|---|---|---|
| Dirección del culto | Dirección | 1 | 1 | No | 10:40 | Crítica |
| Dirección del culto | Lectura | 1 | 1 | No | 10:40 | Importante |
| Dirección del culto | Oración | 1 | 1 | No | 10:40 | Importante |
| Sonido | Mesa | 2 | 1 | Sí | 9:30 | Crítica |
| Multimedia | Proyección | 1 | 1 | No | 10:00 | Importante |
| Multimedia | Cámara | 1 | 1 | No | 10:00 | Importante |
| Acogida | Puerta | 3 | 1 | No | 10:30 | Flexible |
| Niños | Monitores | 2 | 2 | No | 10:30 | Crítica |

Las reglas de publicación se aplican a asignaciones propuestas o aceptadas y
se comprueban por turno; la cobertura confirmada cuenta solo aceptadas.

## S03 · E01, culto publicado con huecos

**Domingo 18 de octubre de 2026, 11:00.** Vista de referencia: jueves 15 de octubre. Las propuestas se enviaron el 13 de octubre, por lo que las pendientes
pueden mostrar «sin responder desde hace 2 días» en esta escena.

| Puesto | Confirmadas | Pendientes | Vacías |
|---|---|---|---:|
| Dirección | Sara | — | 0 |
| Lectura | — | David | 0 |
| Oración | Pablo | — | 0 |
| Mesa | Rubén | Luis | 0 |
| Proyección | Elena | — | 0 |
| Cámara | — | — | 1 |
| Puerta | Nuria | Ana | 1 |
| Monitores | Isabel, Carmen | — | 0 |
| **Total de plazas** | **7** | **3** | **2** |

Resumen: **7 de 12 confirmadas · 3 pendientes · 2 vacías**.
Faltan 5 confirmaciones, que incluyen las 3 pendientes y las 2 vacías: no es una
cuarta categoría que se sume a las otras. Hay 4 puestos incompletos contando
solo confirmaciones: Lectura, Mesa, Cámara y Puerta. Especificar la unidad si
se muestra ese número en una alerta.

## S04 · E02, borrador con dos bloqueos

**Domingo 25 de octubre de 2026, 11:00.** Misma plantilla; únicamente Luis
propuesto en Mesa e Isabel propuesta en Monitores. Ningún aviso enviado.

Resumen: **0 confirmadas · 2 propuestas · 10 vacías**. No mostrar antigüedad de
respuesta. Publicación bloqueada por Mesa sin persona autónoma y Monitores con
una sola persona. Mostrar ambos problemas y enlaces a sus puestos. Añadir a
Rubén y Carmen, como propuestas, resuelve esas dos reglas; no convierte a las
cuatro personas en confirmadas.

## S05 · E03 y candidatos con condiciones distintas

E03: **domingo 1 de noviembre de 2026, 11:00**, misma plantilla, completamente
vacía: 0 confirmadas, 0 propuestas, 12 vacías. Según la decisión heredada, el
vacío total de un turno no bloquea publicación por composición. La confirmación
explica que quedan 12 plazas vacías y no hay personas a las que avisar; no lo
presenta como equipo preparado para prestar el servicio.

Al buscar sustituto de Mesa en E01:

- Marta muestra todos los conflictos: indisponible del 17 al 19 y asignada a
  un encuentro de la misma iglesia el 18, de 10:30 a 11:30. La asignación
  previa coexistió con ese bloqueo; el conflicto advierte y no borra datos.
- Mario muestra «Ya ha alcanzado su preferencia de 2 servicios este mes».
- Ambos siguen visibles, relegados según las reglas de selección. No inventar
  prioridad entre conflictos y frecuencia si el dominio no la fija.
- En Monitores, Laura no puede asignarse para el día 18. Patricia ve la fecha
  de la credencial; un líder ve «Necesita revisión de un administrador para
  este servicio», sin detalles privados.

## S06 · Rechazo y sustitución

Variante independiente de E01: Rubén cambia a «No puedo» el sábado 17 a las
20:00. Quedan **6 confirmadas · 3 pendientes · 3 vacías**; su respuesta queda en
el historial, no ocupa una plaza. Mesa mantiene solo a Luis, aprendiz: mostrar
la falta de autónomo y el hueco crítico; no despublicar silenciosamente el culto.

Al proponer a Mario: **6 confirmadas · 4 pendientes · 2 vacías**. Si Mario
acepta: **7 confirmadas · 3 pendientes · 2 vacías**. La propuesta permite
satisfacer la composición de publicación, pero el hueco de confirmaciones sigue
hasta que acepte. El envío al nuevo candidato sigue D4.

## S07 · Nuevas propuestas sin avisos duplicados

Otra variante que parte del E01 original de S03, no del rechazo de S06.
Proponer a Joel para Cámara e Irene para la plaza vacía de Puerta.
Quedan **7 confirmadas · 5 pendientes · 0 vacías**.

Resumen del envío propuesto: «Se avisará a 2 personas nuevas: Joel e Irene».
Las 10 personas anteriores no reciben una nueva propuesta por esta acción,
incluidas las que siguen pendientes. Recordar a pendientes es una acción propia.
Conservar como pendiente de implementación el momento exacto de ese envío (D4).

## S08 · Invitación y PWA

Ana acepta la invitación a Puerta Abierta y conserva su turno de Puerta en E01.
Ve «Acogida», llegada 10:30 y culto 11:00. Al aceptar, E01 pasa de 7/3/2 a
**8 confirmadas · 2 pendientes · 2 vacías**. Al volver a rechazar, pasa a
**7 confirmadas · 2 pendientes · 3 vacías**. Son variantes, no datos del E01 base.

Joel ve «No tienes turnos asignados ahora mismo» antes de S07. La lista vacía
nombra la iglesia activa y explica que aparecerán sus próximas asignaciones.
Si el enlace de Ana caducó, puede solicitar otro para la misma iglesia.

## S09 · Disponibilidad y frecuencia

Mario mantiene máximo de 2 servicios al mes y 2 días ya servidos en octubre.
No sustituirlo por «cada dos domingos», que requiere otra regla.

Ana añade 20–23 de octubre y después 22–25, con los extremos incluidos.
Se ofrece fusionar en **20–25 de octubre**. Motivo opcional con ayuda general;
el líder ve las fechas, no el motivo. La disponibilidad pertenece a Puerta
Abierta y no se copia a La Ribera.

## S10 · Avisos y estados del servicio

Variantes: instalación necesaria, permiso pendiente, avisos listos, permiso
denegado y dispositivo no compatible. Siempre existe acceso desde la app y
correo cuando corresponda. Capturas reales de instalación pendientes de aportar.

Otra variante cambia E01 de 11:00 a 12:00: Mesa pasa a llegar a las 10:30;
Acogida y Monitores, a las 11:30. Mostrar antes/después y destinatarios. La
reconfirmación de respuestas está pendiente (D5). En cancelación, E01 se muestra
cancelado, conserva contexto y no ofrece responder; los recordatorios pendientes
no deben seguir apareciendo como próximos envíos activos.

## S11 · Incorporación final de Alabanza: repertorio y atril

Esta escena pertenece a la fase 6, cuando la general ya funciona. El equipo de Alabanza entra dentro de Puerta Abierta, manteniendo la UI/UX de su app. Sara tiene además pertenencia y liderazgo en Alabanza. Usar un nuevo servicio EF01, domingo 8 de noviembre de 2026 a las 11:00, con Luis en Sonido; no modificar los contadores de E01 al añadir esta escena.

Usar títulos inventados: «Luz al amanecer» (Sol, 72 BPM), «Juntos al caminar»
(Re, 96 BPM) y «Gracias por hoy» (Do, 68 BPM), en ese orden para EF01. No copiar
letras de canciones reales; usar contenido original de muestra señalado como tal.

Sara prepara el repertorio como líder de Alabanza. Al publicarlo se avisa a
Sonido y Multimedia; repetir sin cambios no duplica avisos. Luis consulta
el atril por servir en EF01. Sara puede acceder por pertenecer a Alabanza.
El permiso se evalúa dentro de Puerta Abierta, no en cualquier iglesia de su cuenta.

## S12 · Recuperación, permisos y límites

- Repetir una confirmación de pago conserva el tenant y las áreas de S01.
- Renombrar PA-A04 en S02 conserva las personas y turnos de S03.
- Acceso a slug ajeno: mensaje sin datos de esa iglesia.
- Cambio de iglesia con formulario sin guardar: guardar o descartar antes del
  cambio según el formulario, o cancelar; nunca guardar en el tenant nuevo.
- El estado de suscripción de Puerta Abierta solo lo ve su propietario;
  la de La Ribera no se activa por compartir una cuenta.
- Guardado de respuesta sin red: indicar el fallo y permitir reintento;
  no afirmar que el líder recibió una respuesta que no se guardó.

## S13 · Perfil, push y campana comunes antes de incorporar Alabanza

Este escenario pertenece a la plataforma general de las fases 1–3, no a la
incorporación final de Alabanza. Usar la interfaz y el comportamiento actuales.

1. Patricia entra en Perfil: foto visible y pestañas Tema, Avisos y Contraseña.
   Cambia la foto, ve su previsualización y el resultado de guardarla; la variante
   fallida conserva un error recuperable. También puede quitarla.
2. Cambia apariencia/color en el móvil. El ordenador conserva su propia elección
   y ningún miembro de la iglesia cambia de tema por esa acción.
3. Desde Avisos activa push en el móvil. Perfil y campana reflejan ese estado;
   el ordenador sigue sin activar. Al desactivarlo en el móvil se conserva la
   bandeja y no se desactiva otro dispositivo autorizado.
4. Abre la campana y consulta avisos. La variante de Ana en E01 continúa pendiente
   después de leer su propuesta: leer no equivale a aceptar el turno.
5. Ana responde en el detalle. Simular fallo del intento de push al coordinador:
   la respuesta permanece guardada y el aviso interno que se haya guardado sigue
   disponible. No afirmar recepción externa cuando no consta.
6. Patricia cambia contraseña. Volver abre la pestaña Contraseña con el resultado;
   una validación fallida se muestra ahí. Cerrar sesión sigue accesible en móvil.
7. Con Sara, cambiar de iglesia conserva preferencias del dispositivo pero
   recarga roles y avisos del tenant. No mostrar la bandeja de Puerta Abierta
   bajo la cabecera de La Ribera.

Si están habilitados push y correo para un aviso, ambos pueden intentarse.
El autor no recibe el aviso de su propia acción. Las variantes no modifican
los contadores base de S03 a menos que se ejecute la respuesta descrita en S08.
Al incorporar Alabanza al final, estos recorridos no se duplican en otro perfil.

## Control de coherencia

Las variantes parten explícitamente de una base y no se acumulan. En estos
ejemplos no hay sobreasignación, por lo que confirmadas + pendientes/propuestas
+ vacías = 12. No usar esa suma como regla universal para datos sobreasignados.
Confirmadas cuenta plazas, no puestos; ocho puestos pueden necesitar doce personas.
Los nombres cambiados de áreas se propagan en la misma iglesia. Los domingos y
las horas se muestran en Europe/Madrid, también al cruzar el cambio de hora.
