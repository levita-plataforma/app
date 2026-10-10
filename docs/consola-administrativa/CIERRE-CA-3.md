# Cierre CA-3 · Equipo, responsables y módulos

Fase del panel: **CA-3**. Responsable real: **Carlos** (agente Claude por su encargo).
Fecha: 10/10/2026.

Estado: **implementada y probada en local; integrada y desplegada solo si esta
carpeta lo recoge más abajo con su PR y su commit.** El alcance ejecutado es el
que figura en «Qué se ha hecho»; lo demás está declarado como excluido o
pendiente, no como terminado.

Los documentos de planificación de la consola (CA-0 a CA-6, especificación y
plan por etapas) **no están integrados en `main`**: siguen sin confirmar en el
árbol de trabajo principal, junto a otra tarea en curso. Por eso este informe no
enlaza a ellos: los enlaces estarían roto. No se han movido ni integrado porque
pertenecen a un trabajo ajeno a esta entrega.

## Base y dependencias

- Base: `main` en `825e79c` (último PR integrado: #39, de Diogo).
- Producción al día antes de empezar: `Remote database is up to date`.
- Dependencias consumidas: CA-0/CA-1 (capacidades, guarda, navegación) y CA-2
  (ficha de iglesia). También el trabajo de Diogo de los días 4 y 7 de octubre:
  su consola de plataforma (PR #38) y su hotfix de recursión en las políticas de
  capacidades (PR #39).

Se comprobó antes de tocar nada que su migración `20261007075116` rehace
`platform_churches` **conservando** los dos filtros de CA-2.1
(`p_onboarding_pendiente`, `p_sin_propietario`) y añadiendo tres más. No hubo
que rehacer nada de CA-2.

## Qué se ha hecho

### CA-3.1 · Equipo de plataforma — completa

Conceder y retirar capacidades existía desde CA-0 **sin wrapper público y sin
ninguna pantalla que lo llamara**: dar de alta a alguien del equipo de LEVITA o
quitarle permisos exigía entrar a la base de datos a mano.

- `app.platform_team()` y su wrapper: el equipo con sus capacidades. Antes
  `platform_operators` solo tenía política «veo mi propia fila», así que ni quien
  gestiona operadores podía listarlo.
- `app.platform_capability_catalog()`: el catálogo sale de la base, no de una
  lista escrita en la pantalla.
- `app.platform_add_operator(email)`: solo cuentas que ya existen en LEVITA, y
  entran **sin ninguna capacidad**. No se ha inventado un flujo de invitación de
  operadores: no existe, y fingirlo dejaría una fila apuntando a una cuenta que
  nadie puede usar.
- `app.platform_remove_operator(user_id)`, con la protección del último gestor.
- Wrappers públicos de conceder y retirar capacidad.
- Pantalla `/operacion/equipo` y su entrada en la navegación, bajo
  `platform.operators.manage`.

**Dos fallos encontrados y arreglados:**

1. **Carrera en la protección del último gestor.** `revoke_platform_capability`
   contaba las cuentas con `platform.operators.manage` y borraba después, sin
   bloqueo. Comprobado con dos conexiones reales: con dos gestores, si A retira
   la de B mientras B retira la de A, las dos transacciones cuentan dos, las dos
   se creen a salvo y las dos borran. **Quedaban cero**, y recuperarse exige
   abrir la base, porque `bootstrap_platform_operator` no está concedida a nadie
   a propósito. Arreglado con un cerrojo de transacción sobre la capacidad
   crítica. Vuelto a medir: queda una, y la segunda retirada se rechaza con su
   mensaje. Es un cerrojo consultivo y no de filas porque lo que hay que
   proteger no es una fila sino cuántas quedan: A borra la de B y B la de A, que
   son filas distintas y nunca se estorbarían.
2. **Retirar al operador entero se saltaba esa protección sin tocarla**, porque
   borrar de `platform_operators` arrastra sus capacidades por la clave ajena.
   La función nueva comprueba lo mismo y bajo el mismo cerrojo.

### CA-3.2 · Contactos — completa

`platform_church_contacts` existía desde la Fase 14, el servicio la exponía y
**ninguna pantalla la llamaba**: la ficha prometía que los correos «se consultan
con permiso de gestión de responsables» y no había dónde hacerlo. Ahora se piden
con un botón, no al cargar, porque cada consulta queda registrada. El texto de la
ficha se ha corregido para decir dónde.

### CA-3.3 · Transferencia de propiedad — **excluida**

Excluida por decisión expresa de Carlos, no por falta de tiempo. No se ha
implementado ningún flujo parcial: no hay aceptación, ni caducidad, ni cambio
atómico, y no se presenta como disponible en ninguna pantalla.

### CA-3.4 · Módulos — motivo y efecto previo

- **El motivo ya lo registraba la RPC en la auditoría y la server action ya lo
  leía del formulario, pero el formulario no tenía el campo**: siempre llegaba
  vacío. En la auditoría constaba quién apagó un módulo y nunca por qué. Ahora se
  pide, y al desactivar es obligatorio, que es cuando alguien pierde acceso.
- La obligatoriedad se comprueba también en el servidor: un botón deshabilitado
  no es una regla. No se ha tocado `platform_set_module`, que es compartida:
  cambiar su contrato afectaría a otros usos, así que es una regla de la consola
  y queda dicho en el código.
- Efecto previo por módulo antes de confirmar, diciendo qué deja de verse y que
  los datos se conservan.
- Historial: los cambios de módulo ya se auditaban y ya aparecen en la sección
  «Qué ha hecho el equipo» de la ficha. Lo que faltaba es que se leyeran: ver
  CA-3.5.

### CA-3.5 · Auditoría — paginada y legible

- `platform_audit` admite desplazamiento y devuelve el total de la consulta. Antes
  daba como mucho cien entradas, la pantalla pedía doscientas y **no había forma
  de ver la ciento uno**. Para una tabla que existe para revisar lo que hizo el
  equipo, llegar hasta donde alcanza la primera página no es revisar.
- Las dos firmas anteriores se retiran con su lista de parámetros exacta, porque
  un `create or replace` con parámetros distintos no reemplaza: crea una
  sobrecarga y deja la vieja accesible.
- **Diez acciones no tenían nombre legible** y la pantalla las mostraba con su
  clave técnica: `platform.church_created`, `platform.admin_invited`,
  `platform.admin_removed`, `platform.invitation_revoked`,
  `platform.invitation_resent`, `platform.contacts_viewed`,
  `platform.module_enabled`, `platform.module_disabled` y las dos nuevas de
  equipo. Seis eran preexistentes desde la Fase 14, y de las más frecuentes.
- Para que no vuelva a pasar: `tests/unit/auditoria-acciones.test.mjs` compara las
  acciones que se escriben en las migraciones con las que la pantalla sabe
  nombrar, y falla nombrando las que falten. Se ha comprobado que **falla de
  verdad** quitando una etiqueta a propósito. Es la misma forma de fallo que ya
  apareció en la Fase 13 con los estados de comunicación: una lista escrita a
  mano que se queda corta respecto a la base.

## Contratos, rutas y migraciones afectados

| Qué | Detalle |
| --- | --- |
| Migraciones | `20261009230635_consola_equipo_plataforma.sql`, `20261009234553_auditoria_paginada.sql` |
| RPC nuevas | `platform_team`, `platform_capability_catalog`, `platform_add_operator`, `platform_remove_operator`, `platform_grant_capability`, `platform_revoke_capability` |
| RPC cambiadas | `app.revoke_platform_capability` (cerrojo), `platform_audit` (desplazamiento y total) |
| RLS | política nueva de lectura en `platform_operators` para quien gestiona operadores |
| Rutas | `/operacion/equipo` (nueva); ficha de iglesia y auditoría modificadas |
| Tipos | seis firmas nuevas y una cambiada en `database.types.ts` |

Sobre la política nueva: la comprobación va por `app.has_platform_capability`,
que es security definer y no vuelve a pasar por RLS. Consultar ahí la propia
tabla reproduciría la recursión infinita que Diogo tuvo que arreglar el 7 de
octubre en las capacidades.

## Pruebas

| Qué | Resultado |
| --- | --- |
| Batería pgTAP completa (46 suites) | **2016 aserciones correctas**, 19 nuevas en `consola_equipo_test.sql` |
| Pruebas unitarias (`npm run test:unit`) | 10 correctas, 3 nuevas |
| Carrera de las dos retiradas | antes: 0 gestores. Después: queda 1, la segunda espera su turno y se rechaza |
| El invariante de auditoría falla cuando debe | comprobado quitando una etiqueta |
| typecheck, lint, build | limpios |

**Un fallo preexistente, ajeno a esta entrega:** `fase10_reservas_test.sql`
falla una aserción (la 35, archivar un recurso con reservas futuras) en el arnés
local. Se ha comprobado que **falla igual en `main` sin estos cambios**, y el CI
—que ejecuta la misma suite con `supabase test db` sobre un Supabase real— está
verde en `main`. Es una diferencia del arnés local, no un fallo introducido aquí.
Queda anotado, no arreglado: no pertenece a CA-3.

## Qué no se ha comprobado

- **No se ha abierto la consola en un navegador.** Lo verificado es esquema,
  permisos, tipos y compilación. El repaso visual en móvil, escritorio y teclado
  que pide el encargo está pendiente.
- No se han ejecutado las cinco suites Node de concurrencia y volumen: no tocan
  nada de este alcance. El CI las ejecuta.
- No se ha dado de alta ni retirado a ningún operador real en producción.

## Decisiones tomadas y por qué

1. **Entrar al equipo no concede ninguna capacidad.** Pertenecer y poder hacer
   algo son cosas distintas; mezclarlas convertiría el alta en una concesión en
   blanco.
2. **Solo se da de alta a quien ya tiene cuenta en LEVITA.** La alternativa era
   inventar un flujo de invitación de operadores que no existe.
3. **Nadie se concede capacidades a sí mismo** (ya venía de CA-0), pero sí puede
   retirárselas: reducir el propio acceso nunca es una escalada.
4. **El equipo se lista con los correos y no se audita cada consulta**, al
   contrario que los contactos de una iglesia. Son cuentas del propio equipo, no
   personas de las iglesias. Si se prefiere auditarlo también, es un cambio de una
   línea y queda señalado aquí como decisión, no como olvido.
5. **El motivo obligatorio al desactivar un módulo es una regla de la consola**, no
   de la RPC compartida.

## Pendiente de decidir

- Si la consulta del equipo debe auditarse (punto 4 de arriba).
- CA-2.5, reanudación del onboarding, sigue fuera de alcance.
- Las nueve decisiones comerciales de la Fase 15, en particular qué impide cada
  estado de suscripción: hoy, en producción, no impiden nada.
