# Iglesias y tenants

Especificación de producto · 15 de septiembre de 2026.
La estructura multiiglesia, las dos vías de alta y la base editable de áreas
proceden de la aclaración del promotor. Los detalles de interfaz que siguen
son criterios de diseño; no acreditan implementación.

## Una iglesia, un espacio independiente

Un tenant es la iglesia cliente. Tiene identificador estable, nombre visible,
slug de acceso, zona horaria, propietario, suscripción y datos propios. El
nombre y el slug no son una autorización. Renombrar una iglesia o un área no
cambia su identificador ni crea otra entidad.

Cada iglesia posee sus áreas, puestos, personas, pertenencias, cualificaciones,
credenciales, disponibilidad, plantillas, eventos, asignaciones, avisos y,
cuando se incorpore el bloque R, canciones y repertorios. Las áreas dependen de
la iglesia; una sede futura no equivale a otra iglesia cliente.

Una cuenta de acceso puede pertenecer a varias iglesias. Cada pertenencia tiene
su propio perfil, roles e historial. Ser propietario en una iglesia no concede
permisos en otra. No se copian automáticamente credenciales, disponibilidad,
contactos o historial entre iglesias.

## Dos vías de alta

### Alta asistida por LEVITA

1. Operación registra el nombre de la iglesia, zona horaria y correo de quien
   será su propietario; elige una oferta de cuota que ya esté configurada.
2. Se crea un alta pendiente y se envía la invitación a esa persona.
3. La persona acredita su acceso y completa los datos y el pago necesarios.
4. Se activa el tenant y empieza la personalización de sus áreas.

**Supuesto de diseño:** el alta asistida utiliza el mismo proceso de pago que
el autoservicio, mediante un enlace, sin introducir cobros manuales, exenciones
ni periodos gratuitos no acordados. El importe concreto queda pendiente.
Una invitación caducada se reenvía sobre la misma alta; no crea otra iglesia.

### Registro de la propia iglesia

1. «Crear mi iglesia»: nombre, zona horaria y cuenta de quien será propietario.
2. Mostrar la cuota configurada, periodicidad, impuestos aplicables y condiciones
   antes de ir al pago. En maquetas, el precio pendiente se identifica como tal.
3. Completar el pago en el flujo del proveedor y volver al estado del alta.
4. Activar la iglesia cuando el servidor confirme la suscripción habilitada.
5. Revisar y adaptar las áreas iniciales; continuar con personas y primer servicio.

Cerrar la pestaña de pago, volver dos veces o repetir una confirmación del
proveedor debe recuperar la misma alta y el mismo tenant. Una página de
«pago recibido» en el navegador no es evidencia suficiente para activar acceso.
El alta de una iglesia es un flujo distinto de la invitación de sus voluntarios.
El registro público de iglesias no abre el acceso a cualquier iglesia existente.

## Estados del alta que hay que diseñar

| Estado de experiencia | Mensaje y siguiente acción |
|---|---|
| Datos por completar | Retomar la misma alta y conservar lo introducido |
| Pago pendiente | Completar el pago de esta iglesia |
| Pago cancelado o fallido | Explicación recuperable y «Volver al pago» |
| Confirmación en curso | «Estamos confirmando el pago»; no afirmar que está activada |
| Iglesia activa, configuración pendiente | Adaptar áreas y preparar el primer servicio |
| Iglesia configurada | Entrar en «Próximos servicios» |
| Renovación necesita atención | Mostrar al propietario cómo actualizar el pago; política de acceso pendiente en D3 |

Estas son etiquetas de interfaz propuestas, no nombres definitivos de estados
SQL o de Stripe. No hay una duración de gracia ni una cuota aprobadas aún.

## Base editable de áreas de servicio

Propuesta de base para la etapa general: cada iglesia recibe una **copia propia** de Sonido, Multimedia, Bienvenida, Niños y Dirección del culto. Los nombres concretos son editables. La integración de la app de Alabanza y sus datos queda para la fase final, dentro de esta misma plataforma. Es un punto de partida de
configuración, no una lista cerrada ni una obligación de usar las cinco.
Las doce fichas de [áreas](areas/00-indice.md) sirven de referencia para ampliar.

El propietario y los administradores pueden:

- Crear más áreas con nombre, orden y color identificativo.
- Editar y renombrar cualquier área de su iglesia; por ejemplo, «Bienvenida»
  puede pasar a llamarse «Acogida».
- Configurar sus puestos y asignar miembros y líderes.
- Revisar los valores sugeridos de llegada, criticidad y composición por puesto.

Los puestos sugeridos, si se ofrecen al iniciar, también se copian al tenant;
la iglesia los revisa antes de usarlos. Un cambio posterior en la plantilla
base de LEVITA no reescribe áreas o puestos ya personalizados. No ofrecer una
sincronización global silenciosa.

**Renombrar conserva** personas, puestos, turnos, permisos e historial ligados
al identificador del área. Formularios, filtros y navegación muestran el nombre
actual, sin mantener otra área con el nombre antiguo. El historial debe seguir
siendo accesible. La edición no puede quitar requisitos bloqueantes sin el
permiso definido en [Datos y permisos](02-datos-y-rls.md).

Archivar un área para nuevos servicios, preservando su historial, es una
propuesta de gestión a revisar. No convertir «quitar de mi configuración» en un
borrado en cascada de turnos publicados. No hace falta una función de eliminación
para demostrar crear, editar y renombrar.

## Iglesia activa y navegación

La cabecera muestra siempre el nombre de la iglesia activa, también en móvil,
formularios de pago, invitaciones y confirmaciones de publicación. Con una sola
pertenencia se entra directamente; con varias, el selector enumera únicamente
las iglesias a las que la persona tiene acceso.

Al cambiar de iglesia se recargan datos y permisos y se limpian selecciones y
formularios del contexto anterior; un formulario sin guardar permite cancelar
el cambio. No se reutiliza un panel con datos de otra iglesia mientras carga.
Un enlace a una iglesia ajena muestra «No tienes acceso a esta iglesia» sin
revelar su equipo, contactos o contenido.

La arquitectura heredada propone rutas `/i/[slug]` dentro de los orígenes del
panel y la PWA. Los dominios definitivos del producto están por confirmar. Un
mismo origen puede alojar a muchos tenants; no se despliega una app por iglesia.

## Operación de plataforma y administración de iglesia

| Perfil | Ámbito |
|---|---|
| Operación LEVITA | Altas asistidas y seguimiento de activación y suscripción |
| Propietario de iglesia | Configuración de su tenant, personas y suscripción |
| Administrador de iglesia | Gestión interna autorizada; facturación reservada al propietario en el modelo actual |
| Líder de área | Programación y miembros dentro de su área según permisos |
| Servidor | Sus respuestas, disponibilidad y consulta autorizada del servicio |

El panel operativo de altas es distinto del panel de la iglesia. No se deduce
un permiso para leer datos pastorales, credenciales o turnos de todos los tenants.
El acceso de soporte y sus controles, si se necesita, requieren definición propia.

## Criterios de revisión

1. Alta asistida y autoservicio desembocan en el mismo proceso de configuración.
2. Reintentar el pago no crea otra iglesia ni copia dos veces las áreas.
3. «Bienvenida» renombrada a «Acogida» en Puerta Abierta sigue siendo
   «Bienvenida» en La Ribera.
4. Un área nueva de una iglesia no aparece en la otra.
5. Cambiar de iglesia recalcula permisos; los privilegios no viajan con la cuenta.
6. Invitaciones, cobros, avisos y enlaces conservan el contexto de la iglesia.
7. Ninguna pantalla promete funciones globales entre iglesias por compartir cuenta.

Crear manualmente un área llamada Alabanza no importa ni conecta la app actual. La incorporación del equipo y sus funciones existentes es la fase final del [plan](13-plan-por-fases.md).
