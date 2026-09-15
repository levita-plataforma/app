# Plan de producto por fases

Revisión: **15 de septiembre de 2026**. Plan vigente tras las aclaraciones del
promotor. El [backlog](TAREAS.md) conserva contexto histórico; este documento
marca el orden actual.

## Idea confirmada

LEVITA será la plataforma general multiiglesia. Cada iglesia tendrá su propio
espacio: podemos darla de alta nosotros o puede registrarse pagando su cuota.
Recibe una base de áreas de servicio que puede editar, renombrar y ampliar.
Personas, programación, permisos y suscripción quedan dentro de su iglesia.

**La UI, la UX y el funcionamiento común proceden de la app actual de Alabanza:** push, campana, perfil, acceso, preferencias y demás recorridos compartidos.
**Alabanza será la última en incorporarse a la plataforma general.** Hasta esa
fase, su app y sus usuarios continúan trabajando como ahora. Se reutilizan
sus patrones y comportamientos comunes en las fases de la general. Lo que se incorpora al final es el equipo de Alabanza con sus funciones específicas y datos, no el sistema común de perfil o avisos.

## Fase 0 · UI/UX y funcionamiento común del producto general

**Resultado:** diseñar la plataforma general como continuación de la experiencia
existente, con un contrato de integración preparado para el final.

- Revisar la versión de Alabanza utilizada por el equipo: pantallas, componentes,
  navegación, temas, diálogos, feedback y funcionamiento móvil.
- Reutilizar esa UI/UX y los módulos comunes de acceso, perfil, tema, push y campana; documentar paridad de comportamiento y adaptaciones por tenant.
- Inventariar lo disponible en Calserv y en el monorepo de turnos; decidir dónde
  se implementa y qué componentes compartidos o adaptados se utilizarán.
- Definir pertenencias, roles y separación de datos de la plataforma general.
- Preparar correspondencias de cuentas, datos y avisos para integrar Alabanza
  al final, sin migrar usuarios ni cambiar su app durante esta fase.

**Mejoras incluidas:** contexto de iglesia visible, accesibilidad y recuperación
de errores sobre componentes compartidos; ningún rediseño visual independiente.

**Criterio de salida:** prototipo de alta y áreas reconocible como la misma
experiencia de Alabanza, componentes inventariados y decisiones técnicas de
integración identificadas. Ver [Referencia UI/UX](14-referencia-uiux-alabanza.md).

## Fase 1 · Alta, cuota y espacio de cada iglesia

**Resultado:** una iglesia se registra o completa un alta asistida, paga y llega
a su espacio activo con una base editable de áreas.

- Registro de iglesia y cuenta propietaria sobre el funcionamiento de acceso existente.
- Perfil común operativo: foto, Tema/Avisos/Contraseña y cierre de sesión, con alcance correcto de preferencias.
- Base común de suscripción push por dispositivo y bandeja interna. La fase 3 conecta esta base a los eventos y recordatorios de servicio.
- Alta asistida desde la operación de LEVITA con enlace para completarla.
- Cuota ligada a la iglesia, confirmación de pago y activación recuperable.
- Base inicial de áreas generales: crear, editar, renombrar y ordenar.
- Selector de iglesia cuando la misma cuenta pertenezca a varias.
- Gestión de suscripción por el propietario y separación del acceso operativo.

**Mejoras incluidas:** retomar altas interrumpidas; no duplicar tenants ni áreas
al reintentar; renombrar conserva personas, puestos e historial; los cambios
no se propagan a otras iglesias. Proponer archivo cuando haya historial vinculado.

**Criterio de salida:** dos iglesias completan altas por caminos diferentes.
Una cambia Bienvenida a Acogida y añade Hospitalidad; la otra conserva su base.
Los cobros y permisos no se comparten entre ellas. Acceso, perfil y controles de avisos conservan su funcionamiento en los dispositivos de referencia.

**Por definir antes de implementar el pago:** importe, periodicidad, condiciones
de cancelación y acceso ante impago. No se inventa un precio ni un plan gratuito.

## Fase 2 · Equipo y programación de las áreas generales

**Resultado:** la iglesia prepara su primer culto con Sonido, Multimedia,
Bienvenida/Acogida, Niños y las otras áreas generales que configure.

- Personas e invitaciones, con asignaciones posibles antes de activar la cuenta.
- Puestos por área, miembros, líderes y permisos acotados.
- Plantillas de servicio, necesidades de personal y eventos con fecha.
- Programación por áreas con candidatos y conflictos visibles.
- Hora de llegada por puesto, cualificación, criticidad y requisitos aplicables.
- Publicación con resumen de destinatarios y plazas confirmadas/pendientes/vacías.

**Mejoras incluidas:** sugerencia por rotación, explicación de bloqueos,
visibilidad de todos los conflictos y prevención de sobrecarga. Los requisitos
de composición y credenciales se incorporan al modelo antes del uso real.

**Criterio de salida:** el coordinador prepara y publica un servicio; un líder
no administra áreas ajenas y los contadores cuadran con sus asignaciones.
Los avisos y respuestas de uso real se completan en fase 3. No se incorporan
todavía las cuentas, canciones ni programación de la app actual de Alabanza.

## Fase 3 · Servidores, disponibilidad y avisos

**Resultado:** cerrar el ciclo de las áreas generales desde la propuesta hasta
la respuesta del servidor.

- Turnos propios y detalle dentro de la navegación heredada de Alabanza.
- Puedo servir / No puedo, cambio de respuesta y nota opcional.
- Bloqueos por fechas y máximo mensual deseado.
- Reutilizar los avisos, bandeja interna y lógica de push/correo de Calserv, adaptados a la iglesia y con una sola vía de emisión.
- Activar/desactivar push desde Perfil y campana con estado coherente por dispositivo; correo según los canales habilitados, también cuando haya push.
- Recordatorios según llegada, horas de silencio y escalado por criticidad.
- Rechazo posterior, propuesta de sustituto, cambios de hora y cancelación.

**Mejoras incluidas:** feedback inmediato con recuperación si falla, motivos
privados, fusión de fechas solapadas y ausencia de avisos duplicados. Añadir al
calendario y copiar para WhatsApp son complementos acotados; no requieren una
integración comercial de WhatsApp para terminar esta fase.

**Criterio de salida:** una propuesta llega, la persona responde y el panel se
actualiza. Un rechazo crítico se atiende y un fallo de push conserva otra vía.
Comprobar el recorrido en dispositivos reales y entre iglesias distintas, además de la paridad con la app existente: foto, tema, contraseña, sesión, push y campana.

## Fase 4 · Piloto de la plataforma general

**Resultado:** validar el producto con iglesias y áreas generales antes de
incorporar Alabanza.

- Propuesta: 2–3 iglesias con equipos y hábitos distintos.
- Observar alta, pago, edición de áreas, programación y respuestas.
- Probar aislamiento, cambios de rol, invitaciones caducadas, pago incompleto,
  reintentos, sustituciones, cambios de fecha y cancelaciones.
- Completar textos y condiciones, baja/exportación, retención, recuperación de
  datos y procedimientos operativos de soporte.
- Revisar accesibilidad, entrega de avisos, política de impago y cancelación.
- Alinear landing y registro con las funciones disponibles.

**Mejoras guiadas por uso:** reducir pasos abandonados, aclarar nombres y
permisos, ajustar avisos y resolver tareas repetidas. Registrar métricas mínimas
sin mezclar información personal entre iglesias.

**Criterio de salida:** las iglesias del piloto completan el recorrido y no
quedan fallos críticos de aislamiento, cobro o pérdida de respuestas. Revisar
objetivos de tiempo y adopción sin inventar resultados o porcentajes.

## Fase 5 · Consolidar la general y preparar la incorporación final

**Resultado:** cerrar las mejoras necesarias del piloto y dejar la plataforma
lista para recibir el área de Alabanza y sus usuarios existentes.

- Resolver los problemas observados y comprobar los componentes compartidos.
- Revisar reparto de carga; añadir un informe sencillo de participación si el
  piloto demuestra su necesidad.
- Confirmar continuidad de cuentas, roles, historial y preferencias de la app
  de Alabanza dentro de la plataforma general.
- Ensayar la integración con datos ficticios y una simulación de traspaso.
- Preparar validación, copia de seguridad y posibilidad de volver al estado
  anterior; no realizar todavía el corte de la app de Alabanza.

**Mejoras incluidas:** una única experiencia de acceso y avisos, sin duplicar
personas ni repetir notificaciones al incorporar el área existente.

**Criterio de salida:** la general funciona por sí misma, los contratos de
integración están resueltos y el ensayo identifica qué se conserva, transforma
o necesita revisión. Ninguna mejora opcional indefinida debe bloquear este cierre.

## Fase 6 · Alabanza entra en la plataforma general — incorporación final

**Resultado:** el equipo de Alabanza utiliza LEVITA como un área más de su iglesia,
con sus funciones específicas y la misma UI/UX que ya conoce.

- Integrar la app o su módulo existente: equipo, programación, catálogo,
  repertorio y atril, preservando funciones y modos de lectura actuales.
- Vincular cuentas y roles con la iglesia correcta; proteger canciones y datos
  por tenant antes de habilitar acceso general.
- Trasladar o vincular los datos según la estrategia acordada; comprobar estados,
  fechas, historial y pertenencias. No decidirlo por copiar tablas sin revisar.
- Coordinar avisos de repertorio con Sonido y Multimedia en el sistema general.
- Validar con el equipo de Alabanza y efectuar la incorporación cuando todo el
  recorrido esté comprobado, con recuperación prevista si algo falla.

**Criterio de salida:** el equipo entra en su iglesia dentro de LEVITA, conserva
sus funciones y datos acordados y comparte el contexto de servicio con las demás
áreas. No queda obligado a operar dos planificaciones o responder en dos sistemas.
El futuro de la app anterior se decide al completar el corte, no antes.

## Mejoras posteriores, fuera de estas incorporaciones

Priorizar después por uso: equipos en bloque, intercambios con aprobación,
disponibilidad recurrente, turnos por franjas, auto-programación con revisión,
plantillas de áreas por tipo de iglesia y varias sedes. Membresía, donaciones
o contabilidad requieren una decisión propia de alcance.

## Dependencias y documentación

Las fases se validan por sus criterios de salida, no por tener maquetas bonitas.
D2–D5 y D8 de [Decisiones](07-decisiones.md) se cierran antes del trabajo que
condicionan. El precio y los plazos no están aprobados; estimar después de
verificar código reutilizable y decisiones pendientes.

El [brief](10-brief-diseno.md), [escenarios](11-escenarios-diseno.md) y
[prompt de Claude Design](PROMPT-CLAUDE-DESIGN.md) siguen este orden: general
con UI/UX y funciones comunes de Alabanza desde las primeras fases; incorporación de su equipo, módulo específico y datos al final.
