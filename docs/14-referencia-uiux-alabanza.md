# Referencia de UI, UX y funcionamiento: app de Alabanza

Revisión de código local: **15 de septiembre de 2026**.
El promotor indica que toda la UI y UX de LEVITA debe proceder de su app de
Alabanza, que se integrará con el producto multiiglesia. Esta decisión sustituye
la propuesta anterior de diseñar la aplicación a partir de la landing.

## Referencias localizadas

| Referencia | Evidencia inspeccionada |
|---|---|
| App de Alabanza | `C:/Users/Usuario/Documents/Calserv`, paquete `lfyw-calserv-app`, versión declarada `0.9.3` |
| HEAD de Alabanza | `532384c03b3578cc17941ca57de3d675d6da59b1` |
| Producto de turnos | `C:/Users/Usuario/Documents/Levitaapp`; contiene `apps/`, `packages/`, `supabase/` y `scripts/` |
| HEAD del producto | `709e2bdc09cab75452ee1f113c0e71ac41666abc` |
| Este checkout | `C:/Users/Usuario/Documents/GitHub/levita.app`: landing y documentación |

Se ha leído código, no se ha verificado la interfaz en un navegador ni el
estado de producción. No se han ejecutado las suites de los repositorios
externos. Los hashes identifican HEAD, no certifican que cualquier archivo
sin seguimiento forme parte de ese commit. Antes de implementar, contrastar
la versión que el equipo utiliza con estas referencias.

## Qué se hereda

| Aspecto | Evidencia en Calserv | Regla para LEVITA |
|---|---|---|
| Tipografía | `src/app/layout.tsx` y `src/app/globals.css`: Work Sans, Outfit, Geist Mono | Mantener texto, titulares y usos monoespaciados existentes |
| Temas | `src/domain/settings/types.ts`: verde, azul y negro; claro, Escenario y automático | Mantener los dos ejes de preferencia por dispositivo; no convertirlos en un ajuste global de iglesia |
| Tema inicial | `defaultBrandTheme = black`, `defaultAppearance = stage` | Primera referencia de maqueta: Negro + Escenario; respetar preferencias ya guardadas |
| Estructura | `src/components/layout/app-shell.tsx` | Barra lateral de 264 px en escritorio, cabecera y navegación inferior móvil |
| Navegación | `src/components/layout/app-nav.tsx` | Inicio, Equipo, Repertorio, Cronograma y Perfil como referencia de continuidad |
| Componentes base | `src/components/ui/` | Reutilizar Button, Card, PageHeader, Input, Select, Textarea, Badge, Avatar y diálogos |
| Tarjetas y páginas | `app-page.tsx`: tarjetas de 22 px de radio y cabecera en Outfit | Conservar proporciones, espaciado y jerarquía; ampliar componentes existentes |
| Iconos | Uso de `lucide-react` en navegación y controles | Mantener familia y tratamiento visual |
| Turno/servicio | `src/components/services/service-sheet.tsx` y `service-detail-client.tsx` | Conservar patrones de detalle, respuesta, equipo y acceso a repertorio |
| Canciones y atril | `src/components/songs/atril.tsx`, `atril-editor.tsx`, `src/components/services/service-songs.tsx` | Integrar la experiencia existente; no encargar otra independiente |
| Avisos | `notification-bell.tsx`, `profile-notifications.tsx` | Conservar bandeja/campana y gestión de avisos; añadir contexto de iglesia |
| Movimiento | Utilidades existentes en `globals.css` y `salida-animada.tsx` | Reusar feedback y transiciones, incluida reducción de movimiento |

No basta usar los mismos colores: se conservan jerarquía, posición de acciones,
patrones de navegación, comportamiento de diálogos, feedback, lectura del
servicio, temas y adaptación móvil. Los componentes nuevos de alta, cuota y
áreas deben parecer una extensión de esa misma aplicación.

## Base funcional común que también se hereda

Aclaración del promotor: la reutilización incluye **cómo funciona** la app:
push, campana, perfil, acceso, preferencias y los demás comportamientos comunes.
No basta reproducir sus pantallas. La base común sirve a las áreas generales
antes de que el equipo y las funciones específicas de Alabanza se incorporen.

| Función común observada | Referencia de código en Calserv | Continuidad exigida |
|---|---|---|
| Acceso, invitación y recuperación | `src/app/login/`, `src/app/invite/`, `src/server/auth/` | Mantener el funcionamiento de acceso existente; adaptar pertenencias por iglesia |
| Perfil y sesión | `src/app/profile/page.tsx`, `profile-tabs.tsx`, `actions.ts` | Foto visible, pestañas Tema/Avisos/Contraseña, cambio de contraseña y cierre de sesión |
| Foto de perfil | `src/components/profile/avatar-uploader.tsx` | Subir, cambiar y quitar foto, previsualización y recuperación de errores; revisar alcance de cuenta/iglesia antes de trasladar datos |
| Apariencia y color | `src/domain/settings/types.ts` y componentes de apariencia | Preferencia personal por dispositivo; no cambia el tema del resto del equipo |
| Activación de push | `use-push-subscription.ts`, `profile-notifications.tsx` | Activar/desactivar en este dispositivo; conservar diagnóstico, carga, errores y reintento |
| Campana y pendientes | `notification-bell.tsx`, `app-shell.tsx` | Bandeja y no leídos; mirar un aviso no equivale a responder el turno |
| Emisión de avisos | `src/server/notifications/dispatch.ts` | Registrar primero el aviso; push y correo como canales externos según configuración |
| Respuesta y detalle del servicio | `src/components/services/` | Mismos controles y feedback de respuesta, adaptados a los puestos de cada área |
| Instalación y navegación móvil | `src/components/layout/` y `src/app/pwa-register.tsx` | Conservar instalación guiada, estructura móvil y comportamiento de sesión |

El inventario se amplía con lo que se encuentre al revisar la versión utilizada
por el equipo. Toda función existente debe marcarse como común reutilizable,
específica de Alabanza para fase final o pendiente de adaptar con motivo.
No omitir una función porque el primer inventario no la haya nombrado, ni
prometer como existente una función que solo aparezca en el backlog.

### Perfil: comportamiento que hay que conservar

La foto queda por encima de las pestañas. Tema agrupa apariencia y color;
Avisos contiene el control de push del dispositivo; Contraseña contiene cambio
y resultado del guardado. Si se vuelve de cambiar contraseña, se abre esa
pestaña para que el resultado no quede oculto. Cerrar sesión sigue accesible en
móvil. Mantener estos recorridos, incluyendo carga y errores, con datos reales
cuando se implemente, no como controles decorativos.

La cuenta y sus preferencias personales no conceden roles en otras iglesias.
Disponibilidad, pertenencias y avisos se mantienen acotados a la iglesia.
El alcance de la foto entre pertenencias se revisa en la adaptación de datos;
la UI no implica que se publique en un directorio global.

### Push y campana: un funcionamiento compartido

Perfil y campana utilizan la misma lógica de suscripción (`usePushSubscription`)
en el código de referencia. Conservar esa única fuente de comportamiento y
comprobar que ambos muestran el mismo estado al activar o desactivar.
Activarlo en el móvil no lo activa en el ordenador. Cambiar la iglesia activa
no debe reasignar el dispositivo a otra persona ni cancelar avisos autorizados
de otras pertenencias; definir esa asociación en el contrato multiiglesia.

`notifyMembers` registra primero la bandeja interna y después intenta los
canales externos habilitados. Push y correo pueden coexistir; el correo no es
exclusivamente un sustituto del push. Un fallo externo no borra la constancia
interna ni convierte una respuesta guardada en una respuesta perdida.
La política existente excluye al autor de los destinatarios de su propia
acción. Ver [Notificaciones](03-notificaciones.md) para canales y adaptación.

### Criterio de paridad funcional

Comparar los mismos recorridos en la app de referencia y en la general:
acceder/recuperar cuenta, cambiar foto, cambiar tema, activar/desactivar push,
leer la campana, responder un turno y cerrar sesión. Anotar por recorrido qué
se conserva y qué se adapta para separar iglesias. Las nuevas necesidades de
pago o áreas amplían esta base; no crean otro sistema de perfil o avisos.

## Valores de referencia, no una segunda paleta

En la combinación inicial Negro + Escenario, el código define fondo `#0A0A0B`,
tarjeta `#141416`, texto `#EDEDEE`, acción principal `#E6E7EA` con texto
`#131315`, bordes `#2A2A2E` y barra lateral `#000000`. Usar los tokens
correspondientes al tema, no incrustar estos valores en componentes nuevos.
Los colores semánticos proceden igualmente de los tokens existentes.

Los colores y fuentes marfil/azul/dorado de la landing no son la referencia
de la aplicación. El encaje del nombre LEVITA y el logotipo de la iglesia se
resuelve sin cambiar los patrones de interacción. No fijar LFY como identidad
obligatoria de todas las iglesias.

## Cómo ampliar la navegación

Propuesta para revisar contra la app real:

- Añadir iglesia activa y selector a la estructura existente.
- Inicio mantiene el resumen y los turnos propios según perfil.
- Equipo incorpora contexto de áreas y su administración; un líder conserva
  acceso acotado a su área.
- Cronograma mantiene la planificación, ahora con puestos de varias áreas.
- Repertorio conserva la experiencia de Alabanza, con acceso según pertenencia.
- Perfil mantiene preferencias personales. La configuración de iglesia y su
  suscripción tienen una entrada administrativa identificada, solo para quien
  tenga permiso; su ubicación exacta se valida sin llenar la barra móvil.

No sustituir la navegación inferior de cinco entradas por una nueva de tres
sin una decisión explícita. Los nombres de rutas del monorepo heredado son
referencias técnicas, no una razón para cambiar los nombres que el equipo usa.

## Integración desde el principio

La fase 0 del [plan](13-plan-por-fases.md) inventaría componentes, pantallas,
autenticación, datos y avisos que se reutilizarán. La fase 1 ya usa esa UI y la base de cuenta/perfil; las fases 2–3 conectan los comportamientos comunes a las áreas generales.
La fase 6, última incorporación, completa la integración funcional de Alabanza y el traspaso de datos
si es necesario; no es el momento de decidir la apariencia.

La reutilización visual no autoriza copiar consultas de una sola iglesia al
producto multiiglesia. Revisar pertenencias, roles, nombres de estado, acceso a
canciones y almacenamiento por tenant antes de reutilizar lógica. El número de
aplicaciones, la convergencia de cuentas y la estrategia de datos se eligen
tras comparar ambos repositorios, no solo porque compartan Next.js.

Hay diferencias observadas que necesitan un contrato de integración:

- Calserv tiene acceso con contraseña, recuperación e invitación. Ese funcionamiento se conserva por instrucción del promotor. La propuesta antigua de enlace mágico queda desplazada; se resuelve la conexión entre cuentas y pertenencias sin sustituir el acceso habitual.
- Calserv centraliza avisos y conserva una bandeja interna; Turnos describe
  una cola de envíos. Hay que coordinar ambos para evitar avisos duplicados,
  preservando la experiencia de campana y su contexto de iglesia.
- Roles y estados no tienen necesariamente los mismos nombres. La misma persona
  debe conservar sus tareas y permisos al integrar, sin heredar permisos globales.

Ver D8 en [Decisiones](07-decisiones.md).

## Mejoras compatibles con la continuidad

Mejorar estados vacíos, errores, legibilidad, contexto de iglesia, prevención
de duplicados y rotación usando los componentes existentes. Validar teclado,
zoom, contraste y tamaño táctil; si un patrón actual presenta una limitación,
registrar el cambio concreto para aplicarlo de forma compartida. No confundir
fidelidad con mantener un fallo de accesibilidad.

## Criterio de entrega para Claude Design

Dar acceso a esta documentación y al código o capturas de la versión elegida
de Calserv. Referencias históricas de handoff complementan el código actual,
no lo sustituyen: pueden contener colores o diseños previos.

Si no puede leer la referencia, puede preparar arquitectura y flujos, pero
no debe presentar una UI inventada como fiel a la app. Los mocks finales
requieren comparar al menos Inicio, Equipo, Cronograma, detalle y Repertorio /
Atril en móvil y escritorio. Marcar qué componentes se reutilizan, se amplían
o son nuevos. Las pantallas nuevas deben conservar temas y comportamientos.

## Orden confirmado de incorporación

Primero funciona la general con las demás áreas. Alabanza sigue en su app y entra al final, dentro de LEVITA. Reutilizar su UI/UX y las funciones comunes no adelanta la incorporación de su equipo ni sus datos de Alabanza. Repertorio y Atril permanecen en la app actual hasta esa incorporación; en el diseño de la general no se presentan como módulos ya activos. La estructura y los componentes de navegación se conservan aunque las funciones visibles dependan de la fase y los permisos.
