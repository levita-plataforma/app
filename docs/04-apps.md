# Aplicaciones y navegación

Especificación de referencia revisada el 15 de septiembre de 2026. Las apps y
API descritas aquí no están en este checkout. Ver [estado y procedencia](README.md).
La landing existente utiliza la configuración de su `package.json`.

## Superficies del producto multiiglesia

| Superficie | Para quién | Función |
|---|---|---|
| Registro público | Nueva iglesia | Crear su alta y completar la cuota |
| Operación LEVITA | Personal autorizado de plataforma | Iniciar altas asistidas y consultar su activación |
| Panel de iglesia | Propietario, administradores y líderes | Configurar y programar dentro del tenant |
| PWA | Servidores, incluidos líderes que también sirven | Responder y consultar turnos en móvil |

La arquitectura heredada separa `apps/dashboard` y `apps/pwa`, compartiendo
dominio, datos y componentes. Es una elección de organización y despliegue,
no una limitación universal que impida otras arquitecturas PWA. Cada app sirve
a múltiples iglesias. No se crea una instalación por tenant.

## Continuidad de navegación

Toda la UI/UX procede de Calserv: lateral de escritorio y navegación inferior con Inicio, Equipo, Repertorio, Cronograma y Perfil. La tabla siguiente es un inventario funcional que se integra en esa estructura, no una barra nueva de navegación. Ver [Referencia UI/UX](14-referencia-uiux-alabanza.md).

## Mapa funcional para diseño

| Sección | Contenido | Perfil |
|---|---|---|
| Alta de iglesia | Nombre, cuenta propietaria, cuota, pago y activación | Nuevo propietario |
| Configuración inicial | Base de áreas: editar, renombrar y crear más | Propietario/admin |
| Próximos servicios | Confirmadas, pendientes y vacías | Propietario/admin; líder limitado a sus áreas |
| Servicio | Puestos, personas, selección, publicación y cambios | Gestión según permisos |
| Áreas de servicio | Áreas propias, puestos, miembros y líderes | Propietario/admin; líder gestiona lo permitido de su área |
| Personas | Personas que sirven, invitaciones y estado de avisos | Propietario/admin; acceso de líderes según matriz |
| Plantillas de servicio | Puestos y necesidades habituales | Propietario/admin |
| Suscripción | Cuota y pago de esta iglesia | Propietario |
| Ajustes de iglesia | Nombre, zona horaria y configuración | Propietario; delegación por definir |
| Canciones y repertorio | Catálogo del área de Alabanza y selección por culto | Bloque R, con permisos propios |
| Mis turnos (PWA) | Lista y detalle, respuesta, llegada y compañeros | Persona asignada |
| Disponibilidad (PWA) | Bloqueos y frecuencia mensual deseada | Cada persona |
| Ajustes (PWA) | Avisos y sesión | Cada persona |
| Atril (PWA) | Canción a pantalla completa y siguiente | Bloque R; quien sirve en el evento o pertenece a Alabanza |

El selector de iglesia es parte de ambas aplicaciones. Operación utiliza un
acceso propio; no se mezcla con el menú de una iglesia. La facturación ya no
se oculta como fase 4. Las rutas técnicas concretas del alta y operación quedan
por definir: el mapa no acredita endpoints construidos.

## Rutas heredadas

Panel: `/`, `/eventos/nuevo`, `/eventos/[id]`, `/areas`, `/areas/[id]`,
`/personas`, `/plantillas` y `/ajustes`. PWA: `/`, `/turno/[id]`,
`/disponibilidad` y `/ajustes`.

El contexto propuesto es `/i/[slug]` dentro del origen de cada app. Por ejemplo,
`/i/puerta-abierta` y `/i/la-ribera` identifican dos espacios independientes.
Los dominios `app.tuiglesia.es` y `mi.tuiglesia.es` son ejemplos heredados.
El servidor revalida siempre la pertenencia: el slug nunca acredita acceso.

## Cuenta, alta e invitaciones

Calserv usa contraseña e invitación con recuperación. La instrucción vigente es conservar ese funcionamiento; la propuesta antigua de enlace mágico queda desplazada. D8 resuelve cómo conectar las cuentas y pertenencias entre proyectos sin obligar a utilizar dos accesos. El **registro de iglesias con pago**
y el **acceso de voluntarios por invitación** son procesos diferentes.
La antigua frase «registro abierto desactivado» corresponde a miembros que
intentan entrar en una iglesia existente, no elimina el nuevo registro comercial.

Una persona invitada puede recibir asignaciones antes de activar su cuenta.
Al aceptar, conserva la ficha e historial de esa iglesia. Una cuenta que ya
existe se vincula a su nueva pertenencia, sin importar datos de otros tenants.
Un enlace identifica su iglesia; con varias pertenencias, se puede cambiar
entre las autorizadas. Ver [flujos 5, 6 y 11](09-flujos.md).

## Contratos API de referencia, pendientes de verificar

| Operación | Referencia heredada | Condiciones |
|---|---|---|
| Responder turno | `POST /api/respond`, `{ token, response: 'accept' \| 'decline' }` | Token firmado y limitado a persona y asignación; validar el tenant y el estado del servicio |
| Suscribir push | `POST /api/push/subscribe`, `{ subscription, userAgent? }` | Sesión y pertenencia; resolver cómo un dispositivo recibe avisos de varias iglesias sin mezclarlos |
| Recibir cambios de pago | `POST /api/stripe/webhook` | Verificar firma sobre cuerpo original, sin sesión de usuario; idempotencia y vinculación a tenant |

La respuesta heredada de `/api/respond` propone 200 con `ok` y `estado`, 400
para petición inválida, 401 para token caducado y 404 para asignación no accesible.
Los casos de turno retirado o culto cancelado necesitan concretar su contrato
antes de implementar. No describir estos endpoints como disponibles en la landing.

## Estado de implementación

El antiguo apartado «todas las pantallas vacías» quedó superado por notas de demos e iconos en `TAREAS.md`. Se ha localizado el monorepo en Documents/Levitaapp. Su existencia se ha comprobado, pero no se han auditado aquí todas las funciones ni ejecutado sus pruebas. La referencia UI/UX identifica los repositorios y HEAD. Se conserva el backlog como historial y se retira la lista duplicada de hechos y pendientes.


## Orden de incorporación

El mapa anterior incluye el destino completo. Primero se activan las áreas generales; Repertorio y Atril se incorporan a LEVITA con Alabanza en la fase final. La app actual conserva esas funciones mientras tanto. La UI/UX de todo el producto sí procede de esa app desde el inicio.

## Base funcional de las aplicaciones

Perfil conserva foto, Tema, Avisos, Contraseña y cierre de sesión. El funcionamiento compartido de push y campana, acceso y preferencias se reutiliza desde las primeras fases, adaptado a cada iglesia; la incorporación final de Alabanza no retrasa esas funciones de la general. Ver [inventario funcional](14-referencia-uiux-alabanza.md) y [avisos](03-notificaciones.md).
