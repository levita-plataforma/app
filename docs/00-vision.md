# Visión y alcance

Revisión: **15 de septiembre de 2026**. Los requisitos de esta página describen
el producto que se quiere construir. El [índice](README.md) distingue ese
producto de la landing que contiene este checkout.

## Qué es LEVITA

**LEVITA es una plataforma SaaS multiiglesia. Cada iglesia es un tenant:** un
espacio propio con sus personas, áreas de servicio, puestos, programación,
permisos, ajustes y suscripción. Una misma plataforma sirve a varias iglesias
sin mezclar sus datos ni sus decisiones.

El núcleo funcional inicial organiza turnos y avisos. «Personas» significa las
personas que sirven; «comunicación», los avisos relacionados con su servicio.
La gestión de miembros, donaciones, contabilidad, asistencia y grupos pequeños
no se incluye por inferencia a partir de la promesa amplia de la landing.

## Decisiones confirmadas por el promotor

El 15 de septiembre de 2026 se concreta que:

1. La plataforma puede dar de alta una iglesia desde su operación interna.
2. La iglesia también puede registrarse por sí misma pagando una cuota.
3. Cada iglesia recibe una base inicial de áreas de servicio editable.
4. La iglesia puede crear más áreas, editar las existentes y cambiarles el nombre.
5. Estos cambios pertenecen a su tenant y no afectan a otras iglesias.
6. La UI, UX y funcionamiento común proceden de la app actual de Alabanza: perfil, acceso, push, campana, preferencias y demás comportamientos compartidos.
7. La plataforma general y las demás áreas se construyen primero; Alabanza es la última en entrar y se incorpora dentro de la general.

El importe y la periodicidad de la cuota están por definir. La suscripción y el
alta forman parte del lanzamiento; la antigua decisión de dejar toda la
facturación para fase 4 queda sustituida. Ver [Facturación](06-facturacion.md)
y [Iglesias y tenants](12-iglesias-y-tenants.md).

## El problema que resuelve el núcleo

Una iglesia de barrio con unos 80 asistentes tiene varias áreas de servicio y
entre 15 y 40 personas que rotan. Con WhatsApp y una hoja de cálculo cuesta
saber quién ha confirmado, evitar conflictos y detectar los huecos del domingo.

**El coordinador**, pastor o líder de área, prepara la programación en
escritorio. **El servidor** responde desde el móvil y consulta cuándo llegar.
**La persona propietaria de la iglesia** completa el alta, configura su espacio
y gestiona la cuota. **La operación de LEVITA** tramita las altas asistidas;
ese papel no equivale a ser administrador de todas las iglesias.

Los tiempos objetivo —diez minutos para programar y treinta segundos para
consultar o responder— se validarán con personas del piloto.

## Entregas

| Entrega | Alcance |
|---|---|
| Landing actual | Marca, anuncio de «Muy pronto» y maqueta ilustrativa |
| Lanzamiento multiiglesia | Alta asistida y autoservicio, pago, activación del tenant, base editable de áreas, pertenencias y permisos |
| Núcleo de programación | Puestos, personas, plantillas de servicio, cultos, asignaciones, disponibilidad, respuestas y avisos |
| Integración de Alabanza | Lo anterior más canciones, repertorio y atril; migración condicionada a que funcionen C, D y R del backlog histórico |
| Evolución posterior | Automatización avanzada, equipos asignados en bloque, varias sedes y otras funciones pendientes de priorizar |

Las dos filas de lanzamiento y núcleo forman la primera experiencia de
producto. No basta diseñar una programación aislada de su alta y su iglesia.
La app de Alabanza continúa funcionando mientras se construye la general. Su repertorio, atril, usuarios y datos se integran en la fase final, preservando su experiencia. Su UI/UX y las funciones comunes se reutilizan desde las primeras fases; no se posponen el perfil ni los avisos de las áreas generales hasta la incorporación de Alabanza.

## La medida del éxito

La iglesia completa el alta y adapta sus áreas sin ayuda técnica. El sábado a
las 20:00 el coordinador puede distinguir lo confirmado, lo pendiente de
respuesta y lo vacío. Un servidor entiende su turno y responde sin explicación.
Una persona que pertenece a dos iglesias sabe siempre en cuál está trabajando.

## Marca y promesa pública

La landing habla de una «plataforma completa para iglesias». La estructura
multiiglesia sí está confirmada; esa frase no aprueba por sí sola módulos de
contabilidad, membresía o donaciones. Los nuevos diseños siguen el alcance de
esta página. El texto público se revisará contra este alcance antes de abrir
el registro; esta tarea documental no modifica la landing.

La UI y UX del producto proceden de la app de Alabanza existente (Calserv / LFY Worship), por instrucción del promotor. Ver [Referencia de UI y UX](14-referencia-uiux-alabanza.md). La identidad de la landing es una referencia comercial, y deja de ser el punto de
partida visual de las aplicaciones.

## Propuesta y evidencia pendiente

Experiencia en español de España, adaptada a iglesias pequeñas y con cobro en
euros. Las afirmaciones antiguas sobre exclusividad frente a competidores y
sus precios quedan como hipótesis: el estudio citado no está incluido aquí y
no hay fuentes fechadas suficientes para convertirlas en promesas comerciales.
