# Prompt para Claude Design — LEVITA

Revisión: **15 de septiembre de 2026**. Copiar el bloque siguiente. Facilitar a
Claude los documentos citados y acceso al código o capturas actuales de la app
de Alabanza. Las rutas locales de esta máquina no serán accesibles desde otra
herramienta por el mero hecho de escribirlas en un prompt.

Fuente de verdad: [Visión](00-vision.md), [Tenants](12-iglesias-y-tenants.md),
[Referencia UI/UX](14-referencia-uiux-alabanza.md), [Plan](13-plan-por-fases.md),
[Brief](10-brief-diseno.md), [Flujos](09-flujos.md) y [Escenarios](11-escenarios-diseno.md).

```text
Diseña la ampliación de LEVITA como plataforma SaaS multiiglesia, integrando
la app de Alabanza que ya utilizamos (Calserv / LFY Worship).

ORDEN OBLIGATORIO: primero la plataforma general con las demás áreas.
Alabanza sigue en su app y será la última en entrar, dentro de LEVITA.
Su UI/UX y las funciones comunes se reutilizan en las primeras fases: push, perfil, acceso, preferencias y campana. Su equipo, módulo específico y datos de Alabanza se incorporan al final. No retrases el funcionamiento común hasta esa incorporación.

REQUISITO PRINCIPAL DE UI, UX Y FUNCIONAMIENTO
Toda la interfaz y la experiencia deben proceder de esa app existente:
componentes, tipografías, temas, navegación, espaciado, diálogos, feedback,
lectura de servicios, repertorio y atril. Las pantallas nuevas deben sentirse
parte de la misma aplicación. La landing de LEVITA no es la referencia de UI.
Conserva también cómo funcionan las acciones, no solo cómo se ven. No propongas otro sistema visual ni rehagas Alabanza como una app independiente.

FUNCIONES COMUNES OBLIGATORIAS
Perfil: foto, pestañas Tema/Avisos/Contraseña y cierre de sesión. Subir, cambiar
y quitar foto con previsualización y errores; tema por dispositivo; cambio de
contraseña que vuelve a esa pestaña con su resultado. Mantén acceso, invitación
y recuperación existentes; no sustituyas el login por otro método inventado.
Push: activar/desactivar en este dispositivo desde Perfil y campana con lógica
compartida y estados coherentes. Activar el móvil no activa el ordenador.
Avisos: conservar bandeja interna y pendientes. Leer no responde el turno.
Primero se guarda el aviso y luego se intentan los canales habilitados; push
y correo pueden coexistir. Un fallo externo no borra una respuesta guardada.
Conservar destinatarios, exclusión del autor y resumen fiel del resultado,
adaptados a la iglesia. Revisa S13 y el inventario funcional para evaluar paridad.

Lee primero la referencia de la app y docs/14-referencia-uiux-alabanza.md.
Código de referencia: src/app/globals.css, src/app/layout.tsx,
src/domain/settings/types.ts, src/components/layout/app-shell.tsx,
app-nav.tsx, src/components/ui y los componentes de services y songs.
La referencia inspeccionada usa Work Sans para texto y Outfit para titulares;
temas verde, azul y negro; apariencia clara, Escenario y automática. El arranque
actual es Negro + Escenario. Mantén preferencias y colores semánticos por tokens.
La navegación actual es Inicio, Equipo, Repertorio, Cronograma y Perfil, con
lateral en escritorio y barra inferior en móvil. Amplíala según permisos,
manteniendo sus patrones. Las funciones visibles dependen del perfil y de la fase: Repertorio y Atril entran en la general al incorporar Alabanza al final.

Si no puedes acceder a las referencias, identifica lo que falta antes de
producir una UI de alta fidelidad. Puedes avanzar en el mapa de flujos, pero
no inventes una apariencia y la presentes como fiel a la app de Alabanza.

PRODUCTO CONFIRMADO
Cada iglesia tiene su propio espacio independiente, con personas, áreas,
puestos, servicios, permisos y suscripción. Una cuenta puede pertenecer a
varias iglesias, con roles diferentes; los datos no se mezclan.

Hay dos vías de alta:
1. LEVITA da de alta la iglesia desde una vista operativa y envía al propietario
   un enlace para completar el proceso.
2. La propia iglesia se registra y paga su cuota.
Ambas llegan a la activación del mismo tipo de espacio y a su configuración.
La cuota entra desde el lanzamiento. Importe y periodicidad están por definir:
no inventes precios ni un plan gratuito. Marca ese dato como pendiente en notas
de diseño; la interfaz final utilizará la oferta configurada.

Como base propuesta para la etapa general, cada iglesia recibe una copia de Sonido, Multimedia, Bienvenida, Niños y Dirección del culto. Es totalmente editable; Alabanza se incorpora funcionalmente al final. Puede crear más, editar y cambiar sus nombres.
Renombrar conserva personas, puestos e historial. Cambiar Bienvenida a Acogida
en una iglesia no cambia otra. La base inicial no es una lista cerrada ni una
plantilla global que reescribe las personalizaciones de sus iglesias.

El primer núcleo funcional organiza turnos y avisos. No deduzcas módulos de
contabilidad completa o chat general solo por ser una plataforma para
iglesias. Integra las funciones existentes de Alabanza sin eliminar su experiencia.

USUARIOS
Propietario: activa su iglesia, configura áreas y gestiona la cuota.
Administrador/coordinador: prepara el domingo y ve lo que falta.
Líder: gestiona su área, no las de toda la iglesia automáticamente.
Servidor: consulta el móvil durante unos segundos para saber cuándo llegar
y responder. Puede tener poca experiencia digital.
Operación LEVITA: inicia altas; es un ámbito distinto de administrar la iglesia.

DISEÑA POR TANDAS, CON RECORRIDOS CONECTADOS
Tanda 0: inventario de UI/UX y funcionamiento existente, con mapa de componentes y módulos que reutilizas,
amplías o necesitas crear. Señala las diferencias de acceso y avisos que hay
que resolver al integrar. No uses un rediseño como atajo.

Tanda A: registro, alta asistida, cuota/pago, confirmación pendiente,
activación, recuperación de pago, personalización de áreas y selector de
iglesia. Incluye crear área y renombrar; termina en un espacio listo para
preparar personas y primer culto. Incluye gestión de suscripción por propietario y Perfil común funcional, manteniendo foto, Tema, Avisos, Contraseña y cierre de sesión.

Tanda B: personas e invitaciones, puestos, plantilla de servicio, programación,
candidatos, publicación, turnos propios, respuesta, disponibilidad, avisos,
sustitución tras rechazo y cambio/cancelación de culto. Estas funciones se
integran en la navegación y componentes de la app actual.

Tanda C, fase final después de consolidar la general: integración de catálogo, repertorio y atril existentes dentro de LEVITA. Conserva sus
funciones y modos de lectura; revisa su acceso por iglesia. No encargues otra
app de música desde cero.

REGLAS DE EXPERIENCIA
La iglesia activa debe estar clara en navegación, pagos, invitaciones y
confirmaciones. Al cambiar de iglesia, cambian datos y permisos sin mostrar
contenido del espacio anterior.

Distingue plazas confirmadas, pendientes de respuesta y vacías. En borrador
usa Propuesto: aún no se ha avisado. No confundas número de puestos con número
de personas necesarias ni propuesta con confirmación.

Muestra todos los conflictos antes de asignar. Indisponibilidad y frecuencia
alcanzada advierten, no ocultan a la persona. Los requisitos bloqueantes y
la composición tienen reglas propias: niños con una sola persona propuesta
bloquea; sonido con solo aprendiz bloquea si exige autónomo. La decisión
heredada permite publicar un turno completamente vacío, que sigue siendo
un hueco visible, no un equipo listo.

Credenciales vigentes para el día del culto. Solo los perfiles autorizados ven
sus detalles. Un líder ve la necesidad de revisión administrativa sin datos
privados. No diseñes subida del documento.

Publicar muestra destinatarios y huecos; reenviar a pendientes es otra acción.
Repetir no vuelve a notificar a todos. En móvil mantener Puedo servir / No puedo,
permitir cambiar de respuesta y mostrar llegada separada de inicio del culto.
Un fallo de red no debe fingir que la respuesta ya llegó al coordinador.

Conserva la bandeja/campana de Alabanza. Push tiene correo y acceso desde app
como alternativas. Los pasos de instalación se validan con capturas reales;
si faltan, marca los espacios pendientes, sin fabricar capturas de iPhone.

CASOS PARA EVALUAR
Usa docs/11-escenarios-diseno.md. Puerta Abierta y La Ribera son iglesias
independientes. En Puerta Abierta, Bienvenida cambia a Acogida; La Ribera
conserva Bienvenida. Sara es líder de Dirección del culto en la primera y servidora en la segunda durante los escenarios de la general.

Culto E01, domingo 18 de octubre de 2026 a las 11:00: 8 puestos que necesitan
12 plazas, con 7 confirmadas, 3 pendientes y 2 vacías. Sonido llega 9:30;
Acogida y Niños, 10:30. Usa las asignaciones del documento para mantener los
totales al responder o sustituir. Las variantes no se acumulan entre sí.

ENTREGA
Empieza por Tanda 0 y Tanda A. Presenta un recorrido completo y coherente antes
de ampliar a los siguientes. Panel de referencia 1440 px, móvil 390 px y
comprobación de comportamiento estrecho. El alta también se completa en móvil.

Maquetas de alta fidelidad, prototipo navegable si es posible, estados vacíos,
carga y error, componentes reutilizados y notas de decisiones pendientes.
Español de España, legibilidad y accesibilidad evaluables. Mejoras de UX se
aplican de forma compartida sin romper la familiaridad de la app de Alabanza.

Consulta docs/07-decisiones.md para los puntos abiertos: condiciones de cuota,
publicación por líderes, envío de nuevas propuestas, cambios de respuesta e
integración de cuentas y avisos. No los conviertas en decisiones aprobadas al
dibujar la pantalla. No simules operaciones reales de pago o envío.
```


---

## ARQUITECTURA INTEGRAL 2026

El alcance vigente ha evolucionado: LEVITA se diseña como plataforma modular integral. El diseño inmediato debe seguir la fase autorizada del `13-plan-por-fases.md`; no es necesario diseñar todos los módulos simultáneamente. Sin embargo, la arquitectura de navegación debe admitir People, Groups, Discipleship, Events, Kids, Communications, Facilities, Analytics y futuros Pastoral/Giving.

Alabanza se integra funcionalmente en la **Fase 11**, aunque su UI/UX común sigue siendo la referencia desde la Fase 0. El módulo Kids está fuera del MVP inicial pero dentro del roadmap; Giving y Pastoral se reservan para fases avanzadas con controles de privacidad específicos.
