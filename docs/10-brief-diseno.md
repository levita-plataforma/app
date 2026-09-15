# Brief de diseño de LEVITA

Revisión: **15 de septiembre de 2026**. Encargo para diseñar el producto;
no acredita pantallas implementadas. Leer [Visión](00-vision.md),
[Iglesias y tenants](12-iglesias-y-tenants.md) y [Plan por fases](13-plan-por-fases.md).

## Referencia obligatoria

Toda la UI, UX y funcionamiento común deben proceder de la app existente de Alabanza: acceso, perfil, preferencias, push, campana y demás recorridos compartidos. Su módulo específico y equipo se integrarán al final con LEVITA. Leer [Referencia UI/UX](14-referencia-uiux-alabanza.md) antes de dibujar. Reutilizar componentes, temas, navegación y comportamiento; la landing no es la referencia de la aplicación.

## Objetivo

Diseñar una plataforma multiiglesia comprensible: una iglesia se registra y paga,
o LEVITA inicia su alta; entra en su espacio, adapta una base de áreas y organiza
el servicio. Una persona puede estar en varias iglesias sin mezclar sus datos
ni trasladar privilegios de una a otra.

El éxito del coordinador es saber qué falta para el domingo. El del servidor
es entender cuándo llegar y responder en pocos segundos. El del propietario es
activar y configurar su iglesia sin conocimientos técnicos.

## Perfiles y contexto

| Perfil | Necesita | Contexto |
|---|---|---|
| Operación LEVITA | Iniciar y seguir altas asistidas | Escritorio; acceso operativo independiente |
| Propietario | Alta, cuota y configuración de su iglesia | Escritorio o móvil durante el registro |
| Administrador | Áreas, personas, puestos y servicios | Escritorio como contexto principal |
| Líder de área | Programar su área y resolver huecos | Escritorio; también puede usar la PWA para sus turnos |
| Servidor | Responder, consultar llegada y disponibilidad | Móvil, sesiones cortas; puede tener poca experiencia digital |

El nombre de la iglesia activa es visible en cabecera, invitaciones, pago y
confirmaciones. Mostrar el selector solo cuando aporte una elección real.
No usar «tenant», RLS, token ni webhook como texto de interfaz.

## Orden confirmado

Primero se construye y valida la general con las demás áreas. La app actual de Alabanza sigue funcionando hasta incorporarse, al final, dentro de LEVITA. Su UI/UX se hereda desde el primer diseño. Repertorio y Atril no se presentan como módulos activos de la general antes de esa fase.

## Alcance y orden de entrega del diseño

### Tanda A · Alta y configuración multiiglesia

1. Registro de iglesia: nombre, cuenta propietaria y zona horaria.
2. Resumen de cuota y paso al pago, con cuota por definir en anotación de diseño.
3. Activación: pendiente, pago fallido/cancelado, activado y recuperación.
4. Personalización de la base de áreas: crear, editar, renombrar y ordenar.
5. Inicio operativo de alta asistida y enlace enviado al propietario.
6. Selector de iglesia y variantes de permisos al cambiar.
7. Suscripción de la iglesia: estado y recuperación del pago por el propietario.

Incluir también el Perfil común existente como recorrido operativo: foto, Tema/Avisos/Contraseña y cierre de sesión. Reutilizar su lógica y feedback; no limitar la entrega a su apariencia.

La base propuesta de áreas generales se copia a cada iglesia; ver los nombres editables de S01. Usar S01 y S02 de los escenarios
para comprobar que renombrar Bienvenida a Acogida no modifica a otra iglesia.
Distinguir base inicial de áreas y plantilla recurrente de un servicio.

### Tanda B · Programación y PWA

8. Personas, invitaciones y configuración de puestos de un área.
9. Plantilla de servicio y creación del primer culto.
10. Próximos servicios: confirmadas, pendientes de respuesta y vacías.
11. Programación agrupada por áreas; panel lateral de candidatos.
12. Publicación: resumen, errores bloqueantes y nuevas propuestas.
13. Invitación, entrada y recuperación con el funcionamiento actual de Calserv; D8 resuelve la conexión de cuentas, no un cambio de método de acceso por defecto.
14. Mis turnos, detalle, respuesta y cambio de respuesta.
15. Disponibilidad: rangos de fechas, fusión de solapes y máximo al mes.
16. Activación de avisos y alternativas cuando push no está activo.
17. Rechazo posterior, sustitución, cambio de hora y cancelación.

Se pueden usar variantes del mismo componente para errores y estados vacíos;
no hace falta un artboard aislado para cada mensaje. Conectar los recorridos
principales para que se puedan recorrer, con datos ficticios consistentes.

### Tanda C · Incorporación final de Alabanza dentro de la general

18. Integrar el catálogo y editor existentes, conservando sus funciones y añadiendo aislamiento por iglesia.
19. Integrar el repertorio existente del culto con orden, tono y publicación.
20. Integrar el atril existente, sus modos de lectura y controles; no reducirlo a una pantalla nueva con solo siguiente.

Es la entrega de integración final de la fase 11 del plan integral; se reutiliza el bloque R existente o se completa lo que falte tras verificarlo. No omitirla de un encargo destinado a
integrar la app de Alabanza. Se revisa después de las tandas A y B, sin ampliar a otros
módulos por inferencia.

## Estructura y jerarquía

Reutilizar la estructura actual de Calserv: lateral en escritorio y barra inferior móvil con Inicio, Equipo, Repertorio, Cronograma y Perfil. Añadir iglesia activa y permisos por tenant. Integrar administración de áreas, disponibilidad y suscripción como extensiones de esa navegación; la ubicación concreta se valida con la app existente. Operación utiliza una superficie separada para altas y activación.

En programación, la necesidad de cada puesto y su estado dominan la pantalla.
Evitar estadísticas decorativas. Mostrar plazas confirmadas, pendientes y
vacías con sus etiquetas: asignar a alguien no significa que haya confirmado.
En borrador usar «Propuesto»; no mostrar «sin responder desde hace 3 días» si
todavía no se ha enviado ninguna propuesta.

En una tarjeta móvil, priorizar: iglesia, puesto, llegada, fecha del culto y
respuesta. Diferenciar «Llega a las 9:30» de «El culto empieza a las 11:00».
El contexto de iglesia puede estar en la cabecera si es inequívoco para la lista.

## Reglas que el diseño debe respetar

- Crear o renombrar un área conserva sus relaciones y solo afecta a su iglesia.
- Las personas pendientes de aceptar invitación ya pueden tener turnos.
- Los candidatos muestran todos sus conflictos antes de elegir. Un conflicto
  de disponibilidad o carga no oculta a una persona ni la veta automáticamente.
- Credenciales obligatorias y composición tienen bloqueos propios. Aplicar los
  ejemplos de [Dominio](01-modelo-dominio.md), incluida la excepción de turnos vacíos.
- Los datos de credenciales y motivos privados no aparecen para un líder.
  Mostrar una explicación permitida y remitir al administrador cuando proceda.
- Publicar explica destinatarios y huecos; republicar no vuelve a avisar a todos.
- Confirmar el pago no equivale a activar el tenant hasta que termine el proceso.
- Los errores conservan datos y ofrecen siguiente paso; ninguna acción de demo
  debe fingir un pago real, correo enviado o guardado en producción.
- Cambio de iglesia recarga contexto y permisos; no mostrar datos de la anterior
  durante la carga ni una lista global de personas de varias iglesias.

Los supuestos abiertos de publicación, pago, soporte y cambios están en
[Decisiones](07-decisiones.md). Representarlos en notas de revisión, no resolverlos
silenciosamente mediante una pantalla.

## Sistema visual que se hereda

La fuente es Calserv, documentada en [Referencia UI/UX](14-referencia-uiux-alabanza.md): Work Sans para texto, Outfit para titulares, tokens existentes, componentes de src/components/ui y navegación actual. El código arranca con Negro + Escenario y conserva elecciones de tema por dispositivo. Mantener también las variantes existentes, sin redefinir su paleta a partir de la landing.

El encargo amplía esa aplicación. La continuidad incluye posiciones de acciones, diálogos, respuesta, avisos, espaciado y comportamiento responsive; no basta copiar colores. El nombre LEVITA y el contexto de iglesia se incorporan sin convertir la identidad LFY en marca fija de todos los tenants.

## Componentes y accesibilidad de diseño

Preparar cabecera de iglesia y selector; navegación por perfil; tarjeta de
servicio; filas de puesto y persona; estado con etiqueta; selector de candidato;
formularios de alta y área; diálogo de publicación; respuesta móvil; mensajes
de error; estado vacío y guía de avisos.

Propuestas de evaluación: texto principal móvil alrededor de 16 px, controles
táctiles de al menos 44 × 44 px, foco visible y navegación por teclado, etiquetas
persistentes en formularios, errores asociados al campo y lectura con zoom al
200 %. Mantener el orden de foco al abrir y cerrar paneles. Respetar reducción
de movimiento. Estas medidas son objetivos del diseño, no una declaración de
cumplimiento sin comprobarlo.

Artboards de referencia: panel 1440 px; móvil 390 px. Revisar el comportamiento
estrecho a 360 px y de escritorio a 1280 px. El alta debe poder completarse en
móvil. Usar desplazamiento cuando haga falta, sin reducir el texto para encajar.

## Lenguaje

Español de España, frases concretas y verbos de acción. «Iglesia» en la interfaz;
«área de servicio» para la organización interna; «puesto» para su función;
«turno» para la participación asignada. «Próximos servicios» como sección;
«Culto del domingo» como nombre del evento. «Personas» se refiere al equipo.

Ejemplos: «Crear área», «Cambiar nombre», «Puedo servir», «No puedo»,
«Personalizar áreas», «Volver al pago», «Falta una persona».
No usar etiquetas técnicas ni mensajes como «Error de validación».

## Evidencias y entrega

Entregar maquetas de alta fidelidad y, si la herramienta lo permite, un prototipo
navegable con selector de escenarios. Incluir componentes reutilizables, estados
vacíos/de carga/de error, notas de decisiones pendientes y correspondencia con
S01–S13 de [Escenarios](11-escenarios-diseno.md).

La guía de instalación requiere capturas reales del dispositivo validado. Si no
se aportan, reservar espacios explícitamente marcados como pendientes en la
maqueta; no presentar capturas generadas como reales.

Se aprueba el recorrido cuando una persona puede identificar su iglesia,
completar el alta, renombrar un área, entender qué falta en el culto y responder
su turno sin explicación. Los datos y totales deben cuadrar entre pantallas.

## Paridad funcional, además de visual

Comparar en la app existente y en LEVITA: acceso/recuperación, foto, tema, contraseña, sesión, activación y desactivación push, campana, lectura y respuesta a turno. Mantener los estados de carga y error y el alcance por dispositivo o iglesia que corresponda. La base común entra en las fases de la general; repertorio, atril, equipo e historial específico de Alabanza entran al final. Ver S13 y el [inventario funcional](14-referencia-uiux-alabanza.md).\n\n---\n\n# Ampliación de brief — plataforma integral\n\nLa navegación y el sistema de diseño deben soportar módulos sin parecer productos separados. El diseño debe prever: selector de iglesia, sede contextual, módulos habilitados, People, calendario, Serving, Groups, Events, Kids, Communications, Facilities y administración. Los módulos sensibles (Kids, Pastoral, Giving) deben comunicar visualmente su ámbito y restringir exposición de datos.\n\nEstados obligatorios de componentes: loading, empty, error recuperable, forbidden, module disabled, archived y conflicto. Las tablas administrativas deben tener búsqueda, filtros, paginación y acciones masivas seguras. En móvil priorizar acciones rápidas; en escritorio, densidad y coordinación.\n