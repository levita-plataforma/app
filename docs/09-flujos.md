# Flujos de pantalla

Especificación de experiencia revisada el **15 de septiembre de 2026**.
Aplica al producto multiiglesia. No acredita que los recorridos estén desplegados.
Todos usan la [UI y UX de Alabanza](14-referencia-uiux-alabanza.md).
Las reglas se centralizan en [Dominio](01-modelo-dominio.md),
[Permisos](02-datos-y-rls.md) y [Tenants](12-iglesias-y-tenants.md).

## Flujo 1 · Montar la programación del domingo

**Quién:** administrador o líder dentro de sus áreas.
**Éxito:** preparar las propuestas en unos diez minutos; objetivo del piloto.

1. Inicio / Cronograma, dentro de la iglesia activa: ver próximos servicios y
   separar plazas confirmadas, pendientes y vacías.
2. Abrir un culto con puestos agrupados en el orden de las áreas de esa iglesia.
3. Elegir un puesto y ver miembros cualificados, con rotación, frecuencia y
   todos sus conflictos antes de asignar.
4. Proponer personas. En borrador no se han enviado avisos; usar «Propuesto».
5. Publicar desde el perfil autorizado y revisar los efectos (flujo 2).

Los candidatos con indisponibilidad, solapes o frecuencia alcanzada siguen en
la lista, marcados y relegados. No ocultarlos como si no existieran. El motivo
privado del bloqueo solo se muestra a quien tenga permiso. Quien no pueda
cubrir el puesto por un requisito bloqueante ve una explicación permitida y
la acción necesaria, no una casilla de ignorar el bloqueo.

La publicación comprueba credenciales para el día del culto y composición:
niños parcialmente cubierto con una persona bloquea; sonido con solo un
aprendiz bloquea si exige autónomo. Un turno totalmente vacío permite publicar
según la decisión heredada, pero sigue visible como hueco; nunca se considera
seguro o listo por haber pasado la publicación. Ver ejemplos de Dominio y S04–S05.

| Estado | Presentación |
|---|---|
| Sin puestos | «Este servicio no tiene puestos todavía» y crear desde plantilla |
| Plaza vacía | Número que falta y acción de asignar |
| Propuesta en borrador | «Propuesto»; sin antigüedad de respuesta |
| Propuesta publicada | «Pendiente de respuesta» y tiempo desde el aviso si consta |
| Confirmado | Nombre y confirmación legible, sin confundirlo con pendiente |
| Todos con conflictos | Mostrar candidatos y sus advertencias; no decir que no hay miembros |
| No hay miembros aptos | Explicar y abrir gestión del área, según permisos |
| Publicación bloqueada | Todos los problemas y acceso al puesto que hay que corregir |

## Flujo 2 · Publicar y enviar nuevas propuestas

**Quién:** propietario/admin en el prototipo. La publicación por líder requiere
resolver D2; no conceder acceso global por dibujar un botón.

1. Mostrar iglesia, culto, personas a avisar, plazas propuestas y vacías.
2. Si hay bloqueos, mostrar todos antes de confirmar; corregir y volver.
3. Confirmar publicación y reflejar que se han preparado los avisos.
4. Mostrar respuestas a medida que consten, sin afirmar entrega real antes de
   confirmarla. Si falla la acción, conservar el borrador.

Publicar un borrador, añadir personas después y recordar a pendientes son
acciones diferentes. No despublicar para reenviar. En S07, solo Joel e Irene
reciben nuevas propuestas; los destinatarios anteriores no se repiten.

**Pendiente D4:** concretar si las nuevas asignaciones en un culto publicado
notifican al guardar o tras confirmar una nueva tanda. El diseño propone
previsualizar los destinatarios; la implementación debe usar un solo momento
de envío y deduplicarlo. El historial de triggers se contrasta antes de portarlo.

## Flujo 3 · Responder al turno

**Quién:** servidor, desde el detalle existente de Alabanza adaptado a su área.

1. Abrir el aviso, el correo o el turno desde Inicio / Cronograma.
2. Ver iglesia, puesto, llegada, culto y compañeros autorizados.
3. Pulsar «Puedo servir» o «No puedo». Nota de rechazo opcional.
4. Dar feedback inmediato; confirmar guardado o recuperar si falla.
5. Permitir cambiar de respuesta mientras la asignación y el servicio sigan
   vigentes. No pedir al líder que deshaga un toque accidental.

Las acciones directas en una notificación son un atajo condicionado a las
capacidades del dispositivo; no diseñar la app dependiendo de que existan.
Si hay un enlace caducado, dirigir al acceso normal y después al mismo turno.
Sin red: indicar que la respuesta no se pudo guardar y permitir reintento;
no afirmar que el líder ya la recibió. Si el turno fue retirado o el culto
cancelado, conservar el contexto y mostrar que ya no requiere respuesta.
El contrato final de esos estados y límites temporales se resuelve en D5.

## Flujo 4 · Activar avisos

Ampliar Perfil / Avisos y la campana de la app de Alabanza. Se reutiliza su funcionamiento de bandeja, push y correo en las áreas generales; cada aviso conserva contexto de iglesia. No esperar a la incorporación final del equipo de Alabanza. Perfil y campana comparten estado por dispositivo; los siete estados de diagnóstico observados se detallan en [Notificaciones](03-notificaciones.md).

| Diagnóstico de referencia | Experiencia requerida |
|---|---|
| Comprobando | Estado de carga del dispositivo |
| Servicio sin configurar | Mensaje claro, sin aparentar que se activó |
| Navegador no compatible | Mantener bandeja y otros canales disponibles |
| Registro push no disponible | Orientar instalación o recuperación según el diagnóstico real |
| Permiso pendiente | Acción explícita para activar en este dispositivo |
| Permiso denegado | Explicar cómo recuperarlo |
| Suscrito | Confirmación y opción de desactivar en este dispositivo |

La guía de iPhone propuesta usa Compartir → Añadir a pantalla de inicio → abrir
desde el icono. Verificar pasos y capturas con el dispositivo/versiones de
referencia antes de darla por terminada. Usar capturas reales; si faltan,
reservar el espacio y marcarlo como pendiente en la maqueta.

Explicar el propósito: «Para recibir avisos en este dispositivo, añade la app
a la pantalla de inicio». El permiso se solicita con una acción voluntaria.
No impedir responder turnos a quien no active push. En Equipo, el coordinador
ve si puede contar con ese canal; «push activo» no es prueba de que se haya leído
un aviso. La integración de bandeja y cola se cierra en D8.

## Flujo 5 · Dar de alta y configurar una iglesia

**Quién:** nuevo propietario o propietario invitado desde un alta asistida.

1. Autoservicio: crear su alta. Asistido: abrir la invitación iniciada por
   operación. Ambos muestran qué iglesia se está creando.
2. Completar cuenta y datos, revisar cuota y pagar según [Facturación](06-facturacion.md).
3. Volver a confirmación pendiente; al terminar activación, entrar a su tenant.
4. Recibir la base propia de cinco áreas y personalizarla: editar, renombrar,
   ordenar y crear más. Guardar cada cambio con feedback recuperable.
5. Preparar puestos, invitar a personas y crear el primer servicio desde plantilla.

Un pago interrumpido retoma la misma alta. Un pago confirmado con activación
incompleta no solicita otro cobro. Repetir un evento del proveedor no duplica
el tenant ni las áreas. No usar una cuota ficticia ni prometer gratuidad.

**Renombrar:** Bienvenida pasa a Acogida, conservando identidad, miembros y
turnos; otras iglesias conservan sus propios nombres. Hospitalidad puede
crearse aunque no forme parte de la plantilla del domingo. No confundir la
base de áreas con una plantilla que crea servicios recurrentes.

Estados: alta incompleta, pago pendiente/fallido, confirmando, tenant activado,
áreas iniciales, formulario de área con error y área nueva sin puestos.

## Flujo 6 · Invitación y entrada al equipo

1. Administrador añade a una persona dentro de la iglesia; puede proponerla
   para turnos antes de que acepte la invitación.
2. La invitación identifica iglesia y finalidad del acceso.
3. Al entrar o activar cuenta se vincula su pertenencia y conserva sus turnos.
4. Si ya pertenece a otra iglesia, no se copian sus datos ni sus privilegios.
5. Continuar al destino original: turno, área o inicio de la iglesia invitante.

Enlace caducado o ya utilizado: explicar y permitir recuperar el acceso sin
crear otra persona. El sistema de entrada conserva el funcionamiento de Calserv (contraseña y recuperación existentes). La propuesta antigua de enlace mágico queda sustituida; D8 resuelve la conexión de cuentas entre proyectos. No diseñar dos cuentas independientes para el mismo acceso por
inercia del monorepo. El registro de iglesias no da acceso abierto a equipos ajenos.

## Flujo 7 · Disponibilidad y frecuencia

Cada persona consulta y edita sus bloqueos en la iglesia activa. Fechas inicial
y final incluidas; motivo opcional con ayuda: «No hace falta decir por qué.
Si lo pones, algo general basta, como viaje».

Si los tramos se solapan, ofrecer fusionarlos, mostrar el intervalo resultante
y conservar datos si falla el guardado. S09: 20–23 más 22–25 queda 20–25.

Frecuencia simple: máximo deseado de servicios al mes. Alcanzarlo relega en las
sugerencias, sin prohibir asignación. «Cada dos domingos» no equivale a ese
máximo y queda fuera de esta versión. No copiar bloqueos entre tenants.
El efecto sobre turnos ya aceptados se explica: declarar indisponibilidad no
los rechaza silenciosamente; la persona revisa esos turnos y responde.

## Flujo 8 · Rechazo después de publicar

1. La persona cambia a «No puedo» y deja de ocupar una plaza de cobertura.
2. El coordinador ve el hueco y el estado de composición actualizado.
3. Un puesto crítico activa el escalado previsto; buscar sustituto en el mismo
   puesto, conservando la respuesta anterior en el historial.
4. Proponer sustituto y enviar por el mecanismo único acordado en D4.
5. Solo su aceptación devuelve esa plaza a confirmadas.

No despublicar el evento automáticamente. No representar al aprendiz como
capaz de cubrir solo un puesto que exige autónomo. S06 separa propuesta y
aceptación para que los contadores sean comprobables.

## Flujo 9 · Cambiar o cancelar un culto

Mostrar iglesia, servicio, valores anteriores/nuevos y afectados antes de
confirmar. Recalcular horas de llegada y recordatorios. Si cambia la fecha,
revalidar credenciales para la fecha nueva y mostrar conflictos; el historial
relata una carencia de implementación en ese punto.

La necesidad de reconfirmar una respuesta al cambiar la hora queda en D5. No
inventar una aceptación nueva del servidor. Cancelar conserva contexto,
retira acciones de respuesta y cancela recordatorios pendientes. Los avisos de
cambio/cancelación respetan destinatarios y no se repiten por reintentar.

## Flujo 10 · Incorporación final de Alabanza, repertorio y atril

Este flujo se activa en la general al terminar las fases previas. Hasta entonces el equipo continúa usando la app actual; reutilizar sus componentes de UI/UX no adelanta su traspaso de cuentas y datos.

Partir de Repertorio y Atril de Calserv: misma búsqueda, selección, edición,
lectura y acciones. Inventariar lo implementado antes de encargar una nueva
pantalla o eliminar funciones que el equipo ya usa.

El catálogo pertenece a la iglesia, lo edita quien tenga permiso en Alabanza;
el repertorio de un culto tiene orden y tono. Publicarlo avisa a las áreas
receptoras sin repetir avisos cuando no cambió. El atril conserva temas,
legibilidad, navegación y funciones existentes. Acceso según pertenencia y
participación del evento, revalidado dentro del tenant. Usar letras originales
de muestra en las maquetas.

## Flujo 11 · Cambiar de iglesia

Iglesia activa visible en la estructura de Calserv. Una sola pertenencia:
entrada directa. Varias: selector con sus iglesias autorizadas y el rol allí.
Al cambiar se recargan datos y permisos; los formularios sin guardar ofrecen
cancelar el cambio o resolver los cambios dentro del tenant original.

Mientras carga, no mostrar datos de la iglesia anterior bajo la nueva cabecera.
Un enlace a una iglesia ajena explica falta de acceso sin revelar su contenido.
S02 comprueba que Sara es líder en Puerta Abierta y servidora en La Ribera.

## Flujo 12 · Perfil común de la plataforma general

Usar el Perfil existente, con foto encima de las pestañas Tema, Avisos y
Contraseña. La persona puede subir/cambiar/quitar su foto, modificar apariencia
y color en el dispositivo, activar/desactivar push aquí, cambiar contraseña
y cerrar sesión desde móvil o escritorio.

Conservar previsualización, carga, errores y feedback de guardado. Volver de
cambiar contraseña abre esa pestaña con el resultado. El estado de Avisos debe
ser coherente con el control de la campana. Cambiar el tema en un dispositivo
no altera el del resto del equipo; el perfil no concede permisos de otra iglesia.

Estos recorridos se habilitan para la general en las primeras fases. Cuando
Alabanza entre al final utilizará la misma base, sin un segundo perfil ni otro
sistema de suscripción push. Datos, sesión y permisos se adaptan a pertenencias
por iglesia sin copiar información privada entre equipos. Ver S13 de escenarios.

## Principios comunes

Un vacío es una pantalla con contexto y siguiente paso. Los errores dicen qué
hacer y conservan lo introducido. Fechas y llegada usan la zona de la iglesia;
confirmaciones y acciones identifican el tenant. Estados con texto e iconos,
no solo color. Conservar componentes, patrones y preferencias de Alabanza;
anotar cualquier mejora de UX para aplicarla de forma compartida.
